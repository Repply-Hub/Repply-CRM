import { describe, it, expect } from 'vitest';
import { periodoDoCalendario } from './periodo-do-calendario';

/** Quarta-feira, 27/08/2026 — o meio de uma semana e o meio de um mês. */
const QUARTA = new Date(2026, 7, 27);

const dia = (d: Date) => d.toISOString().slice(0, 10);

describe('periodoDoCalendario', () => {
  it('no modo DIA cobre o dia inteiro, com folga', () => {
    const { de, ate } = periodoDoCalendario('dia', QUARTA);
    expect(de.getTime()).toBeLessThanOrEqual(QUARTA.getTime());
    expect(ate.getTime()).toBeGreaterThan(QUARTA.getTime());
  });

  it('no modo SEMANA cobre a semana toda, não só o dia', () => {
    const { de, ate } = periodoDoCalendario('semana', QUARTA);
    // Sete dias inteiros. O fim é 23:59:59.999, então a diferença é 7 dias menos 1ms.
    expect((ate.getTime() - de.getTime()) / 86_400_000).toBeGreaterThan(6.9);
  });

  it('no modo MÊS cobre as seis semanas que a grade desenha', () => {
    // A grade de mês mostra dias do mês anterior e do seguinte para fechar as semanas.
    // Recortar exatamente no primeiro e no último dia do mês deixaria essas bordas vazias.
    const { de, ate } = periodoDoCalendario('mes', QUARTA);
    expect(de.getDate()).toBeGreaterThan(20); // caiu em julho
    expect(de.getMonth()).toBe(6);
    expect(ate.getMonth()).toBe(8); // chega a setembro
  });

  it('🔴 o começo é sempre ANTES do fim', () => {
    for (const modo of ['dia', 'semana', 'mes'] as const) {
      const { de, ate } = periodoDoCalendario(modo, QUARTA);
      expect(de.getTime()).toBeLessThan(ate.getTime());
    }
  });

  it('vira texto de data pura, do jeito que o banco compara', () => {
    const { deTexto, ateTexto } = periodoDoCalendario('semana', QUARTA);
    expect(deTexto).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(ateTexto).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(deTexto < ateTexto).toBe(true);
  });

  it('🔴 a semana começa na SEGUNDA, como a grade desenha', () => {
    // `getWeekDays` usa `weekStartsOn: 1` (calendarUtils.ts:14). Com o padrão do date-fns
    // (domingo) o recorte fica deslocado um dia, e o domingo — ÚLTIMO dia da grade — cai fora
    // do período buscado, aparecendo vazio toda semana.
    const { de, ate } = periodoDoCalendario('semana', new Date(2026, 7, 27)); // quinta
    expect(de.getDay()).toBe(1); // segunda
    expect(ate.getDay()).toBe(0); // domingo
  });

  it('a virada de mês não perde dias', () => {
    // Domingo, 1º de março de 2026: a semana dele começa na segunda, 23 de fevereiro.
    const { de } = periodoDoCalendario('semana', new Date(2026, 2, 1));
    expect(de.getMonth()).toBe(1);
  });

  it('a virada de ANO não perde dias', () => {
    const { de, ate } = periodoDoCalendario('mes', new Date(2026, 0, 15));
    expect(de.getFullYear()).toBe(2025);
    expect(ate.getFullYear()).toBe(2026);
  });

  it('o mesmo modo e a mesma data dão sempre o mesmo recorte', () => {
    // A chave da consulta é montada com estes textos: se variassem, a consulta refaria
    // a cada desenho da tela.
    const a = periodoDoCalendario('mes', QUARTA);
    const b = periodoDoCalendario('mes', new Date(2026, 7, 27));
    expect([a.deTexto, a.ateTexto]).toEqual([b.deTexto, b.ateTexto]);
  });

  it('dias diferentes do MESMO mês dão o mesmo recorte no modo mês', () => {
    // Sem isto, navegar de 5 para 6 de agosto refaria a consulta inteira à toa.
    const a = periodoDoCalendario('mes', new Date(2026, 7, 5));
    const b = periodoDoCalendario('mes', new Date(2026, 7, 6));
    expect([a.deTexto, a.ateTexto]).toEqual([b.deTexto, b.ateTexto]);
  });
});
