import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PLACEHOLDER: Record<string, string> = {
  imagem: '[Imagem]',
  audio: '[Áudio]',
  video: '[Vídeo]',
  documento: '[Documento]',
};

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  gestor: 'Gestor',
  vendedor: 'Vendedor',
  empresa: 'Empresa',
};

function capitalize(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

// Prefixa a mensagem enviada ao WhatsApp com "*Nome - Cargo*" para que quem
// recebe saiba qual usuário do CRM está falando. O conteúdo salvo em
// whatsapp_mensagens permanece sem o prefixo (ver `conteudo` mais abaixo).
function withRemetente(nome: string | null, role: string | null, mensagem: string): string {
  if (!nome) return mensagem;
  const cargo = role ? (ROLE_LABELS[role] ?? capitalize(role)) : null;
  const header = `*${nome}${cargo ? ` - ${cargo}` : ''}*`;
  return mensagem ? `${header}\n${mensagem}` : header;
}

// Mesma normalização usada no whatsapp-webhook: garante que o número BR sempre
// inclua o 9º dígito para casar com a conversa já existente do mesmo contato.
function normalizeWhatsappPhone(raw: string): string {
  let digits = (raw ?? "").replace(/\D/g, "");
  // só remove o "55" se for código de país (DDD 55 do RS também começa com "55")
  if (digits.length > 11 && digits.startsWith("55")) digits = digits.slice(2);
  if (digits.length === 10) {
    digits = `${digits.slice(0, 2)}9${digits.slice(2)}`;
  }
  return `55${digits}`;
}

// Garante que o usuário que enviou a mensagem esteja em whatsapp_conversa_responsaveis
// para a conversa, independente de ser grupo ou chat individual, sem duplicar a linha
// caso ele já seja responsável (não há constraint única na tabela para usar upsert).
async function ensureResponsavel(
  supabase: ReturnType<typeof createClient>,
  conversaId: string,
  usuarioId: string
) {
  const { data: existing } = await supabase
    .from("whatsapp_conversa_responsaveis")
    .select("usuario_id")
    .eq("conversa_id", conversaId)
    .eq("usuario_id", usuarioId)
    .maybeSingle();
  if (!existing) {
    await supabase
      .from("whatsapp_conversa_responsaveis")
      .insert({ conversa_id: conversaId, usuario_id: usuarioId });
  }
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

    // Auth + body em paralelo (auth.getUser é rede; req.json é leitura de stream)
    const [{ data: { user }, error: authError }, body] = await Promise.all([
      userClient.auth.getUser(),
      req.json(),
    ]);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { telefone, mensagem, conversa_id, tipo = 'texto', media_url, media_mime, nome_arquivo, ptt = false } = body;

    if (!telefone) {
      return new Response(JSON.stringify({ error: "telefone obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: userData } = await supabase
      .from("usuarios")
      .select("id, empresa_id, nome, role, empresas:empresa_id(whatsapp_assinar_remetente)")
      .eq("user_id", user.id).single();
    if (!userData) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const assinarRemetente = (userData.empresas as { whatsapp_assinar_remetente: boolean } | null)
      ?.whatsapp_assinar_remetente ?? true;

    const { data: instLink } = await supabase
      .from("wapi_instancia_usuarios")
      .select("configuracoes_wapi:instancia_id(instance_url, api_key, instance_name, api_instance_name, status)")
      .eq("usuario_auth_id", user.id)
      .limit(1)
      .maybeSingle();
    const config = (instLink?.configuracoes_wapi ?? null) as {
      instance_url: string; api_key: string; instance_name: string;
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

    const digits = telefone.replace(/\D/g, "");
    // Grupos têm JIDs com 15+ dígitos (ex: 120363XXXXXXXXXX); números individuais max 13 dígitos
    const isGroup = telefone.includes("@g.us") || digits.length > 14;
    const phone = isGroup
      ? (telefone.includes("@g.us") ? telefone : `${digits}@g.us`)
      : normalizeWhatsappPhone(telefone);
    const uazapiInstance = config.api_instance_name ?? config.instance_name;
    const baseUrl = config.instance_url.replace(/\/$/, "");

    let wapiStatus = 0;
    let responseText = "";
    let fetchError = "";
    let wapiUrl = "";

    if (tipo === 'texto' || !media_url) {
      // --- Texto ---
      if (!mensagem) {
        return new Response(JSON.stringify({ error: "mensagem obrigatória para texto" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      wapiUrl = `${baseUrl}/send/text`;
      try {
        const res = await fetch(wapiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", token: config.api_key },
          body: JSON.stringify({
            instanceName: uazapiInstance,
            number: phone,
            text: assinarRemetente ? withRemetente(userData.nome, userData.role, mensagem) : mensagem,
          }),
        });
        wapiStatus = res.status;
        responseText = await res.text().catch(() => "");
      } catch (e) { fetchError = String(e); }
    } else {
      // --- Mídia: POST /send/media ---
      const typeMap: Record<string, string> = {
        imagem: 'image',
        audio: ptt ? 'ptt' : 'audio',
        video: 'video',
        documento: 'document',
      };
      wapiUrl = `${baseUrl}/send/media`;
      const wapiBody: Record<string, unknown> = {
        number: phone,
        type: typeMap[tipo] ?? 'document',
        file: media_url,
      };
      if (mensagem) wapiBody.text = assinarRemetente ? withRemetente(userData.nome, userData.role, mensagem) : mensagem;
      if (tipo === 'documento' && nome_arquivo) wapiBody.docName = nome_arquivo;
      if (media_mime) wapiBody.mimetype = media_mime;

      try {
        const res = await fetch(wapiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", token: config.api_key },
          body: JSON.stringify(wapiBody),
        });
        wapiStatus = res.status;
        responseText = await res.text().catch(() => "");
      } catch (e) { fetchError = String(e); }
    }

    // Debug — aguardado para garantir que erros sejam registrados antes do retorno
    await supabase.from("webhook_debug").insert({
      payload: { _debug: true, url: wapiUrl, status: wapiStatus, response: responseText, fetch_error: fetchError || null }
    });

    if (fetchError) {
      return new Response(JSON.stringify({ error: "Erro de rede ao contactar WhatsApp", detail: fetchError }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (wapiStatus < 200 || wapiStatus >= 300) {
      let wapiError = "";
      try { wapiError = JSON.parse(responseText)?.error ?? ""; } catch { /* ok */ }
      const userMessage = wapiError.includes("not on WhatsApp")
        ? "Número não possui WhatsApp"
        : wapiError || `Erro ao enviar (status ${wapiStatus})`;
      return new Response(JSON.stringify({ error: userMessage, detail: responseText }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let wapiResult: any = {};
    try { wapiResult = JSON.parse(responseText); } catch { /* ok */ }
    const wamid = wapiResult?.key?.id ?? wapiResult?.id ?? null;

    const conteudo = mensagem || nome_arquivo || PLACEHOLDER[tipo] || '[mensagem]';
    const now = new Date().toISOString();

    // Garante conversa e grava mensagem — operações em paralelo quando possível
    let conversaId = conversa_id;
    if (!conversaId) {
      const { data: conv } = await supabase.from("whatsapp_conversas")
        .upsert(
          { empresa_id: userData.empresa_id, telefone: phone, ultima_mensagem: conteudo.slice(0, 200), ultima_mensagem_at: now },
          { onConflict: "empresa_id,telefone" }
        ).select("id").single();
      conversaId = conv?.id;
    }

    if (conversaId) {
      const insertData: Record<string, unknown> = {
        conversa_id: conversaId, empresa_id: userData.empresa_id,
        direcao: "saida", conteudo, tipo: tipo ?? 'texto',
        wamid, status: "enviado", usuario_id: userData.id, lida: true,
      };
      if (media_url) insertData.media_url = media_url;
      if (media_mime) insertData.media_mime = media_mime;

      // Atualiza conversa, insere mensagem e garante que quem enviou vire responsável
      // pela conversa (aparece em "Meus chats"), tanto em grupo quanto em chat individual.
      await Promise.all([
        supabase.from("whatsapp_conversas")
          .update({ ultima_mensagem: conteudo.slice(0, 200), ultima_mensagem_at: now, arquivada: false })
          .eq("id", conversaId),
        supabase.from("whatsapp_mensagens").insert(insertData),
        ensureResponsavel(supabase, conversaId, userData.id),
      ]);
    }

    return new Response(JSON.stringify({ ok: true, wamid, conversa_id: conversaId }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal error", detail: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
