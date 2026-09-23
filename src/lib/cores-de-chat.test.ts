import { describe, it, expect } from 'vitest';
import { CORES_DE_CHAT, COR_FUNDO_PADRAO, COR_ICONE_PADRAO } from './cores-de-chat';

describe('CORES_DE_CHAT', () => {
  it('tem 8 cores com nomes únicos e hex válido (claro e escuro)', () => {
    expect(CORES_DE_CHAT).toHaveLength(8);
    expect(new Set(CORES_DE_CHAT.map((c) => c.nome)).size).toBe(8);
    for (const c of CORES_DE_CHAT) {
      for (const hex of [c.fundo, c.icone, c.fundoEscuro, c.iconeEscuro]) {
        expect(hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    }
  });
  it('a versão escura tem o ícone branco', () => {
    for (const c of CORES_DE_CHAT) {
      expect(c.iconeEscuro.toUpperCase()).toBe('#FFFFFF');
    }
  });
  it('o padrão é o laranja escuro (fundo forte + ícone branco)', () => {
    expect(COR_FUNDO_PADRAO.toUpperCase()).toBe('#FF5A1F');
    expect(COR_ICONE_PADRAO.toUpperCase()).toBe('#FFFFFF');
  });
});
