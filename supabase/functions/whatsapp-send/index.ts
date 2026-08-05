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

// Prefixa a mensagem enviada ao WhatsApp com "*Nome*" para que quem recebe saiba
// qual usuário do CRM está falando. O conteúdo salvo em whatsapp_mensagens
// permanece sem o prefixo (ver `conteudo` mais abaixo).
function withRemetente(nome: string | null, mensagem: string): string {
  if (!nome) return mensagem;
  const header = `*${nome}*`;
  return mensagem ? `${header}\n${mensagem}` : header;
}

// O wamid salvo em whatsapp_mensagens para mensagens enviadas às vezes vem como
// "<telefone>:<messageid>" (ver comentário em whatsapp-webhook/handleStatusUpdate,
// que já precisa fazer match por sufixo por causa disso). A uazapi espera só o
// messageid puro no campo `replyid`, então extrai a parte depois do último ":".
function rawMessageId(wamid: string): string {
  const idx = wamid.lastIndexOf(":");
  return idx !== -1 ? wamid.slice(idx + 1) : wamid;
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

/**
 * Lê a resposta do envio da uazapi e extrai o id da mensagem.
 *
 * Duas armadilhas, as duas observadas em produção:
 *
 * 1. A uazapi às vezes devolve DOIS documentos JSON concatenados no mesmo corpo
 *    (`{chat}\n{message}`). Um `JSON.parse` direto lança, e o `catch` que havia
 *    aqui engolia a exceção — a mensagem era entregue de verdade mas gravada com
 *    `wamid` nulo, perdendo para sempre o recibo de entrega, a citação, a reação
 *    e a exclusão.
 *
 * 2. O id pode vir como string VAZIA. `??` não pega `""` (não é nullish), então
 *    `wamid` virava `""` — e como existe UNIQUE em `wamid`, o segundo envio
 *    nessa condição violava a constraint e o insert falhava calado.
 *
 * Prefere `id` a `messageid` porque `id` vem no formato `<conta>:<messageid>`,
 * que é o que as linhas já gravadas usam e o que `handleStatusUpdate` espera
 * casar por sufixo.
 */
function lerRespostaDoEnvio(texto: string): {
  // deno-lint-ignore no-explicit-any
  objeto: any;
  idDaMensagem: string | null;
} {
  const naoVazio = (v: unknown): string | null => {
    const s = typeof v === "string" ? v.trim() : "";
    return s.length > 0 ? s : null;
  };

  // deno-lint-ignore no-explicit-any
  const documentos: any[] = [];
  try {
    documentos.push(JSON.parse(texto));
  } catch {
    // Corpo com mais de um documento: quebra em `\n{` e tenta cada pedaço.
    for (const parte of texto.split(/\n(?=\s*\{)/)) {
      const t = parte.trim();
      if (!t) continue;
      try {
        documentos.push(JSON.parse(t));
      } catch {
        // Pedaço ilegível não invalida os outros.
      }
    }
    if (documentos.length === 0) {
      console.error("[whatsapp-send] resposta ilegível da uazapi:", texto.slice(0, 300));
    }
  }

  // O documento da MENSAGEM vem depois do documento do CHAT, então varre de trás
  // para frente e fica com o primeiro id de verdade que encontrar.
  for (let i = documentos.length - 1; i >= 0; i--) {
    const d = documentos[i];
    const id = naoVazio(d?.id) ?? naoVazio(d?.messageid) ?? naoVazio(d?.key?.id);
    if (id) return { objeto: d, idDaMensagem: id };
  }

  return { objeto: documentos[documentos.length - 1] ?? {}, idDaMensagem: null };
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

/**
 * Responde uma recusa E registra o motivo em webhook_debug.
 *
 * O registro que já existia ficava depois de todas as validações iniciais, então
 * justamente os erros mais comuns — WhatsApp desconectado, sem vínculo, sessão
 * expirada — não deixavam rastro nenhum, e diagnosticar dependia de adivinhação.
 */
async function recusar(
  supabase: ReturnType<typeof createClient>,
  motivo: string,
  mensagem: string,
  status: number,
  contexto: Record<string, unknown> = {},
) {
  try {
    await supabase.from("webhook_debug").insert({
      payload: { _envio_recusado: true, motivo, status, ...contexto },
    });
  } catch (e) {
    console.error("[whatsapp-send] falha ao registrar recusa:", e);
  }
  console.error(`[whatsapp-send] recusado (${status}): ${motivo}`);
  return new Response(JSON.stringify({ error: mensagem }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
      return await recusar(supabase, "sem_authorization", "Sessão não identificada. Entre novamente no sistema.", 401);
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
      return await recusar(supabase, "jwt_invalido", "Sua sessão expirou. Atualize a página e entre de novo.", 401,
        { detalhe: authError?.message ?? null });
    }

    const {
      telefone, mensagem, conversa_id, tipo = 'texto', media_url, media_mime, nome_arquivo, ptt = false,
      quoted_wamid, quoted_conteudo, quoted_tipo, quoted_remetente_nome,
    } = body;

    if (!telefone) {
      return await recusar(supabase, "sem_telefone", "Esta conversa está sem número de telefone. Abra outra conversa ou recarregue a página.", 400,
        { conversa_id: conversa_id ?? null });
    }

    const { data: userData } = await supabase
      .from("usuarios")
      .select("id, empresa_id, nome, empresas:empresa_id(whatsapp_assinar_remetente)")
      .eq("user_id", user.id).single();
    if (!userData) {
      return await recusar(supabase, "usuario_nao_encontrado", "Seu usuário não foi encontrado no sistema. Fale com o gestor da empresa.", 404,
        { user_id: user.id });
    }
    const assinarRemetente = (userData.empresas as { whatsapp_assinar_remetente: boolean } | null)
      ?.whatsapp_assinar_remetente ?? true;

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
      return await recusar(supabase, "sem_instancia_vinculada", "Seu usuário não tem WhatsApp vinculado. Peça ao gestor para liberar em Configurações.", 400,
        { user_id: user.id, usuario_id: userData.id });
    }
    if (config.status !== "connected") {
      return await recusar(supabase, "instancia_desconectada", "O WhatsApp está desconectado. Reconecte em Configurações e tente de novo.", 400,
        { instancia_id: config.id, instance_name: config.instance_name, status_instancia: config.status });
    }

    const digits = telefone.replace(/\D/g, "");

    /**
     * O JID do grupo é usado LITERALMENTE — nunca passa por `replace(/\D/g,"")`.
     *
     * Existem dois formatos de grupo no WhatsApp, e a diferença é fatal:
     *
     *   moderno  120363356920210019          só dígitos, sobrevive a qualquer limpeza
     *   legado   5511988345626-1425926780    <criador>-<timestamp>, COM HÍFEN
     *
     * Limpar os não-dígitos do legado produzia `55119883456261425926780@g.us`, um
     * JID que não existe. A uazapi responde 200 a ele, com um chat vazio, e a
     * mensagem simplesmente não é entregue a ninguém — falha totalmente muda.
     *
     * Foi o que aconteceu: os 5 grupos de formato legado desta empresa, que estão
     * entre os mais ativos, tinham ZERO envios pelo CRM na história inteira,
     * enquanto recebiam dezenas de mensagens mandadas do celular.
     *
     * `whatsapp-group-participants` sempre fez do jeito certo (`${telefone}@g.us`,
     * sem limpar) e por isso resolve os mesmos 5 grupos sem problema.
     *
     * O hífen é o que identifica o legado: telefone individual é guardado
     * normalizado, só com dígitos, então não há colisão.
     */
    const isGroup = telefone.includes("@g.us") ||
      telefone.includes("-") ||
      digits.length > 14;
    const phone = isGroup
      ? (telefone.endsWith("@g.us") ? telefone : `${telefone}@g.us`)
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
        return await recusar(supabase, "mensagem_vazia", "Escreva uma mensagem antes de enviar.", 400, { tipo });
      }
      wapiUrl = `${baseUrl}/send/text`;
      try {
        const res = await fetch(wapiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", token: config.api_key },
          body: JSON.stringify({
            instanceName: uazapiInstance,
            number: phone,
            text: assinarRemetente ? withRemetente(userData.nome, mensagem) : mensagem,
            ...(quoted_wamid ? { replyid: rawMessageId(quoted_wamid) } : {}),
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
      if (mensagem) wapiBody.text = assinarRemetente ? withRemetente(userData.nome, mensagem) : mensagem;
      if (tipo === 'documento' && nome_arquivo) wapiBody.docName = nome_arquivo;
      if (media_mime) wapiBody.mimetype = media_mime;
      if (quoted_wamid) wapiBody.replyid = rawMessageId(quoted_wamid);

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
      payload: {
        _debug: true, url: wapiUrl, status: wapiStatus, response: responseText, fetch_error: fetchError || null,
        replyid_enviado: quoted_wamid ? rawMessageId(quoted_wamid) : null,
      }
    });

    if (fetchError) {
      return new Response(JSON.stringify({ error: "Não foi possível falar com o servidor do WhatsApp. Tente de novo em instantes.", detail: fetchError }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (wapiStatus < 200 || wapiStatus >= 300) {
      let wapiError = "";
      try { wapiError = JSON.parse(responseText)?.error ?? ""; } catch { /* ok */ }
      const userMessage = wapiError.includes("not on WhatsApp")
        ? "Este número não tem WhatsApp."
        // O texto cru do provedor vem em inglês e costuma ser técnico demais para
        // o usuário final; só é aproveitado quando não há caso conhecido.
        : wapiError || `O WhatsApp recusou o envio (código ${wapiStatus}). Tente de novo em instantes.`;
      return new Response(JSON.stringify({ error: userMessage, detail: responseText }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { idDaMensagem } = lerRespostaDoEnvio(responseText);

    /**
     * 200 NÃO é prova de envio.
     *
     * Quando o JID não existe, a uazapi responde 200 com um "chat" vazio em vez
     * de erro:
     *
     *   {"id":"", "phone":"", "wa_chatid":"55119883456261425926780@g.us", ...}
     *
     * Nenhuma mensagem foi criada. Como o código só olhava a faixa 2xx, isso
     * seguia adiante, gravava a linha com `status: "enviado"` e devolvia
     * `{ok:true}` — a pessoa via o balão, a mensagem nunca saía, e não havia
     * erro em lugar nenhum. Foi assim que os grupos de JID legado ficaram meses
     * sem enviar sem ninguém conseguir explicar.
     *
     * O critério é a existência de um id de mensagem. Toda resposta de envio
     * bem-sucedida traz `messageid` (e `id` no formato `<conta>:<messageid>`);
     * o chat-stub traz `id` vazio. Falhar aqui é ruidoso de propósito: preferir
     * um erro visível a uma entrega imaginária.
     */
    if (!idDaMensagem) {
      console.error("[whatsapp-send] 200 sem id de mensagem — destino provavelmente inexistente:", phone, responseText.slice(0, 300));
      return new Response(JSON.stringify({
        error: isGroup
          ? "O WhatsApp não reconheceu este grupo. Peça para alguém reabrir a conversa pelo celular e tente de novo."
          : "O WhatsApp aceitou a requisição mas não confirmou o envio. Tente de novo.",
        code: "envio_nao_confirmado",
        detail: responseText.slice(0, 500),
      }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const wamid = idDaMensagem;

    // nome_arquivo só deve virar legenda visível para documentos; pra imagem/áudio/
    // vídeo isso vazaria o nome do arquivo (ex: "imagem-colada-...png") como se fosse
    // texto digitado pelo usuário.
    const conteudo = mensagem || (tipo === 'documento' ? nome_arquivo : null) || PLACEHOLDER[tipo] || '[mensagem]';
    const now = new Date().toISOString();

    // Garante conversa e grava mensagem — operações em paralelo quando possível
    let conversaId = conversa_id;
    if (!conversaId) {
      const { data: conv } = await supabase.from("whatsapp_conversas")
        .upsert(
          { empresa_id: userData.empresa_id, telefone: phone, ultima_mensagem: conteudo.slice(0, 200), ultima_mensagem_at: now, instancia_id: config.id },
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
      if (quoted_wamid) insertData.quoted_wamid = quoted_wamid;
      if (quoted_conteudo) insertData.quoted_conteudo = quoted_conteudo;
      if (quoted_tipo) insertData.quoted_tipo = quoted_tipo;
      if (quoted_remetente_nome) insertData.quoted_remetente_nome = quoted_remetente_nome;

      // Atualiza conversa, insere mensagem e garante que quem enviou vire responsável
      // pela conversa (aparece em "Meus chats"), tanto em grupo quanto em chat individual.
      const [, gravacao] = await Promise.all([
        supabase.from("whatsapp_conversas")
          .update({ ultima_mensagem: conteudo.slice(0, 200), ultima_mensagem_at: now, arquivada: false, instancia_id: config.id })
          .eq("id", conversaId),
        supabase.from("whatsapp_mensagens").insert(insertData),
        ensureResponsavel(supabase, conversaId, userData.id),
      ]);

      /**
       * O supabase-js NÃO lança em erro de banco: devolve `{ error }`. O
       * `Promise.all` anterior descartava esse objeto, então uma falha de insert
       * — violação do UNIQUE de `wamid`, por exemplo — passava despercebida e a
       * função ainda respondia `{ok:true}`.
       *
       * O efeito era exatamente o sintoma relatado: a mensagem SAIU (o provedor
       * já confirmou acima), mas não existe linha nenhuma no banco. O balão fica
       * só no cache do React Query e some no primeiro refetch — "aparece e
       * depois some", sem erro em lugar nenhum.
       *
       * Não dá para responder erro aqui: a mensagem JÁ FOI ENTREGUE, e um erro
       * faria a pessoa reenviar e o destinatário receber duas vezes. Então
       * avisa que saiu mas não foi registrada, e deixa o rastro para o webhook
       * eventualmente reconciliar pelo `wamid`.
       */
      if (gravacao?.error) {
        console.error("[whatsapp-send] enviado mas NÃO registrado:", gravacao.error, { conversaId, wamid });
        await supabase.from("webhook_debug").insert({
          payload: {
            _envio_nao_registrado: true,
            motivo: gravacao.error.message ?? String(gravacao.error),
            codigo: gravacao.error.code ?? null,
            conversa_id: conversaId,
            wamid,
          },
        });
        return new Response(JSON.stringify({
          ok: true,
          wamid,
          conversa_id: conversaId,
          aviso: "A mensagem foi enviada, mas não conseguimos registrá-la no histórico. Atualize a página em alguns instantes.",
          code: "enviado_sem_registro",
        }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ ok: true, wamid, conversa_id: conversaId }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Erro inesperado ao enviar a mensagem.", detail: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
