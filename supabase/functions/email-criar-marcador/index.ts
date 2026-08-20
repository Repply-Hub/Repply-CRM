import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chamarNylas, corsHeaders, erroDoNylas, json, type PastaNylas } from "../_shared/nylas.ts";

// Mesma regra de email-conectar/email-desconectar: quem administra a caixa é
// quem pode reorganizá-la. Criar marcador é escrita direta na caixa real
// (Gmail), não só uma preferência do CRM.
const PAPEIS_QUE_ADMINISTRAM = ["admin", "empresa", "gestor"];

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
    if (authError || !user) {
      return json({ error: "Sua sessão expirou. Entre novamente." }, 401);
    }

    const nome = typeof body?.nome === "string" ? body.nome.trim() : "";
    if (!nome) return json({ error: "Dê um nome ao marcador." }, 400);
    // Limite arbitrário, só para não mandar um nome absurdo ao provedor — o
    // Gmail em si tolera bem mais, mas a barra lateral trunca visualmente.
    if (nome.length > 100) return json({ error: "Nome muito longo (máximo 100 caracteres)." }, 400);

    const { data: caller } = await supabase
      .from("usuarios")
      .select("role, empresa_id, deleted_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!caller) return json({ error: "Usuário não encontrado." }, 404);
    if (caller.deleted_at) return json({ error: "Conta suspensa." }, 403);
    if (!caller.empresa_id) return json({ error: "Conta sem empresa vinculada." }, 403);
    if (!PAPEIS_QUE_ADMINISTRAM.includes(caller.role)) {
      return json({ error: "Só o gestor da empresa pode criar marcadores." }, 403);
    }

    // A conta vem do EMPRESA_ID de quem chama, nunca de um id que o cliente
    // mandasse no corpo — é isOneToOne com empresas, então não há ambiguidade,
    // e resolver assim fecha a porta para alguém apontar a conta de outra
    // empresa.
    const { data: conta } = await supabase
      .from("email_contas")
      .select("id, empresa_id")
      .eq("empresa_id", caller.empresa_id)
      .maybeSingle();

    if (!conta) return json({ error: "Nenhuma caixa de e-mail conectada." }, 404);

    const { data: grantRow } = await supabase
      .from("email_conta_grants")
      .select("grant_id")
      .eq("conta_id", conta.id)
      .maybeSingle();

    if (!grantRow?.grant_id) {
      return json({ error: "Caixa sem credencial ativa. Reconecte o e-mail." }, 409);
    }

    let resp: Awaited<ReturnType<typeof chamarNylas<PastaNylas>>>;
    try {
      resp = await chamarNylas<PastaNylas>(`/v3/grants/${grantRow.grant_id}/folders`, {
        method: "POST",
        body: JSON.stringify({ name: nome }),
        timeoutMs: 20_000,
      });
    } catch (e) {
      console.error("[email-criar-marcador] falha de rede:", e);
      return json({ error: "Não foi possível falar com o provedor de e-mail." }, 502);
    }

    if (!resp.ok) {
      const motivo = erroDoNylas(resp.body, resp.texto);
      console.warn("[email-criar-marcador] provedor recusou:", resp.status, motivo);

      if (resp.status === 401 || resp.status === 403) {
        await supabase
          .from("email_contas")
          .update({ status: "revogada", ultimo_erro: motivo.slice(0, 500) })
          .eq("id", conta.id);
        return json({ error: "Credencial expirada. Reconecte o e-mail." }, 409);
      }
      // Nome duplicado, provedor sem suporte a criação de pasta, etc. — o
      // motivo do Nylas já vem em português suficiente na maioria dos casos
      // (ou pelo menos identificável), então repassar é melhor que abafar.
      return json({ error: motivo || "O provedor recusou criar o marcador." }, 502);
    }

    const pasta = resp.body.data;
    if (!pasta?.id) {
      console.error("[email-criar-marcador] provedor não devolveu id da pasta:", resp.texto.slice(0, 300));
      return json({ error: "O provedor criou o marcador, mas não confirmou o id." }, 502);
    }

    // Grava já aqui em vez de esperar a próxima varredura — sem isto o
    // marcador recém-criado ficaria invisível na barra até o próximo
    // email-sync (ou o clique manual de atualizar, que ninguém dá).
    const { error: erroGravar } = await supabase.from("email_pastas").upsert(
      {
        conta_id: conta.id,
        empresa_id: conta.empresa_id,
        pasta_id: pasta.id,
        nome: (pasta.name ?? nome).trim() || pasta.id,
        atributos: (pasta.attributes ?? []).map((a) => a.toLowerCase()),
        total_mensagens: pasta.total_count ?? 0,
        nao_lidas: pasta.unread_count ?? 0,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: "conta_id,pasta_id" },
    );

    if (erroGravar) {
      // O marcador já existe no Gmail; só o espelho local falhou. O próximo
      // sync resolve sozinho, então isto não vira erro para quem chamou.
      console.error("[email-criar-marcador] criado no provedor mas falhou ao espelhar:", erroGravar);
    }

    console.log(`[email-criar-marcador] empresa=${caller.empresa_id} marcador="${nome}" pasta_id=${pasta.id}`);
    return json({ ok: true, pasta: { id: pasta.id, nome: pasta.name ?? nome } });
  } catch (err) {
    console.error("[email-criar-marcador]", err);
    return json({ error: "Erro inesperado ao criar o marcador.", detail: String(err) }, 500);
  }
});
