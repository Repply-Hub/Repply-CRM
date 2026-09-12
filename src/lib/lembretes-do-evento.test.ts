import { describe, it, expect } from 'vitest';
import { LEMBRETES_PADRAO, normalizarLembretes, rotuloDoLembrete } from './lembretes-do-evento';

describe('lembretes do evento', () => {
  it('o padrão é 1 dia e 1 hora antes — decisão do dono do produto', () => {
    expect([...LEMBRETES_PADRAO]).toEqual([1440, 60]);
  });

  it('ordena do mais cedo para o mais tarde e tira repetido', () => {
    expect(normalizarLembretes([60, 1440, 60, 15])).toEqual([1440, 60, 15]);
  });

  it('descarta zero, negativo e fração', () => {
    expect(normalizarLembretes([0, -5, 12.5, 30])).toEqual([30]);
  });

  it('para em 5', () => {
    expect(normalizarLembretes([1, 2, 3, 4, 5, 6])).toEqual([6, 5, 4, 3, 2]);
  });

  it.each([
    [1440, '1 dia antes'], [2880, '2 dias antes'], [60, '1 hora antes'],
    [120, '2 horas antes'], [15, '15 minutos antes'], [1, '1 minuto antes'], [90, '90 minutos antes'],
  ])('%i → %s', (min, rotulo) => expect(rotuloDoLembrete(min)).toBe(rotulo));
});
