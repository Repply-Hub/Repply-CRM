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

    // Quem desconecta escolhe o destino do histórico. O padrão é PRESERVAR:
    // apagar correspondência é irreversível, e o caso comum aqui é trocar de
    // endereço, não abandonar o que já foi recebido. Só apaga quem pedir.
    let preservarMensagens = true;
    try {
      const corpo = await req.json();
      if (corpo && typeof corpo.preservar_mensagens === "boolean") {
        preservarMensagens = corpo.preservar_mensagens;
      }
    } catch {
      // Corpo vazio ou inválido: fica no padrão seguro.
    }

    const { data: conta } = await supabase
      .from("email_contas")
      .select("id, email")
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

    // O histórico é resolvido ANTES de apagar a conta, porque é a remoção dela
    // que dispara o comportamento do banco (hoje ON DELETE SET NULL).
    let mensagensAfetadas = 0;

    if (preservarMensagens) {
      // Carimba de qual caixa cada mensagem veio. Depois que a conta some, o
      // endereço não existe em lugar nenhum — e sem ele o histórico preservado
      // vira uma lista de mensagens de origem desconhecida, ainda mais depois
      // de conectar outro endereço.
      const { count, error: erroCarimbo } = await supabase
        .from("email_mensagens")
        .update({ caixa_origem: conta.email }, { count: "exact" })
        .eq("conta_id", conta.id)
        .is("caixa_origem", null);

      if (erroCarimbo) {
        console.error("[email-desconectar] falha ao carimbar a origem:", erroCarimbo);
        return json(
          { error: "Não foi possível preparar o histórico. Nada foi alterado." },
          500,
        );
      }
      mensagensAfetadas = count ?? 0;
    } else {
      // Apagar é explícito desde que o vínculo virou ON DELETE SET NULL: sem
      // isto a conta some e as mensagens ficam. Feito antes de apagar a conta
      // para que uma falha aqui não deixe órfãs que ninguém pediu.
      const { count, error: erroApagar } = await supabase
        .from("email_mensagens")
        .delete({ count: "exact" })
        .eq("conta_id", conta.id);

      if (erroApagar) {
        console.error("[email-desconectar] falha ao apagar as mensagens:", erroApagar);
        return json(
          { error: "Não foi possível apagar as mensagens. Nada foi alterado." },
          500,
        );
      }
      mensagensAfetadas = count ?? 0;
    }

    // O CASCADE em email_conta_grants leva a credencial junto. As mensagens
    // seguem a regra resolvida acima.
    const { error: erroDelete } = await supabase
      .from("email_contas")
      .delete()
      .eq("id", conta.id);

    if (erroDelete) {
      console.error("[email-desconectar] revogado no Nylas mas não apagado aqui:", erroDelete);
      return json({ error: "Acesso revogado, mas o registro não foi limpo. Recarregue a página." }, 500);
    }

    console.log(
      `[email-desconectar] empresa=${caller.empresa_id} caixa=${conta.email} ` +
        `historico=${preservarMensagens ? "preservado" : "apagado"} mensagens=${mensagensAfetadas}`,
    );
    return json({ ok: true, preservou: preservarMensagens, mensagens: mensagensAfetadas });
  } catch (err) {
    console.error("[email-desconectar]", err);
    return json({ error: "Erro inesperado ao desconectar.", detail: String(err) }, 500);
  }
});
