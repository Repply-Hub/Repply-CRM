import { describe, expect, it } from 'vitest';
import { filtroDeLinkDaConversa } from './link-da-mencao';

describe('filtroDeLinkDaConversa', () => {
  it('conversa do Geral casa pelo link exato', () => {
    expect(filtroDeLinkDaConversa('chat', 'geral')).toEqual({
      tipo: 'igual',
      valor: '/chat?conversa=geral',
    });
  });

  it('grupo do chat leva o id do grupo no link', () => {
    expect(filtroDeLinkDaConversa('chat', 'grupo_abc-123')).toEqual({
      tipo: 'igual',
      valor: '/chat?conversa=grupo_abc-123',
    });
  });

  it('nota do WhatsApp casa pelo começo do link, com curinga no fim (cada nota tem seu mensagemId)', () => {
    expect(filtroDeLinkDaConversa('whatsapp_nota', 'conversa-exemplo')).toEqual({
      tipo: 'comeca_com',
      valor: '/whatsapp?conversaId=conversa-exemplo&mensagemId=%',
    });
  });
});
