import { describe, it, expect } from 'vitest';
import { telefoneDaReceita } from './cnpj';

/**
 * O telefone que a consulta de CNPJ traz da Receita.
 *
 * 🔴 POR QUE ISTO EXISTE (relatado pelo Lucas em 11/09/2026: "achei estranho o telefone que
 * puxou"). O BrasilAPI devolve o telefone só em dígitos, com o DDD grudado no número — a
 * Petrobras volta como `ddd_telefone_1: "2121660000"`, medido em 11/09/2026. As telas de
 * Clientes e Fabricantes jogavam esse texto cru no campo, e a pessoa via `2121660000`.
 */
describe('telefoneDaReceita', () => {
  it('formata o fixo que a Receita devolve em dígitos, com o DDD grudado', () => {
    expect(telefoneDaReceita({ ddd_telefone_1: '2121660000' })).toBe('(21) 2166-0000');
  });

  it('formata o celular de onze dígitos', () => {
    expect(telefoneDaReceita({ ddd_telefone_1: '84999887766' })).toBe('(84) 99988-7766');
  });

  it('telefone ausente na Receita vira campo vazio, e não o texto "undefined"', () => {
    expect(telefoneDaReceita({ ddd_telefone_1: '' })).toBe('');
    expect(telefoneDaReceita({ ddd_telefone_1: undefined as unknown as string })).toBe('');
  });

  it('formato que não é telefone brasileiro volta como veio, sem inventar número', () => {
    // A própria Receita guarda lixo em alguns cadastros: o fax da Petrobras volta "213224".
    expect(telefoneDaReceita({ ddd_telefone_1: '213224' })).toBe('213224');
  });
});
