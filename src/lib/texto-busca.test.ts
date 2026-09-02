import { describe, it, expect } from 'vitest';
import { normalizarParaBusca, correspondeBusca } from './texto-busca';

describe('normalizarParaBusca', () => {
  it('tira acento, caixa e espaço das pontas', () => {
    expect(normalizarParaBusca('  Jerônimo  ')).toBe('jeronimo');
    expect(normalizarParaBusca('SÃO GONÇALO')).toBe('sao goncalo');
    expect(normalizarParaBusca('Aços & Cia')).toBe('acos & cia');
  });

  it('nulo e indefinido viram string vazia', () => {
    expect(normalizarParaBusca(null)).toBe('');
    expect(normalizarParaBusca(undefined)).toBe('');
  });
});

describe('correspondeBusca', () => {
  it('acha o nome com acento a partir do termo sem acento', () => {
    expect(correspondeBusca('Jerônimo - JM Distribuidora', 'jeronimo')).toBe(true);
    expect(correspondeBusca('Construtora São José', 'sao jose')).toBe(true);
  });

  it('funciona nos dois sentidos: termo com acento, alvo sem', () => {
    expect(correspondeBusca('sao paulo', 'São')).toBe(true);
  });

  it('termo vazio casa com qualquer coisa', () => {
    expect(correspondeBusca('qualquer', '')).toBe(true);
    expect(correspondeBusca('qualquer', '   ')).toBe(true);
    expect(correspondeBusca(null, '')).toBe(true);
  });

  it('termo que não está no alvo não casa', () => {
    expect(correspondeBusca('Jerônimo', 'maria')).toBe(false);
  });
});
