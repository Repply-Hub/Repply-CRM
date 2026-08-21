import { acaoDaCaixaDoCabecalho } from './selecao-em-massa';

/**
 * O contrato da caixa de seleção do cabeçalho, na tela de Negócios.
 *
 * O defeito que originou este arquivo: com os 11.906 negócios da MD selecionados
 * pelo atalho "Todos", desmarcar a caixa do cabeçalho tirava só os 10 da página
 * atual. Para desmarcar tudo eram 1.191 cliques, um por página, com um
 * carregamento de lista entre cada um.
 *
 * A regra que ficou: a caixa é SIMÉTRICA. Se marcar pergunta "esta página ou
 * todas?", desmarcar pergunta o mesmo. Perguntar só num dos lados era a
 * assimetria que escondia o defeito.
 */
const base = {
  totalConhecido: true,
  modoTodosFiltrados: false,
  paginaInteiraSelecionada: false,
  totalFiltrado: 11906,
  itensNaPagina: 10,
  selecionadosNaPagina: 0,
  selecionadosNoTotal: 0,
};

describe('acaoDaCaixaDoCabecalho — ao MARCAR', () => {
  it('com mais de uma página, pergunta se é a página ou todas', () => {
    expect(acaoDaCaixaDoCabecalho({ ...base })).toBe('perguntar-marcar');
  });

  it('quando tudo cabe numa página, não pergunta nada', () => {
    // Sem segunda página, "esta página" e "todos" são a mesma coisa: a janela
    // seria uma escolha que não existe.
    expect(acaoDaCaixaDoCabecalho({
      ...base, totalFiltrado: 7, itensNaPagina: 7,
    })).toBe('marcar-pagina');
  });

  it('no modo "todos os filtrados", devolve a página às selecionadas sem perguntar', () => {
    // O usuário tinha excluído linhas desta página e mudou de ideia. Não há
    // ambiguidade: ele só quer estas de volta.
    expect(acaoDaCaixaDoCabecalho({
      ...base, modoTodosFiltrados: true, selecionadosNoTotal: 11896,
    })).toBe('reincluir-pagina');
  });
});

describe('acaoDaCaixaDoCabecalho — ao DESMARCAR', () => {
  it('o caso do defeito: tudo selecionado pelo atalho "Todos" agora PERGUNTA', () => {
    // Antes isto tirava só os 10 da página e exigia 1.191 cliques.
    expect(acaoDaCaixaDoCabecalho({
      ...base,
      modoTodosFiltrados: true,
      paginaInteiraSelecionada: true,
      selecionadosNaPagina: 10,
      selecionadosNoTotal: 11906,
    })).toBe('perguntar-desmarcar');
  });

  it('seleção manual que passa da página também pergunta', () => {
    // Marcou três páginas a dedo, 30 no total, e desmarca na página 2.
    expect(acaoDaCaixaDoCabecalho({
      ...base,
      paginaInteiraSelecionada: true,
      selecionadosNaPagina: 10,
      selecionadosNoTotal: 30,
    })).toBe('perguntar-desmarcar');
  });

  it('quando só esta página está selecionada, desmarca direto', () => {
    // Não há nada fora da página para a pergunta decidir.
    expect(acaoDaCaixaDoCabecalho({
      ...base,
      paginaInteiraSelecionada: true,
      selecionadosNaPagina: 10,
      selecionadosNoTotal: 10,
    })).toBe('desmarcar-pagina');
  });

  it('modo "todos os filtrados" numa única página limpa tudo direto', () => {
    // Filtro que devolve 7 resultados: "esta página" e "tudo" coincidem.
    expect(acaoDaCaixaDoCabecalho({
      ...base,
      modoTodosFiltrados: true,
      paginaInteiraSelecionada: true,
      totalFiltrado: 7,
      itensNaPagina: 7,
      selecionadosNaPagina: 7,
      selecionadosNoTotal: 7,
    })).toBe('limpar-tudo');
  });
});

describe('acaoDaCaixaDoCabecalho — bordas', () => {
  it('página vazia não faz nada', () => {
    expect(acaoDaCaixaDoCabecalho({
      ...base, totalFiltrado: 0, itensNaPagina: 0,
    })).toBe('nada');
  });

  it('página vazia no modo todos os filtrados também não faz nada', () => {
    expect(acaoDaCaixaDoCabecalho({
      ...base, modoTodosFiltrados: true, totalFiltrado: 0, itensNaPagina: 0,
    })).toBe('nada');
  });

  it('enquanto o total não chegou do servidor, a caixa não faz nada', () => {
    // A contagem total vem de uma consulta SEPARADA da lista. Na primeira pintura
    // as linhas já apareceram e o total ainda é desconhecido — agir nessa janela
    // levaria a caixa a limpar a seleção inteira achando que não há nada fora da
    // página, ou a marcar só a página em vez de oferecer "Todos (N)".
    expect(acaoDaCaixaDoCabecalho({
      ...base,
      totalConhecido: false,
      paginaInteiraSelecionada: true,
      selecionadosNaPagina: 10,
      selecionadosNoTotal: 0,
      totalFiltrado: 0,
    })).toBe('nada');

    expect(acaoDaCaixaDoCabecalho({
      ...base, totalConhecido: false, totalFiltrado: 0,
    })).toBe('nada');
  });

  it('contagem incoerente não trava a tela', () => {
    // Se o total vier menor que o da página (corrida entre carregar a lista e
    // recontar), a caixa ainda tem que responder algo previsível.
    expect(acaoDaCaixaDoCabecalho({
      ...base,
      paginaInteiraSelecionada: true,
      selecionadosNaPagina: 10,
      selecionadosNoTotal: 4,
    })).toBe('desmarcar-pagina');
  });
});
