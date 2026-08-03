import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@18.5.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

const APP = "repply";

// Status do Stripe que liberam o uso. O resto bloqueia. past_due fica liberado
// de propósito: o cartão falhou mas o Stripe ainda está reprocessando, e cortar
// o acesso na primeira falha de cobrança gera cancelamento em vez de pagamento.
const STATUS_LIBERAM = ["active", "trialing", "past_due"];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!stripeKey || !webhookSecret) {
    console.error("[stripe-webhook] secrets ausentes");
    return json({ error: "misconfigured" }, 500);
  }

  const assinatura = req.headers.get("stripe-signature");
  if (!assinatura) return json({ error: "missing_signature" }, 400);

  const stripe = new Stripe(stripeKey, {
    httpClient: Stripe.createFetchHttpClient(),
    appInfo: { name: "Repply" },
  });

  // O corpo CRU, antes de qualquer parse: a assinatura é calculada sobre os
  // bytes exatos, e um JSON.parse seguido de stringify quebraria a conferência.
  const corpoCru = await req.text();

  let evento: Stripe.Event;
  try {
    // constructEventAsync com o provedor de cripto da plataforma: a versão
    // síncrona depende do crypto do Node, que não existe no runtime das Edge
    // Functions — usá-la faria toda entrega ser rejeitada.
    evento = await stripe.webhooks.constructEventAsync(
      corpoCru,
      assinatura,
      webhookSecret,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch (err) {
    // 400 é deliberado: sinaliza ao Stripe que a entrega foi rejeitada.
    console.error("[stripe-webhook] assinatura inválida:", err);
    return json({ error: "invalid_signature" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // A conta do Stripe pode ser compartilhada com outros produtos. Ignora o que
  // não é nosso — mas só quando a marca existe: muitos eventos (invoice.*, por
  // exemplo) não carregam metadata no objeto raiz, e descartar por ausência
  // silenciaria eventos legítimos.
  const marcaDoEvento = (evento.data?.object as { metadata?: Record<string, string> })?.metadata?.app;
  if (marcaDoEvento && marcaDoEvento !== APP) {
    return json({ received: true, ignorado: "outro_app" });
  }

  // Deduplicação: o Stripe reenvia até receber 2xx e pode repetir entregas. O
  // INSERT com PK no id do evento transforma repetição em conflito barato.
  const { error: erroDedupe } = await supabase
    .from("stripe_eventos")
    .insert({ id: evento.id, tipo: evento.type });

  if (erroDedupe) {
    if (erroDedupe.code === "23505") {
      return json({ received: true, duplicado: true });
    }
    console.error("[stripe-webhook] falha ao registrar evento:", erroDedupe);
    return json({ error: "dedupe_failed" }, 500);
  }

  try {
    switch (evento.type) {
      case "checkout.session.completed": {
        const sessao = evento.data.object as Stripe.Checkout.Session;
        // Assinatura nova: o estado definitivo chega em customer.subscription.*.
        // Aqui só amarramos o customer à empresa, para o caso de o evento de
        // subscription chegar antes e precisar do vínculo.
        const empresaId = sessao.metadata?.empresa_id;
        if (empresaId && typeof sessao.customer === "string") {
          await supabase
            .from("empresa_assinaturas")
            .upsert(
              { empresa_id: empresaId, stripe_customer_id: sessao.customer },
              { onConflict: "empresa_id" },
            );
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.resumed":
      case "customer.subscription.paused":
      case "customer.subscription.deleted": {
        await aplicarAssinatura(supabase, stripe, evento);
        break;
      }

      case "invoice.paid":
      case "invoice.payment_succeeded":
      case "invoice.payment_failed": {
        // A fatura por si não define o estado — a assinatura define. Relemos a
        // assinatura no Stripe para gravar a verdade dele, não a nossa leitura.
        const fatura = evento.data.object as Stripe.Invoice;
        const subId = resolverAssinaturaDaFatura(fatura);
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          await aplicarAssinatura(supabase, stripe, { ...evento, data: { object: sub } } as Stripe.Event);
        }
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error(`[stripe-webhook] erro processando ${evento.type}:`, err);
    // Remove a marca de processado para que a reentrega do Stripe não seja
    // descartada como duplicata — senão o evento se perderia de vez.
    await supabase.from("stripe_eventos").delete().eq("id", evento.id);
    return json({ error: "handler_failed" }, 500);
  }

  return json({ received: true });
});

/**
 * Grava o estado da assinatura na empresa correspondente.
 */
async function aplicarAssinatura(
  supabase: ReturnType<typeof createClient>,
  stripe: Stripe,
  evento: Stripe.Event,
) {
  const sub = evento.data.object as Stripe.Subscription;
  if (sub.metadata?.app && sub.metadata.app !== APP) return;

  // A empresa vem da metadata; se faltar (assinatura criada à mão no painel,
  // por exemplo), cai para o vínculo pelo customer que já registramos.
  let empresaId = sub.metadata?.empresa_id ?? null;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;

  if (!empresaId && customerId) {
    const { data } = await supabase
      .from("empresa_assinaturas")
      .select("empresa_id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    empresaId = (data as { empresa_id: string } | null)?.empresa_id ?? null;
  }

  if (!empresaId) {
    console.warn("[stripe-webhook] assinatura sem empresa identificável:", sub.id);
    return;
  }

  const eventoEm = new Date((evento.created ?? Math.floor(Date.now() / 1000)) * 1000).toISOString();

  // Eventos podem chegar fora de ordem. Sem esta comparação, uma entrega antiga
  // reprocessada sobrescreveria um estado mais recente — por exemplo,
  // devolvendo para "canceled" uma empresa que já reativou.
  const { data: atual } = await supabase
    .from("empresa_assinaturas")
    .select("ultimo_evento_em")
    .eq("empresa_id", empresaId)
    .maybeSingle();

  const anterior = (atual as { ultimo_evento_em: string | null } | null)?.ultimo_evento_em;
  if (anterior && new Date(anterior) > new Date(eventoEm)) {
    console.log("[stripe-webhook] evento mais antigo que o estado atual, ignorado:", sub.id);
    return;
  }

  const cancelada = evento.type === "customer.subscription.deleted";
  const statusStripe = cancelada ? "canceled" : sub.status;
  const liberado = !cancelada && STATUS_LIBERAM.includes(sub.status);

  // Resolve o plano pelo preço, para o app saber o que a empresa contratou.
  const priceId = sub.items?.data?.[0]?.price?.id ?? null;
  let planoSlug: string | null = null;
  if (priceId) {
    const { data: plano } = await supabase
      .from("planos")
      .select("slug")
      .eq("stripe_price_id", priceId)
      .maybeSingle();
    planoSlug = (plano as { slug: string } | null)?.slug ?? null;
  }

  const fimPeriodo = (sub as unknown as { current_period_end?: number }).current_period_end;

  const patch: Record<string, unknown> = {
    empresa_id: empresaId,
    plan_status: liberado ? "active" : mapearBloqueio(statusStripe),
    subscription_status: statusStripe,
    stripe_subscription_id: sub.id,
    cancel_at_period_end: sub.cancel_at_period_end ?? false,
    current_period_end: fimPeriodo ? new Date(fimPeriodo * 1000).toISOString() : null,
    origem: "stripe",
    ultimo_evento_em: eventoEm,
  };
  if (customerId) patch.stripe_customer_id = customerId;
  if (planoSlug) patch.plano_slug = planoSlug;
  if (liberado) patch.ativado_em = new Date().toISOString();

  const { error } = await supabase
    .from("empresa_assinaturas")
    .upsert(patch, { onConflict: "empresa_id" });

  if (error) throw error;

  console.log(`[stripe-webhook] empresa=${empresaId} status=${statusStripe} liberado=${liberado}`);
}

/** Converte o status do Stripe no vocabulário da coluna plan_status. */
function mapearBloqueio(statusStripe: string): string {
  switch (statusStripe) {
    case "past_due":
      return "past_due";
    case "unpaid":
      return "unpaid";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    default:
      return "inactive";
  }
}

/**
 * Encontra o id da assinatura numa fatura. A API do Stripe já usou três formatos
 * para isso ao longo das versões, e o campo do topo foi removido em 2025.
 */
function resolverAssinaturaDaFatura(fatura: Stripe.Invoice): string | undefined {
  // Caminha por uma sequência de chaves e devolve o valor se for string. Evita
  // encadear acessos em objetos de forma variável sem recorrer a `any`.
  const texto = (raiz: unknown, ...caminho: string[]): string | undefined => {
    let atual: unknown = raiz;
    for (const chave of caminho) {
      if (typeof atual !== "object" || atual === null) return undefined;
      atual = (atual as Record<string, unknown>)[chave];
    }
    return typeof atual === "string" ? atual : undefined;
  };

  // Formato antigo, removido da API em 2025.
  const doTopo = texto(fatura, "subscription");
  if (doTopo) return doTopo;

  // Formato atual.
  const doPai =
    texto(fatura, "parent", "subscription_details", "subscription") ??
    texto(fatura, "parent", "subscription_details", "subscription_id");
  if (doPai) return doPai;

  // Último recurso: procurar nas linhas da fatura.
  for (const linha of fatura.lines?.data ?? []) {
    const candidato =
      texto(linha, "subscription") ??
      texto(linha, "parent", "subscription_item_details", "subscription") ??
      texto(linha, "parent", "subscription_details", "subscription");
    if (candidato) return candidato;
  }
  return undefined;
}
