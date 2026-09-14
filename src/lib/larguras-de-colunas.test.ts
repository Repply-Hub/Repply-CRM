import { describe, it, expect } from 'vitest';
import {
  ajustarLargura,
  gravarLarguras,
  largurasPadrao,
  lerLarguras,
  restaurarColuna,
  somaDasLarguras,
  type ColunaAjustavel,
} from './larguras-de-colunas';

/**
 * O QUE ESTE ARQUIVO PRENDE: a tabela do time nasce cabendo na página e guarda o ajuste de cada
 * pessoa no navegador dela — e NUNCA quebra por causa do guardado. O `localStorage` pode vir vazio,
 * com texto que não é JSON, com uma coluna a menos, ou lançar erro (aba anônima, navegador que
 * bloqueia). Em todos esses casos vale a largura-padrão.
 */

const COLUNAS: ColunaAjustavel[] = [
  { chave: 'negocio', padrao: 200, minima: 140 },
  { chave: 'valor', padrao: 110, minima: 90 },
];
const CHAVE = 'teste_larguras_v1';

function armazenamento(inicial: Record<string, string> = {}) {
  const dados = { ...inicial };
  return {
    dados,
    getItem: (k: string) => (k in dados ? dados[k] : null),
    setItem: (k: string, v: string) => {
      dados[k] = v;
    },
  };
}

const quebrado = {
  getItem: (): string | null => {
    throw new Error('bloqueado');
  },
  setItem: (): void => {
    throw new Error('bloqueado');
  },
};

describe('larguras de colunas', () => {
  it('sem nada guardado, vale a largura-padrão', () => {
    expect(lerLarguras(CHAVE, COLUNAS, armazenamento())).toEqual({ negocio: 200, valor: 110 });
  });

  it('o guardado válido é o que vale', () => {
    const a = armazenamento({ [CHAVE]: JSON.stringify({ negocio: 260, valor: 120 }) });
    expect(lerLarguras(CHAVE, COLUNAS, a)).toEqual({ negocio: 260, valor: 120 });
  });

  it('🔴 guardado quebrado volta ao padrão, e não quebra a tabela', () => {
    expect(lerLarguras(CHAVE, COLUNAS, armazenamento({ [CHAVE]: 'isto não é json' }))).toEqual(
      largurasPadrao(COLUNAS),
    );
    expect(lerLarguras(CHAVE, COLUNAS, armazenamento({ [CHAVE]: '42' }))).toEqual(largurasPadrao(COLUNAS));
    expect(lerLarguras(CHAVE, COLUNAS, armazenamento({ [CHAVE]: '[1,2]' }))).toEqual(largurasPadrao(COLUNAS));
  });

  it('coluna que não estava no guardado nasce na largura-padrão', () => {
    const a = armazenamento({ [CHAVE]: JSON.stringify({ negocio: 260 }) });
    expect(lerLarguras(CHAVE, COLUNAS, a)).toEqual({ negocio: 260, valor: 110 });
  });

  it('largura guardada abaixo da mínima sobe para a mínima; valor inválido volta ao padrão', () => {
    const a = armazenamento({ [CHAVE]: JSON.stringify({ negocio: 10, valor: 'x' }) });
    expect(lerLarguras(CHAVE, COLUNAS, a)).toEqual({ negocio: 140, valor: 110 });
  });

  it('🔴 localStorage que lança erro não quebra nem a leitura nem a gravação', () => {
    expect(lerLarguras(CHAVE, COLUNAS, quebrado)).toEqual(largurasPadrao(COLUNAS));
    expect(() => gravarLarguras(CHAVE, { negocio: 200, valor: 110 }, quebrado)).not.toThrow();
  });

  it('gravar guarda o que a leitura devolve depois', () => {
    const a = armazenamento();
    gravarLarguras(CHAVE, { negocio: 230, valor: 100 }, a);
    expect(lerLarguras(CHAVE, COLUNAS, a)).toEqual({ negocio: 230, valor: 100 });
  });

  it('ajustar respeita a mínima e arredonda', () => {
    const base = largurasPadrao(COLUNAS);
    expect(ajustarLargura(base, COLUNAS[0], 50).negocio).toBe(140);
    expect(ajustarLargura(base, COLUNAS[0], 250.6).negocio).toBe(251);
  });

  it('restaurar volta aquela coluna, e só ela, ao padrão', () => {
    expect(restaurarColuna({ negocio: 300, valor: 130 }, COLUNAS[0])).toEqual({ negocio: 200, valor: 130 });
  });

  it('a soma é o tamanho da tabela', () => {
    expect(somaDasLarguras({ negocio: 200, valor: 110 }, COLUNAS)).toBe(310);
  });
});
