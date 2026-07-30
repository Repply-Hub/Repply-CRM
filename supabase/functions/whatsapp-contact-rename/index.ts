import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const { conversa_id, nome } = body;
    if (!conversa_id || !nome || !String(nome).trim()) {
      return new Response(JSON.stringify({ error: "conversa_id e nome são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const nomeTrim = String(nome).trim();

    const { data: conversa } = await supabase
      .from("whatsapp_conversas")
      .select("id, telefone, empresa_id, is_group")
      .eq("id", conversa_id)
      .single();
    if (!conversa) {
      return new Response(JSON.stringify({ error: "Conversa não encontrada" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // /contact/add da uazapi só edita a agenda de contatos individuais — grupos
    // não têm entrada de agenda equivalente, então o nome só é atualizado localmente.
    if (conversa.is_group) {
      const { error: updErr } = await supabase
        .from("whatsapp_conversas")
        .update({ nome_contato: nomeTrim, nome_contato_editado_manualmente: true })
        .eq("id", conversa_id);
      if (updErr) throw updErr;
      return new Response(JSON.stringify({ nome_contato: nomeTrim, synced_to_whatsapp: false }), {
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
    const number = digits.startsWith("55") ? digits : `55${digits}`;

    let responseText = "";
    let wapiStatus = 0;
    try {
      const res = await fetch(`${baseUrl}/contact/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: config.api_key },
        body: JSON.stringify({ number, name: nomeTrim }),
      });
      wapiStatus = res.status;
      responseText = await res.text().catch(() => "");
    } catch (e) {
      return new Response(JSON.stringify({ error: "Erro de rede", detail: String(e) }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (wapiStatus < 200 || wapiStatus >= 300) {
      let wapiError = "";
      try { wapiError = JSON.parse(responseText)?.error ?? ""; } catch { /* ok */ }
      return new Response(JSON.stringify({ error: wapiError || "Erro ao renomear contato no WhatsApp", detail: responseText }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: updErr } = await supabase
      .from("whatsapp_conversas")
      .update({ nome_contato: nomeTrim, nome_contato_editado_manualmente: true })
      .eq("id", conversa_id);
    if (updErr) throw updErr;

    return new Response(JSON.stringify({ nome_contato: nomeTrim, synced_to_whatsapp: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal error", detail: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
