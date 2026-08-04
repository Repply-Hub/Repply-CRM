import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  callbackUri,
  corsHeaders,
  json,
  nylasBase,
  nylasClientId,
} from "../_shared/nylas.ts";

// Conectar a caixa é ação de quem responde pela empresa. Vendedor não liga nem
// desliga o e-mail corporativo do time inteiro.
const PAPEIS_QUE_CONECTAM = ["admin", "empresa", "gestor"];

const PROVEDORES = ["google", "microsoft", "imap"];

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
    // A identidade vem do JWT, nunca do corpo. Aceitar um `userId` do body é o
    // defeito que gmail-auth-url tem hoje: qualquer um inicia a conexão em nome
    // de qualquer usuário.
    if (authError || !user) {
      return json({ error: "Sua sessão expirou. Entre novamente." }, 401);
    }

    const { data: caller } = await supabase
      .from("usuarios")
      .select("id, role, empresa_id, deleted_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!caller) return json({ error: "Usuário não encontrado." }, 404);
    if (caller.deleted_at) return json({ error: "Conta suspensa." }, 403);
    if (!caller.empresa_id) return json({ error: "Conta sem empresa vinculada." }, 403);
    if (!PAPEIS_QUE_CONECTAM.includes(caller.role)) {
      return json(
        { error: "Só o gestor da empresa pode conectar a caixa de e-mail." },
        403,
      );
    }

    const provedor = typeof body?.provedor === "string" ? body.provedor : "google";
    if (!PROVEDORES.includes(provedor)) {
      return json({ error: "Provedor não suportado." }, 400);
    }

    // UMA caixa por empresa. Recusa aqui, antes de mandar a pessoa ao provedor:
    // deixá-la autorizar no Google para só então descobrir que não pode é perda
    // de tempo dela — e ainda cria um grant no Nylas que precisaria ser revogado
    // depois (conta conectada é a unidade de cobrança deles).
    //
    // O email-callback repete a checagem, porque duas pessoas podem começar o
    // fluxo ao mesmo tempo e este ponto não seguraria a segunda.
    const { data: jaConectada } = await supabase
      .from("email_contas")
      .select("email, status")
      .eq("empresa_id", caller.empresa_id)
      .maybeSingle();

    if (jaConectada) {
      return json(
        {
          error:
            `A empresa já tem a caixa ${jaConectada.email} conectada. ` +
            `Para usar outro endereço, desconecte essa primeiro em E-mails.`,
          code: "empresa_ja_tem_caixa",
          email_conectado: jaConectada.email,
        },
        409,
      );
    }

    // Duas UUID concatenadas: 64 chars, bem abaixo do teto de 256 do Nylas, e
    // aleatoriedade suficiente para não ser adivinhável.
    const state = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");

    const { error: erroEstado } = await supabase
      .from("email_conexao_estados")
      .insert({
        state,
        empresa_id: caller.empresa_id,
        usuario_id: caller.id,
        provedor,
      });

    if (erroEstado) {
      console.error("[email-conectar] falha ao gravar state:", erroEstado);
      return json({ error: "Não foi possível iniciar a conexão." }, 500);
    }

    // Limpeza oportunista dos states vencidos. Sai daqui, e não de um cron, para
    // não criar um job só para apagar uma tabela que raramente passa de dezenas
    // de linhas.
    await supabase
      .from("email_conexao_estados")
      .delete()
      .lt("expira_em", new Date().toISOString());

    const params = new URLSearchParams({
      client_id: nylasClientId(),
      redirect_uri: callbackUri(),
      response_type: "code",
      provider: provedor,
      // offline garante refresh_token do lado do Nylas — é ele quem renova, não
      // nós. Sem isso, a conexão morre quando o access token do provedor vence.
      access_type: "offline",
      state,
    });

    return json({ url: `${nylasBase()}/v3/connect/auth?${params.toString()}` });
  } catch (err) {
    console.error("[email-conectar]", err);
    // appUrl()/nylasClientId() lançam quando o secret falta — a mensagem
    // distingue "faltou configurar" de "deu erro", que são ações diferentes.
    const msg = String(err).includes("ausente")
      ? "Integração de e-mail não configurada. Fale com o suporte."
      : "Não foi possível iniciar a conexão.";
    return json({ error: msg, detail: String(err) }, 500);
  }
});
