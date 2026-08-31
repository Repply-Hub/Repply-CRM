import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizeWhatsappPhone } from "../_shared/whatsapp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// O WhatsApp só aceita editar uma mensagem nos primeiros ~15 minutos. Depois
// disso a operadora recusa. O botão "Editar" no CRM já some passado esse tempo
// (ver DraggableBubble em WhatsAppInbox.tsx); esta checagem é a rede de trás,
// para o caso de a requisição chegar no limite.
const JANELA_EDICAO_MS = 15 * 60 * 1000;

// Mesma extração usada em whatsapp-send/whatsapp-delete-message: o wamid salvo às
// vezes vem como "<telefone>:<messageid>" — a uazapi espera só o messageid puro.
function rawMessageId(wamid: string): string {
  const idx = wamid.lastIndexOf(":");
  return idx !== -1 ? wamid.slice(idx + 1) : wamid;
}

// Igual ao whatsapp-send: o conteúdo enviado ao WhatsApp leva "*Nome*" na frente
// para quem recebe saber qual atendente está falando; o conteúdo salvo em
// whatsapp_mensagens fica SEM o prefixo. Ao editar, reaplica o prefixo no texto
// que vai para a operadora para a mensagem editada continuar com o mesmo formato.
function withRemetente(nome: string | null, mensagem: string): string {
  if (!nome) return mensagem;
  const header = `*${nome}*`;
  return mensagem ? `${header}\n${mensagem}` : header;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Sessão não identificada. Entre novamente no sistema." }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const [{ data: { user }, error: authError }, body] = await Promise.all([
      userClient.auth.getUser(),
      req.json(),
    ]);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Sua sessão expirou. Atualize a página e entre de novo." }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { mensagemId, novoTexto } = body as { mensagemId?: string; novoTexto?: string };
    if (!mensagemId) {
      return new Response(JSON.stringify({ error: "mensagemId é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const textoLimpo = (novoTexto ?? "").trim();
    if (!textoLimpo) {
      return new Response(JSON.stringify({ error: "Escreva o novo texto da mensagem." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: userData } = await supabase
      .from("usuarios")
      .select("id, empresa_id, nome, empresas:empresa_id(whatsapp_assinar_remetente)")
      .eq("user_id", user.id).single();
    if (!userData) {
      return new Response(JSON.stringify({ error: "Seu usuário não foi encontrado no sistema. Fale com o gestor da empresa." }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const assinarRemetente = (userData.empresas as { whatsapp_assinar_remetente: boolean } | null)
      ?.whatsapp_assinar_remetente ?? true;

    // A RLS de whatsapp_mensagens já restringiria isso para o client autenticado,
    // mas esta function roda com service role — filtra por empresa na mão para
    // não editar mensagem de empresa alheia. Traz também a conversa, para o
    // número de destino e para corrigir o "última mensagem" do preview.
    const { data: mensagem } = await supabase
      .from("whatsapp_mensagens")
      .select("id, wamid, direcao, tipo, conteudo, conteudo_original, apagada_para_todos, created_at, conversa_id, whatsapp_conversas:conversa_id(id, telefone, ultima_mensagem_at)")
      .eq("id", mensagemId)
      .eq("empresa_id", userData.empresa_id)
      .maybeSingle();
    if (!mensagem) {
      return new Response(JSON.stringify({ error: "Mensagem não encontrada" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mesmas condições que escondem o botão no frontend — repetidas aqui porque a
    // function é a fronteira de verdade.
    if (mensagem.direcao !== "saida") {
      return new Response(JSON.stringify({ error: "Só dá para editar mensagens que você enviou." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (mensagem.tipo !== "texto") {
      return new Response(JSON.stringify({ error: "Só dá para editar mensagens de texto." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (mensagem.apagada_para_todos) {
      return new Response(JSON.stringify({ error: "Esta mensagem foi apagada." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!mensagem.wamid) {
      return new Response(JSON.stringify({ error: "Esta mensagem ainda não foi confirmada pelo WhatsApp. Tente de novo em instantes." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (Date.now() - new Date(mensagem.created_at).getTime() > JANELA_EDICAO_MS) {
      return new Response(JSON.stringify({ error: "O WhatsApp não deixa mais editar esta mensagem (passou de 15 minutos)." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Nada a fazer se o texto não mudou.
    if (textoLimpo === (mensagem.conteudo ?? "").trim()) {
      return new Response(JSON.stringify({ ok: true, semMudanca: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const conversa = (mensagem.whatsapp_conversas ?? null) as
      { id: string; telefone: string | null; ultima_mensagem_at: string | null } | null;

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
      return new Response(JSON.stringify({ error: "Seu usuário não tem WhatsApp vinculado. Peça ao gestor para liberar em Configurações." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (config.status !== "connected") {
      return new Response(JSON.stringify({ error: "O WhatsApp está desconectado. Reconecte em Configurações e tente de novo." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const baseUrl = config.instance_url.replace(/\/$/, "");

    // Mesmo tratamento de JID de whatsapp-send: grupo de formato legado tem hífen
    // e não pode passar por replace(/\D/g,"") — número individual é normalizado.
    const telRaw = conversa?.telefone ?? "";
    const digits = telRaw.replace(/\D/g, "");
    const isGroup = telRaw.includes("@g.us") || telRaw.includes("-") || digits.length > 14;
    const numeroDestino = telRaw
      ? (isGroup
        ? (telRaw.endsWith("@g.us") ? telRaw : `${telRaw}@g.us`)
        : normalizeWhatsappPhone(telRaw))
      : "";

    const textoParaWhatsapp = assinarRemetente ? withRemetente(userData.nome, textoLimpo) : textoLimpo;

    /**
     * POST /message/edit da uazapi: troca o texto de uma mensagem já enviada.
     *
     * O contrato exato não é verificável (docs.uazapi.com não abre por código), e
     * "Message not found" aparecia em parte das mensagens. O análogo mais próximo
     * é POST /message/react, que resolve o chat SÓ pelo Id da mensagem e NÃO
     * recebe number — mandar um number que não bate com o JID onde a mensagem
     * vive faz a uazapi não achar a mensagem (ex.: conversa guardada com/sem o 9º
     * dígito, grupo, mensagem espelhada do celular).
     *
     * Então tenta em ordem, parando no primeiro 2xx:
     *   1. { id: <messageid puro>, text }            — como o /message/react
     *   2. { id: <wamid inteiro>, text }             — caso o id precise do prefixo
     *   3. { number, id: <messageid puro>, text }    — último recurso, com destino
     *
     * Todas as tentativas vão para webhook_debug, para ver qual forma pega.
     */
    const wapiUrl = `${baseUrl}/message/edit`;
    const idPuro = rawMessageId(mensagem.wamid);
    const tentativas: Record<string, unknown>[] = [
      { id: idPuro, text: textoParaWhatsapp },
    ];
    if (mensagem.wamid !== idPuro) {
      tentativas.push({ id: mensagem.wamid, text: textoParaWhatsapp });
    }
    if (numeroDestino) {
      tentativas.push({ number: numeroDestino, id: idPuro, text: textoParaWhatsapp });
    }

    let wapiStatus = 0;
    let responseText = "";
    let fetchError = "";
    let requestBody: Record<string, unknown> = tentativas[0];
    const log: Record<string, unknown>[] = [];

    for (let i = 0; i < tentativas.length; i++) {
      requestBody = tentativas[i];
      try {
        const res = await fetch(wapiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", token: config.api_key },
          body: JSON.stringify(requestBody),
        });
        wapiStatus = res.status;
        responseText = await res.text().catch(() => "");
        fetchError = "";
      } catch (e) {
        wapiStatus = 0;
        responseText = "";
        fetchError = String(e);
      }
      log.push({ tentativa: i + 1, request_body: requestBody, status: wapiStatus, response: responseText, fetch_error: fetchError || null });

      if (!fetchError && wapiStatus >= 200 && wapiStatus < 300) break;

      // Só vale a pena tentar a próxima forma quando o erro é "não achei a
      // mensagem". Outros erros (desconectado, texto inválido) repetiriam igual.
      let erroAtual = "";
      try { erroAtual = JSON.parse(responseText)?.error ?? ""; } catch { /* ok */ }
      if (!/not found|não encontrad|nao encontrad/i.test(erroAtual)) break;
    }

    await supabase.from("webhook_debug").insert({
      payload: {
        _debug: true, _edit_message: true, url: wapiUrl,
        wamid: mensagem.wamid, tentativas: log,
        status_final: wapiStatus, response_final: responseText, fetch_error: fetchError || null,
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
      const amigavel = /not found/i.test(wapiError)
        ? "O WhatsApp não encontrou esta mensagem para editar. Pode ter passado dos 15 minutos, ou ela foi enviada por fora do CRM."
        : wapiError || `Erro ao editar mensagem (status ${wapiStatus})`;
      return new Response(JSON.stringify({ error: amigavel, detail: responseText }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // O eco desta edição volta pelo webhook marcado wasSentByApi=true e é
    // ignorado por handleIncomingMessage — então grava aqui, igual whatsapp-send
    // faz para as mensagens normais. `conteudo` guarda o texto SEM o prefixo de
    // remetente; `conteudo_original` só na primeira edição.
    const patch: Record<string, unknown> = {
      conteudo: textoLimpo,
      editada: true,
      editada_at: new Date().toISOString(),
    };
    if (!mensagem.conteudo_original) patch.conteudo_original = mensagem.conteudo ?? "";
    await supabase.from("whatsapp_mensagens").update(patch).eq("id", mensagem.id);

    // Corrige o preview da conversa só se a mensagem editada for a mais recente.
    if (conversa?.id && conversa.ultima_mensagem_at &&
        new Date(mensagem.created_at).getTime() >= new Date(conversa.ultima_mensagem_at).getTime() - 1000) {
      await supabase.from("whatsapp_conversas")
        .update({ ultima_mensagem: textoLimpo.slice(0, 200) })
        .eq("id", conversa.id);
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Erro inesperado. Tente de novo em instantes.", detail: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
