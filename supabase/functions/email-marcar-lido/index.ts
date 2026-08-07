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

    /**
     * Aceita uma mensagem ou várias.
     *
     * O plural existe porque a tela tem DOIS caminhos para o mesmo estado: abrir
     * uma mensagem e o botão "Lido" da seleção múltipla. Enquanto só o singular
     * existia, o botão em massa continuava gravando direto na tabela e não
     * avisava o provedor — então a próxima varredura trazia o `unread` do Gmail
     * por cima e as mensagens voltavam a aparecer como novas. Meia
     * funcionalidade é pior do que nenhuma: o usuário marca, some, e volta.
     *
     * O teto de 200 é folgado para a seleção da tela (uma página tem 15) e
     * impede que uma chamada forjada peça milhares de idas ao provedor.
     */
    const ids: string[] = Array.isArray(body?.mensagem_ids)
      ? (body.mensagem_ids as unknown[]).filter((i): i is string => typeof i === "string" && !!i)
      : typeof body?.mensagem_id === "string" && body.mensagem_id
      ? [body.mensagem_id]
      : [];

    const unicos = [...new Set(ids)];
    if (!unicos.length) return json({ error: "mensagem_id ou mensagem_ids obrigatório." }, 400);
    if (unicos.length > 200) return json({ error: "No máximo 200 mensagens por vez." }, 400);

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
    const [{ data: mensagens }, { data: autorizadas, error: erroAutorizacao }] = await Promise.all([
      supabase
        .from("email_mensagens")
        .select("id, conta_id, lido, nylas_message_id")
        .in("id", unicos)
        .eq("empresa_id", caller.empresa_id),
      userClient
        .from("email_mensagens")
        .select("id")
        .in("id", unicos),
    ]);

    if (erroAutorizacao) {
      console.error("[email-marcar-lido] falha ao verificar acesso:", erroAutorizacao);
      return json({ error: "Não consegui verificar seu acesso a estas mensagens." }, 503);
    }

    // O recorte final é a INTERSEÇÃO das duas leituras. Uma seleção com uma
    // mensagem fora do alcance não vira erro: as permitidas seguem, a outra é
    // ignorada. Falhar tudo faria um clique legítimo em 15 mensagens parar por
    // causa de uma — e dizer QUAL faria a resposta virar um oráculo de
    // existência para quem não pode ler.
    const permitidos = new Set((autorizadas ?? []).map((m: { id: string }) => m.id));
    const alvos = (mensagens ?? []).filter((m) => permitidos.has(m.id));

    if (!alvos.length) return json({ error: "Mensagem não encontrada." }, 404);
    if (alvos.length < unicos.length) {
      console.warn(
        `[email-marcar-lido] ${unicos.length - alvos.length} fora do alcance: user=${user.id}`,
      );
    }

    // Já no estado pedido: nada a gravar nem a pedir ao provedor. Vale para o
    // clique repetido e para a mensagem que o webhook já atualizou.
    const mudam = alvos.filter((m) => m.lido !== lido);
    if (!mudam.length) {
      return json({ ok: true, lido, alteradas: 0, provedor: "sem_mudanca" });
    }

    const { error: erroUpdate } = await supabase
      .from("email_mensagens")
      .update({ lido })
      .in("id", mudam.map((m) => m.id));

    if (erroUpdate) {
      console.error("[email-marcar-lido] falha ao gravar:", erroUpdate);
      return json({ error: "Não consegui salvar a leitura." }, 500);
    }

    // As mensagens de uma seleção podem, em tese, vir de contas diferentes.
    // Buscar os grants de uma vez evita uma consulta por mensagem.
    const contas = [...new Set(mudam.map((m) => m.conta_id))];
    const { data: grants } = await supabase
      .from("email_conta_grants")
      .select("conta_id, grant_id")
      .in("conta_id", contas);

    const grantPorConta = new Map<string, string>(
      (grants ?? []).map((g: { conta_id: string; grant_id: string }) => [g.conta_id, g.grant_id]),
    );

    let enviadas = 0;
    let falhas = 0;
    let ultimoMotivo = "";

    // Em série, e não em Promise.all: uma seleção de 200 dispararia 200
    // requisições simultâneas ao Nylas e tomaria 429 — que atinge a MESMA chave
    // usada pelo envio de e-mail, não só por esta rota.
    for (const m of mudam) {
      const grantId = grantPorConta.get(m.conta_id);
      // Sem credencial o CRM segue funcionando: o "lido" já está gravado aqui.
      if (!grantId || !m.nylas_message_id) continue;

      // O Nylas fala em `unread`, não em `lido` — é o inverso.
      const resp = await chamarNylas(
        `/v3/grants/${grantId}/messages/${encodeURIComponent(m.nylas_message_id)}`,
        {
          method: "PUT",
          body: JSON.stringify({ unread: !lido }),
          // Curto de propósito: é uma escrita acessória, e o usuário está
          // esperando a mensagem abrir. Estourar aqui não desfaz nada.
          timeoutMs: 15_000,
        },
      );

      if (resp.ok) {
        enviadas++;
        continue;
      }

      falhas++;
      ultimoMotivo = erroDoNylas(resp.body, resp.texto);
      console.warn("[email-marcar-lido] provedor recusou:", resp.status, ultimoMotivo);

      // 401/403 = credencial morta. Marcar faz a tela pedir reconexão em vez de
      // repetir um erro genérico a cada mensagem aberta. E interrompe o laço:
      // as restantes tomariam o mesmo 401.
      if (resp.status === 401 || resp.status === 403) {
        await supabase
          .from("email_contas")
          .update({ status: "revogada", ultimo_erro: ultimoMotivo.slice(0, 500) })
          .eq("id", m.conta_id);
        break;
      }
    }

    // 2xx mesmo com falha no provedor: o CRM gravou, que é o que a pessoa vê.
    // Devolver erro faria a tela desfazer um selo que está certo.
    return json({
      ok: true,
      lido,
      alteradas: mudam.length,
      provedor: falhas ? "parcial" : "ok",
      enviadas,
      falhas,
      ...(falhas ? { detalhe: ultimoMotivo } : {}),
    });
  } catch (err) {
    console.error("[email-marcar-lido]", err);
    return json({ error: "Erro inesperado.", detail: String(err) }, 500);
  }
});
