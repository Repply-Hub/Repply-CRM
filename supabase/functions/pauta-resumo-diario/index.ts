import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  assuntoDaPauta,
  assuntoDoPulso,
  montarEmail,
  montarPulsoDaEquipe,
  type ItemDaPauta,
  type NegocioDaEquipe,
} from "./corpo.ts";

/**
 * O resumo diário da pauta, às 7h de Brasília.
 *
 * ESTA FUNÇÃO NÃO DECIDE NADA. Ela pergunta ao banco e manda o e-mail:
 *
 *   pauta_resumo_destinatarios()  quem deve receber HOJE (seção ligada, resumo ligado,
 *                                 hoje entre os dias escolhidos pelo gestor)
 *   pauta_do_dia_de(usuario)      a fila de cada um — a MESMA função que a tela usa
 *   ve_pauta_de_todos(usuario)    a chave `pauta_de_todos` — a MESMA leitura que a tela usa
 *   negocios_em_risco_de(usuario) a tabela do time — a MESMA lista que a tela mostra
 *
 * É por isso que existe: se a regra fosse reimplementada aqui em TypeScript, a tela diria
 * "5 orçamentos parados" e o e-mail diria 7, e ninguém confiaria em nenhum dos dois. Esse
 * tipo de divergência leva meses até alguém notar.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DOIS E-MAILS, E A REGRA QUE ESCOLHE ENTRE ELES (decisão do dono do produto, 09/09/2026)
 * ────────────────────────────────────────────────────────────────────────────
 * Desde a migration 20260909120000 a fila da tela "Hoje" voltou a ser SEMPRE pessoal. Quem tem
 * a chave `pauta_de_todos` e nenhum negócio próprio passou a ter fila vazia — e fila vazia não
 * gerava e-mail. Na MD isso é a Fabiola, o Gabriel Medeiros e o Gabriel Pereira: três gestoras
 * parariam de receber o e-mail das 7h em silêncio, uma delas a principal usuária do cliente.
 *
 * Em vez de sumir, o e-mail MUDA DE ASSUNTO. A regra tem DUAS condições, e as duas contam:
 *
 *   fila pessoal vazia   +  TEM a chave  →  o PULSO DA EQUIPE (os 5 maiores da tabela do time)
 *   fila pessoal vazia   +  não tem      →  não sai nada, como sempre
 *   fila pessoal com item                →  a fila pessoal, como sempre — inclusive para quem
 *                                           tem a chave. Não se troca o e-mail de quem já
 *                                           tinha um útil.
 *
 * 🔴 O CASO DE BORDA — chave, fila vazia E a equipe sem nada em risco: NÃO SAI E-MAIL, e conta
 * como `pulso_vazio` no registro. Três motivos:
 *   1. É a mesma decisão de produto que já vale para todo mundo, logo abaixo: "você não tem
 *      nada hoje", todo dia, é o caminho mais rápido para a pessoa criar um filtro e nunca
 *      mais ver a mensagem. Um pulso de zero é essa mesma mensagem com outra roupa.
 *   2. A regressão que este trecho existe para impedir é "três gestoras param de receber um
 *      e-mail ÚTIL". No dia em que nem a fila nem a equipe têm nada, não há e-mail útil a
 *      perder — nada foi tirado de ninguém.
 *   3. O plano B (`docs/superpowers/plans/2026-09-09-hoje-b-a-voz.md`, Tarefa 1) vai colocar a
 *      frase do dia vazio — "Nada parado. Seu dia está seu." — numa função só, com uma cópia
 *      para o Deno e um teste prendendo as duas. Escrevê-la aqui agora criaria a segunda cópia
 *      antes da primeira existir, que é como duas versões da mesma frase começam a divergir
 *      (CLAUDE.md §7.14). Quando a Tarefa 1 entrar, a decisão se revê ALI, num lugar só.
 *   Medido em 10/09/2026: na MD o recorte da equipe está em 161 negócios, então este ramo não
 *   dispara hoje. Ele é o dia raro, não o normal.
 *
 * 🔴 PAUTA VAZIA NÃO GERA E-MAIL. "Você não tem nada hoje", todo dia, é o caminho mais rápido
 * para a pessoa criar uma regra de filtro e nunca mais ver a mensagem. Medido em 25/08/2026:
 * com o resumo ligado na MD, 13 pessoas passam pelas três condições e só 8 têm item na pauta.
 *
 * O agendamento chama uma vez por dia (`0 10 * * *` em UTC = 7h em Natal). Se falhar num dia,
 * o resumo daquele dia passou — repetir tentaria mandar duas vezes, o que é pior.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Quantas linhas da tabela do time cabem num e-mail. E-mail não é tabela. */
const ITENS_DO_PULSO = 5;

/** O nome que este projeto usa por convenção — igual aos outros 8 segredos. */
const NOME_CANONICO = "RESEND_API_KEY";

/**
 * A chave do Resend, tolerando a CAIXA do nome do segredo.
 *
 * 🔴 NOME DE VARIÁVEL DE AMBIENTE DIFERENCIA MAIÚSCULA DE MINÚSCULA. `Resend_api_key` e
 * `RESEND_API_KEY` são dois segredos distintos para o servidor, e `Deno.env.get` do nome
 * certo devolve `undefined` sem erro nenhum quando o que existe é o outro.
 *
 * 🔴 E SÃO DUAS TELAS DIFERENTES NO PAINEL, as duas chamadas "Secrets", as duas com um botão
 * "Add new secret":
 *
 *   Project Settings → Edge Functions → Secrets   ← É DAQUI que `Deno.env.get` lê
 *   Integrations → Vault                          ← cofre do BANCO; esta função NÃO lê de lá
 *
 * Em 26/08/2026 as duas armadilhas se somaram e custaram sete idas e vindas: a chave estava
 * guardada, correta e válida, e o resumo não saía. Primeiro o nome estava em outra caixa;
 * depois a correção foi feita no Vault, que é o cofre do banco e não alimenta função. O
 * painel do Supabase também não renomeia segredo no lugar — é preciso criar outro e apagar
 * o antigo —, e quem tenta renomear fica com a impressão de ter resolvido.
 *
 * A tolerância é ESTREITA de propósito: só a mesma palavra em outra caixa. Não aceita nome
 * parecido, nem abreviação. E quando entra por aqui, o registro diz qual nome foi usado —
 * ver `aviso_nome_do_segredo` em `automation_logs`. Remendo que ninguém enxerga é como a
 * convenção de nomes de um projeto se desfaz.
 */
function lerChaveDoResend(): { valor?: string; nomeUsado?: string; foraDoPadrao: boolean } {
  const exato = Deno.env.get(NOME_CANONICO);
  if (exato) return { valor: exato, nomeUsado: NOME_CANONICO, foraDoPadrao: false };

  const outraCaixa = Object.keys(Deno.env.toObject()).find(
    (n) => n.toUpperCase() === NOME_CANONICO,
  );
  if (outraCaixa) {
    return { valor: Deno.env.get(outraCaixa), nomeUsado: outraCaixa, foraDoPadrao: true };
  }
  return { foraDoPadrao: false };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const inicio = Date.now();
  const resultado = {
    destinatarios: 0,
    // `enviados` conta TODO e-mail que saiu, dos dois formatos; `pulsos` é o pedaço dele que
    // foi pulso da equipe. `pauta_vazia` continua sendo "não recebeu nada", e `pulso_vazio` é
    // o pedaço dele em que a pessoa TINHA a chave e a equipe é que não tinha nada. Assim a
    // conta continua fechando: destinatarios = enviados + pauta_vazia + (falhas em `erros`).
    enviados: 0,
    pulsos: 0,
    pauta_vazia: 0,
    pulso_vazio: 0,
    erros: [] as string[],
  };

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { valor: apiKey, nomeUsado, foraDoPadrao } = lerChaveDoResend();
    const remetente = Deno.env.get("EMAIL_REMETENTE") ?? "Repply <nao-responda@repplyhub.com.br>";
    // O mesmo endereço para os dois e-mails: a tabela do time mora na tela "Hoje", ao lado da
    // fila. O que muda é o rótulo do botão, em `corpo.ts`.
    const linkDaPauta = (Deno.env.get("APP_URL") ?? "https://crm.repplyhub.com.br") + "/hoje";

    // A LISTA VEM ANTES DA CHAVE, de propósito.
    //
    // O resumo nasce DESLIGADO em toda empresa. Conferir a chave primeiro faria esta função
    // registrar um erro todo dia às 7h enquanto ninguém tivesse ligado nada — e registro de
    // erro que acontece todo dia sem consequência é o jeito mais rápido de ensinar a equipe
    // a ignorar registro de erro.
    const { data: destinatarios, error: erroDest } = await supabase.rpc(
      "pauta_resumo_destinatarios",
    );
    if (erroDest) throw erroDest;

    resultado.destinatarios = destinatarios?.length ?? 0;

    if (resultado.destinatarios === 0) {
      // Ninguém para receber hoje: nenhuma empresa ligou o resumo, ou hoje não é um dos dias
      // escolhidos. É o caminho normal, não uma falha.
      await supabase.from("automation_logs").insert({
        tipo: "pauta_resumo_diario",
        status: "ok",
        detalhes: { ...resultado, motivo: "ninguém para receber hoje" },
      });
      return new Response(JSON.stringify(resultado), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!apiKey) {
      // Aqui a falha é ALTA e explicada: existe gente esperando o resumo e não há por onde
      // mandar. Sem isto, a ausência da chave viraria "o resumo simplesmente não chega" e
      // alguém procuraria o defeito na pauta.
      //
      // 🔴 REGISTRA OS NOMES DAS VARIÁVEIS QUE A FUNÇÃO ENXERGA — nomes, JAMAIS conteúdo.
      // Dizer só "falta a chave" manda quem for resolver procurar no escuro. A lista separa
      // as três causas possíveis: nome escrito de outro jeito, segredo guardado no Vault (o
      // cofre do BANCO, que esta função não lê), ou salvo em outro projeto. As três já
      // aconteceram — ver o comentário de `lerChaveDoResend`.
      const variaveis_visiveis = Object.keys(Deno.env.toObject()).sort();
      const msg = "RESEND_API_KEY não está configurada nos secrets do projeto";
      await supabase.from("automation_logs").insert({
        tipo: "pauta_resumo_diario",
        status: "erro",
        detalhes: { erro: msg, variaveis_visiveis, ...resultado },
      });
      return new Response(JSON.stringify({ erro: msg }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    for (const pessoa of destinatarios ?? []) {
      try {
        const { data: pauta, error: erroPauta } = await supabase.rpc("pauta_do_dia_de", {
          p_usuario_id: pessoa.usuario_id,
        });
        if (erroPauta) throw erroPauta;

        const itens = (pauta ?? []) as ItemDaPauta[];

        let html: string;
        let assunto: string;
        let ehPulso = false;

        if (itens.length > 0) {
          html = montarEmail(pessoa.nome ?? "", itens, linkDaPauta);
          assunto = assuntoDaPauta(itens);
        } else {
          // Primeira condição: a chave. Sem ela, nada muda — a pessoa continua sem receber.
          // A leitura é a MESMA da tela (`ve_pauta_de_todos`), e não uma terceira cópia da
          // regra: `pauta_do_dia_de` e a tabela do time já leem por ela.
          const { data: chave, error: erroChave } = await supabase.rpc("ve_pauta_de_todos", {
            p_usuario_id: pessoa.usuario_id,
          });
          if (erroChave) throw erroChave;
          if (chave !== true) {
            resultado.pauta_vazia++;
            continue;
          }

          // 🔴 A PESSOA VAI POR PARÂMETRO, e é por isso que a variante `_de` existe. Esta
          // função fala com o banco como `service_role`, onde não há usuário logado:
          // `auth.uid()` é nulo e o portão de `negocios_em_risco` (que o resolve pela sessão)
          // devolveria NULO — a consulta voltaria vazia todo dia, para todo mundo. A variante
          // também é quem escreve a cerca de empresa, que `service_role` pula junto com a RLS.
          const { data: risco, error: erroRisco } = await supabase.rpc("negocios_em_risco_de", {
            p_usuario_id: pessoa.usuario_id,
            p_limite: ITENS_DO_PULSO,
          });
          if (erroRisco) throw erroRisco;

          const equipe = (risco ?? []) as NegocioDaEquipe[];
          if (equipe.length === 0) {
            // Nem a fila nem a equipe têm nada. Ver o caso de borda no topo do arquivo.
            resultado.pauta_vazia++;
            resultado.pulso_vazio++;
            continue;
          }

          html = montarPulsoDaEquipe(pessoa.nome ?? "", equipe, linkDaPauta);
          assunto = assuntoDoPulso(equipe);
          ehPulso = true;
        }

        const resp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: remetente,
            to: [pessoa.email],
            subject: assunto,
            html,
          }),
        });

        if (!resp.ok) {
          // O corpo da resposta traz o motivo (domínio não verificado, teto do plano,
          // endereço recusado). Guardar só o código deixaria o diagnóstico no escuro.
          const corpo = await resp.text();
          throw new Error(`Resend ${resp.status}: ${corpo.slice(0, 300)}`);
        }

        resultado.enviados++;
        if (ehPulso) resultado.pulsos++;
      } catch (e) {
        // Um destinatário que falha não derruba os outros. É a diferença entre "duas pessoas
        // não receberam" e "ninguém recebeu porque o e-mail de alguém estava recusado".
        //
        // ⚠️ É AQUI que cai a migration 20260909130000 não aplicada: `negocios_em_risco_de`
        // não existiria e o erro do banco entra nesta lista, com nome e tudo, em vez de o
        // e-mail sumir calado. Era o sumiço calado o problema que este trecho veio resolver.
        resultado.erros.push(
          `${pessoa.email}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    await supabase.from("automation_logs").insert({
      tipo: "pauta_resumo_diario",
      status: resultado.erros.length > 0 ? "parcial" : "ok",
      detalhes: {
        ...resultado,
        duracao_ms: Date.now() - inicio,
        // Fica no registro de TODO envio bem-sucedido enquanto o nome estiver fora do
        // padrão. É o que impede o remendo de virar permanente por esquecimento.
        ...(foraDoPadrao
          ? {
              aviso_nome_do_segredo:
                `o segredo está como "${nomeUsado}"; o padrão deste projeto é ` +
                `"${NOME_CANONICO}". Crie um novo com o nome certo em Project Settings → ` +
                `Edge Functions → Secrets (NÃO no Vault) e apague o antigo — o painel do ` +
                `Supabase não renomeia no lugar.`,
            }
          : {}),
      },
    });

    return new Response(JSON.stringify(resultado), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      await supabase.from("automation_logs").insert({
        tipo: "pauta_resumo_diario",
        status: "erro",
        detalhes: { erro: msg, ...resultado },
      });
    } catch {
      // Se nem o registro do erro grava, não há mais o que fazer aqui — a resposta abaixo
      // ainda diz o que houve para quem chamou.
    }
    return new Response(JSON.stringify({ erro: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
