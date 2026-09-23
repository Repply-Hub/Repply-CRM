import { describe, it, expect } from 'vitest';
import { SIMBOLOS_DE_CHAT, simboloDoCatalogo } from './simbolos-de-chat';

describe('SIMBOLOS_DE_CHAT', () => {
  it('tem 15 símbolos com chaves únicas', () => {
    expect(SIMBOLOS_DE_CHAT).toHaveLength(15);
    const chaves = SIMBOLOS_DE_CHAT.map((s) => s.chave);
    expect(new Set(chaves).size).toBe(15);
  });
  it('o balão de chat está na lista (padrão do Geral)', () => {
    expect(SIMBOLOS_DE_CHAT.some((s) => s.chave === 'balao')).toBe(true);
  });
  it('inclui símbolos de obra/construção', () => {
    for (const chave of ['capacete', 'martelo', 'regua', 'predio', 'caminhao']) {
      expect(SIMBOLOS_DE_CHAT.some((s) => s.chave === chave)).toBe(true);
    }
  });
  it('chave conhecida devolve o símbolo; desconhecida/nula devolve null', () => {
    expect(simboloDoCatalogo('lampada')?.chave).toBe('lampada');
    expect(simboloDoCatalogo('nao-existe')).toBeNull();
    expect(simboloDoCatalogo(null)).toBeNull();
    expect(simboloDoCatalogo(undefined)).toBeNull();
  });
});
