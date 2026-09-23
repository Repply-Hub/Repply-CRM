import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Conectar / conferir / desconectar um numero de WhatsApp, SEM a chave passar pelo navegador.
 *
 * 🔴 POR QUE ESTA FUNCAO EXISTE (item 74 da divida tecnica, passo 2).
 * As tres chamadas a operadora saiam do NAVEGADOR, com a `api_key` no cabecalho `token`. Era so
 * por isso que a chave precisava chegar ao navegador — de 21 pessoas, medido em 23/09/2026. E
 * essa credencial vale FORA do produto: trancar o CRM nao a invalida.
 *
 * Aqui a chave e lida com a chave de servico e nunca sai daqui. A resposta da operadora volta
 * CRUA para o navegador, que a interpreta com `src/lib/whatsapp-instancia.ts` — assim esta
 * funcao fica minima e a adivinhacao de formato nao vira uma terceira copia.
 *
 * 🔴 QUEM PODE: gestor, dono da conta e admin. Decisao do dono do produto em 23/09/2026 —
 * conectar um numero e ato de gestor; e ele quem gerencia quem enxerga cada numero. Quando a
 * matriz de permissoes for implementada, a permissao especifica entra AQUI, ao lado do cargo
 * (o espelho no navegador e `podeConectarNumero`, que ja aceita o segundo argumento).
 *
 * A lista de papeis vive duplicada em `src/lib/whatsapp-instancia.ts`. ESTA aqui e a que
 * protege; a de la so evita oferecer um botao que este servidor vai negar.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PAPEIS_QUE_CONECTAM = ["admin", "empresa", "gestor"];

/** O que cada acao faz na operadora. Lista fechada: acao fora dela e recusada. */
const ACOES: Record<string, { caminho: string; metodo: "GET" | "POST" }> = {
  conectar: { caminho: "/instance/connect", metodo: "POST" },
  status: { caminho: "/instance/status", metodo: "GET" },
  desconectar: { caminho: "/instance/disconnect", metodo: "POST" },
};

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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Sessão não identificada. Entre novamente no sistema." }, 401);
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return json({ error: "Sua sessão expirou. Atualize a página e entre de novo." }, 401);
    }

    // `deleted_at is null` de proposito: quem foi removido da empresa nao conecta numero
    // nenhum. Funcao de servidor roda com chave de servico e passa por cima da regra do banco,
    // entao a checagem tem de ser explicita aqui (item 38).
    const { data: quemChamou, error: erroDeUsuario } = await supabase
      .from("usuarios")
      .select("id, role, empresa_id, deleted_at")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (erroDeUsuario || !quemChamou) {
      return json({ error: "Seu usuário não está ativo neste sistema. Fale com o gestor da empresa." }, 403);
    }

    if (!PAPEIS_QUE_CONECTAM.includes(quemChamou.role)) {
      return json({
        error: "Só um gestor pode conectar ou desconectar um número de WhatsApp. Fale com o gestor da sua organização.",
      }, 403);
    }

    let body: Record<string, any> = {};
    try { body = await req.json(); } catch { /* body vazio */ }

    const { acao, instancia_id } = body;

    const rota = ACOES[acao];
    if (!rota) {
      return json({ error: "Ação desconhecida." }, 400);
    }
    if (!instancia_id) {
      return json({ error: "Instância não informada." }, 400);
    }

    const { data: instancia, error: erroDaInstancia } = await supabase
      .from("configuracoes_wapi")
      .select("id, empresa_id, instance_name, instance_url, api_key")
      .eq("id", instancia_id)
      .maybeSingle();

    if (erroDaInstancia || !instancia) {
      return json({ error: "Número de WhatsApp não encontrado." }, 404);
    }

    // Admin da Repply alcanca qualquer empresa; gestor e dono, so a propria.
    if (quemChamou.role !== "admin" && instancia.empresa_id !== quemChamou.empresa_id) {
      return json({ error: "Este número não é da sua empresa." }, 403);
    }

    if (!instancia.instance_url || !instancia.api_key) {
      return json({ error: "Este número ainda não foi provisionado." }, 409);
    }

    const base = String(instancia.instance_url).replace(/\/$/, "");
    const cabecalhos: Record<string, string> = { token: String(instancia.api_key) };
    if (rota.metodo === "POST") cabecalhos["Content-Type"] = "application/json";

    let resposta: Response;
    try {
      resposta = await fetch(`${base}${rota.caminho}`, {
        method: rota.metodo,
        headers: cabecalhos,
        ...(rota.metodo === "POST" ? { body: JSON.stringify({}) } : {}),
      });
    } catch (e) {
      console.error("[whatsapp-instancia] erro de rede na operadora", { acao, erro: String(e) });
      return json({ error: "Não foi possível falar com o servidor de WhatsApp. Tente de novo em instantes." }, 502);
    }

    const texto = await resposta.text().catch(() => "");
    if (!resposta.ok) {
      // 🔴 O corpo da operadora vai para o REGISTRO, nunca para a tela: ele pode ecoar o
      // cabecalho `token` — que e justamente a credencial que esta funcao existe para esconder.
      console.error("[whatsapp-instancia] operadora recusou", {
        acao,
        instancia: instancia.instance_name,
        status: resposta.status,
        corpo: texto,
      });
      return json({ error: `O servidor de WhatsApp recusou a operação (${resposta.status}).` }, 502);
    }

    let payload: unknown = {};
    try { payload = JSON.parse(texto); } catch { /* resposta sem JSON; segue objeto vazio */ }

    return json({ ok: true, payload });
  } catch (err) {
    console.error("[whatsapp-instancia] erro inesperado", err);
    return json({ error: "Erro inesperado. Tente de novo em instantes." }, 500);
  }
});
