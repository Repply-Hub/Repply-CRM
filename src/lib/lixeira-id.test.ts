import { describe, it, expect } from 'vitest';
import { idDaLixeira } from '../../supabase/functions/_shared/lixeira';

describe('idDaLixeira', () => {
  it('acha a lixeira pelo atributo \\trash, mesmo com id opaco (Microsoft)', () => {
    const pastas = [
      { pasta_id: 'AAMkAGI1', atributos: ['\\trash'] },
      { pasta_id: 'AAMkAGI2', atributos: ['\\inbox'] },
    ];
    expect(idDaLixeira(pastas)).toBe('AAMkAGI1');
  });

  it('sem atributo em nenhuma pasta, cai para o id literal TRASH (Gmail)', () => {
    const pastas = [
      { pasta_id: 'INBOX', atributos: [] },
      { pasta_id: 'TRASH', atributos: [] },
    ];
    expect(idDaLixeira(pastas)).toBe('TRASH');
  });

  it('ignora pastas com outros atributos de sistema (\\inbox, \\spam)', () => {
    const pastas = [
      { pasta_id: 'INBOX', atributos: ['\\inbox'] },
      { pasta_id: 'SPAM', atributos: ['\\spam'] },
    ];
    expect(idDaLixeira(pastas)).toBeNull();
  });

  it('lista vazia devolve null', () => {
    expect(idDaLixeira([])).toBeNull();
  });

  it('atributo é lido sem diferenciar maiúscula/minúscula', () => {
    const pastas = [{ pasta_id: 'Label_9', atributos: ['\\Trash'] }];
    expect(idDaLixeira(pastas)).toBe('Label_9');
  });

  it('pasta sem atributos (undefined) não quebra a busca', () => {
    const pastas = [
      { pasta_id: 'INBOX' },
      { pasta_id: 'TRASH', atributos: null },
    ];
    expect(idDaLixeira(pastas)).toBe('TRASH');
  });
});
