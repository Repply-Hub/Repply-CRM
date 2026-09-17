import { describe, it, expect } from 'vitest';
import { enderecosDeAnexo, reagruparPorLinha } from './anexos-da-planilha';

describe('enderecosDeAnexo', () => {
  it('separa vários endereços por vírgula, aparando espaços', () => {
    expect(enderecosDeAnexo('a.pdf, b.pdf ,c.jpg')).toEqual(['a.pdf', 'b.pdf', 'c.jpg']);
  });

  it('um endereço só vira lista de um', () => {
    expect(enderecosDeAnexo('https://exemplo.co/orcamento.pdf')).toEqual([
      'https://exemplo.co/orcamento.pdf',
    ]);
  });

  it('célula vazia, nula ou só espaços/vírgulas vira lista vazia', () => {
    expect(enderecosDeAnexo('')).toEqual([]);
    expect(enderecosDeAnexo(null)).toEqual([]);
    expect(enderecosDeAnexo(undefined)).toEqual([]);
    expect(enderecosDeAnexo('   ')).toEqual([]);
    expect(enderecosDeAnexo(' , , ')).toEqual([]);
  });

  it('não parte um endereço que já tem vírgula? (o Storage não gera vírgula, mas o Bitrix reparado sim)', () => {
    // Endereço com vírgula é raro, mas o separador da planilha É a vírgula — por isso a
    // exportação nunca junta endereços que contenham vírgula sem escape. Este teste fixa que a
    // divisão é literal por vírgula (o contrato dos dois lados).
    expect(enderecosDeAnexo('x.pdf,y.pdf')).toEqual(['x.pdf', 'y.pdf']);
  });
});

describe('reagruparPorLinha', () => {
  it('devolve os itens achatados de volta em listas do tamanho de cada linha', () => {
    const achatado = ['a', 'b', 'c', 'd'];
    expect(reagruparPorLinha([2, 0, 1, 1], achatado)).toEqual([['a', 'b'], [], ['c'], ['d']]);
  });

  it('linha sem anexo vira lista vazia, sem consumir do achatado', () => {
    expect(reagruparPorLinha([0, 0], [])).toEqual([[], []]);
  });

  it('preserva a ordem — o índice no achatado é quem diz a que linha o item pertence', () => {
    const achatado = [10, 20, 30];
    expect(reagruparPorLinha([1, 2], achatado)).toEqual([[10], [20, 30]]);
  });
});
