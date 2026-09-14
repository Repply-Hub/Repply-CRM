import { describe, it, expect } from 'vitest';
import { dataDoEndereco } from './data-do-endereco';

describe('dataDoEndereco', () => {
  it('lê AAAA-MM-DD como dia local', () => {
    const d = dataDoEndereco('2026-09-16')!;
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 8, 16]);
  });

  it('recusa data que não existe', () => {
    expect(dataDoEndereco('2026-02-30')).toBeNull();
  });

  it('recusa formato errado e vazio', () => {
    expect(dataDoEndereco('16/09/2026')).toBeNull();
    expect(dataDoEndereco('')).toBeNull();
    expect(dataDoEndereco(null)).toBeNull();
  });
});
