import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buscarPastas,
  chamarNylas,
  corsHeaders,
  ehPastaDeSistema,
  erroDoNylas,
  gravarPastas,
  json,
  mensagemParaLinha,
  type MensagemNylas,
} from "../_shared/nylas.ts";

/**
 * Traz mensagens do Nylas para o CRM.
 *
 * Existe por dois motivos independentes:
 *  1. O webhook só entrega e-mail NOVO. Ao conectar uma caixa, tudo que já
 *     estava lá seria invisível para sempre sem uma busca ativa.
 *  2. Rede de proteção. Um endpoint que devolve não-2xx em 95% das entregas por
 *     15 min vira `failing` no Nylas e, em 72h, `failed` — que NÃO reativa
 *     sozinho. Sem esta função, essa janela vira perda silenciosa de e-mail.
 *
 * `verify_jwt = false` no config, porque atende dois chamadores com credenciais
 * diferentes; a distinção é feita aqui dentro.
 */

const LIMITE_PADRAO = 50;
const LIMITE_MAXIMO = 200; // teto da API do Nylas

/**
 * Orçamento de tempo por execução.
 *
 * Substitui o teto fixo de 12 marcadores, que era a causa de um sintoma que
 * ninguém explicava: a caixa tem 29 marcadores, então 17 nunca eram varridos e
 * abriam vazios na tela. Cortar por TEMPO cobre a caixa inteira quando ela cabe
 * e degrada em partes quando não cabe — em vez de ignorar sempre os mesmos.
 */
const ORCAMENTO_MS = 90_000;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Sessão não identificada." }, 401);

    const body = await req.json().catch(() => ({}));
    const limite = Math.min(
      Math.max(Number(body?.limit) || LIMITE_PADRAO, 1),
      LIMITE_MAXIMO,
    );

    // Dois chamadores, duas credenciais. Diferente de gmail-sync-inbox, que com
    // verify_jwt=false e sem checagem nenhuma é acionável por qualquer um na
    // internet e itera TODOS os usuários.
    const ehCron = token === (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? " ");

    let empresaId: string | null = null;
    if (!ehCron) {
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
        .select("empresa_id, deleted_at")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!caller) return json({ error: "Usuário não encontrado." }, 404);
      if (caller.deleted_at) return json({ error: "Conta suspensa." }, 403);
      if (!caller.empresa_id) return json({ error: "Conta sem empresa vinculada." }, 403);
      empresaId = caller.empresa_id;
    }

    let consulta = supabase
      .from("email_contas")
      .select("id, empresa_id, email, status, pasta_inbox_id, pasta_sent_id, ultima_sync_em")
      .eq("status", "conectada");
    if (empresaId) consulta = consulta.eq("empresa_id", empresaId);

    const { data: contas } = await consulta;
    if (!contas?.length) {
      return json({ ok: true, contas: 0, novas: 0, atualizadas: 0, aviso: "sem_conta_conectada" });
    }

    const comecouEm = Date.now();
    let novas = 0;
    let atualizadas = 0;
    let pastasEspelhadas = 0;
    const erros: string[] = [];

    for (const [indice, conta] of contas.entries()) {
      /**
       * Fatia do orçamento que cabe a esta conta.
       *
       * Um prazo único para a execução inteira faria a primeira caixa consumir
       * tudo e a última não receber nem a entrada — no cron, que varre todas as
       * empresas, a mesma caixa ficaria sempre no fim da fila. Dividindo em
       * fatias acumuladas, cada conta tem seu quinhão e a soma continua sendo o
       * orçamento total, sem risco de estourar o limite de parede.
       */
      const prazoDaConta = comecouEm + Math.floor((ORCAMENTO_MS * (indice + 1)) / contas.length);

      const { data: grantRow } = await supabase
        .from("email_conta_grants")
        .select("grant_id")
        .eq("conta_id", conta.id)
        .maybeSingle();

      if (!grantRow?.grant_id) {
        erros.push(`${conta.email}: sem credencial`);
        continue;
      }

      // Primeira sincronização traz a caixa como está. Nas seguintes, só o que
      // chegou depois da última — com 5 min de folga, porque o relógio do
      // provedor e o nosso não são o mesmo e uma mensagem na fronteira sumiria.
      const incremental = !body?.backfill && conta.ultima_sync_em;
      const desde = incremental
        ? Math.floor((new Date(conta.ultima_sync_em).getTime() - 5 * 60_000) / 1000)
        : null;

      // Espelha os marcadores do provedor a cada varredura. Sem isto, um
      // marcador criado no Gmail depois da conexão nunca apareceria na barra
      // lateral, e um excluído ficaria lá para sempre como filtro morto.
      // É uma chamada a mais por conta, no mesmo ciclo que já vai à rede.
      const pastasDaCaixa = await buscarPastas(grantRow.grant_id);
      if (pastasDaCaixa.length) {
        pastasEspelhadas += await gravarPastas(
          supabase,
          conta.id,
          conta.empresa_id,
          pastasDaCaixa,
        );
      } else {
        // Sem pastas, o espelho não acontece e a barra de marcadores fica
        // vazia — que é exatamente o sintoma que ninguém conseguia explicar.
        // Um `if` sem `else` transformava essa falha em silêncio; agora ela
        // aparece no resultado da varredura e no log.
        console.warn(`[email-sync] ${conta.email}: /folders devolveu vazio`);
        erros.push(`${conta.email}: não consegui ler as pastas`);
      }

      // Entrada, enviados, spam e lixeira. Os dois últimos passaram a ser
      // buscados porque a barra lateral agora os oferece como filtro próprio —
      // e a tela de Recebidos, em compensação, passou a EXCLUIR mensagens que
      // carreguem SPAM ou TRASH, para lixo não se misturar com trabalho.
      //
      // Os ids vêm do espelho de pastas em vez de colunas próprias em
      // email_contas: no Gmail são literalmente "SPAM" e "TRASH", mas no
      // Microsoft são opacos, e o atributo é o único jeito que vale nos dois.
      const idPorAtributo = (attr: string) =>
        pastasDaCaixa.find((p) => (p.attributes ?? []).some((a) => a.toLowerCase() === attr))?.id;

      const deSistema = [
        conta.pasta_inbox_id,
        conta.pasta_sent_id,
        idPorAtributo("\\spam") ?? idPorAtributo("\\junk"),
        idPorAtributo("\\trash"),
      ].filter(Boolean) as string[];

      // E os marcadores, um por um. No Gmail o marcador é aditivo: a mensagem
      // que está na entrada com o marcador X tem folders [INBOX, Label_X] e já
      // viria pela busca da entrada. Mas quem ARQUIVA depois de marcar (o fluxo
      // normal de quem organiza a caixa) perde o INBOX e fica só com Label_X —
      // essa mensagem era invisível para o CRM.
      //
      // É justamente o acervo de quem só tem acesso a um marcador: sem isto, a
      // pessoa liberada num marcador veria apenas o punhado que ainda está na
      // entrada.
      const marcadores = pastasDaCaixa.filter((p) => p.id && !ehPastaDeSistema(p)).map((p) => p.id);

      /**
       * Quais marcadores varrer.
       *
       * O teto fixo de 12 era a causa de um sintoma que ninguém explicava: a
       * caixa tem 29 marcadores, então 17 NUNCA eram varridos. "006 - NAMBEI"
       * mostrava 3 na barra (número do Gmail) e abria vazio, porque não havia
       * uma única mensagem dele aqui — e o mesmo valia para PADO, ISOVER,
       * ASPERBRAS, DM2 e outros.
       *
       * Agora o corte é por TEMPO, não por contagem: varre enquanto couber no
       * orçamento e para antes de estourar. Uma caixa pequena é coberta inteira;
       * uma enorme é coberta em partes, e o que ficou de fora aparece no
       * resultado em vez de sumir.
       *
       * `pastas` no corpo pede uma varredura DIRIGIDA — é o que a tela usa ao
       * abrir um marcador que ainda não tem mensagem aqui, para buscar aquele e
       * só aquele, na hora.
       */
      const pedidas = Array.isArray(body?.pastas)
        ? (body.pastas as unknown[]).filter((p): p is string => typeof p === "string" && !!p)
        : null;

      const escolhidos = pedidas
        ? marcadores.filter((m) => pedidas.includes(m))
        : marcadores;

      // Conta sem pastas resolvidas (falha no callback): busca sem filtro, que é
      // pior mas melhor do que não trazer nada.
      const alvos = deSistema.length || escolhidos.length
        ? [...deSistema, ...escolhidos]
        : [null];

      // Se a varredura cobriu a caixa inteira. Vira falso quando o tempo acaba
      // no meio — e é o que decide se `ultima_sync_em` pode avançar.
      let cobriuTudo = true;

      for (const pasta of alvos) {
        // Corte por TEMPO. A função tem limite de parede, e estourar significa
        // NADA gravado — pior do que gravar quase tudo. As pastas de sistema
        // vêm primeiro na lista justamente para nunca serem as sacrificadas.
        if (Date.now() > prazoDaConta) {
          const faltaram = alvos.length - alvos.indexOf(pasta);
          console.warn(`[email-sync] ${conta.email}: tempo esgotado, ${faltaram} pasta(s) fora`);
          erros.push(`${conta.email}: ${faltaram} pasta(s) ficaram para a próxima varredura`);
          cobriuTudo = false;
          break;
        }

        const params = new URLSearchParams({ limit: String(limite) });
        if (pasta) params.set("in", pasta);
        if (desde) params.set("received_after", String(desde));

        const resp = await chamarNylas<MensagemNylas[]>(
          `/v3/grants/${grantRow.grant_id}/messages?${params.toString()}`,
          { method: "GET", timeoutMs: 60_000 },
        );

        if (!resp.ok) {
          const motivo = erroDoNylas(resp.body, resp.texto);
          // 401/403 = credencial morta. Marcar faz a tela pedir reconexão em vez
          // de repetir erro genérico a cada tentativa.
          if (resp.status === 401 || resp.status === 403) {
            await supabase
              .from("email_contas")
              .update({ status: "revogada", ultimo_erro: motivo.slice(0, 500) })
              .eq("id", conta.id);
            erros.push(`${conta.email}: acesso revogado`);
            break;
          }
          erros.push(`${conta.email}: ${motivo}`);
          continue;
        }

        const mensagens = resp.body.data ?? [];
        if (!mensagens.length) continue;

        // Dedup DENTRO do lote. Passou a ser necessário quando os marcadores
        // entraram na varredura: no Gmail o marcador é aditivo, então a mesma
        // mensagem volta pela INBOX e de novo pelo Label_X na mesma execução.
        // O Postgres recusa um `INSERT ... ON CONFLICT` que atinja a mesma
        // linha duas vezes ("cannot affect row a second time") e o lote INTEIRO
        // seria perdido.
        const porId = new Map<string, MensagemNylas>();
        for (const m of mensagens) if (m?.id) porId.set(m.id, m);

        const linhas = [...porId.values()].map((m) =>
          mensagemParaLinha(m, conta.id, conta.empresa_id, conta.email)
        );

        // `excluido` fica FORA do payload (mensagemParaLinha não o inclui): o
        // PostgREST só atualiza as colunas presentes, e incluí-la ressuscitaria
        // o que o usuário apagou a cada sync. É o defeito que gmail-sync-inbox
        // tem com `lido`.
        const { data: gravadas, error } = await supabase
          .from("email_mensagens")
          .upsert(linhas, { onConflict: "conta_id,nylas_message_id" })
          .select("criado_em, updated_at");

        if (error) {
          console.error("[email-sync] falha ao gravar:", error);
          erros.push(`${conta.email}: ${error.message}`);
          continue;
        }

        for (const g of gravadas ?? []) {
          // Mesmo timestamp nas duas colunas = linha recém-criada.
          if (g.criado_em === g.updated_at) novas++;
          else atualizadas++;
        }
      }

      /**
       * O carimbo só avança quando a varredura cobriu a caixa INTEIRA.
       *
       * `ultima_sync_em` é a fronteira do modo incremental: tudo anterior a ele
       * é considerado já trazido. Carimbar depois de uma varredura PARCIAL —
       * dirigida a um marcador só, ou interrompida pelo tempo — declararia
       * sincronizado o que nunca foi buscado, e as mensagens antigas dos
       * marcadores que ficaram de fora se tornariam inalcançáveis para sempre:
       * a varredura seguinte pediria ao provedor só o que chegou depois.
       *
       * Errar para o lado de repetir trabalho é barato. Errar para o outro lado
       * perde e-mail em silêncio.
       */
      if (pedidas === null && cobriuTudo) {
        await supabase
          .from("email_contas")
          .update({ ultima_sync_em: new Date().toISOString(), ultimo_erro: null })
          .eq("id", conta.id);
      }
    }

    // Limpeza dos states de OAuth vencidos. Sai daqui além de email-conectar
    // porque uma conexão abandonada no meio deixa a linha para trás e ninguém
    // mais passa por aquele caminho — o sync roda com frequência e é de graça.
    await supabase
      .from("email_conexao_estados")
      .delete()
      .lt("expira_em", new Date().toISOString());

    console.log(
      `[email-sync] contas=${contas.length} novas=${novas} atualizadas=${atualizadas} pastas=${pastasEspelhadas}`,
    );
    return json({
      ok: true,
      contas: contas.length,
      novas,
      atualizadas,
      pastas: pastasEspelhadas,
      erros,
    });
  } catch (err) {
    console.error("[email-sync]", err);
    return json({ error: "Erro inesperado ao sincronizar.", detail: String(err) }, 500);
  }
});
