import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@18.5.0?target=deno";

/**
 * Encerra uma empresa: cancela a cobrança e marca para exclusão.
 *
 * 🔴 NENHUM DADO É APAGADO AQUI. Nem uma linha. A empresa some de tudo, ninguém dela entra
 * mais, a assinatura para de cobrar — e cada registro continua onde estava por 60 dias. A
 * apagada definitiva é outra etapa, e mesmo lá é a equipe que confirma.
 *
 * ═══ A ORDEM É CANCELAR PRIMEIRO, MARCAR DEPOIS ═══
 *
 * Se algo falhar no meio, os dois desfechos possíveis são muito diferentes:
 *
 *   cancelar → marcar   pior caso: assinatura cancelada numa empresa ainda ativa.
 *                       Chato, visível no painel, e reversível refazendo a assinatura.
 *
 *   marcar → cancelar   pior caso: empresa ENCERRADA e AINDA SENDO COBRADA. É dinheiro do
 *                       cliente saindo por um sistema que ele não acessa mais, e ele só
 *                       descobre na fatura.
 *
 * A ordem escolhida é a que erra para o lado barato.
 *
 * 🔴 E O CANCELAMENTO É IMEDIATO, não no fim do período. Cobrar 60 dias de quem acabou de
 * ser cortado não se justifica — a decisão do Lucas em 29/08/2026 foi essa. O efeito colateral
 * está avisado no `restaurar_empresa`: restaurar NÃO ressuscita a assinatura.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Erro do Supabase não é um `Error` (CLAUDE.md §4.6): `String(e)` devolve "[object Object]"
 * e engole a explicação do banco. Já aconteceu na régua de cobrança, em 30/08/2026.
 */
function mensagem(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    const partes = [o.message, o.details, o.hint, o.code].filter(Boolean);
    if (partes.length > 0) return partes.join(" | ");
    try {
      return JSON.stringify(e).slice(0, 400);
    } catch {
      // referência circular: cai no String(e)
    }
  }
  return String(e);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const { empresa_id: empresaId, motivo } = await req.json().catch(() => ({}));
    if (!empresaId) return json({ error: "empresa_id é obrigatório." }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // ── Quem está chamando? ────────────────────────────────────────────────────────────
    // 🔴 A AUTORIZAÇÃO É CONFERIDA AQUI, e não só na tela. Esta função roda com chave de
    // serviço, que ignora toda regra de segurança do banco — então ela é a única barreira.
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) return json({ error: "Sem autorização." }, 401);

    const { data: auth } = await supabase.auth.getUser(token);
    if (!auth?.user) return json({ error: "Sessão inválida." }, 401);

    const { data: quemChama } = await supabase
      .from("usuarios")
      .select("id, role")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (quemChama?.role !== "admin") {
      return json({ error: "Apenas o administrador global pode excluir uma empresa." }, 403);
    }

    const resultado = {
      assinatura_cancelada: false,
      assinatura_ja_estava_cancelada: false,
      sem_assinatura: false,
      aviso_stripe: null as string | null,
    };

    // ── 1. Cancelar a cobrança ─────────────────────────────────────────────────────────
    const { data: assinatura } = await supabase
      .from("empresa_assinaturas")
      .select("stripe_subscription_id")
      .eq("empresa_id", empresaId)
      .maybeSingle();

    const subId = assinatura?.stripe_subscription_id ?? null;

    if (!subId) {
      // Cortesia, legacy, ou quem nunca assinou: não há cobrança para cancelar. É o caso
      // mais comum hoje (9 das 10 empresas), e não é erro.
      resultado.sem_assinatura = true;
    } else {
      const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
      if (!stripeKey) return json({ error: "Cobrança não configurada no servidor." }, 500);

      const stripe = new Stripe(stripeKey, {
        httpClient: Stripe.createFetchHttpClient(),
        appInfo: { name: "Repply" },
      });

      try {
        const atual = await stripe.subscriptions.retrieve(subId);
        if (atual.status === "canceled") {
          resultado.assinatura_ja_estava_cancelada = true;
        } else {
          await stripe.subscriptions.cancel(subId);
          resultado.assinatura_cancelada = true;
        }
      } catch (e) {
        // 🔴 FALHA NO STRIPE INTERROMPE A EXCLUSÃO. Marcar mesmo assim deixaria a empresa
        // encerrada e sendo cobrada — o desfecho que a ordem desta função existe para
        // evitar. Melhor não excluir e a pessoa tentar de novo.
        return json(
          {
            error:
              "Não foi possível cancelar a assinatura no Stripe. A empresa NÃO foi excluída — " +
              "tente de novo, ou cancele pelo painel do Stripe antes.",
            detalhe: mensagem(e),
          },
          502,
        );
      }
    }

    // ── 2. Marcar para exclusão, guardando o estado anterior ───────────────────────────
    // Chamada com o token de quem clicou (não com a chave de serviço) porque a função do
    // banco confere `is_admin()` e registra `excluida_por` a partir da sessão.
    const comoUsuario = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );

    const { data: marcacao, error: erroMarcar } = await comoUsuario.rpc("excluir_empresa", {
      p_empresa_id: empresaId,
      p_motivo: motivo ?? null,
    });

    if (erroMarcar) {
      return json(
        {
          error:
            "A assinatura foi cancelada, mas a empresa NÃO foi marcada como excluída. " +
            "Tente de novo — a segunda tentativa não cobra nada.",
          detalhe: mensagem(erroMarcar),
          ...resultado,
        },
        500,
      );
    }

    await supabase.from("automation_logs").insert({
      tipo: "empresa_excluida",
      status: "ok",
      detalhes: { empresa_id: empresaId, por: quemChama.id, motivo, ...resultado },
    });

    return json({ ok: true, ...resultado, ...(marcacao as Record<string, unknown>) });
  } catch (e) {
    return json({ error: mensagem(e) }, 500);
  }
});
