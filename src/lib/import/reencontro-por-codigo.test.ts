import { describe, it, expect } from 'vitest';
import { classificarPorCodigo, codigosParaConsultar } from './reencontro-por-codigo';

const A = '3f2a8b91-0000-4000-8000-00000000000a';
const B = '3f2a8b91-0000-4000-8000-00000000000b';
const C = '3f2a8b91-0000-4000-8000-00000000000c';

describe('codigosParaConsultar', () => {
  it('devolve só o que tem formato de identificador, sem repetir', () => {
    const linhas = [{ codigo: A }, { codigo: A }, { codigo: '' }, { codigo: 'abc' }];
    expect(codigosParaConsultar(linhas)).toEqual([A]);
  });

  it('🔴 filtra o que não tem formato de identificador — senão a consulta INTEIRA cai', () => {
    // O Postgres recusa o SELECT todo com "invalid input syntax for type uuid" quando UM
    // valor da lista está fora do formato. Uma célula com "abc" derrubaria a busca dos
    // 12 mil códigos válidos junto.
    expect(codigosParaConsultar([{ codigo: 'abc' }, { codigo: 'Código/ID' }])).toEqual([]);
  });

  it('aceita o identificador em caixa alta e com espaço em volta', () => {
    expect(codigosParaConsultar([{ codigo: `  ${A.toUpperCase()}  ` }])).toEqual([A]);
  });
});

describe('classificarPorCodigo', () => {
  it('código que existe vai para "atualiza"', () => {
    const r = classificarPorCodigo([{ codigo: A }], new Set([A]));
    expect(r.atualiza).toHaveLength(1);
    expect(r.atualiza[0]).toMatchObject({ balde: 'atualiza', codigo: A, indice: 0 });
  });

  it('célula vazia vai para "sem_codigo"', () => {
    const r = classificarPorCodigo([{ codigo: '' }, { codigo: '   ' }, {}], new Set());
    expect(r.semCodigo).toHaveLength(3);
    expect(r.semCodigo.every(l => l.codigo === '')).toBe(true);
  });

  it('código preenchido que o banco não devolveu vai para "nao_encontrado"', () => {
    const r = classificarPorCodigo([{ codigo: B }], new Set([A]));
    expect(r.naoEncontrado).toHaveLength(1);
    expect(r.atualiza).toHaveLength(0);
  });

  it('texto que nem tem formato de identificador também é "nao_encontrado"', () => {
    const r = classificarPorCodigo([{ codigo: 'abc' }], new Set([A]));
    expect(r.naoEncontrado).toHaveLength(1);
    expect(r.semCodigo).toHaveLength(0);
  });

  it('🔴 código repetido no arquivo recusa TODAS as linhas dele, não só a segunda', () => {
    // Duas linhas com o mesmo código são uma contradição, não uma ordem. Escolher a última
    // em silêncio grava a errada metade das vezes (decisão 10 do desenho).
    const r = classificarPorCodigo([{ codigo: A }, { codigo: A }, { codigo: B }], new Set([A, B]));
    expect(r.repetido).toHaveLength(2);
    expect(r.repetido.map(l => l.indice)).toEqual([0, 1]);
    expect(r.atualiza.map(l => l.codigo)).toEqual([B]);
  });

  it('repetido vence "não encontrado" — a contradição é o problema maior', () => {
    const r = classificarPorCodigo([{ codigo: C }, { codigo: C }], new Set());
    expect(r.repetido).toHaveLength(2);
    expect(r.naoEncontrado).toHaveLength(0);
  });

  it('a mesma linha aparece uma vez só em "todas", com o índice da planilha', () => {
    const r = classificarPorCodigo([{ codigo: A }, { codigo: '' }, { codigo: 'abc' }], new Set([A]));
    expect(r.todas).toHaveLength(3);
    expect(r.todas.map(l => l.indice)).toEqual([0, 1, 2]);
    expect(r.todas.map(l => l.balde)).toEqual(['atualiza', 'sem_codigo', 'nao_encontrado']);
  });

  it('arquivoInteiroSemCodigo é verdadeiro só quando NINGUÉM trouxe código', () => {
    expect(classificarPorCodigo([{ codigo: '' }, {}], new Set()).arquivoInteiroSemCodigo).toBe(true);
    expect(classificarPorCodigo([{ codigo: '' }, { codigo: A }], new Set([A])).arquivoInteiroSemCodigo).toBe(false);
    // Texto inválido CONTA como ter trazido código: o arquivo não é de base nova, é uma
    // volta de exportação com uma célula estragada.
    expect(classificarPorCodigo([{ codigo: 'abc' }], new Set()).arquivoInteiroSemCodigo).toBe(false);
  });

  it('arquivo vazio não quebra', () => {
    const r = classificarPorCodigo([], new Set());
    expect(r.todas).toHaveLength(0);
    expect(r.arquivoInteiroSemCodigo).toBe(true);
  });
});
