import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@18.5.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const { data: caller } = await supabase
      .from("usuarios")
      .select("role, empresa_id, deleted_at, empresas:empresa_id(owner_id)")
      .eq("user_id", user.id)
      .single();

    if (!caller) return json({ error: "Usuário não encontrado." }, 404);
    if (caller.deleted_at) return json({ error: "Conta suspensa." }, 403);
    if (!caller.empresa_id) return json({ error: "Conta sem empresa vinculada." }, 403);

    const empresa = caller.empresas as { owner_id: string } | null;
    const ehDono = empresa?.owner_id === user.id;
    if (!ehDono && !PAPEIS_QUE_ASSINAM.includes(caller.role)) {
      return json({ error: "Só o gestor da empresa pode gerenciar a assinatura." }, 403);
    }

    const { data: assinatura } = await supabase
      .from("empresa_assinaturas")
      .select("stripe_customer_id")
      .eq("empresa_id", caller.empresa_id)
      .maybeSingle();

    // Sem cliente no Stripe não há o que gerenciar: o caminho é o checkout. O
    // código deixa o front distinguir isso de um erro de verdade.
    if (!assinatura?.stripe_customer_id) {
      return json({ error: "Esta empresa ainda não tem assinatura.", code: "sem_customer" }, 409);
    }

    const stripe = new Stripe(stripeKey, {
      httpClient: Stripe.createFetchHttpClient(),
      appInfo: { name: "Repply" },
    });

    const sessao = await stripe.billingPortal.sessions.create({
      customer: assinatura.stripe_customer_id,
      return_url: `${appUrl}/assinar`,
      locale: "pt-BR",
    });

    return json({ url: sessao.url });
  } catch (err) {
    console.error("[stripe-portal]", err);
    return json({ error: "Não foi possível abrir o portal de cobrança.", detail: String(err) }, 500);
  }
});
