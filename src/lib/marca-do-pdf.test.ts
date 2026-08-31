import { describe, it, expect } from 'vitest';
import { encaixar, encurtar } from './marca-do-pdf';
import type jsPDF from 'jspdf';

/**
 * As duas contas do cabeçalho de marca que dá para fixar sem desenhar nada.
 *
 * 🔴 O CORTE DE TEXTO NÃO É ENFEITE. O jsPDF não corta: ele desenha para fora da página, e o
 * texto simplesmente some. O subtítulo do painel e o título da exportação de conversa já
 * estouravam a margem direita ANTES de a logo da Repply passar a ocupar a direita.
 */

/** Um documento de mentira onde cada caractere mede 1 — a conta fica legível. */
const doc = { getTextWidth: (t: string) => t.length } as unknown as jsPDF;

describe('encaixar', () => {
  it('logo larga é limitada pela largura', () => {
    // O wordmark da Repply é 512x175.
    const r = encaixar({ largura: 512, altura: 175 }, 22, 8);
    expect(r.largura).toBeCloseTo(22);
    expect(r.altura).toBeCloseTo(22 * (175 / 512));
    expect(r.altura).toBeLessThanOrEqual(8);
  });

  it('logo quadrada é limitada pela altura', () => {
    const r = encaixar({ largura: 500, altura: 500 }, 30, 12);
    expect(r.altura).toBeCloseTo(12);
    expect(r.largura).toBeCloseTo(12);
  });

  it('🔴 nunca passa da caixa, em nenhuma proporção', () => {
    const proporcoes = [
      { largura: 4000, altura: 100 },
      { largura: 100, altura: 4000 },
      { largura: 7, altura: 7 },
      { largura: 1024, altura: 350 },
    ];
    for (const p of proporcoes) {
      const r = encaixar(p, 30, 12);
      expect(r.largura).toBeLessThanOrEqual(30 + 1e-9);
      expect(r.altura).toBeLessThanOrEqual(12 + 1e-9);
    }
  });

  it('mantém a proporção — logo esticada é logo estragada', () => {
    const r = encaixar({ largura: 400, altura: 100 }, 30, 12);
    expect(r.largura / r.altura).toBeCloseTo(4);
  });
});

describe('encurtar', () => {
  it('texto que cabe passa intacto, sem reticências', () => {
    expect(encurtar(doc, 'Relatório', 50)).toBe('Relatório');
  });

  it('🔴 texto que não cabe é cortado com reticências', () => {
    const r = encurtar(doc, 'Conversa — Construtora Meridiano Empreendimentos', 12);
    expect(r.endsWith('…')).toBe(true);
    expect(r.length).toBeLessThanOrEqual(12);
  });

  it('não deixa espaço solto antes das reticências', () => {
    expect(encurtar(doc, 'abc def ghi', 5)).not.toMatch(/ …$/);
  });

  it('largura zero ou negativa devolve o texto, em vez de sumir com ele', () => {
    // Some com o texto seria pior que deixá-lo passar: pelo menos a pessoa vê que há algo.
    expect(encurtar(doc, 'Relatório', 0)).toBe('Relatório');
    expect(encurtar(doc, 'Relatório', -5)).toBe('Relatório');
  });

  it('texto vazio não vira reticências', () => {
    expect(encurtar(doc, '', 10)).toBe('');
    expect(encurtar(doc, null as never, 10)).toBe('');
  });
});
