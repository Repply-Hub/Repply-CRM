import { describe, it, expect } from 'vitest';
import { CORES_DE_CHAT, COR_FUNDO_PADRAO, COR_ICONE_PADRAO } from './cores-de-chat';

describe('CORES_DE_CHAT', () => {
  it('tem 8 pares com nomes únicos e hex válido', () => {
    expect(CORES_DE_CHAT).toHaveLength(8);
    expect(new Set(CORES_DE_CHAT.map((c) => c.nome)).size).toBe(8);
    for (const c of CORES_DE_CHAT) {
      expect(c.fundo).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(c.icone).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
  it('as cores padrão são hex válido', () => {
    expect(COR_FUNDO_PADRAO).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(COR_ICONE_PADRAO).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });
});
