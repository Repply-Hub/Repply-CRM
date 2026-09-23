import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Tirar e devolver o acesso de alguem da equipe — item 38 da divida tecnica, parte 2.
 *
 * 🔴 POR QUE. Ate 23/09/2026 "Remover" so gravava `deleted_at` na linha de `usuarios`. O login
 * continuava vivo, e nao havia NENHUMA chamada de revogacao em todo o repositorio. Medido
 * naquele dia: uma pessoa removida em 11/09 ainda tinha login ativo, sessao aberta e token de
 * renovacao valido.
 *
 * As migrations 20260923130000 e 20260923130100 fecharam o BANCO. Mas 16 funcoes de servidor
 * consultam `usuarios` com chave de servico e ignoram toda regra do banco — enquanto o login
 * viver, quem saiu ainda manda WhatsApp em nome da empresa por esse caminho.
 *
 * 🔴 UMA OPERACAO SO — a licao do item 39. Carimbar a data na tela e revogar o login aqui
 * seriam DOIS gestos, e entre dois gestos ha sempre uma janela: um que falhe deixa a pessoa
 * "removida na tela e com acesso" ou "sem acesso e ativa na tela". Aqui os dois andam juntos, e
 * a ordem importa: REVOGA PRIMEIRO, carimba depois. Se o carimbo falhar, sobra alguem sem
 * acesso e ativo na tela — visivel e facil de repetir. Se fosse ao contrario, sobraria alguem
 * "removido" com acesso, que e exatamente o bug que esta funcao existe para fechar.
 *
 * 🔴 REVERSIVEL DE PROPOSITO. O banimento tem prazo e "Restaurar" o desfaz. NUNCA apagar a
 * conta (`deleteUser`): isso levaria junto o rastro de quem fez o que no historico.
 *
 * ⚠️ O QUE ISTO NAO FECHA: o token de acesso que a pessoa ja tem na mao continua valido ate
 * expirar (no maximo 1 hora). O banimento barra login novo e renovacao, nao o token em curso.
 * Na pratica a janela e pequena e o banco ja barra desde as migrations de 23/09 — sobra so o
 * caminho das funcoes de servidor. Fechar a janela por completo exige apagar a sessao no
 * esquema `auth`, que o PostgREST nao expoe; ficaria para uma funcao de banco propria.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PAPEIS_DE_CHEFIA = ["admin", "empresa", "gestor"];
/** 100 anos. O Supabase pede uma duracao; "para sempre" se escreve assim. */
const BANIMENTO = "876000h";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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

    // ── Quem esta chamando? ───────────────────────────────────────────────────────────
    // 🔴 A autorizacao e conferida AQUI. Esta funcao roda com chave de servico, que ignora
    // toda regra do banco — entao ela e a unica barreira.
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) return json({ error: "Sem autorização." }, 401);

    const { data: auth } = await supabase.auth.getUser(token);
    if (!auth?.user) return json({ error: "Sua sessão expirou. Entre de novo." }, 401);

    const { data: quemChama } = await supabase
      .from("usuarios")
      .select("id, role, empresa_id, deleted_at")
      .eq("user_id", auth.user.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!quemChama) {
      return json({ error: "Seu usuário não está ativo neste sistema." }, 403);
    }
    if (!PAPEIS_DE_CHEFIA.includes(quemChama.role)) {
      return json({ error: "Só um gestor pode remover ou restaurar o acesso de alguém." }, 403);
    }

    const { acao, usuario_id: usuarioId } = await req.json().catch(() => ({}));
    if (acao !== "revogar" && acao !== "devolver") {
      return json({ error: "Ação desconhecida." }, 400);
    }
    if (!usuarioId) return json({ error: "Usuário não informado." }, 400);

    // 🔴 Ninguem tira o proprio acesso. Sem isto, um gestor desatento se tranca para fora e so
    // o painel do Supabase o traz de volta.
    if (usuarioId === quemChama.id) {
      return json({ error: "Você não pode remover o seu próprio acesso." }, 400);
    }

    const { data: alvo } = await supabase
      .from("usuarios")
      .select("id, user_id, empresa_id, role")
      .eq("id", usuarioId)
      .maybeSingle();

    if (!alvo) return json({ error: "Usuário não encontrado." }, 404);

    // Admin da Repply alcanca qualquer empresa; gestor e dono, so a propria.
    if (quemChama.role !== "admin" && alvo.empresa_id !== quemChama.empresa_id) {
      return json({ error: "Esta pessoa não é da sua empresa." }, 403);
    }

    const revogando = acao === "revogar";

    // ── 1. O LOGIN primeiro ───────────────────────────────────────────────────────────
    if (alvo.user_id) {
      const { error: erroDoLogin } = await supabase.auth.admin.updateUserById(alvo.user_id, {
        ban_duration: revogando ? BANIMENTO : "none",
      });
      if (erroDoLogin) {
        console.error("[usuario-acesso] falha ao mexer no login", { acao, erro: erroDoLogin.message });
        return json(
          { error: "Não foi possível alterar o acesso desta pessoa. Nada foi mudado." },
          502,
        );
      }
    }

    // ── 2. A LINHA depois ─────────────────────────────────────────────────────────────
    const { error: erroDaLinha, count } = await supabase
      .from("usuarios")
      .update(
        { deleted_at: revogando ? new Date().toISOString() : null },
        { count: "exact" },
      )
      .eq("id", usuarioId);

    // 🔴 Zero linhas NAO e sucesso (CLAUDE.md §4.6): a recusa da regra de acesso volta sem
    // erro. Aqui rodamos com chave de servico, entao zero significa que a linha sumiu no meio
    // — e o login ja mudou. Avisar e melhor que comemorar.
    if (erroDaLinha || count === 0) {
      console.error("[usuario-acesso] login alterado mas a linha nao", { acao, usuarioId, count });
      return json({
        error: revogando
          ? "O acesso foi revogado, mas a pessoa continua aparecendo na lista. Recarregue e tente de novo."
          : "O acesso foi devolvido, mas a pessoa continua marcada como removida. Recarregue e tente de novo.",
      }, 500);
    }

    return json({ ok: true, acao, usuario_id: usuarioId });
  } catch (err) {
    console.error("[usuario-acesso] erro inesperado", err);
    return json({ error: "Erro inesperado. Tente de novo em instantes." }, 500);
  }
});
