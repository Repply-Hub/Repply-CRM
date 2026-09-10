import { describe, it, expect } from 'vitest';
import { escolherLinhasParaCadastrar } from './linhas-para-cadastrar';

describe('escolherLinhasParaCadastrar', () => {
  it('🔴 usa o índice da prévia, não a posição na lista já filtrada', () => {
    // Planilha original com 4 linhas (prévia 0, 1, 2, 3). A prévia 0 foi descartada por
    // falta de Cliente — não aparece em `linhas`, que sobra com só 3 posições. A prévia 1
    // é a única marcada para cadastrar.
    //
    // Um `.filter((_, j) => set.has(j))` ingênuo confundiria a posição 1 de `linhas`
    // (que é o conteúdo da prévia 2) com o índice de prévia 1 — cadastrando a linha errada.
    // O resultado certo é o conteúdo da prévia 1, que está na posição 0 de `linhas`.
    const linhas = [
      { nome: 'conteúdo da prévia 1' },
      { nome: 'conteúdo da prévia 2' },
      { nome: 'conteúdo da prévia 3' },
    ];
    const indicesDaPrevia = [1, 2, 3];
    const indicesEscolhidos = new Set([1]);

    const resultado = escolherLinhasParaCadastrar(linhas, indicesDaPrevia, indicesEscolhidos);

    expect(resultado).toEqual([{ nome: 'conteúdo da prévia 1' }]);
  });

  it('conjunto de índices escolhidos vazio não cadastra nenhuma linha', () => {
    const linhas = [{ nome: 'a' }, { nome: 'b' }];
    const resultado = escolherLinhasParaCadastrar(linhas, [0, 1], new Set());
    expect(resultado).toEqual([]);
  });

  it('lista de linhas vazia devolve lista vazia, mesmo com índices escolhidos', () => {
    const resultado = escolherLinhasParaCadastrar([], [], new Set([0, 1, 2]));
    expect(resultado).toEqual([]);
  });
});
