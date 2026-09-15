import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chamarNylas, corsHeaders, erroDoNylas, json } from "../_shared/nylas.ts";
import { idDaLixeira } from "../_shared/lixeira.ts";

/**
 * Move uma ou mais mensagens para a LIXEIRA do provedor — como o botão de
 * excluir faz no próprio Gmail: a mensagem some da Entrada, aqui e lá, e passa
 * a existir só na lixeira (recuperável por até 30 dias no Gmail).
 *
 * 🔴 ORDEM INVERTIDA de `email-mover-marcador` (que é o molde deste arquivo):
 * lá o banco grava PRIMEIRO e o provedor é melhor esforço (2xx mesmo com falha
 * parcial). Aqui é o CONTRÁRIO — decisão do dono do produto, 15/09/2026:
 * "se o Gmail falhar, NÃO esconder e avisar. Nunca fingir que apagou." Por
 * isso o espelho em `email_mensagens.pastas` só acontece DEPOIS que o Nylas
 * confirma cada mensagem, uma a uma. Nada aqui grava `excluido=true`: esse
 * campo é do caminho antigo (esconder só localmente) e não é mais tocado por
 * este fluxo — ver `docs/...` / `.superpowers/sdd/email-excluir-brief.md`.
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

    // Mesmo teto e mesma aceitação de singular/plural de `email-mover-marcador`.
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

    // MESMA dupla de leituras de `email-mover-marcador`: o service_role ignora a
    // RLS, então quem autoriza é o `userClient`, que passa por
    // `tenho_acesso_a_mensagem(conta_id, pastas)` — a regra por marcador.
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
      console.error("[email-excluir] falha ao verificar acesso:", erroAutorizacao);
      return json({ error: "Não consegui verificar seu acesso a estas mensagens." }, 503);
    }

    const permitidos = new Set((autorizadas ?? []).map((m: { id: string }) => m.id));
    const alvos = (mensagens ?? []).filter((m) => permitidos.has(m.id));

    if (!alvos.length) return json({ error: "Mensagem não encontrada." }, 404);
    if (alvos.length < unicos.length) {
      console.warn(
        `[email-excluir] ${unicos.length - alvos.length} fora do alcance: user=${user.id}`,
      );
    }

    const contas = [...new Set(alvos.map((m) => m.conta_id).filter(Boolean))] as string[];

    // Uma volta ao banco por conta envolvida: as pastas dela (para achar a
    // lixeira) e o grant (para falar com o provedor). Feito ANTES do laço de
    // mensagens porque várias mensagens costumam ser da mesma conta.
    const [{ data: todasAsPastas, error: erroPastas }, { data: grants, error: erroGrants }] =
      await Promise.all([
        supabase
          .from("email_pastas")
          .select("conta_id, pasta_id, atributos")
          .in("conta_id", contas),
        supabase
          .from("email_conta_grants")
          .select("conta_id, grant_id")
          .in("conta_id", contas),
      ]);
    if (erroPastas) console.error("[email-excluir] falha ao buscar pastas:", erroPastas);
    if (erroGrants) console.error("[email-excluir] falha ao buscar grants:", erroGrants);

    const lixeiraPorConta = new Map<string, string | null>();
    for (const contaId of contas) {
      const pastasDaConta = (todasAsPastas ?? []).filter((p: { conta_id: string }) => p.conta_id === contaId);
      lixeiraPorConta.set(contaId, idDaLixeira(pastasDaConta));
    }

    const grantPorConta = new Map<string, string>();
    for (const g of (grants ?? []) as Array<{ conta_id: string; grant_id: string }>) {
      grantPorConta.set(g.conta_id, g.grant_id);
    }

    let excluidas = 0;
    let falharam = 0;
    let ultimoMotivo = "";
    // Agrupado por id de pasta (que é POR CONTA): uma seleção pode misturar
    // mensagens de contas diferentes, e cada uma tem sua própria lixeira.
    const idsConfirmadosPorLixeira = new Map<string, string[]>();

    // Em série, não em paralelo — mesmo motivo de `email-mover-marcador`: uma
    // seleção grande tomaria 429 do Nylas, que compartilha limite com o envio.
    for (const m of alvos) {
      const trashId = lixeiraPorConta.get(m.conta_id ?? "");
      if (!trashId) {
        falharam++;
        ultimoMotivo = "conta sem lixeira";
        continue;
      }

      const grantId = grantPorConta.get(m.conta_id ?? "");
      if (!grantId || !m.nylas_message_id) {
        falharam++;
        ultimoMotivo = "conta sem conexão ativa com o provedor";
        continue;
      }

      let resp: Awaited<ReturnType<typeof chamarNylas>>;
      try {
        resp = await chamarNylas(
          `/v3/grants/${grantId}/messages/${encodeURIComponent(m.nylas_message_id)}`,
          {
            method: "PUT",
            body: JSON.stringify({ folders: [trashId] }),
            timeoutMs: 15_000,
          },
        );
      } catch (e) {
        falharam++;
        ultimoMotivo = `sem resposta do provedor (${String(e).slice(0, 120)})`;
        console.warn("[email-excluir] rede falhou:", String(e));
        continue;
      }

      if (!resp.ok) {
        falharam++;
        ultimoMotivo = erroDoNylas(resp.body, resp.texto);
        console.warn("[email-excluir] provedor recusou:", resp.status, ultimoMotivo);

        if (resp.status === 401 || resp.status === 403) {
          await supabase
            .from("email_contas")
            .update({ status: "revogada", ultimo_erro: ultimoMotivo.slice(0, 500) })
            .eq("id", m.conta_id);
          break;
        }
        continue;
      }

      // 🔴 SÓ ENTÃO grava local — o provedor manda. Nunca gravar para um id que
      // falhou lá: seria fingir que excluiu.
      excluidas++;
      const grupo = idsConfirmadosPorLixeira.get(trashId) ?? [];
      grupo.push(m.id);
      idsConfirmadosPorLixeira.set(trashId, grupo);
    }

    // Um UPDATE por lixeira (== por conta), não um por mensagem: a seleção
    // grande mais comum é de uma conta só, e isso vira uma chamada ao banco em
    // vez de N. NÃO mexe em `excluido`: esse campo é do caminho antigo
    // (esconder só localmente, sem falar com o provedor) e este fluxo não o usa.
    for (const [trashId, ids] of idsConfirmadosPorLixeira) {
      const { error: erroUpdate } = await supabase
        .from("email_mensagens")
        .update({ pastas: [trashId] })
        .in("id", ids);
      if (erroUpdate) {
        console.error("[email-excluir] falha ao gravar local:", erroUpdate);
        // O provedor já confirmou a exclusão dessas mensagens; não gravar aqui
        // deixa o CRM temporariamente desatualizado (a próxima sincronização
        // resolve, porque o sync lê `pastas` de volta do provedor). Não
        // recontar como falha: para o usuário, do ponto de vista de "excluí ou
        // não", o Gmail já confirmou.
      }
    }

    return json({
      ok: true,
      excluidas,
      falharam,
      ...(falharam ? { detalhe: ultimoMotivo } : {}),
    });
  } catch (err) {
    console.error("[email-excluir]", err);
    return json({ error: "Erro inesperado ao excluir.", detail: String(err) }, 500);
  }
});
