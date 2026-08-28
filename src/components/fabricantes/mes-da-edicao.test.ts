import { describe, it, expect } from 'vitest';
import { MESES, ANO_INTEIRO, mesParaSelect, selectParaMes } from './mes-da-edicao';

describe('mês da edição', () => {
  it('leva o nulo do banco para "o ano inteiro" e traz de volta como nulo', () => {
    // O ida-e-volta é o que importa: se uma das pontas escorregar, catálogo anual vira
    // janeiro e sobe indevidamente na ordem da prateleira.
    expect(mesParaSelect(null)).toBe(ANO_INTEIRO);
    expect(mesParaSelect(undefined)).toBe(ANO_INTEIRO);
    expect(selectParaMes(ANO_INTEIRO)).toBeNull();
  });

  it('preserva o mês nas duas direções', () => {
    for (const m of MESES) {
      const numero = Number(m.v);
      expect(mesParaSelect(numero)).toBe(m.v);
      expect(selectParaMes(m.v)).toBe(numero);
    }
  });

  it('oferece os doze meses, de janeiro a dezembro', () => {
    expect(MESES).toHaveLength(12);
    expect(MESES[0].l).toBe('Janeiro');
    expect(MESES[11].l).toBe('Dezembro');
  });
});
