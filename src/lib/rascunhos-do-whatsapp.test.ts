import { describe, it, expect, beforeEach } from 'vitest';
import {
  lerRascunhos, gravarRascunho, limparRascunho, podarRascunhos, comRascunhoNoTopo,
} from './rascunhos-do-whatsapp';

beforeEach(() => localStorage.clear());

describe('rascunhos do whatsapp', () => {
  it('começa vazio', () => {
    expect(lerRascunhos('u1')).toEqual({});
  });

  it('guarda e devolve por conversa', () => {
    gravarRascunho('u1', 'c1', 'oi');
    gravarRascunho('u1', 'c2', 'tudo bem?');
    expect(lerRascunhos('u1')).toEqual({ c1: 'oi', c2: 'tudo bem?' });
  });

  it('não mistura duas pessoas no mesmo computador', () => {
    gravarRascunho('u1', 'c1', 'da Silvia');
    gravarRascunho('u2', 'c1', 'do Daniel');
    expect(lerRascunhos('u1')).toEqual({ c1: 'da Silvia' });
    expect(lerRascunhos('u2')).toEqual({ c1: 'do Daniel' });
  });

  it('texto vazio apaga o rascunho em vez de guardar string vazia', () => {
    gravarRascunho('u1', 'c1', 'oi');
    gravarRascunho('u1', 'c1', '   ');
    expect(lerRascunhos('u1')).toEqual({});
  });

  it('limpar remove só aquela conversa', () => {
    gravarRascunho('u1', 'c1', 'a');
    gravarRascunho('u1', 'c2', 'b');
    expect(limparRascunho('u1', 'c1')).toEqual({ c2: 'b' });
  });

  it('podar descarta rascunho de conversa que não existe mais', () => {
    gravarRascunho('u1', 'c1', 'a');
    gravarRascunho('u1', 'sumiu', 'b');
    expect(podarRascunhos('u1', ['c1'])).toEqual({ c1: 'a' });
  });

  it('podar não faz nada quando a lista de conversas ainda não chegou', () => {
    gravarRascunho('u1', 'c1', 'a');
    expect(podarRascunhos('u1', [])).toEqual({ c1: 'a' });
  });

  it('aguenta lixo gravado no armazenamento', () => {
    localStorage.setItem('repply_wa_rascunhos_u1', 'isto não é json');
    expect(lerRascunhos('u1')).toEqual({});
  });
});

describe('comRascunhoNoTopo', () => {
  // A ordem que chega já vem do banco: mais recente primeiro.
  const lista = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];

  it('sem rascunho nenhum, devolve o MESMO array', () => {
    expect(comRascunhoNoTopo(lista, {})).toBe(lista);
  });

  it('quem tem rascunho sobe', () => {
    expect(comRascunhoNoTopo(lista, { c: 'oi' }).map((x) => x.id))
      .toEqual(['c', 'a', 'b', 'd']);
  });

  it('preserva a ordem original entre os que têm rascunho', () => {
    expect(comRascunhoNoTopo(lista, { d: 'x', b: 'y' }).map((x) => x.id))
      .toEqual(['b', 'd', 'a', 'c']);
  });

  it('preserva a ordem original entre os que não têm', () => {
    expect(comRascunhoNoTopo(lista, { a: 'x' }).map((x) => x.id))
      .toEqual(['a', 'b', 'c', 'd']);
  });

  it('todo mundo com rascunho não embaralha nada', () => {
    expect(comRascunhoNoTopo(lista, { a: '1', b: '2', c: '3', d: '4' }).map((x) => x.id))
      .toEqual(['a', 'b', 'c', 'd']);
  });

  it('não altera a lista que recebeu', () => {
    const copia = [...lista];
    comRascunhoNoTopo(lista, { d: 'x' });
    expect(lista).toEqual(copia);
  });
});
