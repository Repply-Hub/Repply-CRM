import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Mesma extração usada em whatsapp-send: o wamid salvo às vezes vem como
// "<telefone>:<messageid>" — a uazapi espera só o messageid puro.
function rawMessageId(wamid: string): string {
  const idx = wamid.lastIndexOf(":");
  return idx !== -1 ? wamid.slice(idx + 1) : wamid;
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

    const { wamid, emoji } = body as { wamid?: string; emoji?: string };

    if (!wamid) {
      return new Response(JSON.stringify({ error: "wamid é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: userData } = await supabase
      .from("usuarios")
      .select("id, empresa_id")
      .eq("user_id", user.id).single();
    if (!userData) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: instLink } = await supabase
      .from("wapi_instancia_usuarios")
      .select("configuracoes_wapi:instancia_id(id, instance_url, api_key, instance_name, api_instance_name, status)")
      .eq("usuario_auth_id", user.id)
      .limit(1)
      .maybeSingle();
    const config = (instLink?.configuracoes_wapi ?? null) as {
      id: string; instance_url: string; api_key: string; instance_name: string;
      api_instance_name: string | null; status: string;
    } | null;
    if (!config) {
      return new Response(JSON.stringify({ error: "WhatsApp não configurado" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (config.status !== "connected") {
      return new Response(JSON.stringify({ error: "Instância desconectada" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const baseUrl = config.instance_url.replace(/\/$/, "");

    // Confirmado empiricamente contra a instância real (docs.uazapi.com não é acessível
    // programaticamente): o endpoint de reação é POST /message/react, com campos
    // capitalizados (Id/Text) — convenção diferente de /send/text (number/text em
    // minúsculo). O JID de destino é resolvido pela própria uazapi a partir do Id da
    // mensagem, não precisa de number/phone. Text vazio remove a reação.
    const wapiUrl = `${baseUrl}/message/react`;
    let wapiStatus = 0;
    let responseText = "";
    let fetchError = "";
    try {
      const res = await fetch(wapiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: config.api_key },
        body: JSON.stringify({
          Id: rawMessageId(wamid),
          Text: emoji ?? "",
        }),
      });
      wapiStatus = res.status;
      responseText = await res.text().catch(() => "");
    } catch (e) { fetchError = String(e); }

    await supabase.from("webhook_debug").insert({
      payload: {
        _debug: true, _reaction_send: true, url: wapiUrl, status: wapiStatus,
        response: responseText, fetch_error: fetchError || null,
        request_body: { Id: rawMessageId(wamid), Text: emoji },
      },
    });

    if (fetchError) {
      return new Response(JSON.stringify({ error: "Erro de rede ao contactar WhatsApp", detail: fetchError }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (wapiStatus < 200 || wapiStatus >= 300) {
      let wapiError = "";
      try { wapiError = JSON.parse(responseText)?.error ?? ""; } catch { /* ok */ }
      return new Response(JSON.stringify({ error: wapiError || `Erro ao reagir (status ${wapiStatus})`, detail: responseText }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // A instância envia a reação com sucesso, mas o eco via webhook vem marcado
    // wasSentByApi=true (e por isso é ignorado por handleIncomingMessage) — persiste
    // o resultado aqui, igual ao whatsapp-send faz para mensagens normais.
    const { data: alvos } = await supabase
      .from("whatsapp_mensagens")
      .select("id, reacoes")
      .eq("empresa_id", userData.empresa_id)
      .like("wamid", `%${rawMessageId(wamid)}`);

    for (const alvo of alvos ?? []) {
      const atuais: any[] = Array.isArray(alvo.reacoes) ? alvo.reacoes : [];
      const semAutor = atuais.filter((r) => r?.autor !== "eu");
      const novasReacoes = emoji
        ? [...semAutor, { emoji, autor: "eu", nome: "Você", at: new Date().toISOString() }]
        : semAutor;
      await supabase.from("whatsapp_mensagens").update({ reacoes: novasReacoes }).eq("id", alvo.id);
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal error", detail: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
