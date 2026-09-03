import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  chamarNylas,
  corsHeaders,
  type EnderecoNylas,
  erroDoNylas,
  json,
  type MensagemNylas,
} from "../_shared/nylas.ts";

/** Status de assinatura que liberam envio. Espelha STATUS_LIBERAM do Stripe. */
const PLANOS_QUE_ENVIAM = ["active", "trialing", "past_due"];

/** Normaliza o que o cliente mandou para o formato de endereço do Nylas. */
function enderecos(valor: unknown): EnderecoNylas[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .map((v) => {
      if (typeof v === "string") return { email: v.trim() };
      if (v && typeof v === "object" && typeof (v as EnderecoNylas).email === "string") {
        const e = v as EnderecoNylas;
        return { email: e.email.trim(), ...(e.name ? { name: e.name } : {}) };
      }
      return null;
    })
    .filter((v): v is EnderecoNylas => !!v && v.email.length > 0);
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
    if (!authHeader) return json({ error: "Sessão não identificada." }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const [{ data: { user }, error: authError }, body] = await Promise.all([
      userClient.auth.getUser(),
      req.json().catch(() => ({})),
    ]);
    if (authError || !user) {
      return json({ error: "Sua sessão expirou. Entre novamente." }, 401);
    }

    const { data: caller } = await supabase
      .from("usuarios")
      .select("id, empresa_id, nome, deleted_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!caller) return json({ error: "Usuário não encontrado." }, 404);
    if (caller.deleted_at) return json({ error: "Conta suspensa." }, 403);
    if (!caller.empresa_id) return json({ error: "Conta sem empresa vinculada." }, 403);

    // ---- validação do destinatário ---------------------------------------
    const para = enderecos(body?.to);
    if (para.length === 0) {
      return json({ error: "Informe ao menos um destinatário." }, 400);
    }

    // ---- gate de plano ----------------------------------------------------
    // Enviar é a ação que custa dinheiro; é aqui que a inadimplência morde, e
    // não em marcar e-mail como lido. Empresa sem linha de assinatura passa —
    // mesmo princípio de empresa_plano_ativo(): na dúvida, liberar.
    const { data: assinatura } = await supabase
      .from("empresa_assinaturas")
      .select("plan_status")
      .eq("empresa_id", caller.empresa_id)
      .maybeSingle();

    if (assinatura && !PLANOS_QUE_ENVIAM.includes(assinatura.plan_status)) {
      return json(
        { error: "Assinatura inativa. Regularize para voltar a enviar e-mails.", code: "plano_inativo" },
        402,
      );
    }

    // ---- conta conectada --------------------------------------------------
    // Duas leituras da MESMA linha, de propósito, com credenciais diferentes:
    //
    //  - a de serviço responde "existe? está viva?", e é o que produz mensagem
    //    de erro útil;
    //  - a do usuário responde "esta pessoa pode?", porque passa pela RLS de
    //    email_contas, que é `tenho_acesso_a_caixa(id)` — a MESMA regra que
    //    decide o que a tela mostra.
    //
    // Replicar a regra aqui em TypeScript seria uma segunda fonte de verdade
    // que dessincroniza no primeiro ajuste de política. Deixar o banco decidir
    // custa uma consulta e nunca diverge.
    const [{ data: conta }, { data: contaVisivel }] = await Promise.all([
      supabase
        .from("email_contas")
        .select("id, email, nome_exibicao, status")
        .eq("empresa_id", caller.empresa_id)
        .maybeSingle(),
      userClient
        .from("email_contas")
        .select("id")
        .eq("empresa_id", caller.empresa_id)
        .maybeSingle(),
    ]);

    if (!conta) {
      return json(
        { error: "Nenhuma caixa de e-mail conectada. Conecte em E-mails.", code: "sem_conta" },
        409,
      );
    }
    if (conta.status !== "conectada") {
      return json(
        { error: "A conexão com o e-mail expirou. Reconecte a caixa.", code: "conta_revogada" },
        409,
      );
    }

    // Enviar é falar EM NOME da empresa, com o endereço dela no remetente. Sem
    // esta checagem qualquer pessoa com login mandava e-mail pela caixa do
    // atendimento sem nunca ter recebido acesso a ela.
    //
    // Quem tem um marcador só continua passando: você pediu que quem enxerga o
    // marcador possa responder por ele, e `tenho_acesso_a_caixa` devolve
    // verdadeiro para qualquer liberação — inteira ou de um marcador.
    if (!contaVisivel) {
      console.warn(
        `[email-enviar] acesso negado: usuario=${caller.id} conta=${conta.id} empresa=${caller.empresa_id}`,
      );
      return json(
        {
          error: "Você não tem acesso a esta caixa de e-mail. Peça a um gestor para liberar.",
          code: "sem_acesso_a_caixa",
        },
        403,
      );
    }

    const { data: grantRow } = await supabase
      .from("email_conta_grants")
      .select("grant_id")
      .eq("conta_id", conta.id)
      .maybeSingle();

    if (!grantRow?.grant_id) {
      return json({ error: "Credencial da caixa não encontrada. Reconecte.", code: "sem_grant" }, 409);
    }

    // ---- anexos do rascunho --------------------------------------------------
    // A tela manda `rascunho_id`; os arquivos estão presos a ele em
    // `email_rascunho_anexos`, com o binário no balde PRIVADO `email-anexos`.
    //
    // A leitura das linhas é pelo `userClient` de propósito: a RLS de
    // `email_rascunho_anexos` é pessoal, então isso já garante que o rascunho é
    // de quem está enviando — sem uma segunda regra em TypeScript. O download do
    // binário é com a chave de serviço porque o balde é privado.
    const rascunhoId =
      typeof body?.rascunho_id === "string" && body.rascunho_id ? body.rascunho_id : null;

    type AnexoParaEnviar = { nome: string; mime: string; blob: Blob; caminho: string };
    const anexos: AnexoParaEnviar[] = [];
    const TETO_ANEXOS = 20 * 1024 * 1024;

    if (rascunhoId) {
      const { data: linhas, error: erroAnexos } = await userClient
        .from("email_rascunho_anexos")
        .select("caminho, nome_arquivo, mime, tamanho")
        .eq("rascunho_id", rascunhoId);

      if (erroAnexos) {
        console.error("[email-enviar] falha ao ler anexos:", erroAnexos);
        return json({ error: "Não consegui ler os anexos deste e-mail." }, 503);
      }

      const total = (linhas ?? []).reduce((s, l) => s + (Number(l.tamanho) || 0), 0);
      if (total > TETO_ANEXOS) {
        return json(
          { error: "Os anexos passam de 20 MB no total. Remova algum e tente de novo." },
          413,
        );
      }

      for (const l of linhas ?? []) {
        const { data: bin, error: erroDownload } = await supabase.storage
          .from("email-anexos")
          .download(l.caminho);
        if (erroDownload || !bin) {
          console.error(`[email-enviar] falha ao baixar anexo ${l.caminho}:`, erroDownload);
          return json({ error: `Não consegui carregar o anexo "${l.nome_arquivo}".` }, 502);
        }
        anexos.push({
          nome: l.nome_arquivo || "anexo",
          mime: l.mime || "application/octet-stream",
          blob: bin,
          caminho: l.caminho,
        });
      }
    }

    // ---- envio ------------------------------------------------------------
    const payload: Record<string, unknown> = {
      to: para,
      subject: typeof body?.subject === "string" ? body.subject : "",
      body: typeof body?.body === "string" ? body.body : "",
    };
    const cc = enderecos(body?.cc);
    const bcc = enderecos(body?.bcc);
    if (cc.length) payload.cc = cc;
    if (bcc.length) payload.bcc = bcc;
    // O Nylas acrescenta In-Reply-To e References sozinho a partir daqui — é o
    // que mantém a resposta na mesma conversa no cliente do destinatário.
    //
    // Mas RESPONDER a uma conversa exige poder LER aquela conversa. Sem esta
    // checagem, `reply_to_message_id` era o único campo do envio que escapava
    // da regra por marcador: quem foi liberado só em "004 - DECA" podia
    // emendar uma resposta em qualquer conversa da caixa cujo id conhecesse, e
    // o destinatário veria a mensagem entrar na thread original — no cliente
    // dele, indistinguível de uma resposta legítima do atendimento.
    //
    // Quem autoriza é o `userClient`, pela mesma RLS que decide o que a tela
    // mostra (`tenho_acesso_a_mensagem`), e não uma segunda regra em
    // TypeScript que dessincronizaria no primeiro ajuste de política.
    if (typeof body?.reply_to_message_id === "string" && body.reply_to_message_id) {
      // SEM filtrar por `conta_id`, de propósito. Filtrar por ele parecia mais
      // apertado e era só mais quebrado: as 142 mensagens de caixas já
      // desconectadas ficam com `conta_id` NULO (o histórico que o usuário
      // escolheu preservar), continuam listadas em Recebidos, e responder a
      // qualquer uma delas passaria a devolver 403 dizendo que a pessoa não tem
      // acesso — o que é falso, ela está olhando a mensagem na tela.
      //
      // Quem recorta é a RLS, que já trata `conta_id` nulo, e o `empresa_id` que
      // ela impõe. Repetir o recorte aqui só acrescentava uma regra a mais para
      // divergir.
      //
      // `limit(1)` em vez de `maybeSingle()`: reconectar uma caixa preservando o
      // histórico pode deixar a MESMA `nylas_message_id` em duas linhas (a
      // arquivada, com conta nula, e a nova). `maybeSingle` viraria erro nesse
      // caso; para autorizar, achar uma já basta.
      const { data: originais, error: erroOriginal } = await userClient
        .from("email_mensagens")
        .select("id")
        .eq("nylas_message_id", body.reply_to_message_id)
        .limit(1);

      const original = originais?.[0] ?? null;

      if (erroOriginal) {
        console.error("[email-enviar] falha ao verificar a conversa:", erroOriginal);
        return json({ error: "Não consegui verificar seu acesso a esta conversa." }, 503);
      }
      if (!original) {
        console.warn(
          `[email-enviar] resposta negada: usuario=${caller.id} mensagem=${body.reply_to_message_id}`,
        );
        return json(
          { error: "Você não tem acesso à conversa que está respondendo.", code: "sem_acesso_a_conversa" },
          403,
        );
      }

      payload.reply_to_message_id = body.reply_to_message_id;
    }

    const cabecalhos: Record<string, string> = {};
    // Idempotency-Key: o envio é síncrono e sem retry automático; se a rede cair
    // depois do Nylas aceitar, o retry do cliente não pode mandar duas vezes.
    if (typeof body?.idempotency_key === "string" && body.idempotency_key) {
      cabecalhos["Idempotency-Key"] = body.idempotency_key.slice(0, 256);
    }

    // Sem anexo: JSON puro, como sempre foi. Com anexo: multipart/form-data —
    // exigência do Nylas acima de 3 MB, e mais simples do que decidir o limiar.
    // O campo `message` leva o JSON; cada arquivo é um part próprio, com o nome
    // do arquivo no Content-Disposition (3º argumento do `append`). O nome do
    // CAMPO é sufixado com o índice para dois anexos de mesmo nome não colidirem.
    let corpoDaChamada: BodyInit;
    if (anexos.length === 0) {
      corpoDaChamada = JSON.stringify(payload);
    } else {
      // O `message` leva o JSON, com um manifesto `attachments` (nome + tipo +
      // tamanho) — é o que o SDK oficial do Nylas manda, e alguns backends só
      // casam o part com a entrada do manifesto. Cada arquivo vai num part
      // próprio, nome de campo com índice (dois anexos homônimos não colidem) e
      // o nome do arquivo no Content-Disposition (3º arg do `append`).
      const payloadMultipart = {
        ...payload,
        attachments: anexos.map((a) => ({
          filename: a.nome,
          content_type: a.mime,
          size: a.blob.size,
        })),
      };
      const form = new FormData();
      form.append("message", JSON.stringify(payloadMultipart));
      anexos.forEach((a, i) => {
        form.append(`attachment${i}`, a.blob, a.nome);
      });
      corpoDaChamada = form;
    }

    const resp = await chamarNylas<MensagemNylas>(
      `/v3/grants/${grantRow.grant_id}/messages/send`,
      {
        method: "POST",
        headers: cabecalhos,
        body: corpoDaChamada,
        // 150s por recomendação da doc do Nylas: o envio é síncrono e Exchange
        // self-hosted chega a levar 2 minutos.
        timeoutMs: 150_000,
      },
    );

    if (!resp.ok || !resp.body.data) {
      const motivo = erroDoNylas(resp.body, resp.texto);
      console.error("[email-enviar] Nylas recusou:", resp.status, motivo);

      // 401/403 do Nylas para um grant significa credencial morta: o usuário
      // revogou o acesso no provedor. Marcar aqui faz a tela pedir reconexão em
      // vez de repetir um erro genérico a cada tentativa.
      if (resp.status === 401 || resp.status === 403) {
        await supabase
          .from("email_contas")
          .update({ status: "revogada", ultimo_erro: motivo.slice(0, 500) })
          .eq("id", conta.id);
        return json(
          { error: "A conexão com o e-mail expirou. Reconecte a caixa.", code: "conta_revogada" },
          409,
        );
      }

      return json({ error: `Não foi possível enviar: ${motivo}` }, 502);
    }

    const enviada = resp.body.data;

    // ---- registra ---------------------------------------------------------
    // O webhook `message.created` corre com esta resposta HTTP e quase sempre
    // CHEGA PRIMEIRO — medido: das 27 mensagens enviadas em produção, 27 foram
    // criadas pelo webhook. Com `ignoreDuplicates: true`, que era o que estava
    // aqui, este upsert virava um no-op silencioso e três colunas que SÓ este
    // caminho conhece nunca eram gravadas: `enviado_por` (quem clicou em
    // enviar), `corpo_html` (o texto que a pessoa escreveu) e `envio_status`.
    //
    // Isso não era cosmético. A regra de acesso reconhece "o que eu enviei" por
    // `enviado_por`; com ela sempre nula, quem tem acesso só a um marcador
    // mandava um e-mail novo e ele sumia da própria caixa de enviados.
    //
    // Mesclar é seguro nos dois sentidos da corrida: `mensagemParaLinha` (o
    // caminho do webhook) não inclui `corpo_html`, `enviado_por` nem
    // `envio_status`, e este payload não inclui `pastas` nem `excluido` — o
    // PostgREST só toca nas colunas presentes, então nenhum dos dois apaga o
    // que o outro escreveu.
    const { error: erroInsert } = await supabase
      .from("email_mensagens")
      .upsert(
        {
          empresa_id: caller.empresa_id,
          conta_id: conta.id,
          nylas_message_id: enviada.id,
          nylas_thread_id: enviada.thread_id ?? null,
          direcao: "enviado",
          remetente_nome: conta.nome_exibicao ?? caller.nome ?? null,
          remetente_email: conta.email,
          destinatarios: para,
          cc,
          bcc,
          assunto: payload.subject as string,
          snippet: String(payload.body ?? "").replace(/<[^>]*>/g, " ").trim().slice(0, 200),
          corpo_html: payload.body as string,
          lido: true,
          envio_status: "enviado",
          enviado_por: caller.id,
          ...(anexos.length ? { tem_anexo: true } : {}),
          data_mensagem: new Date((enviada.date ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
        },
        { onConflict: "conta_id,nylas_message_id" },
      );

    if (erroInsert) {
      // O e-mail SAIU. Falhar a resposta agora faria o usuário reenviar e o
      // destinatário receber duas vezes — o registro local é o que perdemos.
      console.error("[email-enviar] enviado mas não registrado:", erroInsert);
    }

    // ---- faxina dos anexos ----------------------------------------------------
    // O e-mail saiu com os anexos embutidos; as cópias no balde não servem mais.
    // Best-effort: falhar aqui não pode virar erro na tela (o e-mail JÁ foi). As
    // linhas somem sozinhas quando a tela descarta o rascunho (cascade), mas
    // apagar já aqui evita anexo pendurado se a pessoa deixar o rascunho aberto.
    if (rascunhoId && anexos.length) {
      const { error: erroBalde } = await supabase.storage
        .from("email-anexos")
        .remove(anexos.map((a) => a.caminho));
      if (erroBalde) console.error("[email-enviar] falha ao limpar o balde:", erroBalde);

      const { error: erroLinhas } = await supabase
        .from("email_rascunho_anexos")
        .delete()
        .eq("rascunho_id", rascunhoId);
      if (erroLinhas) console.error("[email-enviar] falha ao apagar linhas de anexo:", erroLinhas);
    }

    return json({ ok: true, id: enviada.id, thread_id: enviada.thread_id ?? null });
  } catch (err) {
    const texto = String(err);
    if (texto.includes("TimeoutError") || texto.includes("timed out")) {
      // Pode ter saído. Não afirmar que falhou.
      return json(
        { error: "O envio demorou demais para responder. Confira a caixa de enviados antes de tentar de novo." },
        504,
      );
    }
    console.error("[email-enviar]", err);
    return json({ error: "Erro inesperado ao enviar o e-mail.", detail: texto }, 500);
  }
});
