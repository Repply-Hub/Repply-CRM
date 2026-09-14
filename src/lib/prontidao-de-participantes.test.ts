import { describe, it, expect } from 'vitest';
import { ajustarCicloDeAberturaEProntidao } from './prontidao-de-participantes';

/**
 * O QUE ESTE ARQUIVO PRENDE: Bloco 3, item A (segundo conserto da revisão), requisito (f).
 *
 * O revisor apontou que um teste de componente, com Testing Library, não consegue observar
 * a renderização intermediária que a correção original fecha — `act()` esvazia os efeitos
 * pendentes antes de qualquer asserção, então mesmo o código ERRADO (que só corrigia a
 * marca dentro de um `useEffect`) passaria num teste assim. A prova de que a correção
 * acontece na MESMA chamada síncrona que detecta a mudança de ciclo só é possível fora do
 * React — é isto que estes testes fazem, chamando a função pura diretamente.
 */
describe('ajustarCicloDeAberturaEProntidao', () => {
  it(
    '🔴 (f) reabrir com cache quente: mesmo com dataUpdatedAt já maior que a marca de um ' +
      'ciclo ANTERIOR, a MESMA chamada rebaselina e devolve "não pronto"',
    () => {
      // Um ciclo anterior (mesmo grupoId) já tinha marcado a busca como concluída — a marca
      // daquele ciclo (100) é bem menor que o `dataUpdatedAt` já em cache (500), porque
      // aquele ciclo teve tempo de terminar antes do evento ser fechado.
      const refsDeQuandoEstavaAberto = { cicloAberto: 'grupo-1', marcaAntesDeBuscarDeNovo: 100 };

      // Fecha: o componente chama isto com `open=false` no mesmo render em que o modal fecha.
      const refsAoFechar = ajustarCicloDeAberturaEProntidao(
        false,
        'grupo-1',
        { isFetching: false, isSuccess: true, dataUpdatedAt: 500 },
        refsDeQuandoEstavaAberto,
      );
      expect(refsAoFechar.cicloAberto).toBeNull();

      // Reabre o MESMO evento: o cache ainda tem `dataUpdatedAt: 500` (nada mudou desde que
      // fechou — o refetch forçado nem chegou a rodar ainda, é assíncrono). SEM a
      // rebaselinagem, `500 > 100` leria "pronto" — exatamente o bug que este arquivo prende.
      const resultado = ajustarCicloDeAberturaEProntidao(
        true,
        'grupo-1',
        { isFetching: false, isSuccess: true, dataUpdatedAt: 500 },
        refsAoFechar,
      );

      expect(resultado.participantesProntos).toBe(false);
      // A marca já foi rebaselinada NESTA MESMA chamada, para o valor atual do cache —
      // é o que faz o refetch forçado (que ainda vai rodar) parecer "mais novo" depois.
      expect(resultado.marcaAntesDeBuscarDeNovo).toBe(500);
      expect(resultado.cicloAberto).toBe('grupo-1');
    },
  );

  it('depois que o refetch forçado realmente termina com um valor mais novo, fica pronto', () => {
    const aoReabrir = ajustarCicloDeAberturaEProntidao(
      true,
      'grupo-1',
      { isFetching: false, isSuccess: true, dataUpdatedAt: 500 },
      { cicloAberto: null, marcaAntesDeBuscarDeNovo: 100 },
    );
    expect(aoReabrir.participantesProntos).toBe(false);

    // O refetch forçado começa (isFetching vira true) — continua não pronto.
    const duranteABusca = ajustarCicloDeAberturaEProntidao(
      true,
      'grupo-1',
      { isFetching: true, isSuccess: true, dataUpdatedAt: 500 },
      aoReabrir,
    );
    expect(duranteABusca.participantesProntos).toBe(false);

    // O refetch termina com um `dataUpdatedAt` de verdade mais novo — agora sim.
    const depoisDaBusca = ajustarCicloDeAberturaEProntidao(
      true,
      'grupo-1',
      { isFetching: false, isSuccess: true, dataUpdatedAt: 600 },
      duranteABusca,
    );
    expect(depoisDaBusca.participantesProntos).toBe(true);
  });

  it('primeira abertura de verdade (nunca buscado): dataUpdatedAt 0 não conta como pronto', () => {
    const resultado = ajustarCicloDeAberturaEProntidao(
      true,
      'grupo-1',
      { isFetching: true, isSuccess: false, dataUpdatedAt: 0 },
      { cicloAberto: null, marcaAntesDeBuscarDeNovo: 0 },
    );
    expect(resultado.participantesProntos).toBe(false);
  });

  it('trocar de evento (grupoId diferente) também rebaselina, mesmo com "open" continuando true', () => {
    const resultado = ajustarCicloDeAberturaEProntidao(
      true,
      'grupo-2',
      // O cache do OUTRO evento pode já ter um dataUpdatedAt alto — não deve importar.
      { isFetching: false, isSuccess: true, dataUpdatedAt: 900 },
      { cicloAberto: 'grupo-1', marcaAntesDeBuscarDeNovo: 100 },
    );

    expect(resultado.participantesProntos).toBe(false);
    expect(resultado.marcaAntesDeBuscarDeNovo).toBe(900);
    expect(resultado.cicloAberto).toBe('grupo-2');
  });

  it('erro: mesmo com dataUpdatedAt "maior", isSuccess falso nunca fica pronto', () => {
    const resultado = ajustarCicloDeAberturaEProntidao(
      true,
      'grupo-1',
      { isFetching: false, isSuccess: false, dataUpdatedAt: 900 },
      { cicloAberto: 'grupo-1', marcaAntesDeBuscarDeNovo: 100 },
    );
    expect(resultado.participantesProntos).toBe(false);
  });

  it('sem grupoId (evento novo): não mexe no ciclo processado', () => {
    const resultado = ajustarCicloDeAberturaEProntidao(
      true,
      undefined,
      { isFetching: false, isSuccess: false, dataUpdatedAt: 0 },
      { cicloAberto: null, marcaAntesDeBuscarDeNovo: 0 },
    );
    expect(resultado.cicloAberto).toBeNull();
  });
});
