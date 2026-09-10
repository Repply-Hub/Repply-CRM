/**
 * Onde um atendimento termina e o próximo começa, numa conversa de WhatsApp.
 *
 * 🔴 A REGRA É DO DONO DO PRODUTO, e não uma heurística nossa: "abrir" e
 * "fechar" conversa é um conceito que o Repply criou, e a equipe usa de
 * propósito. São 4.168 fechamentos na MD, presentes em 757 das 764 conversas.
 *
 * O corte é o fechamento — e só ele. Nada de silêncio: um corte por tempo seria
 * inventado por nós, e a operação já produz um marco melhor.
 *
 * Duas consequências aceitas de olhos abertos:
 *
 * - Conversa SEM fechamento nenhum vira um bloco só, que é exatamente o que a
 *   tela mostrava antes desta mudança. Como o recurso de fechar só existe desde
 *   20/07/2026, todo o histórico anterior degrada sozinho — sem código de
 *   transição e sem tela vazia.
 * - A nota é texto livre, escrita em `WhatsAppInbox` ("Fulana fechou a conversa
 *   e removeu … dos responsáveis"). Casar por texto é frágil de propósito
 *   assumido: não existe campo estruturado hoje, e inventar um exigiria migrar
 *   4.168 linhas já escritas. Se um dia a frase mudar, os testes daqui quebram
 *   antes de o usuário perceber — que é o ponto de eles existirem.
 */

const FECHOU = /\bfechou a conversa\b/i;
const ASSUMIU = /^(.+?)\s+assumiu esta conversa\b/i;

export interface MensagemParaBloco {
  id: string;
  created_at: string;
  conteudo: string | null;
  is_nota_interna: boolean;
}

export interface BlocoDeAtendimento {
  /** A primeira mensagem de verdade do bloco — é para onde a linha aponta. */
  primeiraMensagemId: string;
  inicioEm: string;
  /** Fim: o fechamento, ou a última mensagem quando o bloco segue aberto. */
  fimEm: string;
  /** Quantas mensagens de verdade. Nota interna não conta. */
  mensagens: number;
  /** Quem assumiu o atendimento neste bloco, na ordem em que assumiu. */
  atendentes: string[];
  fechado: boolean;
}

interface EmMontagem {
  primeiraMensagemId: string | null;
  inicioEm: string | null;
  fimEm: string | null;
  mensagens: number;
  atendentes: string[];
  fechado: boolean;
}

function novo(): EmMontagem {
  return {
    primeiraMensagemId: null, inicioEm: null, fimEm: null,
    mensagens: 0, atendentes: [], fechado: false,
  };
}

/** Um bloco só existe se teve mensagem de verdade — fechamento sozinho não é atendimento. */
function fechar(atual: EmMontagem, saida: BlocoDeAtendimento[]) {
  if (!atual.primeiraMensagemId || !atual.inicioEm) return;
  saida.push({
    primeiraMensagemId: atual.primeiraMensagemId,
    inicioEm: atual.inicioEm,
    fimEm: atual.fimEm ?? atual.inicioEm,
    mensagens: atual.mensagens,
    atendentes: atual.atendentes,
    fechado: atual.fechado,
  });
}

export function blocosDeAtendimento(
  mensagens: MensagemParaBloco[],
): BlocoDeAtendimento[] {
  if (!mensagens?.length) return [];

  // A ordem cronológica é o eixo da regra inteira. O chamador pode entregar
  // fora de ordem — o realtime insere no começo da lista, por exemplo.
  const emOrdem = [...mensagens].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );

  const blocos: BlocoDeAtendimento[] = [];
  let atual = novo();

  for (const m of emOrdem) {
    if (m.is_nota_interna) {
      const texto = m.conteudo ?? '';

      if (FECHOU.test(texto)) {
        // Fechamento sem mensagem nenhuma no bloco não cria bloco vazio:
        // `fechar` descarta, e o estado é reiniciado do mesmo jeito.
        atual.fechado = true;
        atual.fimEm = m.created_at;
        fechar(atual, blocos);
        atual = novo();
        continue;
      }

      const assumiu = texto.match(ASSUMIU);
      if (assumiu) {
        const nome = assumiu[1].trim();
        if (nome && !atual.atendentes.includes(nome)) atual.atendentes.push(nome);
      }
      // Qualquer outra nota (direcionou, adicionou, saiu, reabriu) não move o
      // corte: o que abre bloco novo é a próxima mensagem de verdade.
      continue;
    }

    if (!atual.primeiraMensagemId) {
      atual.primeiraMensagemId = m.id;
      atual.inicioEm = m.created_at;
    }
    atual.mensagens += 1;
    atual.fimEm = m.created_at;
  }

  fechar(atual, blocos);
  return blocos;
}

/**
 * Os blocos que pertencem a um negócio.
 *
 * O critério é o INÍCIO do bloco, não a sobreposição: um atendimento que começou
 * antes de o negócio existir não é daquele negócio, mesmo que tenha se arrastado
 * para dentro da janela.
 */
export function blocosNaJanela(
  blocos: BlocoDeAtendimento[],
  de: string,
  ate: string,
): BlocoDeAtendimento[] {
  return blocos.filter((b) => b.inicioEm >= de && b.inicioEm <= ate);
}

/**
 * Slugs das etapas em que o negócio está ENCERRADO.
 *
 * Amarrado ao SLUG, e não ao nome: renomear a etapa troca só o rótulo, o slug
 * fica. Uma empresa já chama "Fechamento" de "Faturado" e o slug continua
 * `fechamento`. As duas são `is_sistema` e existem em todas as empresas.
 */
const ETAPAS_ENCERRADAS = ['fechamento', 'perdido'];

export function negocioEncerrado(status: string | null | undefined): boolean {
  return ETAPAS_ENCERRADAS.includes((status ?? '').trim().toLowerCase());
}

export interface JanelaDoNegocio {
  de: string;
  ate: string;
}

/**
 * De quando até quando o histórico daquele negócio conta.
 *
 * 🔴 A DATA DE INÍCIO É `data_pedido`, NUNCA `created_at`. Os 11.989 negócios
 * importados do Bitrix compartilham um único `created_at` — o instante da
 * importação. Usar aquilo daria a mesma janela para todos (ver CLAUDE.md §4.4).
 *
 * 🔴 E A DATA DE FIM SÓ VALE SE FOR DEPOIS DO INÍCIO. Medido em 10/09/2026:
 * **445 negócios encerrados têm data de fechamento ANTERIOR à de criação** —
 * fecha-mês legítimo, que a casa já decidiu não reparar nem travar. Com a
 * janela crua, esses 445 mostrariam histórico vazio, porque nenhum bloco pode
 * começar depois do início e antes de um fim que veio antes. Quando a data não
 * serve, a janela corre até agora: mostrar o que houve é melhor do que mostrar
 * nada.
 *
 * Negócio EM ABERTO ignora a data de fechamento de propósito — para ele ela é
 * uma previsão herdada da planilha que ninguém atualiza, e cortaria a janela
 * antes das conversas de agora.
 */
export function janelaDoNegocio({
  dataPedido,
  prazoResposta,
  status,
  agora,
}: {
  dataPedido: string;
  prazoResposta?: string | null;
  status?: string | null;
  /** Injetável para o teste; em produção é o relógio. */
  agora?: string;
}): JanelaDoNegocio {
  const de = dataPedido;
  const fim = agora ?? new Date().toISOString();

  if (!negocioEncerrado(status)) return { de, ate: fim };
  if (!prazoResposta) return { de, ate: fim };
  // Fim do dia: `prazo_resposta` é data seca, e um bloco das 15h do próprio dia
  // do fechamento pertence ao negócio.
  const ate = `${prazoResposta}T23:59:59.999Z`;
  if (ate < de) return { de, ate: fim };
  return { de, ate };
}
