import { describe, it, expect } from 'vitest';
import { alvoDaChave, chaveDoAlvo, chaveDaMensagemDoChat, alvoInicialDaUrl } from './alvo-do-chat';

const ID = '3f2a8c10-5b7d-4e21-9a6f-0c4d2e8b7a91'; // inventado
const OUTRO_ID = '8b1e4f2a-9c3d-4a7e-b6f1-2d5c8a0e9b34'; // inventado

describe('alvo do chat', () => {
  it('lê as três chaves', () => {
    expect(alvoDaChave('geral')).toEqual({ type: 'geral' });
    expect(alvoDaChave(`grupo_${ID}`)).toEqual({ type: 'grupo', grupoId: ID });
    expect(alvoDaChave(`dm_${ID}`)).toEqual({ type: 'dm', memberId: ID, recipientId: ID });
  });

  it('recusa o que não é chave', () => {
    expect(alvoDaChave('grupo_')).toBeNull();
    expect(alvoDaChave('qualquer')).toBeNull();
    expect(alvoDaChave(null)).toBeNull();
  });

  it('ida e volta', () => {
    for (const chave of ['geral', `grupo_${ID}`, `dm_${ID}`]) {
      expect(chaveDoAlvo(alvoDaChave(chave)!)).toBe(chave);
    }
  });
});

describe('chaveDaMensagemDoChat', () => {
  it('mensagem de grupo vira grupo_<id>, mesmo com recipient_id preenchido', () => {
    expect(
      chaveDaMensagemDoChat({ grupo_id: ID, recipient_id: OUTRO_ID, usuario_id: OUTRO_ID }),
    ).toBe(`grupo_${ID}`);
  });

  it('mensagem direta vira dm_<usuario_id> — o remetente é o outro lado da conversa', () => {
    expect(
      chaveDaMensagemDoChat({ grupo_id: null, recipient_id: ID, usuario_id: OUTRO_ID }),
    ).toBe(`dm_${OUTRO_ID}`);
  });

  it('sem grupo nem destinatário direto, é o Geral', () => {
    expect(
      chaveDaMensagemDoChat({ grupo_id: null, recipient_id: null, usuario_id: OUTRO_ID }),
    ).toBe('geral');
  });

  it('a chave que produz é a mesma que alvoDaChave sabe ler de volta', () => {
    const chave = chaveDaMensagemDoChat({ grupo_id: ID, recipient_id: null, usuario_id: OUTRO_ID });
    expect(alvoDaChave(chave)).toEqual({ type: 'grupo', grupoId: ID });
  });
});

describe('alvoInicialDaUrl', () => {
  it('chave válida vira alvo', () => {
    expect(alvoInicialDaUrl(`dm_${ID}`)).toEqual({ type: 'dm', memberId: ID, recipientId: ID });
    expect(alvoInicialDaUrl('geral')).toEqual({ type: 'geral' });
  });

  it('sem parâmetro, ou parâmetro inválido, não decide nada', () => {
    expect(alvoInicialDaUrl(null)).toBeNull();
    expect(alvoInicialDaUrl('')).toBeNull();
    expect(alvoInicialDaUrl('lixo')).toBeNull();
  });
});
