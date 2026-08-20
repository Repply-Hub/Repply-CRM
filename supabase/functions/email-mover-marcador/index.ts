import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chamarNylas, corsHeaders, erroDoNylas, json } from "../_shared/nylas.ts";

/**
 * Move uma ou mais mensagens para um marcador — como "Mover para" no próprio
 * Gmail: a mensagem SAI de onde estava (inclusive da Entrada, lá no
 * provedor) e passa a existir só no marcador de destino. Não é "aplicar mais
 * um rótulo": no Gmail o marcador normalmente é aditivo (ver comentários em
 * `_shared/nylas.ts`), mas "mover" é precisamente o caso em que a pessoa quer
 * o oposto — arquivar num cliente só, não empilhar rótulos.
 *
 * Mesmo desenho de `email-marcar-lido`: grava aqui primeiro (o que a tela
 * mostra), espelha no provedor em melhor esforço, em série para não estourar
 * limite de taxa numa seleção grande.
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

    const pastaId = typeof body?.pasta_id === "string" ? body.pasta_id.trim() : "";
    if (!pastaId) return json({ error: "pasta_id obrigatório." }, 400);

    // Mesmo teto e mesma aceitação de singular/plural de `email-marcar-lido`.
    const ids: string[] = Array.isArray(body?.mensagem_ids)
      ? (body.mensagem_ids as unknown[]).filter((i): i is string => typeof i === "string" && !!i)
      : typeof body?.mensagem_id === "string" && body.mensagem_id
      ? [body.mensagem_id]
      : [];
    const unicos = [...new Set(ids)];
    if (!unicos.length) return json({ error: "mensagem_id ou mensagem_ids obrigatório." }, 400);
    if (unicos.length > 200) return json({ error: "No máximo 200 mensagens por vez." }, 400);

    const { data: caller } = await supabase
      .from("usuarios")
      .select("empresa_id, deleted_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!caller) return json({ error: "Usuário não encontrado." }, 404);
    if (caller.deleted_at) return json({ error: "Conta suspensa." }, 403);
    if (!caller.empresa_id) return json({ error: "Conta sem empresa vinculada." }, 403);

    // O marcador de destino precisa ser um marcador REAL desta empresa — sem
    // isto, alguém poderia mandar mover para qualquer string e a chamada ao
    // Nylas falharia de forma confusa (ou pior, um id que por acidente exista
    // na caixa errada, se o Nylas algum dia aceitar id cru sem checar grant).
    const { data: pastaAlvo } = await supabase
      .from("email_pastas")
      .select("pasta_id, nome")
      .eq("empresa_id", caller.empresa_id)
      .eq("pasta_id", pastaId)
      .maybeSingle();
    if (!pastaAlvo) return json({ error: "Marcador de destino não encontrado." }, 404);

    // MESMA dupla de leituras de `email-marcar-lido`: o service_role ignora a
    // RLS, então quem autoriza é o `userClient`, que passa por
    // `tenho_acesso_a_mensagem(conta_id, pastas)` — a regra por marcador. Sem
    // ela, quem tem acesso só a um marcador poderia mover qualquer mensagem
    // da empresa cujo id conhecesse.
    const [{ data: mensagens }, { data: autorizadas, error: erroAutorizacao }] = await Promise.all([
      supabase
        .from("email_mensagens")
        .select("id, conta_id, nylas_message_id")
        .in("id", unicos)
        .eq("empresa_id", caller.empresa_id),
      userClient
        .from("email_mensagens")
        .select("id")
        .in("id", unicos),
    ]);

    if (erroAutorizacao) {
      console.error("[email-mover-marcador] falha ao verificar acesso:", erroAutorizacao);
      return json({ error: "Não consegui verificar seu acesso a estas mensagens." }, 503);
    }

    const permitidos = new Set((autorizadas ?? []).map((m: { id: string }) => m.id));
    const alvos = (mensagens ?? []).filter((m) => permitidos.has(m.id));

    if (!alvos.length) return json({ error: "Mensagem não encontrada." }, 404);
    if (alvos.length < unicos.length) {
      console.warn(
        `[email-mover-marcador] ${unicos.length - alvos.length} fora do alcance: user=${user.id}`,
      );
    }

    const { error: erroUpdate } = await supabase
      .from("email_mensagens")
      .update({ pastas: [pastaId] })
      .in("id", alvos.map((m) => m.id));

    if (erroUpdate) {
      console.error("[email-mover-marcador] falha ao gravar:", erroUpdate);
      return json({ error: "Não consegui salvar o marcador." }, 500);
    }

    const contas = [...new Set(alvos.map((m) => m.conta_id).filter(Boolean))] as string[];
    const grantPorConta = new Map<string, string>();
    if (contas.length) {
      const { data: grants, error: erroGrants } = await supabase
        .from("email_conta_grants")
        .select("conta_id, grant_id")
        .in("conta_id", contas);
      if (erroGrants) {
        console.error("[email-mover-marcador] falha ao buscar grants:", erroGrants);
      }
      for (const g of (grants ?? []) as Array<{ conta_id: string; grant_id: string }>) {
        grantPorConta.set(g.conta_id, g.grant_id);
      }
    }

    let movidas = 0;
    let falhas = 0;
    let ultimoMotivo = "";

    // Em série, não em paralelo — mesmo motivo de `email-marcar-lido`: uma
    // seleção grande tomaria 429 do Nylas, que compartilha limite com o envio.
    for (const m of alvos) {
      const grantId = grantPorConta.get(m.conta_id);
      if (!grantId || !m.nylas_message_id) continue;

      let resp: Awaited<ReturnType<typeof chamarNylas>>;
      try {
        resp = await chamarNylas(
          `/v3/grants/${grantId}/messages/${encodeURIComponent(m.nylas_message_id)}`,
          {
            method: "PUT",
            body: JSON.stringify({ folders: [pastaId] }),
            timeoutMs: 15_000,
          },
        );
      } catch (e) {
        falhas++;
        ultimoMotivo = `sem resposta do provedor (${String(e).slice(0, 120)})`;
        console.warn("[email-mover-marcador] rede falhou no espelho:", String(e));
        continue;
      }

      if (resp.ok) {
        movidas++;
        continue;
      }

      falhas++;
      ultimoMotivo = erroDoNylas(resp.body, resp.texto);
      console.warn("[email-mover-marcador] provedor recusou:", resp.status, ultimoMotivo);

      if (resp.status === 401 || resp.status === 403) {
        await supabase
          .from("email_contas")
          .update({ status: "revogada", ultimo_erro: ultimoMotivo.slice(0, 500) })
          .eq("id", m.conta_id);
        break;
      }
    }

    // 2xx mesmo com falha parcial no provedor: o CRM já gravou, que é o que a
    // pessoa vê na hora. A próxima sincronização acerta o resto.
    return json({
      ok: true,
      pasta: { id: pastaAlvo.pasta_id, nome: pastaAlvo.nome },
      alteradas: alvos.length,
      provedor: falhas ? "parcial" : "ok",
      movidas,
      falhas,
      ...(falhas ? { detalhe: ultimoMotivo } : {}),
    });
  } catch (err) {
    console.error("[email-mover-marcador]", err);
    return json({ error: "Erro inesperado ao mover.", detail: String(err) }, 500);
  }
});
