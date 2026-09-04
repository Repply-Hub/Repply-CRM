import { describe, it, expect } from 'vitest';
import { podeGerenciarFigurinhas } from './figurinha';

/**
 * Tirar uma figurinha da grade some com ela para TODOS que atendem o número. Este teste
 * guarda a lista de quem pode — ela precisa continuar igual à da política
 * `wa_figurinhas_update` no banco. Se alguém acrescentar um papel aqui e esquecer o banco,
 * o "x" aparece na tela e o clique é recusado.
 */
describe('podeGerenciarFigurinhas', () => {
  it('deixa quem manda na empresa', () => {
    expect(podeGerenciarFigurinhas('empresa')).toBe(true);
    expect(podeGerenciarFigurinhas('gestor')).toBe(true);
    expect(podeGerenciarFigurinhas('admin')).toBe(true);
  });

  it('não deixa o vendedor', () => {
    expect(podeGerenciarFigurinhas('vendedor')).toBe(false);
  });

  // Sem papel carregado ainda, a resposta é "não pode" — nunca "pode por enquanto".
  // O perfil chega depois da tela, e o padrão precisa ser o lado seguro.
  it('não deixa quando o papel ainda não chegou', () => {
    expect(podeGerenciarFigurinhas(null)).toBe(false);
    expect(podeGerenciarFigurinhas(undefined)).toBe(false);
    expect(podeGerenciarFigurinhas('')).toBe(false);
  });

  // Papel desconhecido (um que venha a existir no banco antes de existir aqui) também
  // cai no lado seguro em vez de virar gestor por acidente.
  it('não deixa papel que não conhece', () => {
    expect(podeGerenciarFigurinhas('Gestor')).toBe(false);
    expect(podeGerenciarFigurinhas('supervisor')).toBe(false);
  });
});
