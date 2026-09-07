import { describe, it, expect } from 'vitest';
import { linhasVisiveisDoHistorico, MARCADOR_DE_MUTIRAO } from './historico-do-negocio';

/** Uma linha do histórico, curta o bastante para o teste caber na cabeça. */
function linha(
  id: string,
  created_at: string,
  extra: Partial<{ tipo: 'status' | 'campo'; campo: string | null; pedido_id: string }> = {},
) {
  return {
    id,
    pedido_id: extra.pedido_id ?? 'negocio-1',
    tipo: extra.tipo ?? ('campo' as const),
    campo: extra.campo ?? 'Observações',
    created_at,
  };
}

describe('o histórico do negócio esconde o que o mutirão escreveu', () => {
  it('esconde a própria linha do marcador técnico', () => {
    const linhas = [linha('a', '2026-09-04T12:13:00Z', { campo: MARCADOR_DE_MUTIRAO })];
    expect(linhasVisiveisDoHistorico(linhas)).toEqual([]);
  });

  it('🔴 esconde as linhas do MESMO INSTANTE do marcador — é o que apaga o "Alterou Cliente" em lote', () => {
    const instante = '2026-09-04T12:13:00Z';
    const linhas = [
      linha('marcador', instante, { campo: MARCADOR_DE_MUTIRAO }),
      linha('cliente', instante, { campo: 'Cliente' }),
      linha('obra', instante, { campo: 'Obra' }),
    ];
    expect(linhasVisiveisDoHistorico(linhas)).toEqual([]);
  });

  it('🔴 PRESERVA a mesma troca de cliente quando ela foi feita por gente, em outro instante', () => {
    const linhas = [
      linha('marcador', '2026-09-04T12:13:00Z', { campo: MARCADOR_DE_MUTIRAO }),
      linha('à mão', '2026-09-04T15:40:00Z', { campo: 'Cliente' }),
    ];
    expect(linhasVisiveisDoHistorico(linhas).map((l) => l.id)).toEqual(['à mão']);
  });

  it('🔴 NUNCA esconde uma mudança de etapa, mesmo no instante do mutirão', () => {
    const instante = '2026-09-04T12:13:00Z';
    const linhas = [
      linha('marcador', instante, { campo: MARCADOR_DE_MUTIRAO }),
      linha('etapa', instante, { tipo: 'status', campo: null }),
    ];
    expect(linhasVisiveisDoHistorico(linhas).map((l) => l.id)).toEqual(['etapa']);
  });

  it('o instante de um negócio não esconde linha de OUTRO negócio', () => {
    const instante = '2026-09-04T12:13:00Z';
    const linhas = [
      linha('marcador', instante, { campo: MARCADOR_DE_MUTIRAO, pedido_id: 'negocio-1' }),
      linha('vizinho', instante, { campo: 'Cliente', pedido_id: 'negocio-2' }),
    ];
    expect(linhasVisiveisDoHistorico(linhas).map((l) => l.id)).toEqual(['vizinho']);
  });

  it('sem marcador nenhum, devolve tudo na mesma ordem', () => {
    const linhas = [
      linha('a', '2026-09-01T10:00:00Z', { campo: 'Valor total' }),
      linha('b', '2026-09-02T10:00:00Z', { tipo: 'status', campo: null }),
    ];
    expect(linhasVisiveisDoHistorico(linhas).map((l) => l.id)).toEqual(['a', 'b']);
  });

  it('aguenta lista vazia e indefinida', () => {
    expect(linhasVisiveisDoHistorico([])).toEqual([]);
    expect(linhasVisiveisDoHistorico(undefined)).toEqual([]);
  });
});
