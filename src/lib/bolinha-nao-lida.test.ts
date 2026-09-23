import { describe, it, expect } from 'vitest';
import { estadoDaBolinha } from './bolinha-nao-lida';

describe('estadoDaBolinha', () => {
  it('há mensagem nova: mostra o número', () => {
    expect(estadoDaBolinha(3, false)).toBe('numero');
    expect(estadoDaBolinha(3, true)).toBe('numero'); // número vence a marca
  });
  it('sem mensagem nova, mas marcada à mão: mostra a bolinha', () => {
    expect(estadoDaBolinha(0, true)).toBe('ponto');
  });
  it('nada a mostrar', () => {
    expect(estadoDaBolinha(0, false)).toBe('nada');
  });
});
