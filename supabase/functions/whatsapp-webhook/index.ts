import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

// WhatsApp/uazapi às vezes envia o JID de celulares BR sem o 9º dígito (número antigo).
// Normaliza para o formato canônico (55 + DDD + 9 + número) para casar com conversas
// criadas manualmente no app, evitando duas conversas para o mesmo contato.
function normalizeWhatsappPhone(raw: string): string {
  let digits = (raw ?? "").replace(/\D/g, "");
  // só remove o "55" se for código de país (DDD 55 do RS também começa com "55")
  if (digits.length > 11 && digits.startsWith("55")) digits = digits.slice(2);
  if (digits.length === 10) {
    digits = `${digits.slice(0, 2)}9${digits.slice(2)}`;
  }
  return `55${digits}`;
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
      .select("empresa_id, webhook_secret, instance_url, api_key, api_instance_name")
      .eq("instance_name", instanceName)
      .single();

    if (!config) {
      return new Response(JSON.stringify({ error: "instance not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const empresaId = config.empresa_id;

    // payload.event pode ser string (nome do evento, em payloads antigos) ou objeto
    // (dados do evento, ex: messages_update) — só usa como fallback se for string.
    const eventTypeFallback = typeof payload.event === "string" ? payload.event : "";
    const eventType = (payload.EventType ?? eventTypeFallback ?? payload.type ?? "").toLowerCase();

    if (eventType === "messages_update") {
      await handleStatusUpdate(supabase, empresaId, payload);
    } else if (eventType === "messages" || eventType.includes("message")) {
      await handleIncomingMessage(supabase, empresaId, instanceName, config, payload);
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

async function uploadBytesToStorage(
  supabase: any,
  bytes: Uint8Array,
  mime: string,
  empresaId: string,
  wamid: string,
): Promise<string | null> {
  const ext = mime.includes("ogg") ? "ogg" : mime.includes("webm") ? "webm"
    : mime.includes("mp4") ? "mp4" : mime.includes("mpeg") ? "mp3"
    : mime.includes("jpeg") || mime.includes("jpg") ? "jpg"
    : mime.includes("png") ? "png" : mime.includes("pdf") ? "pdf" : "bin";

  const path = `incoming/${empresaId}/${Date.now()}-${wamid.slice(-10)}.${ext}`;
  const { data: up, error } = await supabase.storage
    .from("whatsapp-media")
    .upload(path, bytes, { contentType: mime, upsert: false });
  if (error) { console.error("[webhook] upload falhou:", error); return null; }
  return supabase.storage.from("whatsapp-media").getPublicUrl(up.path).data.publicUrl;
}

function b64ToBytes(raw: string): Uint8Array {
  const b64 = raw.includes(",") ? raw.split(",")[1] : raw;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function decryptWhatsAppMedia(
  encUrl: string,
  mediaKeyB64: string,
  tipo: string,
): Promise<Uint8Array | null> {
  const infoMap: Record<string, string> = {
    audio: "WhatsApp Audio Keys",
    imagem: "WhatsApp Image Keys",
    video: "WhatsApp Video Keys",
    documento: "WhatsApp Document Keys",
    sticker: "WhatsApp Image Keys",
  };
  const info = new TextEncoder().encode(infoMap[tipo] ?? "WhatsApp Audio Keys");

  const mediaKey = b64ToBytes(mediaKeyB64);
  const ikm = await crypto.subtle.importKey("raw", mediaKey, "HKDF", false, ["deriveBits"]);
  const expandedBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info },
    ikm,
    112 * 8,
  );
  const expanded = new Uint8Array(expandedBits);
  const iv = expanded.slice(0, 16);
  const cipherKey = expanded.slice(16, 48);

  const res = await fetch(encUrl, { headers: { "User-Agent": "WhatsApp/2.23.0 A" } });
  if (!res.ok) { console.log(`[webhook] CDN fetch ${res.status}`); return null; }
  const encData = new Uint8Array(await res.arrayBuffer());
  const encMedia = encData.slice(0, -10);

  const key = await crypto.subtle.importKey("raw", cipherKey, { name: "AES-CBC" }, false, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-CBC", iv }, key, encMedia);
  return new Uint8Array(plaintext);
}

async function downloadAndStoreMedia(
  supabase: any,
  _config: any,
  empresaId: string,
  _instanceName: string,
  wamid: string,
  mediaMime: string | null,
  cdnUrl: string | null,
  inlineB64: string | null,
  mediaKey: string | null,
  tipo: string,
): Promise<string | null> {
  const mime = (mediaMime ?? "audio/ogg").split(";")[0].trim();

  try {
    if (inlineB64) {
      console.log("[webhook] base64 inline");
      const bytes = b64ToBytes(inlineB64);
      return await uploadBytesToStorage(supabase, bytes, mime, empresaId, wamid);
    }

    if (cdnUrl && mediaKey) {
      console.log("[webhook] descriptografando WhatsApp E2E...");
      const bytes = await decryptWhatsAppMedia(cdnUrl, mediaKey, tipo);
      if (bytes) {
        console.log(`[webhook] descriptografia OK — ${bytes.length} bytes`);
        return await uploadBytesToStorage(supabase, bytes, mime, empresaId, wamid);
      }
    }

    return null;
  } catch (e) {
    console.error("[webhook] downloadAndStoreMedia erro:", e);
    return null;
  }
}

async function handleIncomingMessage(
  supabase: any,
  empresaId: string,
  instanceName: string,
  config: any,
  payload: any,
) {
  const msg = payload.message;
  if (!msg) return;

  if (msg.fromMe === true || msg.wasSentByApi === true) return;

  const isGroup = msg.isGroup === true || payload.chat?.wa_isGroup === true;

  const chatid: string = msg.chatid ?? msg.sender_pn ?? "";
  const rawTelefone = chatid
    .replace("@s.whatsapp.net", "")
    .replace("@c.us", "")
    .replace("@g.us", "");
  if (!rawTelefone) return;
  const telefone = isGroup ? rawTelefone : normalizeWhatsappPhone(rawTelefone);

  const wamid: string = msg.messageid ?? msg.id ?? "";
  // Para grupos, o nome da conversa é o nome do grupo; para individuais é o nome do contato
  const groupName: string = payload.chat?.wa_name ?? payload.chat?.name ?? "";
  const pushName: string = isGroup
    ? (groupName || msg.senderName || "")
    : (msg.senderName ?? payload.chat?.wa_name ?? payload.chat?.name ?? "");

  // Em grupos, quem enviou a mensagem é o participante (msg.sender_pn / msg.senderName),
  // não o grupo em si — guarda separado para exibir "quem mandou o quê" na UI.
  let remetenteNome: string | null = null;
  let remetenteTelefone: string | null = null;
  if (isGroup) {
    remetenteNome = msg.senderName || null;
    const rawSenderPn = (msg.sender_pn ?? "")
      .replace("@s.whatsapp.net", "")
      .replace("@c.us", "");
    remetenteTelefone = rawSenderPn ? normalizeWhatsappPhone(rawSenderPn) : null;
  }

  const msgType = (msg.messageType ?? msg.type ?? "text").toLowerCase();
  const content = msg.content && typeof msg.content === "object" ? msg.content : null;
  let conteudo: string = msg.text || content?.caption || msg.caption || "";
  let tipo = "texto";

  const anyMediaUrl = (): string | null =>
    content?.URL ?? content?.url ?? content?.link ?? content?.audio ??
    msg.audioUrl ?? msg.imageUrl ?? msg.videoUrl ?? msg.documentUrl ?? null;

  let mediaUrl: string | null = null;
  let mediaMime: string | null =
    content?.mimetype ?? content?.mimeType ?? msg.mimetype ?? null;

  if (msgType.includes("image")) {
    tipo = "imagem";
    mediaUrl = anyMediaUrl();
    if (!conteudo) conteudo = "[Imagem]";
  } else if (
    msgType.includes("audio") || msgType.includes("ptt") ||
    msgType.includes("voice") ||
    msg.ptt === true || content?.ptt === true
  ) {
    tipo = "audio";
    mediaUrl = anyMediaUrl();
    conteudo = "[Áudio]";
  } else if (msgType.includes("video")) {
    tipo = "video";
    mediaUrl = anyMediaUrl();
    if (!conteudo) conteudo = "[Vídeo]";
  } else if (msgType.includes("document")) {
    tipo = "documento";
    mediaUrl = anyMediaUrl();
    if (!conteudo) conteudo = content?.fileName ?? content?.filename ?? "[Documento]";
  } else if (msgType.includes("sticker")) {
    tipo = "sticker";
    mediaUrl = anyMediaUrl();
    conteudo = "[Sticker]";
  }

  // Fallback: detecta pelo mimetype
  if (tipo === "texto" && mediaMime) {
    const mime = mediaMime.toLowerCase();
    if (mime.startsWith("audio/") || mime.includes("ogg") || mime.includes("opus")) {
      tipo = "audio";
      mediaUrl = anyMediaUrl();
      conteudo = "[Áudio]";
    } else if (mime.startsWith("image/")) {
      tipo = "imagem";
      mediaUrl = anyMediaUrl();
      if (!conteudo) conteudo = "[Imagem]";
    } else if (mime.startsWith("video/")) {
      tipo = "video";
      mediaUrl = anyMediaUrl();
      if (!conteudo) conteudo = "[Vídeo]";
    } else if (mime.startsWith("application/") || mime.includes("pdf") || mime.includes("zip")) {
      tipo = "documento";
      mediaUrl = anyMediaUrl();
      if (!conteudo) conteudo = "[Documento]";
    }
  }

  if (!conteudo) conteudo = `[${tipo}]`;

  const inlineB64: string | null =
    msg.base64 ?? content?.base64 ?? msg.data ?? content?.data ?? null;
  const mediaKey: string | null =
    content?.mediaKey ?? content?.MediaKey ?? msg.mediaKey ?? null;

  if (tipo !== "texto" && wamid) {
    const storedUrl = await downloadAndStoreMedia(
      supabase, config, empresaId, instanceName, wamid, mediaMime,
      anyMediaUrl(), inlineB64, mediaKey, tipo,
    );
    if (storedUrl) mediaUrl = storedUrl;
    console.log(`[webhook] mídia (${tipo}) stored="${storedUrl ?? "falhou"}"`);
  }

  console.log(`[webhook] mensagem de ${telefone} (${pushName}) grupo=${isGroup}: "${conteudo}" tipo=${tipo}`);

  const { data: existente } = await supabase
    .from("whatsapp_conversas")
    .select("id, nao_lidas, nome_contato")
    .eq("empresa_id", empresaId)
    .eq("telefone", telefone)
    .maybeSingle();

  let conversa: { id: string; nao_lidas: number } | null = null;

  if (existente) {
    const { data, error } = await supabase
      .from("whatsapp_conversas")
      .update({
        nome_contato: pushName || existente.nome_contato,
        ultima_mensagem: conteudo.slice(0, 200),
        ultima_mensagem_at: new Date().toISOString(),
        nao_lidas: (existente.nao_lidas ?? 0) + 1,
        arquivada: false,
        is_group: isGroup,
      })
      .eq("id", existente.id)
      .select("id, nao_lidas")
      .single();
    if (error) {
      console.error("[webhook] update conversa:", error);
      return;
    }
    conversa = data;
  } else {
    const { data, error } = await supabase
      .from("whatsapp_conversas")
      .insert({
        empresa_id: empresaId,
        telefone,
        nome_contato: pushName || null,
        ultima_mensagem: conteudo.slice(0, 200),
        ultima_mensagem_at: new Date().toISOString(),
        nao_lidas: 1,
        arquivada: false,
        is_group: isGroup,
      })
      .select("id, nao_lidas")
      .single();
    if (error) {
      console.error("[webhook] insert conversa:", error);
      return;
    }
    conversa = data;
  }

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
  if (mediaUrl) insertData.media_url = mediaUrl;
  if (mediaMime) insertData.media_mime = mediaMime;
  if (remetenteNome) insertData.remetente_nome = remetenteNome;
  if (remetenteTelefone) insertData.remetente_telefone = remetenteTelefone;

  const { error: msgError } = await supabase
    .from("whatsapp_mensagens")
    .upsert(insertData, wamid ? { onConflict: "wamid", ignoreDuplicates: true } : {});

  if (msgError) {
    console.error("[webhook] insert mensagem:", msgError);
  }
}

// Recibo de entrega/leitura (evento "messages_update" da uazapi). Formato real
// observado: { EventType: "messages_update", state: "Delivered", event: { Type:
// "Delivered", MessageIDs: ["<messageid sem prefixo de telefone>"], ... } } — o
// wamid salvo em whatsapp_mensagens vem como "<telefone>:<messageid>" (resposta do
// /send/text), por isso o match é por sufixo (LIKE '%<messageid>').
const STATUS_RANK: Record<string, number> = { enviando: 0, enviado: 1, entregue: 2, lido: 3 };
const RECEIPT_STATUS_MAP: Record<string, string> = {
  delivered: "entregue",
  read: "lido",
  "read-self": "lido",
  played: "lido",
};

async function handleStatusUpdate(supabase: any, empresaId: string, payload: any) {
  const ev = payload.event ?? {};
  const messageIds: string[] = Array.isArray(ev.MessageIDs) ? ev.MessageIDs : [];
  if (messageIds.length === 0) return;

  const receiptType = String(ev.Type ?? payload.state ?? "").toLowerCase();
  const novoStatus = RECEIPT_STATUS_MAP[receiptType];
  if (!novoStatus) return;

  for (const rawId of messageIds) {
    if (!rawId) continue;
    const { data: msgs, error } = await supabase
      .from("whatsapp_mensagens")
      .select("id, status")
      .eq("empresa_id", empresaId)
      .eq("direcao", "saida")
      .like("wamid", `%${rawId}`);
    if (error) {
      console.error("[webhook] status update select:", error);
      continue;
    }
    for (const m of msgs ?? []) {
      if ((STATUS_RANK[m.status] ?? 0) >= STATUS_RANK[novoStatus]) continue;
      await supabase.from("whatsapp_mensagens").update({ status: novoStatus }).eq("id", m.id);
    }
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
