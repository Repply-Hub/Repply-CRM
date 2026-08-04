import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json, mensagemParaLinha, type MensagemNylas } from "../_shared/nylas.ts";

/**
 * Recebe as notificações do Nylas. Público (`verify_jwt = false`): o Nylas não
 * manda JWT do Supabase, e a autenticidade vem do HMAC em `x-nylas-signature`.
 */

/** HMAC-SHA256 hex do corpo cru, com o webhook_secret como chave. */
async function assinaturaEsperada(corpoCru: string, segredo: string): Promise<string> {
  // SubtleCrypto e não o crypto do Node: o runtime das Edge Functions não tem o
  // segundo. É o mesmo detalhe que faria toda entrega do Stripe ser rejeitada.
  const chave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const assinado = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(corpoCru));
  return Array.from(new Uint8Array(assinado))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Comparação de tempo constante: sair no primeiro byte diferente vaza o segredo. */
function iguaisEmTempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // -----------------------------------------------------------------------
  // 1. Desafio de registro — só há UMA tentativa
  // -----------------------------------------------------------------------
  // O Nylas faz GET ?challenge=<uuid> ao criar o webhook e exige 200 em até 10s
  // com o valor EXATO no corpo — "not even quotation marks". Falhar aqui não dá
  // segunda chance: é preciso apagar o webhook e criar outro.
  if (req.method === "GET") {
    const challenge = new URL(req.url).searchParams.get("challenge");
    if (!challenge) return new Response("ok", { status: 200 });

    const bytes = new TextEncoder().encode(challenge);
    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": "text/plain",
        // Content-Length explícito: sem ele o Deno pode responder com
        // Transfer-Encoding: chunked, que o Nylas rejeita.
        "Content-Length": String(bytes.byteLength),
      },
    });
  }

  // -----------------------------------------------------------------------
  // 2. Notificação
  // -----------------------------------------------------------------------
  const segredo = Deno.env.get("NYLAS_WEBHOOK_SECRET");
  if (!segredo) {
    console.error("[email-webhook] NYLAS_WEBHOOK_SECRET ausente");
    return json({ error: "misconfigured" }, 500);
  }

  // O corpo CRU, antes de qualquer parse: a assinatura é calculada sobre os
  // bytes exatos, e um JSON.parse seguido de stringify quebraria a conferência.
  const corpoCru = await req.text();

  const recebida = req.headers.get("x-nylas-signature") ?? req.headers.get("X-Nylas-Signature");
  if (!recebida) return json({ error: "missing_signature" }, 400);

  const esperada = await assinaturaEsperada(corpoCru, segredo);
  if (!iguaisEmTempoConstante(recebida.trim().toLowerCase(), esperada)) {
    console.error("[email-webhook] assinatura inválida");
    return json({ error: "invalid_signature" }, 401);
  }

  let evento: {
    id?: string;
    type?: string;
    data?: { object?: MensagemNylas & { grant_id?: string } };
  };
  try {
    evento = JSON.parse(corpoCru);
  } catch {
    // Corpo assinado mas ilegível: 200 para o Nylas não ficar reentregando algo
    // que nunca vai dar certo.
    return json({ received: true, ignorado: "json_invalido" });
  }

  const tipo = evento.type ?? "";
  const objeto = evento.data?.object;
  const grantId = objeto?.grant_id;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // Idempotência: o Nylas garante entrega at-least-once e tenta até 3 vezes.
  // Duplicata é regra, não exceção. PK no id do evento transforma repetição em
  // conflito barato — mesmo padrão de stripe_eventos.
  if (evento.id) {
    const { error } = await supabase
      .from("email_webhook_eventos")
      .insert({ id: evento.id, tipo, grant_id: grantId ?? null });
    if (error) {
      if (error.code === "23505") return json({ received: true, duplicado: true });
      console.error("[email-webhook] falha ao registrar evento:", error);
      // 500 é dos códigos que o Nylas reentrega — o evento não se perde.
      return json({ error: "dedupe_failed" }, 500);
    }
  }

  try {
    if (!grantId) return json({ received: true, ignorado: "sem_grant" });

    const { data: grantRow } = await supabase
      .from("email_conta_grants")
      .select("conta_id")
      .eq("grant_id", grantId)
      .maybeSingle();

    if (!grantRow) {
      // Grant que não é nosso (aplicação Nylas compartilhada) ou conta já
      // desconectada aqui. 200 para o Nylas parar de tentar.
      return json({ received: true, ignorado: "grant_desconhecido" });
    }

    const { data: conta } = await supabase
      .from("email_contas")
      .select("id, empresa_id, email")
      .eq("id", grantRow.conta_id)
      .maybeSingle();

    if (!conta) return json({ received: true, ignorado: "conta_removida" });

    // ---- credencial morta ------------------------------------------------
    if (tipo === "grant.expired" || tipo === "grant.deleted") {
      await supabase
        .from("email_contas")
        .update({
          status: "revogada",
          ultimo_erro: "O acesso foi revogado no provedor. Reconecte a caixa.",
        })
        .eq("id", conta.id);
      console.log(`[email-webhook] grant revogado empresa=${conta.empresa_id}`);
      return json({ received: true });
    }

    // ---- mensagem --------------------------------------------------------
    if (tipo.startsWith("message.created") || tipo.startsWith("message.updated")) {
      // O sufixo .truncated significa payload acima de 1MB: o objeto veio
      // cortado e é preciso reconsultar a mensagem. Sem `id` não há o que fazer.
      if (!objeto?.id) return json({ received: true, ignorado: "sem_id" });

      const linha = mensagemParaLinha(objeto, conta.id, conta.empresa_id, conta.email);

      const { error } = await supabase
        .from("email_mensagens")
        .upsert(linha, { onConflict: "conta_id,nylas_message_id" });

      if (error) {
        console.error("[email-webhook] falha ao gravar mensagem:", error);
        // Solta a marca de processado para a reentrega não ser descartada como
        // duplicata — senão o e-mail se perderia de vez.
        if (evento.id) await supabase.from("email_webhook_eventos").delete().eq("id", evento.id);
        return json({ error: "persist_failed" }, 500);
      }

      await supabase
        .from("email_contas")
        .update({ ultima_sync_em: new Date().toISOString() })
        .eq("id", conta.id);
    }

    return json({ received: true });
  } catch (err) {
    console.error(`[email-webhook] erro processando ${tipo}:`, err);
    if (evento.id) await supabase.from("email_webhook_eventos").delete().eq("id", evento.id);
    return json({ error: "handler_failed" }, 500);
  }
});
