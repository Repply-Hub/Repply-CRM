import { describe, it, expect } from 'vitest';
import { melhorRecorte } from './capa-do-pdf';

/**
 * `melhorRecorte` recebe uma pontuação por LINHA da página (quanto aquela linha tem de
 * conteúdo visual) e devolve de que altura começar o recorte da capa.
 *
 * O caso que originou isto: o catálogo da Deca tem uma faixa PRETA SÓLIDA no topo da primeira
 * página, e a capa cortava exatamente ali — um retângulo preto no cartão.
 */

/** Linha lisa (preto sólido, branco sólido, qualquer cor chapada) não tem detalhe nenhum. */
const LISA = 0;

describe('melhorRecorte', () => {
  it('🔴 pula a faixa lisa do topo e vai para onde há conteúdo', () => {
    // 40 linhas de preto sólido, depois 60 com conteúdo — é o catálogo da Deca.
    const p = [...Array(40).fill(LISA), ...Array(60).fill(10)];
    expect(melhorRecorte(p, 30)).toBeGreaterThanOrEqual(40);
  });

  it('quando o conteúdo está no topo, começa do topo', () => {
    const p = [...Array(60).fill(10), ...Array(40).fill(LISA)];
    expect(melhorRecorte(p, 30)).toBe(0);
  });

  it('acha o miolo quando o conteúdo está no meio', () => {
    const p = [...Array(30).fill(LISA), ...Array(20).fill(50), ...Array(30).fill(LISA)];
    const inicio = melhorRecorte(p, 20);
    expect(inicio).toBeGreaterThanOrEqual(25);
    expect(inicio).toBeLessThanOrEqual(35);
  });

  it('janela maior que a página começa do topo, sem estourar', () => {
    expect(melhorRecorte([1, 2, 3], 100)).toBe(0);
  });

  it('página inteiramente lisa começa do topo — não há o que escolher', () => {
    expect(melhorRecorte(Array(100).fill(LISA), 30)).toBe(0);
  });

  it('empate fica com a janela mais ALTA', () => {
    // Numa capa de catálogo, o topo costuma ser a marca. Empatou, sobe.
    expect(melhorRecorte(Array(100).fill(5), 30)).toBe(0);
  });

  it('nunca devolve início negativo nem além do fim', () => {
    const p = [...Array(10).fill(LISA), ...Array(90).fill(7)];
    const inicio = melhorRecorte(p, 30);
    expect(inicio).toBeGreaterThanOrEqual(0);
    expect(inicio + 30).toBeLessThanOrEqual(p.length);
  });

  it('lista vazia não quebra', () => {
    expect(melhorRecorte([], 30)).toBe(0);
  });

  it('🔴 prefere conteúdo DENSO a conteúdo ralo', () => {
    // Uma tarja com um risquinho não pode ganhar de uma foto.
    const p = [...Array(30).fill(1), ...Array(30).fill(LISA), ...Array(40).fill(20)];
    expect(melhorRecorte(p, 25)).toBeGreaterThanOrEqual(60);
  });
});
