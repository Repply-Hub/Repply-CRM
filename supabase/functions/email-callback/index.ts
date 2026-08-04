import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  appUrl,
  callbackUri,
  chamarNylas,
  corsHeaders,
  nylasApiKey,
  nylasBase,
  nylasClientId,
} from "../_shared/nylas.ts";

/**
 * Retorno do OAuth do Nylas. Chega SEM JWT — é o navegador voltando do provedor,
 * igual ao stripe-webhook. A autenticidade vem do `state` de uso único, gerado
 * em email-conectar e consumido aqui.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Falha antes de qualquer coisa se APP_URL não existir: sem ela não há para
  // onde devolver o usuário, e um destino chutado no meio de um fluxo de
  // autenticação é pior do que um erro visível.
  let destino: string;
  try {
    destino = `${appUrl()}/emails`;
  } catch {
    return new Response("APP_URL não configurada.", { status: 500 });
  }

  const voltar = (params: Record<string, string>) =>
    Response.redirect(`${destino}?${new URLSearchParams(params).toString()}`, 303);

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const erroProvedor = url.searchParams.get("error");

    if (erroProvedor) {
      // Usuário clicou em cancelar na tela do provedor. Não é falha do sistema.
      return voltar({ conexao: "cancelada" });
    }
    if (!code || !state) {
      return voltar({ conexao: "erro", motivo: "retorno_incompleto" });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // DELETE ... RETURNING: consumo atômico. Duas chegadas do mesmo state (o
    // usuário aperta F5 na volta) só encontram linha uma vez. Este é o único
    // ponto que impede alguém de amarrar a caixa dele à empresa de outro.
    const { data: estados } = await supabase
      .from("email_conexao_estados")
      .delete()
      .eq("state", state)
      .select("empresa_id, usuario_id, provedor, expira_em");

    const estado = estados?.[0];
    if (!estado) return voltar({ conexao: "erro", motivo: "state_invalido" });
    if (new Date(estado.expira_em).getTime() < Date.now()) {
      return voltar({ conexao: "erro", motivo: "state_expirado" });
    }

    // ---- troca do código pelo grant -------------------------------------
    // client_secret é a API KEY da aplicação (não um segredo separado) — é o que
    // a referência do endpoint diz literalmente. E code_verifier: "nylas" é o
    // que o guia oficial usa mesmo sem PKCE; a referência marca o campo como
    // opcional e não diz se pode ser omitido, então seguimos o guia.
    const troca = await fetch(`${nylasBase()}/v3/connect/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: nylasClientId(),
        client_secret: nylasApiKey(),
        grant_type: "authorization_code",
        code,
        redirect_uri: callbackUri(),
        code_verifier: "nylas",
      }),
      signal: AbortSignal.timeout(30_000),
    });

    const textoTroca = await troca.text();
    let dadosTroca: {
      grant_id?: string;
      email?: string;
      provider?: string;
      error?: unknown;
      error_description?: string;
    } = {};
    try {
      dadosTroca = textoTroca ? JSON.parse(textoTroca) : {};
    } catch { /* resposta não-JSON cai no erro abaixo */ }

    if (!troca.ok || !dadosTroca.grant_id || !dadosTroca.email) {
      console.error("[email-callback] troca falhou:", troca.status, textoTroca.slice(0, 400));
      return voltar({ conexao: "erro", motivo: "troca_falhou" });
    }

    const grantId = dadosTroca.grant_id;
    const emailConta = dadosTroca.email;
    const provedor = dadosTroca.provider ?? estado.provedor;

    // ---- pastas ----------------------------------------------------------
    // O filtro `in` da API do Nylas exige o ID da pasta, não o nome — no Google
    // é o id da label. Resolvido uma vez aqui e cacheado, para o sync não gastar
    // uma chamada a /folders por execução.
    let pastaInbox: string | null = null;
    let pastaSent: string | null = null;
    try {
      const pastas = await chamarNylas<Array<{ id: string; name?: string; attributes?: string[] }>>(
        `/v3/grants/${grantId}/folders`,
        { method: "GET", timeoutMs: 20_000 },
      );
      for (const p of pastas.body.data ?? []) {
        const nome = (p.name ?? "").toLowerCase();
        const attrs = (p.attributes ?? []).map((a) => a.toLowerCase());
        if (!pastaInbox && (attrs.includes("\\inbox") || nome === "inbox")) pastaInbox = p.id;
        if (!pastaSent && (attrs.includes("\\sent") || nome === "sent" || nome === "sent mail")) {
          pastaSent = p.id;
        }
      }
    } catch (e) {
      // Não é fatal: o sync consegue trabalhar sem filtro de pasta, só menos
      // preciso. Conectar e falhar por causa disso seria desproporcional.
      console.warn("[email-callback] não consegui resolver pastas:", e);
    }

    // ---- grava conta -----------------------------------------------------
    const { data: conta, error: erroConta } = await supabase
      .from("email_contas")
      .upsert(
        {
          empresa_id: estado.empresa_id,
          provedor,
          email: emailConta,
          status: "conectada",
          ultimo_erro: null,
          pasta_inbox_id: pastaInbox,
          pasta_sent_id: pastaSent,
          conectado_por: estado.usuario_id,
          conectado_em: new Date().toISOString(),
        },
        { onConflict: "empresa_id" },
      )
      .select("id")
      .single();

    if (erroConta || !conta) {
      console.error("[email-callback] falha ao gravar conta:", erroConta);
      return voltar({ conexao: "erro", motivo: "gravacao_falhou" });
    }

    // ---- grava o grant ---------------------------------------------------
    const { error: erroGrant } = await supabase
      .from("email_conta_grants")
      .upsert(
        { conta_id: conta.id, grant_id: grantId, atualizado_em: new Date().toISOString() },
        { onConflict: "conta_id" },
      );

    if (erroGrant) {
      // 23505 no UNIQUE de grant_id significa que esta caixa já está ligada a
      // OUTRA empresa. O Nylas cria um grant por endereço por aplicação, então
      // seguir adiante daria a uma empresa acesso à caixa da outra.
      if (erroGrant.code === "23505") {
        await supabase
          .from("email_contas")
          .update({ status: "erro", ultimo_erro: "Esta caixa já está conectada a outra empresa." })
          .eq("id", conta.id);
        return voltar({ conexao: "erro", motivo: "caixa_em_uso" });
      }
      console.error("[email-callback] falha ao gravar grant:", erroGrant);
      return voltar({ conexao: "erro", motivo: "gravacao_falhou" });
    }

    console.log(`[email-callback] conectado empresa=${estado.empresa_id} provedor=${provedor}`);
    return voltar({ conexao: "ok" });
  } catch (err) {
    console.error("[email-callback]", err);
    return voltar({ conexao: "erro", motivo: "inesperado" });
  }
});
