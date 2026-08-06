import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chamarNylas, corsHeaders, erroDoNylas, json } from "../_shared/nylas.ts";

/**
 * Espelha o "lido" do CRM de volta para a caixa de origem.
 *
 * O CRM sempre marcou lido só aqui, e a varredura sempre trouxe o `unread` do
 * provedor por cima. Isso deixava o estado andando num sentido só: alguém lia
 * uma mensagem no CRM, o Gmail continuava achando que era nova, e na próxima
 * sincronização ela voltava a aparecer em negrito — o trabalho de ler
 * simplesmente não durava.
 *
 * Agora anda nos dois. Com uma caixa COMPARTILHADA isso tem uma consequência
 * que vale dizer em voz alta: quando um vendedor abre a mensagem aqui, ela
 * deixa de ser nova para todo mundo, inclusive no celular de quem também
 * acompanha a caixa. É o comportamento de uma caixa de atendimento — o inverso
 * (cada um com o seu "lido") exigiria uma tabela de leitura por pessoa e faria
 * o número do CRM nunca bater com o do provedor.
 *
 * A gravação local é o que importa e acontece primeiro. A ida ao provedor é o
 * melhor-esforço: se o Nylas estiver fora do ar, a mensagem continua lida aqui.
 */
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

    const mensagemId = typeof body?.mensagem_id === "string" ? body.mensagem_id : null;
    if (!mensagemId) return json({ error: "mensagem_id obrigatório." }, 400);
    // `lido` ausente = marcar como lida, que é o caminho de 99% dos cliques.
    const lido = body?.lido === undefined ? true : !!body.lido;

    const { data: caller } = await supabase
      .from("usuarios")
      .select("empresa_id, deleted_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!caller) return json({ error: "Usuário não encontrado." }, 404);
    if (caller.deleted_at) return json({ error: "Conta suspensa." }, 403);
    if (!caller.empresa_id) return json({ error: "Conta sem empresa vinculada." }, 403);

    // A MESMA dupla de leituras do email-mensagem: o service_role ignora a RLS,
    // então quem autoriza é o `userClient`, que passa por
    // `tenho_acesso_a_mensagem(conta_id, pastas)` — a regra por marcador.
    // Sem ela, quem tem um marcador só poderia mexer no "lido" de qualquer
    // mensagem da empresa cujo id conhecesse.
    const [{ data: mensagem }, { data: autorizada, error: erroAutorizacao }] = await Promise.all([
      supabase
        .from("email_mensagens")
        .select("id, conta_id, lido, nylas_message_id")
        .eq("id", mensagemId)
        .eq("empresa_id", caller.empresa_id)
        .maybeSingle(),
      userClient
        .from("email_mensagens")
        .select("id")
        .eq("id", mensagemId)
        .maybeSingle(),
    ]);

    if (erroAutorizacao) {
      console.error("[email-marcar-lido] falha ao verificar acesso:", erroAutorizacao);
      return json({ error: "Não consegui verificar seu acesso a esta mensagem." }, 503);
    }

    if (!mensagem || !autorizada) {
      if (mensagem && !autorizada) {
        console.warn(
          `[email-marcar-lido] acesso negado: user=${user.id} mensagem=${mensagemId}`,
        );
      }
      return json({ error: "Mensagem não encontrada." }, 404);
    }

    // Já está no estado pedido: nada a gravar aqui nem a pedir ao provedor.
    // Vale para o clique repetido e para a mensagem que o webhook já atualizou.
    if (mensagem.lido === lido) {
      return json({ ok: true, lido, provedor: "sem_mudanca" });
    }

    const { error: erroUpdate } = await supabase
      .from("email_mensagens")
      .update({ lido })
      .eq("id", mensagem.id);

    if (erroUpdate) {
      console.error("[email-marcar-lido] falha ao gravar:", erroUpdate);
      return json({ error: "Não consegui salvar a leitura." }, 500);
    }

    const { data: grantRow } = await supabase
      .from("email_conta_grants")
      .select("grant_id")
      .eq("conta_id", mensagem.conta_id)
      .maybeSingle();

    // Sem credencial o CRM segue funcionando: o "lido" já está gravado aqui.
    if (!grantRow?.grant_id) {
      return json({ ok: true, lido, provedor: "sem_grant" });
    }

    // O Nylas fala em `unread`, não em `lido` — é o inverso.
    const resp = await chamarNylas(
      `/v3/grants/${grantRow.grant_id}/messages/${encodeURIComponent(mensagem.nylas_message_id)}`,
      {
        method: "PUT",
        body: JSON.stringify({ unread: !lido }),
        // Curto de propósito: é uma escrita acessória, e o usuário está
        // esperando a mensagem abrir. Estourar aqui não desfaz nada.
        timeoutMs: 15_000,
      },
    );

    if (!resp.ok) {
      const motivo = erroDoNylas(resp.body, resp.texto);
      console.warn("[email-marcar-lido] provedor recusou:", resp.status, motivo);

      // 401/403 = credencial morta. Marcar faz a tela pedir reconexão, em vez
      // de repetir um erro genérico a cada mensagem aberta.
      if (resp.status === 401 || resp.status === 403) {
        await supabase
          .from("email_contas")
          .update({ status: "revogada", ultimo_erro: motivo.slice(0, 500) })
          .eq("id", mensagem.conta_id);
      }

      // 2xx mesmo assim: o CRM gravou, que é o que a pessoa vê. Devolver erro
      // faria a tela desfazer um selo que está certo.
      return json({ ok: true, lido, provedor: "falhou", detalhe: motivo });
    }

    return json({ ok: true, lido, provedor: "ok" });
  } catch (err) {
    console.error("[email-marcar-lido]", err);
    return json({ error: "Erro inesperado.", detail: String(err) }, 500);
  }
});
