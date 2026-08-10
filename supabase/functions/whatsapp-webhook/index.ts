import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizeWhatsappPhone } from "../_shared/whatsapp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};


serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const url = new URL(req.url);
    const instanceName =
      url.searchParams.get("instance") ?? req.headers.get("x-instance-name");

    if (!instanceName) {
      return new Response(
        JSON.stringify({ error: "instance param required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
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
      .select(
        "id, empresa_id, webhook_secret, instance_url, api_key, api_instance_name",
      )
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
    const eventTypeFallback =
      typeof payload.event === "string" ? payload.event : "";
    const eventType = (
      payload.EventType ??
      eventTypeFallback ??
      payload.type ??
      ""
    ).toLowerCase();

    if (eventType === "messages_update") {
      await handleStatusUpdate(supabase, empresaId, payload);
    } else if (eventType === "messages" || eventType.includes("message")) {
      await handleIncomingMessage(
        supabase,
        empresaId,
        instanceName,
        config,
        payload,
      );
    } else if (eventType.includes("connection")) {
      await handleConnectionUpdate(supabase, empresaId, instanceName, payload);
    } else if (eventType.includes("call")) {
      await handleCallEvent(supabase, empresaId, payload);
    } else if (
      !eventType.includes("presence") &&
      !eventType.includes("group")
    ) {
      // eventType desconhecido e não é um dos tipos já ignorados de propósito
      // (presence/group) — grava pra investigar depois se isso não devia ter
      // sido tratado como mensagem.
      await logWebhookDrop(supabase, "evento_nao_reconhecido", {
        eventType,
        payload,
      });
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

// Registra em webhook_debug qualquer ponto em que uma mensagem/evento é descartado
// sem gravar nada — sem isso, perdas silenciosas só são descobertas quando alguém
// nota "faltou uma mensagem" dias depois, sem nenhuma pista de qual campo faltou.
async function logWebhookDrop(supabase: any, motivo: string, payload: unknown) {
  try {
    await supabase
      .from("webhook_debug")
      .insert({ payload: { _drop_reason: motivo, payload } });
  } catch (e) {
    console.error("[webhook] falha ao gravar webhook_debug:", e);
  }
}

// Mimetypes de documento que a uazapi/baileys mandam para arquivos "document" — sem
// essas entradas, o fallback genérico gravava tudo como .bin, tornando o arquivo
// original (docx, xlsx, etc.) ilegível para quem baixasse pela URL do Storage.
const MIME_TO_EXT: Record<string, string> = {
  "vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  msword: "doc",
  "vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "vnd.ms-excel": "xls",
  "vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "vnd.ms-powerpoint": "ppt",
  zip: "zip",
  "x-rar-compressed": "rar",
  "vnd.rar": "rar",
  csv: "csv",
  plain: "txt",
};

function extFromFileName(fileName: string | null): string | null {
  if (!fileName) return null;
  const match = /\.([a-zA-Z0-9]{1,8})$/.exec(fileName.trim());
  return match ? match[1].toLowerCase() : null;
}

function extFromMime(mime: string): string {
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("mpeg")) return "mp3";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("pdf")) return "pdf";
  for (const [needle, ext] of Object.entries(MIME_TO_EXT)) {
    if (mime.includes(needle)) return ext;
  }
  return "bin";
}

async function uploadBytesToStorage(
  supabase: any,
  bytes: Uint8Array,
  mime: string,
  empresaId: string,
  wamid: string,
  fileName: string | null = null,
): Promise<string | null> {
  const ext = extFromFileName(fileName) ?? extFromMime(mime);

  const path = `incoming/${empresaId}/${Date.now()}-${wamid.slice(-10)}.${ext}`;
  const { data: up, error } = await supabase.storage
    .from("whatsapp-media")
    .upload(path, bytes, { contentType: mime, upsert: false });
  if (error) {
    console.error("[webhook] upload falhou:", error);
    return null;
  }
  return supabase.storage.from("whatsapp-media").getPublicUrl(up.path).data
    .publicUrl;
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
  const ikm = await crypto.subtle.importKey("raw", mediaKey, "HKDF", false, [
    "deriveBits",
  ]);
  const expandedBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info },
    ikm,
    112 * 8,
  );
  const expanded = new Uint8Array(expandedBits);
  const iv = expanded.slice(0, 16);
  const cipherKey = expanded.slice(16, 48);

  const res = await fetch(encUrl, {
    headers: { "User-Agent": "WhatsApp/2.23.0 A" },
  });
  if (!res.ok) {
    console.log(`[webhook] CDN fetch ${res.status}`);
    return null;
  }
  const encData = new Uint8Array(await res.arrayBuffer());
  const encMedia = encData.slice(0, -10);

  const key = await crypto.subtle.importKey(
    "raw",
    cipherKey,
    { name: "AES-CBC" },
    false,
    ["decrypt"],
  );
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-CBC", iv },
    key,
    encMedia,
  );
  return new Uint8Array(plaintext);
}

// Fallback quando a uazapi não manda `mimetype` no payload (comum em figurinhas).
// Usar um default único (ex.: "audio/ogg") para todos os tipos gravava o Content-Type
// errado no Storage para mídias não-áudio — um sticker salvo como "audio/ogg" não
// renderiza em nenhuma tag <img>, mesmo com os bytes corretos.
const DEFAULT_MIME_BY_TIPO: Record<string, string> = {
  audio: "audio/ogg",
  imagem: "image/jpeg",
  video: "video/mp4",
  documento: "application/octet-stream",
  sticker: "image/webp",
};

// Fallback via API da uazapi (POST /message/download) para quando o payload do
// webhook não traz um `content.url`/mediaKey utilizáveis (visto em produção: algumas
// figurinhas chegam com `content.url` truncado, ex. "https://a.whatsapp.net", que não
// é um link de mídia válido — nossa descriptografia manual não tem como funcionar com
// isso). A uazapi já faz esse download/descriptografia internamente; ver
// docs.uazapi.com — endpoint retorna `base64Data` quando `return_base64: true`.
type UazapiDownloadResult =
  | { ok: true; bytes: Uint8Array; mime: string | null }
  | { ok: false; reason: string; detail: unknown };

async function downloadViaUazapiApi(
  config: { instance_url: string; api_key: string },
  wamid: string,
): Promise<UazapiDownloadResult> {
  try {
    const baseUrl = config.instance_url.replace(/\/$/, "");
    const res = await fetch(`${baseUrl}/message/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: config.api_key },
      body: JSON.stringify({
        id: wamid,
        return_base64: true,
        return_link: false,
      }),
    });
    const bodyText = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        reason: `http_${res.status}`,
        detail: bodyText.slice(0, 2000),
      };
    }
    let data: any;
    try {
      data = JSON.parse(bodyText);
    } catch {
      return {
        ok: false,
        reason: "invalid_json",
        detail: bodyText.slice(0, 2000),
      };
    }
    if (!data?.base64Data) {
      return { ok: false, reason: "no_base64Data", detail: data };
    }
    return {
      ok: true,
      bytes: b64ToBytes(data.base64Data),
      mime: data.mimetype ?? null,
    };
  } catch (e) {
    return { ok: false, reason: "exception", detail: String(e) };
  }
}

async function downloadAndStoreMedia(
  supabase: any,
  config: any,
  empresaId: string,
  _instanceName: string,
  wamid: string,
  mediaMime: string | null,
  cdnUrl: string | null,
  inlineB64: string | null,
  mediaKey: string | null,
  tipo: string,
  fileName: string | null = null,
): Promise<string | null> {
  const mime = (mediaMime ?? DEFAULT_MIME_BY_TIPO[tipo] ?? "audio/ogg")
    .split(";")[0]
    .trim();

  try {
    if (inlineB64) {
      console.log("[webhook] base64 inline");
      const bytes = b64ToBytes(inlineB64);
      return await uploadBytesToStorage(
        supabase,
        bytes,
        mime,
        empresaId,
        wamid,
        fileName,
      );
    }

    if (cdnUrl && mediaKey) {
      console.log("[webhook] descriptografando WhatsApp E2E...");
      // `crypto.subtle.decrypt` lança (não retorna null) quando a chave/padding não
      // batem — sem este try/catch local, essa exceção seria pega pelo catch externo
      // da função inteira, abortando antes de tentar o fallback via API da uazapi.
      let bytes: Uint8Array | null = null;
      try {
        bytes = await decryptWhatsAppMedia(cdnUrl, mediaKey, tipo);
      } catch (e) {
        console.error("[webhook] descriptografia E2E falhou:", e);
      }
      if (bytes) {
        console.log(`[webhook] descriptografia OK — ${bytes.length} bytes`);
        return await uploadBytesToStorage(
          supabase,
          bytes,
          mime,
          empresaId,
          wamid,
          fileName,
        );
      }
    }

    if (config?.instance_url && config?.api_key && wamid) {
      console.log("[webhook] fallback: baixando mídia via API uazapi...");
      const apiResult = await downloadViaUazapiApi(config, wamid);
      if (apiResult.ok) {
        const apiMime = (apiResult.mime ?? mime).split(";")[0].trim();
        console.log(
          `[webhook] download via API OK — ${apiResult.bytes.length} bytes, mime=${apiMime}`,
        );
        return await uploadBytesToStorage(
          supabase,
          apiResult.bytes,
          apiMime,
          empresaId,
          wamid,
          fileName,
        );
      }
      console.log(
        `[webhook] download via API uazapi falhou: ${apiResult.reason}`,
      );
      await logWebhookDrop(
        supabase,
        `media_download_uazapi_falhou:${apiResult.reason}`,
        {
          wamid,
          tipo,
          detail: apiResult.detail,
        },
      );
    }

    return null;
  } catch (e) {
    console.error("[webhook] downloadAndStoreMedia erro:", e);
    return null;
  }
}

// Mensagens recebidas criam/atualizam a conversa via service role, sem passar pelo
// trigger de auto-atribuição de responsável (esse só roda para inserts feitos pelo
// client autenticado, ver 20260709190000_whatsapp_conversas_restringe_admin_e_responsaveis.sql).
// Isso é intencional: a conversa nasce sem responsável (visível só para admin/role
// empresa, que já têm acesso total via RLS independente de whatsapp_conversa_responsaveis)
// até alguém assumi-la ou um admin/gestor direcioná-la para um atendente — ver o fluxo
// "Assumir/Direcionar" em WhatsAppInbox.tsx. Não auto-atribuir todos os usuários
// vinculados à instância (wapi_instancia_usuarios): isso inflava a lista de
// responsáveis a cada mensagem nova, mesmo em conversas já atribuídas a outra pessoa.

async function handleIncomingMessage(
  supabase: any,
  empresaId: string,
  instanceName: string,
  config: any,
  payload: any,
) {
  const msg = payload.message;
  if (!msg) {
    await logWebhookDrop(supabase, "sem_message", payload);
    return;
  }

  // `wasSentByApi` = true significa que essa mensagem já foi inserida de forma
  // síncrona pelo whatsapp-send (CRM chamou a API da uazapi) — ignora pra não duplicar.
  // `fromMe` sozinho só indica que a mensagem saiu deste número, não quem a originou:
  // mensagens enviadas pelo WhatsApp Web ou pelo celular físico conectado à mesma
  // instância também chegam com fromMe=true, mas precisam ser salvas (direcao "saida")
  // porque nunca passaram pelo whatsapp-send.
  if (msg.wasSentByApi === true) return;

  const sentByOtherChannel = msg.fromMe === true;

  // `chatid` termina em "@g.us" para grupos no formato uazapi/baileys — sinal mais
  // confiável que `msg.isGroup`/`payload.chat?.wa_isGroup`, que já vieram ausentes/false
  // em payloads de grupo e faziam o telefone do grupo ser normalizado como se fosse um
  // número BR individual, gerando uma conversa "fantasma" separada da conversa real.
  const chatid: string = msg.chatid ?? msg.sender_pn ?? "";
  const isGroup =
    chatid.endsWith("@g.us") ||
    msg.isGroup === true ||
    payload.chat?.wa_isGroup === true;

  const rawTelefone = chatid
    .replace("@s.whatsapp.net", "")
    .replace("@c.us", "")
    .replace("@g.us", "");
  if (!rawTelefone) {
    await logWebhookDrop(supabase, "sem_telefone", { msg, chat: payload.chat });
    return;
  }
  const telefone = isGroup ? rawTelefone : normalizeWhatsappPhone(rawTelefone);

  const wamid: string = msg.messageid ?? msg.id ?? "";
  // Para grupos, o nome da conversa é o nome do grupo; para individuais é o nome do contato
  const groupName: string = payload.chat?.wa_name ?? payload.chat?.name ?? "";
  // wa_contactName é o nome salvo na AGENDA do celular conectado à instância — é o que
  // aparece no app do WhatsApp real. wa_name é só o "push name" (nome de perfil que a
  // própria pessoa define) e costuma divergir do nome salvo. Por isso wa_contactName tem
  // prioridade máxima para chat individual; `name` é o fallback já resolvido pela uazapi
  // (mistura wa_contactName/wa_name/dado interno), usado quando o contato não está salvo.
  const contactSavedName: string = payload.chat?.wa_contactName ?? "";
  // Em chat individual, msg.senderName é quem ENVIOU aquela mensagem específica — para
  // mensagens de saída refletidas de WhatsApp Web/celular físico (sentByOtherChannel),
  // isso é o próprio nome do perfil da empresa (ex: "MD Representações"), não o do
  // contato. Usar isso como pushName sobrescrevia nome_contato com o nome da própria
  // empresa a cada resposta enviada fora do CRM. payload.chat sempre descreve o contato
  // da conversa, então é a fonte certa quando quem enviou não é o contato.
  const pushName: string = isGroup
    ? groupName || msg.senderName || ""
    : sentByOtherChannel
      ? (contactSavedName || payload.chat?.name || payload.chat?.wa_name || "")
      : (contactSavedName || payload.chat?.name || msg.senderName || payload.chat?.wa_name || "");

  // Em grupos, quem enviou a mensagem é o participante (msg.sender_pn / msg.senderName),
  // não o grupo em si — guarda separado para exibir "quem mandou o quê" na UI.
  let remetenteNome: string | null = null;
  let remetenteTelefone: string | null = null;
  if (isGroup) {
    remetenteNome = msg.senderName || null;
    const rawSenderPn = (msg.sender_pn ?? "")
      .replace("@s.whatsapp.net", "")
      .replace("@c.us", "");
    remetenteTelefone = rawSenderPn
      ? normalizeWhatsappPhone(rawSenderPn)
      : null;
  }

  const msgType = (msg.messageType ?? msg.type ?? "text").toLowerCase();
  const content =
    msg.content && typeof msg.content === "object" ? msg.content : null;

  // --- Reação (❤️ 👍 etc.) a uma mensagem existente ---
  // Formato confirmado empiricamente contra POST /message/react (docs.uazapi.com não é
  // acessível programaticamente): messageType "ReactionMessage" e o alvo/emoji vêm direto
  // em content.key.ID / content.text (chave capitalizada "ID", diferente do resto do
  // payload que usa "id" minúsculo) — não aninhado em "reactionMessage". Mantém alguns
  // fallbacks defensivos e loga o payload cru em webhook_debug para facilitar ajuste caso
  // o webhook de mensagens recebidas difira do formato de confirmação de envio observado.
  const looksLikeReaction = msgType.includes("reaction");
  if (looksLikeReaction) {
    const reactionEmoji: string = content?.text ?? msg.text ?? "";
    const reactionTargetWamid: string | null =
      content?.key?.ID ??
      content?.key?.id ??
      msg.quoted?.id ??
      msg.quoted?.messageid ??
      content?.contextInfo?.stanzaId ??
      null;

    await supabase.from("webhook_debug").insert({
      payload: {
        _reaction_debug: true,
        msg,
        chat: payload.chat,
        reactionEmoji,
        reactionTargetWamid,
      },
    });

    if (reactionTargetWamid) {
      const autorKey = sentByOtherChannel ? "eu" : telefone;
      const autorNome = sentByOtherChannel ? "Você" : pushName || telefone;

      const { data: alvos } = await supabase
        .from("whatsapp_mensagens")
        .select("id, reacoes")
        .eq("empresa_id", empresaId)
        .like("wamid", `%${reactionTargetWamid}`);

      for (const alvo of alvos ?? []) {
        const atuais: any[] = Array.isArray(alvo.reacoes) ? alvo.reacoes : [];
        const semAutor = atuais.filter((r) => r?.autor !== autorKey);
        const novasReacoes = reactionEmoji
          ? [
              ...semAutor,
              {
                emoji: reactionEmoji,
                autor: autorKey,
                nome: autorNome,
                at: new Date().toISOString(),
              },
            ]
          : semAutor;
        await supabase
          .from("whatsapp_mensagens")
          .update({ reacoes: novasReacoes })
          .eq("id", alvo.id);
      }
    }
    return;
  }

  let conteudo: string = msg.text || content?.caption || msg.caption || "";
  let tipo = "texto";

  const anyMediaUrl = (): string | null =>
    content?.URL ??
    content?.url ??
    content?.link ??
    content?.audio ??
    msg.audioUrl ??
    msg.imageUrl ??
    msg.videoUrl ??
    msg.documentUrl ??
    msg.stickerUrl ??
    null;

  let mediaUrl: string | null = null;
  let mediaMime: string | null =
    content?.mimetype ?? content?.mimeType ?? msg.mimetype ?? null;
  const mediaFileName: string | null =
    content?.fileName ?? content?.filename ?? msg.fileName ?? null;

  if (msgType.includes("image")) {
    tipo = "imagem";
    mediaUrl = anyMediaUrl();
    if (!conteudo) conteudo = "[Imagem]";
  } else if (
    msgType.includes("audio") ||
    msgType.includes("ptt") ||
    msgType.includes("voice") ||
    msg.ptt === true ||
    content?.ptt === true
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
    if (!conteudo) conteudo = mediaFileName ?? "[Documento]";
  } else if (msgType.includes("sticker")) {
    tipo = "sticker";
    mediaUrl = anyMediaUrl();
    conteudo = "[Sticker]";
  }

  // Fallback: detecta pelo mimetype
  if (tipo === "texto" && mediaMime) {
    const mime = mediaMime.toLowerCase();
    if (
      mime.startsWith("audio/") ||
      mime.includes("ogg") ||
      mime.includes("opus")
    ) {
      tipo = "audio";
      mediaUrl = anyMediaUrl();
      conteudo = "[Áudio]";
    } else if (mime.includes("webp")) {
      // Stickers do WhatsApp são sempre image/webp; imagens normais nunca usam esse mimetype.
      tipo = "sticker";
      mediaUrl = anyMediaUrl();
      conteudo = "[Sticker]";
    } else if (mime.startsWith("image/")) {
      tipo = "imagem";
      mediaUrl = anyMediaUrl();
      if (!conteudo) conteudo = "[Imagem]";
    } else if (mime.startsWith("video/")) {
      tipo = "video";
      mediaUrl = anyMediaUrl();
      if (!conteudo) conteudo = "[Vídeo]";
    } else if (
      mime.startsWith("application/") ||
      mime.includes("pdf") ||
      mime.includes("zip")
    ) {
      tipo = "documento";
      mediaUrl = anyMediaUrl();
      if (!conteudo) conteudo = "[Documento]";
    }
  }

  if (!conteudo) conteudo = `[${tipo}]`;

  // Mensagem citada (reply) — `msg.quoted` é uma STRING PURA com o id da mensagem
  // citada (confirmado contra payloads reais em webhook_debug/_reaction_debug), não um
  // objeto com .id/.messageType/.senderName como o código antigo assumia — por isso
  // replies de clientes nunca apareciam como citação no chat (a condição nunca batia).
  // uazapi não manda conteúdo/tipo/autor da mensagem citada, só o id; buscamos isso na
  // nossa própria tabela (mesmo padrão de match "sufixo" usado para reações, já que
  // `wamid` pode estar salvo como "<telefone>:<messageid>"). Guarda um snapshot (não
  // uma FK) porque a mensagem original pode já ter sido apagada.
  const quotedRawId: string | null =
    (typeof msg.quoted === "string" && msg.quoted) ||
    content?.contextInfo?.stanzaId ||
    null;

  let quotedWamid: string | null = null;
  let quotedConteudo: string | null = null;
  let quotedTipo: string | null = null;
  // O nome de quem mandou a citação só é resolvido mais abaixo (depois da conversa):
  // em conversa individual, uma mensagem citada de "entrada" nunca tem remetente_nome
  // (esse campo só existe para saber QUAL participante falou dentro de um grupo — no
  // 1:1 quem manda "entrada" é sempre o próprio contato), então o fallback precisa do
  // nome_contato já resolvido, que só existe depois do upsert da conversa.
  let quotedMsgDirecao: string | null = null;
  let quotedMsgRemetenteNome: string | null = null;

  if (quotedRawId) {
    const { data: quotedMatches } = await supabase
      .from("whatsapp_mensagens")
      .select("wamid, conteudo, tipo, direcao, remetente_nome")
      .eq("empresa_id", empresaId)
      .like("wamid", `%${quotedRawId}`)
      .limit(1);
    const quotedMsg = quotedMatches?.[0] ?? null;
    if (quotedMsg) {
      quotedWamid = quotedMsg.wamid;
      quotedConteudo = quotedMsg.conteudo;
      quotedTipo = quotedMsg.tipo;
      quotedMsgDirecao = quotedMsg.direcao;
      quotedMsgRemetenteNome = quotedMsg.remetente_nome ?? null;
    }
  }

  const inlineB64: string | null =
    msg.base64 ?? content?.base64 ?? msg.data ?? content?.data ?? null;
  const mediaKey: string | null =
    content?.mediaKey ?? content?.MediaKey ?? msg.mediaKey ?? null;

  if (tipo !== "texto" && wamid) {
    const storedUrl = await downloadAndStoreMedia(
      supabase,
      config,
      empresaId,
      instanceName,
      wamid,
      mediaMime,
      anyMediaUrl(),
      inlineB64,
      mediaKey,
      tipo,
      mediaFileName,
    );
    // Se o download/upload falhar, não usa a URL crua da CDN do WhatsApp como
    // media_url: ela é um link E2E criptografado (.enc) sem os headers/auth que só
    // nosso decrypt (ou a API da uazapi) sabe resolver — salvar isso trava a mensagem
    // com uma imagem/anexo quebrado para sempre. Melhor deixar null e mostrar o
    // placeholder de "mídia indisponível" no frontend.
    mediaUrl = storedUrl;
    console.log(`[webhook] mídia (${tipo}) stored="${storedUrl ?? "falhou"}"`);
  }

  console.log(
    `[webhook] mensagem de ${telefone} (${pushName}) grupo=${isGroup}: "${conteudo}" tipo=${tipo}`,
  );

  // A uazapi reentrega o mesmo webhook (retry por timeout/cold start) e a linha da
  // mensagem já é deduplicada mais abaixo via upsert(onConflict: wamid,
  // ignoreDuplicates). O contador de não lidas não tinha essa mesma proteção e era
  // incrementado a cada reentrega, mesmo quando só 1 mensagem de fato chegava —
  // daí o badge mostrar um número bem maior que a quantidade real de mensagens.
  let jaProcessada = false;
  if (wamid) {
    const { data: msgExistente } = await supabase
      .from("whatsapp_mensagens")
      .select("id")
      .eq("empresa_id", empresaId)
      .eq("wamid", wamid)
      .maybeSingle();
    jaProcessada = !!msgExistente;
  }

  let { data: existente } = await supabase
    .from("whatsapp_conversas")
    .select("id, nao_lidas, nome_contato, nome_contato_editado_manualmente")
    .eq("empresa_id", empresaId)
    .eq("telefone", telefone)
    .maybeSingle();

  /**
   * Não achou? Procura a chave LEGADA com o 9º dígito antes de criar.
   *
   * A normalização antiga enfiava o 9 em qualquer número de 10 dígitos —
   * inclusive FIXO, cujo JID real não tem o 9. Conversas criadas naquela época
   * vivem com o número errado. Agora que a normalização parou de inventar o 9,
   * o inbound desses contatos chega com o número certo, que não casa com a
   * linha antiga — e sem este fallback cada mensagem criaria uma conversa
   * DUPLICADA, rachando o histórico no meio.
   *
   * Ao encontrar a legada, corrige o telefone dela ali mesmo (colisão-safe):
   * o inbound seguinte já casa direto. Só roda para a faixa ambígua [2-5]; um
   * celular canônico (9+[6-9]) nunca entra aqui.
   */
  if (!existente && !isGroup && /^55\d{2}[2-5]\d{7}$/.test(telefone)) {
    const chaveLegada = telefone.slice(0, 4) + "9" + telefone.slice(4);
    const { data: legada } = await supabase
      .from("whatsapp_conversas")
      .select("id, nao_lidas, nome_contato, nome_contato_editado_manualmente")
      .eq("empresa_id", empresaId)
      .eq("telefone", chaveLegada)
      .maybeSingle();
    if (legada) {
      const { error: erroRename } = await supabase
        .from("whatsapp_conversas")
        .update({ telefone })
        .eq("id", legada.id);
      if (erroRename) {
        console.warn("[webhook] conversa legada encontrada mas não renomeada:", erroRename.message);
      } else {
        console.log(`[webhook] conversa ${legada.id} corrigida: ${chaveLegada} -> ${telefone}`);
      }
      existente = legada;
    }
  }

  let conversa: { id: string; nao_lidas: number } | null = null;
  let nomeContatoResolvido: string | null = null;

  if (existente) {
    // Um nome editado manualmente no CRM (via whatsapp-contact-rename) não pode ser
    // sobrescrito pelo nome de perfil que chega em toda mensagem recebida — sem essa
    // checagem, a edição manual "resetava" para o nome padrão do WhatsApp na próxima
    // mensagem do contato.
    nomeContatoResolvido = existente.nome_contato_editado_manualmente
      ? existente.nome_contato
      : (pushName || existente.nome_contato);
    const { data, error } = await supabase
      .from("whatsapp_conversas")
      .update({
        nome_contato: nomeContatoResolvido,
        ultima_mensagem: conteudo.slice(0, 200),
        ultima_mensagem_at: new Date().toISOString(),
        nao_lidas:
          sentByOtherChannel || jaProcessada
            ? (existente.nao_lidas ?? 0)
            : (existente.nao_lidas ?? 0) + 1,
        arquivada: false,
        is_group: isGroup,
        instancia_id: config.id,
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
    nomeContatoResolvido = pushName || null;
    const { data, error } = await supabase
      .from("whatsapp_conversas")
      .insert({
        empresa_id: empresaId,
        telefone,
        nome_contato: nomeContatoResolvido,
        ultima_mensagem: conteudo.slice(0, 200),
        ultima_mensagem_at: new Date().toISOString(),
        nao_lidas: sentByOtherChannel || jaProcessada ? 0 : 1,
        arquivada: false,
        is_group: isGroup,
        instancia_id: config.id,
      })
      .select("id, nao_lidas")
      .single();
    if (error) {
      console.error("[webhook] insert conversa:", error);
      return;
    }
    conversa = data;
  }

  // Mesma regra usada no frontend (quotedNomeFor em WhatsAppInbox.tsx): citação de
  // saída sempre foi "Você"; citação de entrada usa quem mandou dentro do grupo
  // (remetente_nome) ou, faltando isso — sempre o caso em conversa individual —,
  // o nome do contato já resolvido acima.
  const quotedRemetenteNome: string | null = !quotedWamid
    ? null
    : quotedMsgDirecao === "saida"
      ? "Você"
      : (quotedMsgRemetenteNome ?? nomeContatoResolvido ?? null);

  const insertData: any = {
    conversa_id: conversa.id,
    empresa_id: empresaId,
    direcao: sentByOtherChannel ? "saida" : "entrada",
    conteudo,
    tipo,
    status: sentByOtherChannel ? "enviado" : "entregue",
    lida: sentByOtherChannel ? true : false,
  };
  if (wamid) insertData.wamid = wamid;
  if (mediaUrl) insertData.media_url = mediaUrl;
  if (mediaMime) insertData.media_mime = mediaMime;
  if (remetenteNome) insertData.remetente_nome = remetenteNome;
  if (remetenteTelefone) insertData.remetente_telefone = remetenteTelefone;
  if (quotedWamid) insertData.quoted_wamid = quotedWamid;
  if (quotedConteudo) insertData.quoted_conteudo = quotedConteudo;
  if (quotedTipo) insertData.quoted_tipo = quotedTipo;
  if (quotedRemetenteNome)
    insertData.quoted_remetente_nome = quotedRemetenteNome;

  const { error: msgError } = await supabase
    .from("whatsapp_mensagens")
    .upsert(
      insertData,
      wamid ? { onConflict: "wamid", ignoreDuplicates: true } : {},
    );

  if (msgError) {
    console.error("[webhook] insert mensagem:", msgError);
  }
}

// Notifica no chat quando o cliente faz uma ligação (voz ou vídeo) pelo WhatsApp
// (evento "call" do webhook uazapi). Schema confirmado a partir de payloads reais
// gravados em webhook_debug (_call_debug): cada ligação dispara um sub-evento por
// estado — event.Data.Tag em ("offer", "accept", "reject", "terminate") — todos
// com o mesmo event.CallID. Só "offer" representa o cliente iniciando a ligação;
// os demais vêm de quem atende/recusa/encerra (inclusive do nosso lado) e não
// devem virar notificação nova. O JID em event.From/event.CallCreator é um "@lid"
// (identificador anônimo do WhatsApp para chamadas, não o telefone real) — usar
// isso direto cria uma conversa fantasma; o telefone de fato vem em
// `payload.sender_pn` / `event.Data.Attrs.caller_pn`, no formato
// "<numero>@s.whatsapp.net".
async function handleCallEvent(supabase: any, empresaId: string, payload: any) {
  const ev = payload.event ?? {};

  await supabase.from("webhook_debug").insert({
    payload: { _call_debug: true, payload },
  });

  const tag = String(ev.Data?.Tag ?? "").toLowerCase();
  if (tag !== "offer") return;

  const rawFrom: string = payload.sender_pn ?? ev.Data?.Attrs?.caller_pn ?? "";
  if (!rawFrom) {
    await logWebhookDrop(supabase, "call_sem_sender_pn", { ev, payload });
    return;
  }

  const isGroupCall = rawFrom.endsWith("@g.us");
  const rawTelefone = rawFrom
    .replace("@s.whatsapp.net", "")
    .replace("@c.us", "")
    .replace("@g.us", "")
    .split(":")[0]; // remove eventual sufixo de device (ex: "<numero>:59@lid")
  if (!rawTelefone) return;
  const telefone = isGroupCall
    ? rawTelefone
    : normalizeWhatsappPhone(rawTelefone);

  // Chamada de vídeo inclui uma tag "video" entre os codecs oferecidos em
  // event.Data.Content — só áudio nunca tem essa tag.
  const content: any[] = Array.isArray(ev.Data?.Content) ? ev.Data.Content : [];
  const isVideo = content.some(
    (c) => String(c?.Tag ?? "").toLowerCase() === "video",
  );
  const conteudo = isVideo
    ? "Chamada de vídeo recebida"
    : "Chamada de voz recebida";

  const callId = String(ev.CallID ?? ev.Data?.Attrs?.["call-id"] ?? "");
  const wamid = callId ? `call:${callId}` : `call:${telefone}:${Date.now()}`;

  // A uazapi reentrega o mesmo webhook em retry — sem essa checagem, a mesma
  // ligação incrementaria nao_lidas mais de uma vez (mesmo padrão usado em
  // handleIncomingMessage para mensagens).
  const { data: msgExistente } = await supabase
    .from("whatsapp_mensagens")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("wamid", wamid)
    .maybeSingle();
  if (msgExistente) return;

  let { data: existente } = await supabase
    .from("whatsapp_conversas")
    .select("id, nao_lidas")
    .eq("empresa_id", empresaId)
    .eq("telefone", telefone)
    .maybeSingle();

  // Mesmo fallback de chave legada do fluxo de mensagens (ver comentário lá):
  // a notificação de chamada de um fixo não pode rachar a conversa em duas.
  if (!existente && !isGroupCall && /^55\d{2}[2-5]\d{7}$/.test(telefone)) {
    const chaveLegada = telefone.slice(0, 4) + "9" + telefone.slice(4);
    const { data: legada } = await supabase
      .from("whatsapp_conversas")
      .select("id, nao_lidas")
      .eq("empresa_id", empresaId)
      .eq("telefone", chaveLegada)
      .maybeSingle();
    if (legada) {
      await supabase.from("whatsapp_conversas").update({ telefone }).eq("id", legada.id);
      existente = legada;
    }
  }

  let conversaId: string | null = null;
  if (existente) {
    await supabase
      .from("whatsapp_conversas")
      .update({
        ultima_mensagem: conteudo,
        ultima_mensagem_at: new Date().toISOString(),
        nao_lidas: (existente.nao_lidas ?? 0) + 1,
        arquivada: false,
      })
      .eq("id", existente.id);
    conversaId = existente.id;
  } else {
    const { data, error } = await supabase
      .from("whatsapp_conversas")
      .insert({
        empresa_id: empresaId,
        telefone,
        ultima_mensagem: conteudo,
        ultima_mensagem_at: new Date().toISOString(),
        nao_lidas: 1,
        arquivada: false,
        is_group: isGroupCall,
      })
      .select("id")
      .single();
    if (error) {
      console.error("[webhook] insert conversa (call):", error);
      return;
    }
    conversaId = data?.id ?? null;
  }
  if (!conversaId) return;

  const { error: msgError } = await supabase.from("whatsapp_mensagens").upsert(
    {
      conversa_id: conversaId,
      empresa_id: empresaId,
      direcao: "entrada",
      conteudo,
      tipo: "chamada",
      status: "entregue",
      lida: false,
      wamid,
    },
    { onConflict: "wamid", ignoreDuplicates: true },
  );
  if (msgError) console.error("[webhook] insert chamada:", msgError);
}

// Recibo de entrega/leitura (evento "messages_update" da uazapi). Formato real
// observado: { EventType: "messages_update", state: "Delivered", event: { Type:
// "Delivered", MessageIDs: ["<messageid sem prefixo de telefone>"], ... } } — o
// wamid salvo em whatsapp_mensagens vem como "<telefone>:<messageid>" (resposta do
// /send/text), por isso o match é por sufixo (LIKE '%<messageid>').
const STATUS_RANK: Record<string, number> = {
  enviando: 0,
  enviado: 1,
  entregue: 2,
  lido: 3,
};
const RECEIPT_STATUS_MAP: Record<string, string> = {
  delivered: "entregue",
  read: "lido",
  "read-self": "lido",
  played: "lido",
};

async function handleStatusUpdate(
  supabase: any,
  empresaId: string,
  payload: any,
) {
  const ev = payload.event ?? {};
  const messageIds: string[] = Array.isArray(ev.MessageIDs)
    ? ev.MessageIDs
    : [];
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
      await supabase
        .from("whatsapp_mensagens")
        .update({ status: novoStatus })
        .eq("id", m.id);
    }
  }
}

async function handleConnectionUpdate(
  supabase: any,
  empresaId: string,
  instanceName: string,
  payload: any,
) {
  const state = payload.data?.state ?? payload.state ?? payload.status;
  const statusMap: Record<string, string> = {
    open: "connected",
    connected: "connected",
    close: "disconnected",
    disconnected: "disconnected",
    connecting: "connecting",
  };
  const status = statusMap[state] ?? "disconnected";

  await supabase
    .from("configuracoes_wapi")
    .update({ status })
    .eq("empresa_id", empresaId)
    .eq("instance_name", instanceName);
}
