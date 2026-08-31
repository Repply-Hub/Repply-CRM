import { describe, it, expect } from 'vitest';
import { getMessageTemplate } from './use-whatsapp';

/**
 * 🔴 O texto de relacionamento dizia "Sou da MD Representações" — chumbado, para as dez
 * empresas assinantes. Não é texto interno: ele abre o WhatsApp já preenchido, com destino ao
 * CLIENTE do representante. Uma empresa se apresentando com o nome de outra.
 *
 * (Conferido em 31/08/2026: os dois pontos que usavam esse atalho são código morto hoje —
 * `openWhatsAppForNotification` nunca é chamada e `WhatsAppQuickAction` não é importada em
 * lugar nenhum. O texto foi corrigido mesmo assim, para o dia em que alguém religar o botão.)
 */
describe('getMessageTemplate', () => {
  it('🔴 apresenta a empresa de quem escreve, não uma cravada no código', () => {
    const msg = getMessageTemplate('relacionamento', 'Construtora Meridiano', 'JHS Representações');
    expect(msg).toContain('Sou da JHS Representações');
    expect(msg).toContain('Construtora Meridiano');
    expect(msg).not.toMatch(/MD Representa/);
  });

  it('🔴 sem nome de empresa, a frase perde a apresentação em vez de inventar uma', () => {
    const msg = getMessageTemplate('relacionamento', 'Construtora Meridiano');
    expect(msg).not.toMatch(/Sou da/);
    expect(msg).toContain('Construtora Meridiano');
    expect(msg.startsWith('Olá!')).toBe(true);
  });

  it('a cobrança nunca citou empresa nenhuma, e continua assim', () => {
    const msg = getMessageTemplate('cobranca', 'Construtora Meridiano', 'JHS Representações');
    expect(msg).toContain('Construtora Meridiano');
    expect(msg).not.toMatch(/JHS/);
  });
});
