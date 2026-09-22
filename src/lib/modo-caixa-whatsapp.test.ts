import { describe, it, expect } from 'vitest';
import {
  modoCaixaDaEmpresa,
  elementosDaCaixa,
  ultimoResponsavel,
} from './modo-caixa-whatsapp';

describe('modoCaixaDaEmpresa', () => {
  it('true vira lista_unica', () => expect(modoCaixaDaEmpresa(true)).toBe('lista_unica'));
  it('false vira repply', () => expect(modoCaixaDaEmpresa(false)).toBe('repply'));
  it('null/undefined caem em repply (padrão seguro)', () => {
    expect(modoCaixaDaEmpresa(null)).toBe('repply');
    expect(modoCaixaDaEmpresa(undefined)).toBe('repply');
  });
});

describe('elementosDaCaixa', () => {
  it('modo repply mostra atribuição e esconde o traço', () => {
    const e = elementosDaCaixa('repply');
    expect(e.mostrarAbasDeGrupo).toBe(true);
    expect(e.agruparConversas).toBe(true);
    expect(e.mostrarAvisoSemResponsavel).toBe(true);
    expect(e.mostrarVisualizadores).toBe(true);
    expect(e.mostrarTracoResponsavel).toBe(false);
  });
  it('modo lista_unica esconde atribuição e mostra o traço', () => {
    const e = elementosDaCaixa('lista_unica');
    expect(e.mostrarAbasDeGrupo).toBe(false);
    expect(e.agruparConversas).toBe(false);
    expect(e.mostrarAvisoSemResponsavel).toBe(false);
    expect(e.mostrarVisualizadores).toBe(false);
    expect(e.mostrarTracoResponsavel).toBe(true);
  });
});

describe('ultimoResponsavel', () => {
  const ana = { id: 'a', nome: 'Ana Souza', avatar_url: null, atribuido_em: '2026-09-01T10:00:00Z' };
  const bruno = { id: 'b', nome: 'Bruno Lima', avatar_url: null, atribuido_em: '2026-09-05T10:00:00Z' };
  it('lista vazia ou indefinida → undefined', () => {
    expect(ultimoResponsavel(undefined)).toBeUndefined();
    expect(ultimoResponsavel([])).toBeUndefined();
  });
  it('um só → ele mesmo', () => expect(ultimoResponsavel([ana])).toBe(ana));
  it('vários → o de atribuido_em mais recente', () => {
    expect(ultimoResponsavel([ana, bruno])).toBe(bruno);
    expect(ultimoResponsavel([bruno, ana])).toBe(bruno);
  });
  it('sem data não quebra (mantém um estável)', () => {
    // Tipado com o campo opcional para o objeto ter propriedade em comum com a
    // restrição `{ atribuido_em?: string }` — senão o TS acusa TS2559 (nenhuma
    // propriedade em comum). Sem valor de data: é o caso "sem atribuido_em".
    const semData: { id: string; nome: string; avatar_url: string | null; atribuido_em?: string } =
      { id: 'c', nome: 'Carla', avatar_url: null };
    expect(ultimoResponsavel([semData])).toBe(semData);
  });
});
