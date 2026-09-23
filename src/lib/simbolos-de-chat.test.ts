import { describe, it, expect } from 'vitest';
import { SIMBOLOS_DE_CHAT, simboloDoCatalogo } from './simbolos-de-chat';

describe('SIMBOLOS_DE_CHAT', () => {
  it('tem 10 símbolos com chaves únicas', () => {
    expect(SIMBOLOS_DE_CHAT).toHaveLength(10);
    const chaves = SIMBOLOS_DE_CHAT.map((s) => s.chave);
    expect(new Set(chaves).size).toBe(10);
  });
  it('o balão de chat está na lista (padrão do Geral)', () => {
    expect(SIMBOLOS_DE_CHAT.some((s) => s.chave === 'balao')).toBe(true);
  });
  it('chave conhecida devolve o símbolo; desconhecida/nula devolve null', () => {
    expect(simboloDoCatalogo('lampada')?.chave).toBe('lampada');
    expect(simboloDoCatalogo('nao-existe')).toBeNull();
    expect(simboloDoCatalogo(null)).toBeNull();
    expect(simboloDoCatalogo(undefined)).toBeNull();
  });
});
