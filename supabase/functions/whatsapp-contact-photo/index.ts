import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Procura recursivamente uma URL de imagem em chaves como image/photo/foto/avatar/picture
function findImageUrl(obj: unknown, depth = 0): string | null {
  if (!obj || depth > 4) return null;
  if (typeof obj !== "object") return null;
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof value === "string" && /^https?:\/\//.test(value) && /image|photo|foto|avatar|picture|imgurl/i.test(key)) {
      return value;
    }
  }
  for (const value of Object.values(obj as Record<string, unknown>)) {
    if (value && typeof value === "object") {
      const found = findImageUrl(value, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const [{ data: { user }, error: authError }, body] = await Promise.all([
      userClient.auth.getUser(),
      req.json(),
    ]);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { conversa_id } = body;
    if (!conversa_id) {
      return new Response(JSON.stringify({ error: "conversa_id obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: conversa } = await supabase
      .from("whatsapp_conversas")
      .select("id, telefone, empresa_id, foto_perfil_url")
      .eq("id", conversa_id)
      .single();
    if (!conversa) {
      return new Response(JSON.stringify({ error: "Conversa não encontrada" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (conversa.foto_perfil_url) {
      return new Response(JSON.stringify({ foto_perfil_url: conversa.foto_perfil_url }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: instLink } = await supabase
      .from("wapi_instancia_usuarios")
      .select("configuracoes_wapi:instancia_id(instance_url, api_key, status)")
      .eq("usuario_auth_id", user.id)
      .limit(1)
      .maybeSingle();
    const config = (instLink?.configuracoes_wapi ?? null) as {
      instance_url: string; api_key: string; status: string;
    } | null;
    if (!config || config.status !== "connected") {
      return new Response(JSON.stringify({ error: "WhatsApp não configurado" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const baseUrl = config.instance_url.replace(/\/$/, "");
    const digits = conversa.telefone.replace(/\D/g, "");
    const isGroup = conversa.telefone.includes("@g.us") || digits.length > 14;
    const number = isGroup
      ? (conversa.telefone.includes("@g.us") ? conversa.telefone : `${digits}@g.us`)
      : (digits.startsWith("55") ? digits : `55${digits}`);

    let responseText = "";
    let wapiStatus = 0;
    try {
      const res = await fetch(`${baseUrl}/chat/details`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: config.api_key },
        body: JSON.stringify({ number }),
      });
      wapiStatus = res.status;
      responseText = await res.text().catch(() => "");
    } catch (e) {
      return new Response(JSON.stringify({ error: "Erro de rede", detail: String(e) }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let wapiResult: unknown = null;
    try { wapiResult = JSON.parse(responseText); } catch { /* ok */ }

    // Debug: guarda a resposta bruta para validar o nome exato do campo de imagem
    await supabase.from("webhook_debug").insert({
      payload: { _debug: "chat-details", url: `${baseUrl}/chat/details`, status: wapiStatus, response: responseText },
    });

    if (wapiStatus < 200 || wapiStatus >= 300) {
      return new Response(JSON.stringify({ error: "Erro ao buscar foto", detail: responseText }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fotoUrl = findImageUrl(wapiResult);
    if (fotoUrl) {
      await supabase
        .from("whatsapp_conversas")
        .update({ foto_perfil_url: fotoUrl })
        .eq("id", conversa_id);
    }

    return new Response(JSON.stringify({ foto_perfil_url: fotoUrl }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal error", detail: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
