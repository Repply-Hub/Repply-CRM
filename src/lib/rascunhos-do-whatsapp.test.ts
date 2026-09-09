import { describe, it, expect, beforeEach } from 'vitest';
import {
  lerRascunhos, gravarRascunho, limparRascunho, podarRascunhos,
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
