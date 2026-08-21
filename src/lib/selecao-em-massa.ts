/**
 * A decisão da caixa de seleção do cabeçalho, na lista de Negócios.
 *
 * Mora fora da tela — que tem 2.700 linhas — porque são SETE resultados
 * possíveis em dois modos de seleção, e a diferença entre dois deles custou
 * 1.191 cliques ao usuário. Aqui a regra fica travada por teste.
 *
 * OS DOIS MODOS, que é o que confunde:
 *
 * - **Normal**: cada negócio marcado vira um id numa lista. O usuário escolheu
 *   um a um, ou página a página.
 * - **Todos os filtrados**: ninguém carrega 11.906 ids no navegador. O sistema
 *   guarda "está tudo marcado" mais a lista de EXCEÇÕES, e a exclusão em massa
 *   roda no servidor com os mesmos filtros da tela.
 *
 * O DEFEITO QUE ORIGINOU ISTO: no modo "todos os filtrados", desmarcar a caixa
 * do cabeçalho acrescentava a página atual às exceções. Com 10 por página e
 * 11.906 negócios, "desmarcar todos" viravam 1.191 cliques, um por página.
 *
 * A REGRA QUE CORRIGE — SIMETRIA: marcar já perguntava "apenas esta página ou
 * todos os N?". Desmarcar passa a fazer a MESMA pergunta. Perguntar de um lado
 * só é o que fazia a caixa parecer que desmarcava tudo quando não desmarcava.
 *
 * A pergunta só aparece quando ela decide alguma coisa: se não há nada
 * selecionado fora da página atual, as duas respostas dão no mesmo e a janela
 * seria um estorvo.
 */
export type AcaoDaCaixaDeSelecao =
  /** Página sem linhas: o clique não tem o que fazer. */
  | 'nada'
  /** Existe seleção fora desta página: perguntar se marca a página ou todas. */
  | 'perguntar-marcar'
  /** Existe seleção fora desta página: perguntar se desmarca a página ou tudo. */
  | 'perguntar-desmarcar'
  /** Zera a seleção inteira e sai do modo "todos os filtrados". */
  | 'limpar-tudo'
  /** Continua em "todos os filtrados" e devolve esta página às selecionadas. */
  | 'reincluir-pagina'
  /** Tira desta página a marcação, sem tocar no resto. */
  | 'desmarcar-pagina'
  /** Acrescenta os ids desta página à seleção. */
  | 'marcar-pagina';

export interface EstadoDaCaixaDeSelecao {
  /**
   * true = a contagem total do filtro já chegou do servidor.
   *
   * O total vem de uma consulta SEPARADA da lista, então existe uma janela em que
   * as linhas já estão pintadas e `totalFiltrado` ainda é 0. Agir nela leva a
   * caixa a limpar a seleção inteira (achando que não há nada fora da página) ou
   * a marcar só a página em vez de oferecer "Todos (N)".
   */
  totalConhecido: boolean;
  /** true = o usuário usou o atalho "Todos (N)" e a seleção é por filtro, não por id. */
  modoTodosFiltrados: boolean;
  /** true = todas as linhas visíveis nesta página estão marcadas. */
  paginaInteiraSelecionada: boolean;
  /** Quantos negócios o filtro atual devolve no total, somando todas as páginas. */
  totalFiltrado: number;
  /** Quantas linhas a página atual está exibindo. */
  itensNaPagina: number;
  /** Quantas linhas DESTA página estão marcadas. */
  selecionadosNaPagina: number;
  /** Quantos negócios estão marcados ao todo, contando as outras páginas. */
  selecionadosNoTotal: number;
}

export function acaoDaCaixaDoCabecalho(estado: EstadoDaCaixaDeSelecao): AcaoDaCaixaDeSelecao {
  const {
    totalConhecido,
    modoTodosFiltrados,
    paginaInteiraSelecionada,
    totalFiltrado,
    itensNaPagina,
    selecionadosNaPagina,
    selecionadosNoTotal,
  } = estado;

  if (itensNaPagina <= 0) return 'nada';

  // Melhor a caixa não responder por um instante do que responder errado sobre
  // 11.906 negócios. A janela dura o tempo da consulta de contagem.
  if (!totalConhecido) return 'nada';

  // ── DESMARCANDO ────────────────────────────────────────────────────────────
  if (paginaInteiraSelecionada) {
    // Só pergunta se a resposta muda alguma coisa: precisa haver marcação fora
    // desta página. `>` e não `>=` de propósito — contagem incoerente (corrida
    // entre carregar a lista e recontar) cai no caminho previsível de baixo.
    if (selecionadosNoTotal > selecionadosNaPagina) return 'perguntar-desmarcar';

    // Nada fora da página: desmarcar aqui é desmarcar tudo. No modo "todos os
    // filtrados" isso significa também sair do modo, senão a tela continuaria
    // dizendo que tudo está selecionado.
    return modoTodosFiltrados ? 'limpar-tudo' : 'desmarcar-pagina';
  }

  // ── MARCANDO ───────────────────────────────────────────────────────────────
  // No modo "todos os filtrados" não há ambiguidade: a caixa desmarcada quer
  // dizer que ESTA página foi excluída à mão, e marcar é pedi-la de volta.
  if (modoTodosFiltrados) return 'reincluir-pagina';

  return totalFiltrado > itensNaPagina ? 'perguntar-marcar' : 'marcar-pagina';
}
