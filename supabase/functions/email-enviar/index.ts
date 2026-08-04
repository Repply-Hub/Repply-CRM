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
    const { data: conta } = await supabase
      .from("email_contas")
      .select("id, email, nome_exibicao, status")
      .eq("empresa_id", caller.empresa_id)
      .maybeSingle();

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

    const { data: grantRow } = await supabase
      .from("email_conta_grants")
      .select("grant_id")
      .eq("conta_id", conta.id)
      .maybeSingle();

    if (!grantRow?.grant_id) {
      return json({ error: "Credencial da caixa não encontrada. Reconecte.", code: "sem_grant" }, 409);
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
    if (typeof body?.reply_to_message_id === "string" && body.reply_to_message_id) {
      payload.reply_to_message_id = body.reply_to_message_id;
    }

    const cabecalhos: Record<string, string> = {};
    // Idempotency-Key: o envio é síncrono e sem retry automático; se a rede cair
    // depois do Nylas aceitar, o retry do cliente não pode mandar duas vezes.
    if (typeof body?.idempotency_key === "string" && body.idempotency_key) {
      cabecalhos["Idempotency-Key"] = body.idempotency_key.slice(0, 256);
    }

    const resp = await chamarNylas<MensagemNylas>(
      `/v3/grants/${grantRow.grant_id}/messages/send`,
      {
        method: "POST",
        headers: cabecalhos,
        body: JSON.stringify(payload),
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
    // ON CONFLICT DO NOTHING porque o webhook message.created pode chegar antes
    // desta resposta HTTP voltar — os dois caminhos gravam a mesma mensagem.
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
          data_mensagem: new Date((enviada.date ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
        },
        { onConflict: "conta_id,nylas_message_id", ignoreDuplicates: true },
      );

    if (erroInsert) {
      // O e-mail SAIU. Falhar a resposta agora faria o usuário reenviar e o
      // destinatário receber duas vezes — o registro local é o que perdemos.
      console.error("[email-enviar] enviado mas não registrado:", erroInsert);
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
