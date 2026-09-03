import { describe, it, expect } from 'vitest';
import { formatarTelefone, apenasDigitosTelefone } from './telefone';

describe('formatarTelefone', () => {
  it('formata celular de 11 dígitos como +55 (99) 99999-9999', () => {
    expect(formatarTelefone('84999998888')).toBe('+55 (84) 99999-8888');
  });

  it('formata fixo de 10 dígitos como +55 (99) 9999-9999 — não enfia o nono dígito', () => {
    // O caso do CLAUDE.md §7.1: fixo com WhatsApp não pode virar celular.
    expect(formatarTelefone('8420300387')).toBe('+55 (84) 2030-0387');
  });

  it('remove o 55 do código de país quando o valor já vem com DDI', () => {
    expect(formatarTelefone('5584999998888')).toBe('+55 (84) 99999-8888');
    expect(formatarTelefone('+55 84 99999-8888')).toBe('+55 (84) 99999-8888');
  });

  it('preserva o DDD 55 (Rio Grande do Sul) quando não há código de país', () => {
    expect(formatarTelefone('5599999888')).toBe('+55 (55) 9999-9888');
    expect(formatarTelefone('55999998888')).toBe('+55 (55) 99999-8888');
  });

  it('formata parcialmente enquanto digita', () => {
    expect(formatarTelefone('8')).toBe('+55 (8');
    expect(formatarTelefone('84')).toBe('+55 (84');
    expect(formatarTelefone('849')).toBe('+55 (84) 9');
    expect(formatarTelefone('84999')).toBe('+55 (84) 999');
    expect(formatarTelefone('8499999')).toBe('+55 (84) 9999-9');
  });

  it('é idempotente: parte do próprio valor já mascarado sem duplicar nada', () => {
    expect(formatarTelefone('+55 (84) 99999-8888')).toBe('+55 (84) 99999-8888');
  });

  it('descarta o que passa de 11 dígitos nacionais em vez de recusar', () => {
    expect(formatarTelefone('8499999888812345')).toBe('+55 (84) 99999-8888');
  });

  it('string vazia continua vazia (campo apagado não vira "+55 (")', () => {
    expect(formatarTelefone('')).toBe('');
    expect(formatarTelefone(null)).toBe('');
  });
});

describe('apenasDigitosTelefone', () => {
  it('devolve só o número nacional, sem o 55 do código de país', () => {
    expect(apenasDigitosTelefone('+55 (84) 99999-8888')).toBe('84999998888');
    expect(apenasDigitosTelefone('5584999998888')).toBe('84999998888');
  });

  it('limita a 11 dígitos nacionais', () => {
    expect(apenasDigitosTelefone('(84) 99999-8888 ramal 2')).toBe('84999998888');
  });
});
