import { describe, it, expect } from 'vitest';
import { contarResultadoDaAtualizacao } from './use-bulk-import';

describe('contarResultadoDaAtualizacao', () => {
  it('🔴 conta o que o banco DEVOLVEU, não o que foi pedido', () => {
    // A regra de segurança recusa em silêncio: um vendedor comum só edita os próprios
    // negócios, e `update` de linha alheia não dá erro — simplesmente não altera nada.
    // Prometer 3 e ter mudado 1 é pior do que não avisar (dívida técnica item 47).
    const r = contarResultadoDaAtualizacao(3, [{ id: 'a' }], []);
    expect(r).toEqual({ pedidos: 3, aceitos: 1, recusados: 2, motivos: {} });
  });

  it('sem recusa, aceitos é igual a pedidos', () => {
    const r = contarResultadoDaAtualizacao(2, [{ id: 'a' }, { id: 'b' }], []);
    expect(r).toMatchObject({ pedidos: 2, aceitos: 2, recusados: 0 });
  });

  it('erro de verdade entra em motivos, agrupado', () => {
    const r = contarResultadoDaAtualizacao(2, [], ['tempo esgotado', 'tempo esgotado']);
    expect(r.motivos).toEqual({ 'tempo esgotado': 2 });
    expect(r.recusados).toBe(2);
  });

  it('nada pedido devolve tudo zerado', () => {
    expect(contarResultadoDaAtualizacao(0, [], [])).toEqual({
      pedidos: 0, aceitos: 0, recusados: 0, motivos: {},
    });
  });
});
