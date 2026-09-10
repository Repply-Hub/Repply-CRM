import { describe, it, expect } from 'vitest';
import {
  filtroDaCaixa, CAIXA_DE_ENTRADA, PASTA_SPAM, PASTA_LIXEIRA,
} from './filtro-da-caixa';

// Os marcadores reais da caixa da MD: rótulos que a pessoa criou no Gmail.
const MARCADORES = ['Label_4', 'Label_27', 'Label_185'];

describe('filtroDaCaixa', () => {
  it('a caixa de entrada esconde spam, lixeira e TODOS os marcadores', () => {
    expect(filtroDaCaixa(CAIXA_DE_ENTRADA, MARCADORES)).toEqual({
      precisaTer: null,
      naoPodeTer: [PASTA_SPAM, PASTA_LIXEIRA, 'Label_4', 'Label_27', 'Label_185'],
    });
  });

  it('todos os e-mails escondem só spam e lixeira', () => {
    expect(filtroDaCaixa(null, MARCADORES)).toEqual({
      precisaTer: null,
      naoPodeTer: [PASTA_SPAM, PASTA_LIXEIRA],
    });
  });

  it('um marcador escolhido mostra o marcador e mais nada', () => {
    expect(filtroDaCaixa('Label_27', MARCADORES)).toEqual({
      precisaTer: 'Label_27',
      naoPodeTer: [],
    });
  });

  it('spam e lixeira mostram o que está neles, sem se excluir', () => {
    expect(filtroDaCaixa(PASTA_SPAM, MARCADORES)).toEqual({
      precisaTer: PASTA_SPAM, naoPodeTer: [],
    });
    expect(filtroDaCaixa(PASTA_LIXEIRA, MARCADORES)).toEqual({
      precisaTer: PASTA_LIXEIRA, naoPodeTer: [],
    });
  });

  it('caixa sem marcador nenhum: a entrada é igual a todos os e-mails', () => {
    expect(filtroDaCaixa(CAIXA_DE_ENTRADA, [])).toEqual(filtroDaCaixa(null, []));
  });

  it('não repete spam nem lixeira se eles vierem na lista de marcadores', () => {
    // Defesa: se um dia `ehSistema` deixar spam passar por marcador, o filtro
    // não pode acabar com a mesma pasta duas vezes na exclusão.
    const f = filtroDaCaixa(CAIXA_DE_ENTRADA, [PASTA_SPAM, 'Label_4']);
    expect(f.naoPodeTer).toEqual([PASTA_SPAM, PASTA_LIXEIRA, 'Label_4']);
  });

  it('🔴 a entrada nunca esconde a si mesma', () => {
    // `CAIXA_DE_ENTRADA` não é pasta do provedor e não pode acabar na lista de
    // exclusão nem se aparecer entre os marcadores por acidente.
    const f = filtroDaCaixa(CAIXA_DE_ENTRADA, [CAIXA_DE_ENTRADA, 'Label_4']);
    expect(f.naoPodeTer).not.toContain(CAIXA_DE_ENTRADA);
    expect(f.naoPodeTer).toEqual([PASTA_SPAM, PASTA_LIXEIRA, 'Label_4']);
  });
});
