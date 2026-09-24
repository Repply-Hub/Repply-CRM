import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  conferirReconfiguracao,
  corpoDeReconfiguracao,
  ehNossoEndereco,
  enderecoComSegredo,
  escolherWebhookParaReconfigurar,
  enderecoDeInstanciaNova,
  gerarSegredoDeWebhook,
  semSegredoNoTexto,
} from "../_shared/endereco-do-webhook.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function buildInstanceName(empresaId: string): string {
  const sanitize = (s: string) => s.replace(/[^a-z0-9]/gi, "").toLowerCase();
  const empresaPart = sanitize(empresaId).slice(0, 8);
  const random = Math.random().toString(36).slice(2, 8);
  return `${empresaPart}_${random}`;
}

async function deleteOrphan(baseUrl: string, token: string): Promise<void> {
  await fetch(`${baseUrl}/instance`, {
    method: "DELETE",
    headers: { token },
  }).catch(() => {});
}

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
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Sessão não identificada. Entre novamente no sistema." }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: "Sua sessão expirou. Atualize a página e entre de novo." }, 401);

    const { data: caller } = await supabase
      .from("usuarios")
      .select("id, role, empresa_id")
      .eq("user_id", user.id)
      .single();

    if (!caller) return json({ error: "Seu usuário não foi encontrado no sistema. Fale com o gestor da empresa." }, 404);

    const allowedRoles = ["admin", "empresa", "gestor"];
    if (!allowedRoles.includes(caller.role)) return json({ error: "Você não tem permissão para esta ação." }, 403);

    let body: Record<string, any> = {};
    try { body = await req.json(); } catch { /* body vazio */ }

    const { action, instance_id, target_usuario_id } = body;

    // target_usuario_ids: lista opcional para vincular a MÚLTIPLOS usuários na criação
    // (ex: "vincular a todos os usuários da empresa"). target_usuario_id (singular)
    // continua suportado por compatibilidade e é tratado como lista de 1 item.
    const target_usuario_ids: string[] = Array.isArray(body.target_usuario_ids)
      ? body.target_usuario_ids
      : (target_usuario_id ? [target_usuario_id] : []);

    // ── CREATE: cria instância na uazapi, vincula opcionalmente a um ou mais usuários ──
    if (action === "create") {
      const UAZAPI_BASE_URL = (Deno.env.get("UAZAPI_BASE_URL") ?? "").replace(/\/$/, "");
      const UAZAPI_ADMIN_TOKEN = Deno.env.get("UAZAPI_ADMIN_TOKEN") ?? "";
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";

      if (!UAZAPI_BASE_URL || !UAZAPI_ADMIN_TOKEN || !SUPABASE_URL) {
        return json({ error: "Configuração do servidor incompleta" }, 500);
      }

      let targetAuthIds: string[] = [];
      let empresaId = caller.empresa_id;

      if (target_usuario_ids.length > 0) {
        const { data: targets } = await supabase
          .from("usuarios")
          .select("id, user_id, empresa_id")
          .in("id", target_usuario_ids);

        if (!targets || targets.length !== target_usuario_ids.length) {
          return json({ error: "Usuário alvo não encontrado" }, 404);
        }

        if (caller.role !== "admin" && targets.some(t => t.empresa_id !== caller.empresa_id)) {
          return json({ error: "Forbidden: usuário fora da sua empresa" }, 403);
        }

        targetAuthIds = targets.map(t => t.user_id);
        empresaId = targets[0].empresa_id;
      }

      const instanceName = buildInstanceName(empresaId);

      const initRes = await fetch(`${UAZAPI_BASE_URL}/instance/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json", admintoken: UAZAPI_ADMIN_TOKEN },
        body: JSON.stringify({ name: instanceName }),
      });

      const initText = await initRes.text();
      if (!initRes.ok) {
        return json({ error: "Erro ao criar instância na uazapi", detail: initText }, 500);
      }

      let initData: Record<string, any> = {};
      try { initData = JSON.parse(initText); } catch { /* ok */ }

      const token: string | undefined =
        initData?.token ?? initData?.instance?.token ?? initData?.instance?.apikey ?? initData?.apikey;

      if (!token) {
        return json({ error: "uazapi não retornou token da instância", detail: initData }, 500);
      }

      // 🔴 Instância nova já nasce com segredo — Tarefa 7 do plano de blindagem. Sem isto, a
      // próxima empresa reabriria o buraco do item 16 pela porta dos fundos, e a etapa de
      // passar a recusar deixaria essa empresa sem receber nada.
      //
      // Aqui o corpo pode ser fixo, ao contrário da ação `reconfigurar-webhook`: a instância
      // acabou de nascer, não há configuração anterior a preservar.
      const webhookSecret = gerarSegredoDeWebhook();

      const registrarWebhook = async (url: string) => {
        const res = await fetch(`${UAZAPI_BASE_URL}/webhook`, {
          method: "POST",
          headers: { "Content-Type": "application/json", token },
          body: JSON.stringify({ url, enabled: true, events: ["All"] }),
        });
        return { ok: res.ok, status: res.status, texto: await res.text().catch(() => "") };
      };

      // 🔴 REDE DE SEGURANÇA: A PROTEÇÃO NÃO PODE IMPEDIR A EMPRESA DE EXISTIR.
      //
      // Em 24/09/2026, no primeiro uso real, a operadora RECUSOU o endereço com senha numa
      // instância desconectada. Enquanto não se sabe se a recusa é pela senha no endereço ou
      // por outro motivo, a criação de instância nova não pode ficar refém disso: uma empresa
      // nova que não consegue criar o WhatsApp é um problema maior que uma instância nascendo
      // desprotegida — esta aparece no painel como "Sem senha" e alguém resolve depois; aquela
      // trava o cliente na porta.
      //
      // Então: tenta com senha; se a operadora recusar, volta ao formato de sempre, que está
      // em produção desde que o sistema existe. `protegida` decide se a senha é gravada — e
      // gravar senha que a operadora não aceitou seria pior que não ter: a etapa de recusar
      // passaria a barrar o tráfego legítimo dessa instância.
      let protegida = true;
      let envio = await registrarWebhook(
        enderecoDeInstanciaNova(SUPABASE_URL, instanceName, webhookSecret),
      );

      if (!envio.ok) {
        console.error("[whatsapp-admin-provision] operadora recusou o endereço COM senha", {
          status: envio.status,
          body: semSegredoNoTexto(envio.texto, webhookSecret),
        });
        protegida = false;
        envio = await registrarWebhook(
          `${SUPABASE_URL}/functions/v1/whatsapp-webhook?instance=${instanceName}`,
        );
      }

      if (!envio.ok) {
        const semSegredo = semSegredoNoTexto(envio.texto, webhookSecret);
        console.error("[whatsapp-admin-provision] erro em /webhook", { status: envio.status, body: semSegredo });
        await deleteOrphan(UAZAPI_BASE_URL, token);
        return json({ error: "Erro ao configurar webhook na uazapi", status: envio.status, detail: semSegredo }, 500);
      }

      const { data: newInst, error: insertError } = await supabase
        .from("configuracoes_wapi")
        .insert({
          empresa_id: empresaId,
          instance_name: instanceName,
          api_key: token,
          instance_url: UAZAPI_BASE_URL,
          // Só grava a senha se a operadora aceitou o endereço que a carrega.
          webhook_secret: protegida ? webhookSecret : null,
          provisionada: true,
          status: "disconnected",
        })
        .select("id")
        .single();

      if (insertError || !newInst) {
        await deleteOrphan(UAZAPI_BASE_URL, token);
        return json({ error: "Erro ao salvar configuração", detail: insertError?.message }, 500);
      }

      // Vincular usuário(s) via junction table (se fornecido)
      if (targetAuthIds.length > 0) {
        const { error: linkError } = await supabase
          .from("wapi_instancia_usuarios")
          .insert(targetAuthIds.map(authId => ({ instancia_id: newInst.id, usuario_auth_id: authId })));

        if (linkError) {
          console.error("[whatsapp-admin-provision] erro ao vincular usuário(s) na criação", linkError);
        }
      }

      return json({ success: true, instanceName });
    }

    // ── LINK: vincula um usuário adicional a uma instância existente ───────────
    if (action === "link") {
      if (!instance_id || target_usuario_ids.length === 0) {
        return json({ error: "instance_id e target_usuario_id(s) são obrigatórios" }, 400);
      }

      const { data: instancia } = await supabase
        .from("configuracoes_wapi")
        .select("id, empresa_id")
        .eq("id", instance_id)
        .single();

      if (!instancia) return json({ error: "Instância não encontrada" }, 404);

      if (caller.role !== "admin" && instancia.empresa_id !== caller.empresa_id) {
        return json({ error: "Forbidden: instância fora da sua empresa" }, 403);
      }

      const { data: targets } = await supabase
        .from("usuarios")
        .select("id, user_id, empresa_id")
        .in("id", target_usuario_ids);

      if (!targets || targets.length !== target_usuario_ids.length) {
        return json({ error: "Usuário alvo não encontrado" }, 404);
      }

      if (caller.role !== "admin" && targets.some(t => t.empresa_id !== caller.empresa_id)) {
        return json({ error: "Forbidden: usuário fora da sua empresa" }, 403);
      }

      // Idempotente: ignora se já estiver vinculado
      const { error: linkError } = await supabase
        .from("wapi_instancia_usuarios")
        .upsert(
          targets.map(t => ({ instancia_id: instance_id, usuario_auth_id: t.user_id })),
          { onConflict: "instancia_id,usuario_auth_id", ignoreDuplicates: true }
        );

      if (linkError) {
        return json({ error: "Erro ao vincular usuário", detail: linkError.message }, 500);
      }

      return json({ success: true });
    }

    // ── UNLINK: remove vínculo de um usuário específico com a instância ────────
    if (action === "unlink") {
      if (!instance_id || !target_usuario_id) {
        return json({ error: "instance_id e target_usuario_id são obrigatórios" }, 400);
      }

      const { data: instancia } = await supabase
        .from("configuracoes_wapi")
        .select("id, empresa_id")
        .eq("id", instance_id)
        .single();

      if (!instancia) return json({ error: "Instância não encontrada" }, 404);

      if (caller.role !== "admin" && instancia.empresa_id !== caller.empresa_id) {
        return json({ error: "Forbidden: instância fora da sua empresa" }, 403);
      }

      const { data: target } = await supabase
        .from("usuarios")
        .select("user_id")
        .eq("id", target_usuario_id)
        .single();

      if (!target) return json({ error: "Usuário não encontrado" }, 404);

      await supabase
        .from("wapi_instancia_usuarios")
        .delete()
        .eq("instancia_id", instance_id)
        .eq("usuario_auth_id", target.user_id);

      return json({ success: true });
    }

    // ── RECONFIGURAR-WEBHOOK: põe o segredo no endereço, sem destruir o que já está lá ──
    //
    // Item 16 da dívida técnica · Tarefa 4 do plano de blindagem.
    //
    // 🔴 POR QUE ESTA AÇÃO EXISTE. O webhook do WhatsApp aceita qualquer um: a coluna
    // `webhook_secret` é lida na consulta e nunca conferida. Medido em 23/09/2026, das 81.540
    // chamadas anotadas desde 09/09, ZERO trouxeram segredo — porque nenhuma instância tem
    // segredo configurado. A conferência não pode ser ligada antes disto: recusaria 100% do
    // tráfego real, e a caixa de dois clientes pagantes pararia EM SILÊNCIO.
    //
    // 🔴 POR QUE ELA LÊ ANTES DE ESCREVER. As duas instâncias vivas têm configuração
    // DIFERENTE na operadora (uma com `events: []`, outra com `events: ["All"]`). Mandar um
    // corpo fixo reescreveria a de uma delas para outra coisa. Aqui o corpo enviado é o corpo
    // recebido, com o endereço trocado — e nada mais.
    //
    // 🔴 POR QUE ELA RELÊ DEPOIS. "A operadora respondeu 200" e "a operadora aplicou" são
    // coisas diferentes. E se o envio ACRESCENTAR um endereço em vez de substituir, o 200 vem
    // igual e cada mensagem passa a chegar duas vezes. Só a segunda leitura separa os casos.
    //
    // O segredo só é gravado no banco depois que a releitura confirma. Gravar antes deixaria o
    // banco esperando um segredo que a operadora nunca vai mandar — e a etapa seguinte do
    // plano (passar a recusar) recusaria tudo.
    if (action === "reconfigurar-webhook") {
      if (!instance_id) return json({ error: "instance_id é obrigatório" }, 400);

      const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
      if (!SUPABASE_URL) return json({ error: "Configuração do servidor incompleta" }, 500);

      const { data: instancia } = await supabase
        .from("configuracoes_wapi")
        .select("id, empresa_id, instance_name, api_key, instance_url")
        .eq("id", instance_id)
        .single();

      if (!instancia) return json({ error: "Instância não encontrada" }, 404);

      if (caller.role !== "admin" && instancia.empresa_id !== caller.empresa_id) {
        return json({ error: "Forbidden: instância fora da sua empresa" }, 403);
      }
      if (!instancia.api_key || !instancia.instance_url) {
        return json({ error: "Esta instância não tem credencial da operadora gravada." }, 409);
      }

      const baseDaOperadora = instancia.instance_url.replace(/\/$/, "");
      const cabecalhos = { "Content-Type": "application/json", token: instancia.api_key };

      const lerDaOperadora = async (): Promise<
        { ok: true; lista: unknown } | { ok: false; erro: string }
      > => {
        try {
          const res = await fetch(`${baseDaOperadora}/webhook`, { headers: cabecalhos });
          const texto = await res.text().catch(() => "");
          if (!res.ok) return { ok: false, erro: `a operadora respondeu ${res.status}` };
          try {
            return { ok: true, lista: JSON.parse(texto) };
          } catch {
            return { ok: false, erro: "a operadora respondeu algo que não é JSON" };
          }
        } catch (e) {
          return { ok: false, erro: `não foi possível falar com a operadora (${String(e)})` };
        }
      };

      // ── 1. O que está lá hoje ──────────────────────────────────────────────────────
      const antes = await lerDaOperadora();
      if (!antes.ok) {
        return json({ error: `Não deu para ler a configuração atual: ${antes.erro}. Nada foi mudado.` }, 502);
      }

      const escolha = escolherWebhookParaReconfigurar(antes.lista);
      if (!escolha.ok) return json({ error: escolha.motivo }, 409);

      const atual = escolha.webhook;
      if (!ehNossoEndereco(atual.url, SUPABASE_URL, instancia.instance_name)) {
        return json({
          error: "O endereço cadastrado na operadora não é o desta instância no nosso sistema. " +
            "Nada foi mudado — pôr o segredo num endereço alheio seria entregá-lo de bandeja.",
        }, 409);
      }

      // ── 2. O mesmo de sempre, agora com o segredo ──────────────────────────────────
      const segredo = gerarSegredoDeWebhook();
      const novaUrl = enderecoComSegredo(atual.url as string, segredo);

      let envioOk = false;
      let redeFalhou = false;
      let detalheDoEnvio = "";
      try {
        const res = await fetch(`${baseDaOperadora}/webhook`, {
          method: "POST",
          headers: cabecalhos,
          body: JSON.stringify(corpoDeReconfiguracao(atual, novaUrl)),
        });
        detalheDoEnvio = await res.text().catch(() => "");
        envioOk = res.ok;
        if (!res.ok) {
          console.error("[whatsapp-admin-provision] operadora recusou o webhook", {
            status: res.status,
            instancia: instancia.instance_name,
          });
        }
      } catch (e) {
        console.error("[whatsapp-admin-provision] erro de rede ao reconfigurar webhook", e);
        detalheDoEnvio = String(e);
        redeFalhou = true;
      }

      // 🔴 RECUSA E QUEDA DE REDE NÃO SÃO A MESMA COISA, e tratá-las juntas faria a tela
      // prometer o que não sabe. Quando a operadora RECUSA, ela recebeu o pedido e disse não —
      // o cadastro dela continua como estava. Quando a REDE cai no meio, o pedido pode ter
      // chegado e sido aplicado; afirmar "nada foi mudado" aí seria chute com cara de fato.
      // Por isso, na queda, a gente vai OLHAR antes de falar.
      if (redeFalhou) {
        const olhada = await lerDaOperadora();
        const conferida = olhada.ok ? conferirReconfiguracao(olhada.lista, novaUrl) : null;
        if (conferida?.ok) {
          // O envio chegou apesar da queda. Segue o fluxo normal: grava e confirma.
          envioOk = true;
        } else {
          return json({
            error: "A conexão com a operadora caiu no meio do envio. " +
              (olhada.ok
                ? "O cadastro dela continua como estava, e as mensagens seguem chegando. Pode repetir."
                : "Não deu para olhar como ficou. NÃO repita ainda: confira o cadastro na operadora primeiro."),
            detail: semSegredoNoTexto(detalheDoEnvio, segredo).slice(0, 500),
          }, 502);
        }
      }

      if (!envioOk) {
        return json({
          error: "A operadora recusou o novo endereço. Nada foi gravado, e o webhook continua " +
            "funcionando como antes.",
          // 🔴 A recusa da operadora costuma ecoar o endereço que ela recebeu — e esse
          // endereço carrega o segredo. Nunca repassar o corpo cru para a tela.
          detail: semSegredoNoTexto(detalheDoEnvio, segredo).slice(0, 500),
        }, 502);
      }

      // ── 3. Ficou mesmo como pedimos? ───────────────────────────────────────────────
      const depois = await lerDaOperadora();
      if (!depois.ok) {
        return json({
          error: `O envio foi aceito, mas não deu para reler e conferir: ${depois.erro}. ` +
            "A senha NÃO foi gravada aqui. Não dá para afirmar como o cadastro da operadora " +
            "ficou — confira antes de repetir.",
        }, 502);
      }

      const conferencia = conferirReconfiguracao(depois.lista, novaUrl);
      if (!conferencia.ok) {
        // 🔴 NÃO dizer "as mensagens continuam chegando". Este ramo cobre justamente os casos
        // em que elas PODEM ter parado (a operadora ficou sem endereço) ou passado a chegar em
        // dobro (ela acrescentou em vez de substituir). O motivo já diz qual é; repetir uma
        // tranquilização genérica por cima seria desmentir a própria medição.
        return json({
          error: `${conferencia.motivo} A senha NÃO foi gravada aqui — confira o cadastro na ` +
            "operadora antes de repetir a ação.",
        }, 502);
      }

      // ── 4. Só agora o banco ────────────────────────────────────────────────────────
      // Zero linhas não é sucesso (CLAUDE.md §4.6). Aqui rodamos com chave de serviço, então
      // zero significa que a linha sumiu no meio — e a operadora JÁ está mandando o segredo.
      const { error: erroDoBanco, count } = await supabase
        .from("configuracoes_wapi")
        .update({ webhook_secret: segredo }, { count: "exact" })
        .eq("id", instancia.id);

      if (erroDoBanco || count === 0) {
        console.error("[whatsapp-admin-provision] operadora reconfigurada mas o segredo nao foi gravado", {
          instancia: instancia.instance_name,
          count,
          erro: erroDoBanco?.message,
        });
        return json({
          error: "A operadora já está mandando o segredo, mas ele NÃO foi gravado aqui. " +
            "As mensagens continuam chegando; repita a ação para gerar outro.",
        }, 500);
      }

      return json({ ok: true, instance_name: instancia.instance_name, conferido: true });
    }

    // ── DELETE: remove instância da uazapi e do banco (cascade limpa junction) ─
    if (action === "delete") {
      if (!instance_id) return json({ error: "instance_id é obrigatório" }, 400);

      const { data: instancia } = await supabase
        .from("configuracoes_wapi")
        .select("id, empresa_id, api_key, instance_url")
        .eq("id", instance_id)
        .single();

      if (!instancia) return json({ error: "Instância não encontrada" }, 404);

      if (caller.role !== "admin" && instancia.empresa_id !== caller.empresa_id) {
        return json({ error: "Forbidden: instância fora da sua empresa" }, 403);
      }

      if (instancia.api_key && instancia.instance_url) {
        await deleteOrphan(instancia.instance_url.replace(/\/$/, ""), instancia.api_key);
      }

      await supabase.from("configuracoes_wapi").delete().eq("id", instance_id);

      return json({ success: true });
    }

    return json({ error: "Ação inválida. Use: create, link, unlink, delete, reconfigurar-webhook" }, 400);

  } catch (err) {
    console.error("[whatsapp-admin-provision] erro inesperado", err);
    return json({ error: "Erro inesperado. Tente de novo em instantes.", detail: String(err) }, 500);
  }
});
