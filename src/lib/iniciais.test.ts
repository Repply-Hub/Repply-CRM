import { describe, it, expect } from 'vitest';
import { iniciais } from './iniciais';

/**
 * O QUE ESTE ARQUIVO PRENDE: as letras do círculo da foto quando a pessoa não tem foto. Duas telas
 * desenham esse círculo — o campo de responsáveis do negócio e a tabela do time da tela "Hoje" —,
 * e a mesma pessoa não pode aparecer com letras diferentes em cada uma.
 */
describe('iniciais', () => {
  it('nome e sobrenome: a primeira letra de cada', () => {
    expect(iniciais('Ana Souza')).toBe('AS');
  });

  it('nome composto: a primeira do primeiro nome e a do último', () => {
    expect(iniciais('Ana Maria de Souza')).toBe('AS');
  });

  it('um nome só: as duas primeiras letras', () => {
    expect(iniciais('Ana')).toBe('AN');
  });

  it('espaços sobrando não viram letra', () => {
    expect(iniciais('  Bruno   Lima  ')).toBe('BL');
  });

  it('nome vazio vira interrogação, e não um círculo em branco', () => {
    expect(iniciais('')).toBe('?');
    expect(iniciais('   ')).toBe('?');
  });
});
