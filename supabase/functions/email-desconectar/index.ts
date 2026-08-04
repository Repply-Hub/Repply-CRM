import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chamarNylas, corsHeaders, json } from "../_shared/nylas.ts";

// Mesma regra de email-conectar: quem liga é quem desliga.
const PAPEIS_QUE_CONECTAM = ["admin", "empresa", "gestor"];

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

    const { data: { user }, error: authError } = await userClient.auth.getUser();
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
      return json({ error: "Só o gestor da empresa pode desconectar a caixa." }, 403);
    }

    const { data: conta } = await supabase
      .from("email_contas")
      .select("id")
      .eq("empresa_id", caller.empresa_id)
      .maybeSingle();

    // Idempotente: desconectar o que já está desconectado é sucesso, não erro.
    if (!conta) return json({ ok: true, ja_desconectada: true });

    const { data: grantRow } = await supabase
      .from("email_conta_grants")
      .select("grant_id")
      .eq("conta_id", conta.id)
      .maybeSingle();

    // Revoga no Nylas ANTES de apagar aqui. Apagar primeiro e falhar no Nylas
    // deixaria o grant órfão lá — e conta conectada é a unidade de cobrança
    // deles (US$ 2/mês acima das 5 gratuitas), então o órfão sai caro e ninguém
    // saberia que existe.
    if (grantRow?.grant_id) {
      try {
        const resp = await chamarNylas(`/v3/grants/${grantRow.grant_id}`, {
          method: "DELETE",
          timeoutMs: 20_000,
        });
        // 404 significa que já não existe lá — o objetivo está cumprido.
        if (!resp.ok && resp.status !== 404) {
          console.error("[email-desconectar] Nylas recusou revogar:", resp.status, resp.texto.slice(0, 300));
          return json(
            { error: "Não foi possível revogar o acesso no provedor. Tente de novo em instantes." },
            502,
          );
        }
      } catch (e) {
        console.error("[email-desconectar] falha de rede ao revogar:", e);
        return json({ error: "Não foi possível falar com o provedor de e-mail." }, 502);
      }
    }

    // O CASCADE em email_conta_grants e email_mensagens leva o resto junto.
    const { error: erroDelete } = await supabase
      .from("email_contas")
      .delete()
      .eq("id", conta.id);

    if (erroDelete) {
      console.error("[email-desconectar] revogado no Nylas mas não apagado aqui:", erroDelete);
      return json({ error: "Acesso revogado, mas o registro não foi limpo. Recarregue a página." }, 500);
    }

    console.log(`[email-desconectar] empresa=${caller.empresa_id}`);
    return json({ ok: true });
  } catch (err) {
    console.error("[email-desconectar]", err);
    return json({ error: "Erro inesperado ao desconectar.", detail: String(err) }, 500);
  }
});
