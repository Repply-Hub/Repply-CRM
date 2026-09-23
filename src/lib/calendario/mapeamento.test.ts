import { describe, it, expect } from 'vitest';
import { paraGoogle, paraRepply } from './mapeamento';

describe('mapeamento evento Repply ↔ Google', () => {
  it('evento com hora vira dateTime com fuso, e volta igual', () => {
    const e = {
      titulo: 'Visita obra', descricao: 'levar catálogo',
      inicio: '2026-10-05T13:00:00.000Z', fim: '2026-10-05T14:00:00.000Z', diaInteiro: false,
    };
    const g = paraGoogle(e, 'America/Sao_Paulo');
    expect(g.summary).toBe('Visita obra');
    expect(g.start.dateTime).toBe('2026-10-05T13:00:00.000Z');
    expect(g.start.timeZone).toBe('America/Sao_Paulo');
    expect(g.end.dateTime).toBe('2026-10-05T14:00:00.000Z');
    expect(g.start.date).toBeUndefined();

    const volta = paraRepply(g);
    expect(volta.diaInteiro).toBe(false);
    expect(volta.inicio).toBe('2026-10-05T13:00:00.000Z');
    expect(volta.fim).toBe('2026-10-05T14:00:00.000Z');
  });

  it('dia inteiro: Google usa data-fim EXCLUSIVA (dia seguinte)', () => {
    const e = {
      titulo: 'Feriado', descricao: null,
      inicio: '2026-10-05T00:00:00.000Z', fim: '2026-10-05T23:59:59.000Z', diaInteiro: true,
    };
    const g = paraGoogle(e, 'America/Sao_Paulo');
    expect(g.start.date).toBe('2026-10-05');
    expect(g.end.date).toBe('2026-10-06'); // exclusiva: dia seguinte
    expect(g.start.dateTime).toBeUndefined();
    expect(g.start.timeZone).toBeUndefined();
  });

  it('dia inteiro volta do Google: subtrai 1 dia do fim exclusivo', () => {
    const g = { summary: 'Feriado', start: { date: '2026-10-05' }, end: { date: '2026-10-06' } };
    const volta = paraRepply(g);
    expect(volta.diaInteiro).toBe(true);
    expect(volta.inicio).toBe('2026-10-05T00:00:00.000Z');
    expect(volta.fim).toBe('2026-10-05T23:59:59.000Z'); // último dia real
  });

  it('descrição vazia não vira "undefined" no Google', () => {
    const g = paraGoogle({ titulo: 'X', descricao: null, inicio: '2026-10-05T13:00:00.000Z', fim: '2026-10-05T14:00:00.000Z', diaInteiro: false }, 'America/Sao_Paulo');
    expect(g.description).toBeUndefined();
  });
});
