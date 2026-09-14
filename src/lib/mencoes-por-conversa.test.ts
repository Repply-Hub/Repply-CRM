import { describe, it, expect } from 'vitest';
import { contarPorChave } from './mencoes-por-conversa';

describe('contarPorChave', () => {
  it('separa chat e WhatsApp, por conversa', () => {
    expect(
      contarPorChave([
        { id: '1', origem: 'chat', conversa_chave: 'geral' },
        { id: '2', origem: 'chat', conversa_chave: 'geral' },
        { id: '3', origem: 'chat', conversa_chave: 'grupo_g1' },
        { id: '4', origem: 'whatsapp_nota', conversa_chave: 'c9' },
      ]),
    ).toEqual({ chat: { geral: 2, grupo_g1: 1 }, whatsapp: { c9: 1 }, totalChat: 3, totalWhatsapp: 1 });
  });

  it('lista vazia', () => {
    expect(contarPorChave([])).toEqual({ chat: {}, whatsapp: {}, totalChat: 0, totalWhatsapp: 0 });
  });
});
