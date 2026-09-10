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
