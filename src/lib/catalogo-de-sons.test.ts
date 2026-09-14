import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CATALOGO_DE_SONS, SOM_PADRAO, somDoCatalogo } from './catalogo-de-sons';

describe('catálogo de sons', () => {
  it('o primeiro é o padrão de hoje', () => {
    expect(CATALOGO_DE_SONS[0]).toMatchObject({ id: SOM_PADRAO, rotulo: 'Padrão', arquivo: '/sons/notificacao.mp3' });
  });

  it('tem os 10 sons, na ordem da tela', () => {
    expect(CATALOGO_DE_SONS.map((s) => s.rotulo)).toEqual([
      'Padrão', 'Toque suave', 'Plim', 'Cristal', 'Arpejo', 'Pop', 'Marimba', 'Sino', 'Gota', 'Bipe duplo',
    ]);
  });

  it('ids não se repetem', () => {
    const ids = CATALOGO_DE_SONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('🔴 nenhum endereço tem acento ou espaço — quebram em servidor e cache', () => {
    for (const s of CATALOGO_DE_SONS) expect(s.arquivo).toMatch(/^\/sons\/[a-z0-9/-]+\.mp3$/);
  });

  it('🔴 todo arquivo do catálogo existe em public/ — senão a opção fica muda', () => {
    for (const s of CATALOGO_DE_SONS) expect(existsSync(join('public', s.arquivo))).toBe(true);
  });

  it('id desconhecido (som retirado no futuro) cai no padrão', () => {
    expect(somDoCatalogo('som-que-nao-existe').id).toBe(SOM_PADRAO);
    expect(somDoCatalogo(null).id).toBe(SOM_PADRAO);
    expect(somDoCatalogo(undefined).id).toBe(SOM_PADRAO);
  });

  it('id conhecido devolve o próprio som', () => {
    expect(somDoCatalogo('sino').arquivo).toBe('/sons/opcoes/sino.mp3');
  });
});
