import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
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

    const url = new URL(req.url);
    const instanceName = url.searchParams.get("instance") ?? req.headers.get("x-instance-name");

    if (!instanceName) {
      return new Response(JSON.stringify({ error: "instance param required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawBody = await req.text();
    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: config } = await supabase
      .from("configuracoes_wapi")
      .select("empresa_id, webhook_secret")
      .eq("instance_name", instanceName)
      .single();

    if (!config) {
      return new Response(JSON.stringify({ error: "instance not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const empresaId = config.empresa_id;

    // Formato uazapi: { message: {...}, chat: {...}, EventType: "messages", ... }
    const eventType = (payload.EventType ?? payload.event ?? payload.type ?? "").toLowerCase();

    if (eventType === "messages" || eventType.includes("message")) {
      await handleIncomingMessage(supabase, empresaId, payload);
    } else if (eventType.includes("connection")) {
      await handleConnectionUpdate(supabase, empresaId, instanceName, payload);
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[webhook] error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function handleIncomingMessage(supabase: any, empresaId: string, payload: any) {
  const msg = payload.message;
  if (!msg) return;

  // Ignora mensagens enviadas pela própria instância ou por API
  if (msg.fromMe === true || msg.wasSentByApi === true) return;

  // Ignora grupos
  if (msg.isGroup === true || payload.chat?.wa_isGroup === true) return;

  // Extrai número do remetente
  const chatid: string = msg.chatid ?? msg.sender_pn ?? "";
  const telefone = chatid.replace("@s.whatsapp.net", "").replace("@c.us", "");
  if (!telefone) return;

  const wamid: string = msg.messageid ?? msg.id ?? "";
  const pushName: string = msg.senderName ?? payload.chat?.wa_name ?? payload.chat?.name ?? "";

  // Extrai conteúdo conforme tipo
  const msgType = (msg.type ?? msg.messageType ?? "text").toLowerCase();
  let conteudo: string = msg.text ?? msg.content ?? msg.caption ?? "";
  let tipo = "texto";

  if (msgType === "image" || msgType === "imageMessage") {
    tipo = "imagem";
    if (!conteudo) conteudo = "[Imagem]";
  } else if (msgType === "audio" || msgType === "audioMessage" || msgType === "ptt") {
    tipo = "audio";
    conteudo = "[Áudio]";
  } else if (msgType === "video" || msgType === "videoMessage") {
    tipo = "video";
    if (!conteudo) conteudo = "[Vídeo]";
  } else if (msgType === "document" || msgType === "documentMessage") {
    tipo = "documento";
    if (!conteudo) conteudo = "[Documento]";
  } else if (msgType === "sticker" || msgType === "stickerMessage") {
    tipo = "sticker";
    conteudo = "[Sticker]";
  }

  if (!conteudo) conteudo = `[${tipo}]`;

  console.log(`[webhook] mensagem de ${telefone} (${pushName}): "${conteudo}"`);

  // Upsert da conversa
  const { data: conversa, error: convError } = await supabase
    .from("whatsapp_conversas")
    .upsert(
      {
        empresa_id: empresaId,
        telefone,
        nome_contato: pushName || null,
        ultima_mensagem: conteudo.slice(0, 200),
        ultima_mensagem_at: new Date().toISOString(),
        nao_lidas: 1,
      },
      { onConflict: "empresa_id,telefone" }
    )
    .select("id, nao_lidas")
    .single();

  if (convError) {
    console.error("[webhook] upsert conversa:", convError);
    return;
  }

  // Incrementa não lidas
  await supabase
    .from("whatsapp_conversas")
    .update({ nao_lidas: (conversa.nao_lidas ?? 0) + 1 })
    .eq("id", conversa.id);

  // Insere mensagem (sem duplicar pelo wamid)
  const insertData: any = {
    conversa_id: conversa.id,
    empresa_id: empresaId,
    direcao: "entrada",
    conteudo,
    tipo,
    status: "entregue",
    lida: false,
  };
  if (wamid) insertData.wamid = wamid;

  const { error: msgError } = await supabase
    .from("whatsapp_mensagens")
    .upsert(insertData, wamid ? { onConflict: "wamid", ignoreDuplicates: true } : {});

  if (msgError) {
    console.error("[webhook] insert mensagem:", msgError);
  }
}

async function handleConnectionUpdate(
  supabase: any,
  empresaId: string,
  instanceName: string,
  payload: any
) {
  const state = payload.data?.state ?? payload.state ?? payload.status;
  const statusMap: Record<string, string> = {
    open: "connected", connected: "connected",
    close: "disconnected", disconnected: "disconnected",
    connecting: "connecting",
  };
  const status = statusMap[state] ?? "disconnected";

  await supabase
    .from("configuracoes_wapi")
    .update({ status })
    .eq("empresa_id", empresaId)
    .eq("instance_name", instanceName);
}
