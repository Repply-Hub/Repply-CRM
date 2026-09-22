import { describe, it, expect } from 'vitest';
import { recusaDoAnexoDeTarefa, ehImagem, tamanhoLegivel, ordenarAnexos } from './anexos-de-tarefa';

const arq = (over: Partial<{ name: string; size: number; type: string }> = {}) => ({
  name: 'doc.pdf', size: 1024, type: 'application/pdf', ...over,
});

describe('recusaDoAnexoDeTarefa', () => {
  it('aceita PDF, imagem e arquivos de escritório', () => {
    expect(recusaDoAnexoDeTarefa(arq({ name: 'a.pdf', type: 'application/pdf' }))).toBeNull();
    expect(recusaDoAnexoDeTarefa(arq({ name: 'a.png', type: 'image/png' }))).toBeNull();
    expect(recusaDoAnexoDeTarefa(arq({ name: 'a.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }))).toBeNull();
    expect(recusaDoAnexoDeTarefa(arq({ name: 'a.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))).toBeNull();
    expect(recusaDoAnexoDeTarefa(arq({ name: 'a.zip', type: '' }))).toBeNull();
  });
  it('recusa acima de 15 MB, citando o limite', () => {
    const r = recusaDoAnexoDeTarefa(arq({ size: 20 * 1024 * 1024 }));
    expect(r).toContain('15');
  });
  it('recusa tipo fora da lista (.exe)', () => {
    expect(recusaDoAnexoDeTarefa(arq({ name: 'v.exe', type: 'application/octet-stream' }))).not.toBeNull();
  });
});

describe('ehImagem / tamanhoLegivel / ordenarAnexos', () => {
  it('ehImagem só para image/*', () => {
    expect(ehImagem('image/png')).toBe(true);
    expect(ehImagem('application/pdf')).toBe(false);
    expect(ehImagem(null)).toBe(false);
  });
  it('tamanhoLegivel em PT-BR, vazio quando não há bytes', () => {
    expect(tamanhoLegivel(null)).toBe('');
    expect(tamanhoLegivel(2 * 1024 * 1024)).toBe('2,0 MB');
    expect(tamanhoLegivel(500 * 1024)).toBe('500 KB');
  });
  it('ordenarAnexos põe o mais novo em cima e não muta o array', () => {
    const a = { created_at: '2026-09-01T00:00:00Z' };
    const b = { created_at: '2026-09-05T00:00:00Z' };
    const orig = [a, b];
    expect(ordenarAnexos(orig)).toEqual([b, a]);
    expect(orig).toEqual([a, b]);
  });
});
