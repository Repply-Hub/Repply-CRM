import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@18.5.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Marca todos os objetos criados por este app. A conta do Stripe pode ser
// compartilhada com outros produtos, e é por esta chave que o webhook decide o
// que é dele.
const APP = "repply";

// Quem responde pela empresa. Alinhado com podeGerenciarAssinatura no front,
// mas a decisão que vale é esta — o cliente só decide se mostra o botão.
const PAPEIS_QUE_ASSINAM = ["admin", "empresa", "gestor"];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) return json({ error: "Cobrança não configurada." }, 500);

    const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");
    if (!appUrl) return json({ error: "APP_URL não configurada." }, 500);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const [{ data: { user }, error: authError }, body] = await Promise.all([
      userClient.auth.getUser(),
      req.json().catch(() => ({})),
    ]);
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const { data: caller } = await supabase
      .from("usuarios")
      .select("id, role, empresa_id, nome, email, deleted_at, empresas:empresa_id(id, nome, owner_id)")
      .eq("user_id", user.id)
      .single();

    if (!caller) return json({ error: "Usuário não encontrado." }, 404);
    if (caller.deleted_at) return json({ error: "Conta suspensa." }, 403);
    if (!caller.empresa_id) return json({ error: "Conta sem empresa vinculada." }, 403);

    const empresa = caller.empresas as { id: string; nome: string | null; owner_id: string } | null;
    const ehDono = empresa?.owner_id === user.id;
    if (!ehDono && !PAPEIS_QUE_ASSINAM.includes(caller.role)) {
      return json({ error: "Só o gestor da empresa pode assinar." }, 403);
    }

    // O cliente manda o slug; o preço é resolvido aqui. Aceitar um price_id do
    // navegador deixaria qualquer um assinar um preço arbitrário da conta.
    const slug = typeof body?.plano === "string" ? body.plano : "lancamento";
    const { data: plano } = await supabase
      .from("planos")
      .select("slug, nome, stripe_price_id")
      .eq("slug", slug)
      .maybeSingle();

    if (!plano) return json({ error: "Plano não encontrado." }, 400);
    if (!plano.stripe_price_id) {
      return json(
        { error: "Plano ainda sem preço configurado no Stripe.", code: "sem_price_id" },
        409,
      );
    }

    const stripe = new Stripe(stripeKey, {
      httpClient: Stripe.createFetchHttpClient(),
      appInfo: { name: "Repply" },
    });

    const { data: assinatura } = await supabase
      .from("empresa_assinaturas")
      .select("empresa_id, stripe_customer_id, stripe_subscription_id, plan_status")
      .eq("empresa_id", caller.empresa_id)
      .maybeSingle();

    // Já em dia: não faz sentido abrir um segundo checkout — o caminho é o
    // portal de gestão.
    if (assinatura?.stripe_subscription_id && assinatura.plan_status === "active") {
      return json({ error: "Esta empresa já tem assinatura ativa.", code: "ja_ativa" }, 409);
    }

    let customerId = assinatura?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: caller.email ?? user.email ?? undefined,
        name: empresa?.nome ?? caller.nome ?? undefined,
        metadata: { app: APP, empresa_id: caller.empresa_id },
      });
      customerId = customer.id;

      await supabase
        .from("empresa_assinaturas")
        .upsert(
          { empresa_id: caller.empresa_id, stripe_customer_id: customerId },
          { onConflict: "empresa_id" },
        );
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: plano.stripe_price_id, quantity: 1 }],
      // Assinatura recorrente no Brasil aceita apenas cartão; boleto e PIX não
      // são suportados pelo Checkout em modo subscription.
      payment_method_types: ["card"],
      locale: "pt-BR",
      allow_promotion_codes: true,
      metadata: { app: APP, empresa_id: caller.empresa_id, plano: plano.slug },
      // A metadata precisa estar TAMBÉM aqui: nos eventos
      // customer.subscription.*, o objeto entregue é a Subscription, que não
      // herda a metadata da sessão de checkout.
      subscription_data: {
        metadata: { app: APP, empresa_id: caller.empresa_id, plano: plano.slug },
      },
      // Derivado do secret, nunca do header Origin: com CORS liberado, aceitar o
      // Origin transformaria isto num redirecionamento aberto no meio de um
      // fluxo de pagamento.
      success_url: `${appUrl}/assinar?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/assinar?status=cancelled`,
    });

    return json({ url: session.url });
  } catch (err) {
    console.error("[stripe-checkout]", err);
    return json({ error: "Não foi possível iniciar o pagamento.", detail: String(err) }, 500);
  }
});
