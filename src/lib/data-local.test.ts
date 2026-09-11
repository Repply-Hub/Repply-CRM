import { describe, it, expect } from 'vitest';
import { hojeLocal, formatarDataBR } from './data-local';

/**
 * POR QUE ESTE ARQUIVO EXISTE
 *
 * Duas conversões de data que viram outro dia quando feitas em UTC — e o JavaScript faz em UTC
 * justamente nos dois idiomas mais digitados deste projeto (CLAUDE.md §7.12):
 *
 *   · "hoje" como texto: `new Date().toISOString().slice(0, 10)` é a data em UTC. Das 21h à
 *     meia-noite, no horário de Brasília, já é amanhã — o cadastro gravava a "Data de criação"
 *     de amanhã, e os arquivos exportados saíam com a data de amanhã no nome.
 *   · carimbo do banco (`created_at`, com fuso) mostrado como data: recortar os 10 primeiros
 *     caracteres pega o dia em UTC. Um cliente criado às 22h30 aparecia com o dia seguinte.
 */

// 22h30 de 11/09/2026 em Natal é 01h30 de 12/09 em UTC.
const NOITE_DE_11_09 = new Date('2026-09-12T01:30:00Z');

/**
 * 🔴 A PRECONDIÇÃO. Em UTC, os casos da noite passariam com o defeito de pé. `src/test/setup.ts`
 * crava `America/Fortaleza`; se alguém tirar, é aqui que avisa.
 */
describe('o fuso dos testes', () => {
  it('está atrás de UTC — o idioma antigo já diz 12/09 às 22h30 de 11/09', () => {
    expect(NOITE_DE_11_09.toISOString().slice(0, 10)).toBe('2026-09-12');
    expect(NOITE_DE_11_09.getDate()).toBe(11);
  });
});

describe('hojeLocal', () => {
  it('às 22h30 ainda é o dia de hoje, não o de amanhã', () => {
    expect(hojeLocal(NOITE_DE_11_09)).toBe('2026-09-11');
  });

  it('de dia não muda nada', () => {
    expect(hojeLocal(new Date('2026-09-11T14:00:00Z'))).toBe('2026-09-11');
  });

  it('às 23h de 31/12 ainda é o ano velho', () => {
    expect(hojeLocal(new Date('2027-01-01T02:00:00Z'))).toBe('2026-12-31');
  });
});

describe('formatarDataBR', () => {
  it('data seca AAAA-MM-DD é só reescrita, sem passar por fuso', () => {
    expect(formatarDataBR('2026-09-01')).toBe('01/09/2026');
  });

  it('carimbo UTC do banco vira o dia no fuso de quem olha', () => {
    // `created_at` de um cliente criado às 22h30 de 24/08 em Natal, como o Supabase devolve.
    expect(formatarDataBR('2026-08-25T01:30:00.123456+00:00')).toBe('24/08/2026');
  });

  it('carimbo de dia continua no mesmo dia', () => {
    expect(formatarDataBR('2026-08-25T14:30:00+00:00')).toBe('25/08/2026');
  });

  it('data com hora e sem fuso (como a importação grava) é lida como hora local', () => {
    expect(formatarDataBR('2024-03-15T10:30')).toBe('15/03/2024');
  });

  it('texto que não é data ISO volta como veio', () => {
    expect(formatarDataBR('15/03/2024')).toBe('15/03/2024');
  });

  it('vazio vira vazio', () => {
    expect(formatarDataBR(null)).toBe('');
    expect(formatarDataBR('')).toBe('');
  });
});
