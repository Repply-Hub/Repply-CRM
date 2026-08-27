import { describe, it, expect } from 'vitest';
import { calcularDiffDeVinculos } from './obra-contatos-diff';

/**
 * O vínculo obra↔contato é gravado mandando a lista COMPLETA, e o que não está
 * nela é apagado. Este teste fixa esse contrato — em especial o caso que apaga
 * dado sem o usuário pedir, se alguém trocar a semântica de "lista vazia".
 */
describe('calcularDiffDeVinculos', () => {
  it('lista igual não escreve nada', () => {
    expect(calcularDiffDeVinculos(['a', 'b'], ['b', 'a'])).toEqual({ inserir: [], remover: [] });
  });

  it('acrescenta só o que falta', () => {
    expect(calcularDiffDeVinculos(['a'], ['a', 'b'])).toEqual({ inserir: ['b'], remover: [] });
  });

  it('remove só o que saiu', () => {
    expect(calcularDiffDeVinculos(['a', 'b'], ['a'])).toEqual({ inserir: [], remover: ['b'] });
  });

  it('troca completa: entra um, sai o outro', () => {
    expect(calcularDiffDeVinculos(['a'], ['b'])).toEqual({ inserir: ['b'], remover: ['a'] });
  });

  it('🔴 lista desejada VAZIA desvincula todos — é este o caso que apaga dado', () => {
    // É por isso que a tela precisa distinguir "o usuário desmarcou tudo" de
    // "a lista ainda não carregou": as duas chegariam aqui como [] e a segunda
    // apagaria vínculos que ninguém mandou apagar.
    expect(calcularDiffDeVinculos(['a', 'b', 'c'], [])).toEqual({
      inserir: [],
      remover: ['a', 'b', 'c'],
    });
  });

  it('sem vínculo nenhum e nada escolhido não faz escrita', () => {
    expect(calcularDiffDeVinculos([], [])).toEqual({ inserir: [], remover: [] });
  });

  it('id repetido na escolha não vira duas inserções', () => {
    expect(calcularDiffDeVinculos([], ['a', 'a'])).toEqual({ inserir: ['a'], remover: [] });
  });
});
