/**
 * O que cada item da barra lateral da seção de E-mails mostra.
 *
 * Existe como módulo, e não como dois `if` dentro da consulta, porque a MESMA
 * regra precisa valer em dois lugares: a listagem e o número no selo. Quando as
 * duas eram escritas à mão, o selo prometia mensagens que a lista não tinha — é
 * o defeito que o comentário de `Emails.tsx` já descrevia ("006 - NAMBEI"
 * mostrava 3 e abria vazio). Aqui elas não podem divergir: as duas chamam esta
 * função.
 *
 * A diferença entre Caixa de entrada e Todos os e-mails é a do Gmail: mover para
 * um marcador TIRA da entrada, e a mensagem segue existindo em Todos e no
 * marcador. Nada aqui interpreta o NOME da pasta — a lista de marcadores chega
 * pronta de quem sabe distinguir marcador de pasta de sistema (`ehSistema`, em
 * use-email-pastas). Casar por nome funcionaria numa empresa e quebraria na
 * seguinte, que organiza a caixa por outro critério.
 */

/** Ids que o Nylas usa para as pastas de sistema, iguais em qualquer provedor. */
export const PASTA_SPAM = 'SPAM';
export const PASTA_LIXEIRA = 'TRASH';

/**
 * A Caixa de entrada não é uma pasta do provedor: é "o que chegou e ninguém
 * arquivou ainda". Por isso um valor próprio, e não um `pasta_id`. O formato com
 * underscores não colide com id de marcador (`Label_4`) nem de sistema (`INBOX`).
 */
export const CAIXA_DE_ENTRADA = '__entrada__';

/**
 * O que está aceso na barra. `null` = Todos os e-mails.
 * Mesmo nome que o projeto já usava em `BarraPastas`.
 */
export type PastaSelecionada = string | null;

export interface FiltroDaCaixa {
  /** Pasta que a mensagem precisa ter para aparecer. */
  precisaTer: string | null;
  /** Pastas que, se a mensagem tiver, a tiram da lista. */
  naoPodeTer: string[];
}

export function filtroDaCaixa(
  selecao: PastaSelecionada,
  marcadores: string[],
): FiltroDaCaixa {
  // Spam e lixeira escolhidos de propósito: a pessoa quer ver justamente o que
  // as outras listas escondem.
  if (selecao === PASTA_SPAM || selecao === PASTA_LIXEIRA) {
    return { precisaTer: selecao, naoPodeTer: [] };
  }

  if (selecao === CAIXA_DE_ENTRADA) {
    const fora = [PASTA_SPAM, PASTA_LIXEIRA];
    for (const m of marcadores) {
      // `CAIXA_DE_ENTRADA` fora: não é pasta do provedor, e excluí-la faria a
      // entrada esconder a si mesma.
      if (m === CAIXA_DE_ENTRADA) continue;
      if (!fora.includes(m)) fora.push(m);
    }
    return { precisaTer: null, naoPodeTer: fora };
  }

  if (selecao === null) {
    return { precisaTer: null, naoPodeTer: [PASTA_SPAM, PASTA_LIXEIRA] };
  }

  // Um marcador específico.
  return { precisaTer: selecao, naoPodeTer: [] };
}
