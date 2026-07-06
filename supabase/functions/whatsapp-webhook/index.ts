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

    const eventType = (payload.EventType ?? payload.event ?? payload.type ?? "").toLowerCase();

    if (eventType === "messages" || eventType.includes("message")) {
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
  const telefone = chatid
    .replace("@s.whatsapp.net", "")
    .replace("@c.us", "")
    .replace("@g.us", "");
  if (!telefone) return;

  const wamid: string = msg.messageid ?? msg.id ?? "";
  // Para grupos, o nome da conversa é o nome do grupo; para individuais é o nome do contato
  const groupName: string = payload.chat?.wa_name ?? payload.chat?.name ?? "";
  const pushName: string = isGroup
    ? (groupName || msg.senderName || "")
    : (msg.senderName ?? payload.chat?.wa_name ?? payload.chat?.name ?? "");

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
        arquivada: false,
      },
      { onConflict: "empresa_id,telefone" }
    )
    .select("id, nao_lidas")
    .single();

  if (convError) {
    console.error("[webhook] upsert conversa:", convError);
    return;
  }

  await supabase
    .from("whatsapp_conversas")
    .update({ nao_lidas: (conversa.nao_lidas ?? 0) + 1 })
    .eq("id", conversa.id);

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
