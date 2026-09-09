import { describe, it, expect } from 'vitest';
import { ehIndecifravel } from './mensagem-indecifravel';

describe('ehIndecifravel', () => {
  it('reconhece as formas que a uazapi já mandou', () => {
    // As quatro variantes observadas em produção em 09/09/2026.
    expect(ehIndecifravel('[Undecryptable] [text] Não foi possível descriptografar a mensagem. Abra o WhatsApp no seu celular para visualizá-la.')).toBe(true);
    expect(ehIndecifravel('[Undecryptable] [reaction] Não foi possível descriptografar a mensagem.')).toBe(true);
    expect(ehIndecifravel('[Undecryptable] [media] [image] Não foi possível descriptografar a mensagem.')).toBe(true);
    expect(ehIndecifravel('[Undecryptable] [media] [view_once] Não foi possível descriptografar a mensagem.')).toBe(true);
  });

  it('não confunde com mensagem comum', () => {
    expect(ehIndecifravel('Bom dia, tem o orçamento do Quartzolit?')).toBe(false);
    expect(ehIndecifravel('[Imagem]')).toBe(false);
    expect(ehIndecifravel('')).toBe(false);
    expect(ehIndecifravel(null)).toBe(false);
    expect(ehIndecifravel(undefined)).toBe(false);
  });

  it('não depende de maiúscula', () => {
    expect(ehIndecifravel('[undecryptable] [text] qualquer coisa')).toBe(true);
  });
});
