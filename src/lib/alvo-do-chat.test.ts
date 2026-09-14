import { describe, it, expect } from 'vitest';
import { alvoDaChave, chaveDoAlvo } from './alvo-do-chat';

const ID = '3f2a8c10-5b7d-4e21-9a6f-0c4d2e8b7a91'; // inventado

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
