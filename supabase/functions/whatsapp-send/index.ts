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

    const { telefone, mensagem, conversa_id, tipo = 'texto', media_url, media_mime, nome_arquivo } = body;

    if (!telefone) {
      return new Response(JSON.stringify({ error: "telefone obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: userData } = await supabase
      .from("usuarios").select("id, empresa_id").eq("user_id", user.id).single();
    if (!userData) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: config } = await supabase
      .from("configuracoes_wapi")
      .select("instance_url, api_key, instance_name, api_instance_name, status")
      .eq("usuario_id", user.id).single();
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
    const phone = digits.startsWith("55") ? digits : `55${digits}`;
    const uazapiInstance = config.api_instance_name ?? config.instance_name;
    const baseUrl = config.instance_url.replace(/\/$/, "");

    let wapiStatus = 0;
    let responseText = "";
    let fetchError = "";
    let wapiUrl = "";

    if (tipo === 'texto' || !media_url) {
      // --- Texto: JSON ---
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
          body: JSON.stringify({ instanceName: uazapiInstance, number: phone, text: mensagem }),
        });
        wapiStatus = res.status;
        responseText = await res.text().catch(() => "");
      } catch (e) { fetchError = String(e); }
    } else {
      // --- Mídia: POST /send/media com JSON, campo "file" como URL (padrão do CLI uazapi) ---
      const typeMap: Record<string, string> = {
        imagem: 'image',
        audio: 'audio',
        video: 'video',
        documento: 'document',
      };
      wapiUrl = `${baseUrl}/send/media`;
      const wapiBody: Record<string, unknown> = {
        instanceName: uazapiInstance,
        number: phone,
        to: phone,
        type: typeMap[tipo] ?? 'document',
        file: media_url,
      };
      if (mensagem) wapiBody.caption = mensagem;
      if (tipo === 'documento' && nome_arquivo) wapiBody.fileName = nome_arquivo;

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

    // Debug fire-and-forget (não bloqueia a resposta)
    supabase.from("webhook_debug").insert({
      payload: { _debug: true, url: wapiUrl, status: wapiStatus, response: responseText, fetch_error: fetchError || null }
    });

    if (fetchError) {
      return new Response(JSON.stringify({ error: "Erro de rede", detail: fetchError }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (wapiStatus < 200 || wapiStatus >= 300) {
      return new Response(JSON.stringify({ error: "Erro uazapi", status: wapiStatus, detail: responseText }), {
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

      // Atualiza conversa e insere mensagem em paralelo
      await Promise.all([
        supabase.from("whatsapp_conversas")
          .update({ ultima_mensagem: conteudo.slice(0, 200), ultima_mensagem_at: now })
          .eq("id", conversaId),
        supabase.from("whatsapp_mensagens").insert(insertData),
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
