/**
 * Qual coluna o filtro de período consulta.
 *
 * POR QUE ESTE TESTE EXISTE: a opção "Fechamento" do filtro consultava `fechado_em`,
 * que é carimbada por trigger quando o negócio entra numa etapa final DENTRO do Repply.
 * Para a base importada do Bitrix isso virou a data da importação — dos 11.714 negócios
 * importados da MD, 11.653 ficaram com 18/08/2026 e 61 com 19/08/2026. A base histórica
 * de 2022 a 2026 inteira aparecia como fechada no dia em que entrou no sistema.
 *
 * Consequência: "quanto vendemos em agosto" separava a venda importada da cadastrada à
 * mão. São a mesma venda. A data de fechamento passou a ser `prazo_resposta`, que tem o
 * mesmo significado nas duas origens.
 *
 * Se alguém apontar este filtro de volta para `fechado_em`, este teste falha.
 */
import { describe, it, expect } from 'vitest';
import { applyDateRangeFilter } from './use-pedidos';

/** Dublê do query builder: só anota qual coluna e qual valor receberam. */
function espiao() {
  const chamadas: Array<{ op: 'gte' | 'lte'; coluna: string; valor: string }> = [];
  const q = {
    chamadas,
    gte(coluna: string, valor: string) { chamadas.push({ op: 'gte', coluna, valor }); return q; },
    lte(coluna: string, valor: string) { chamadas.push({ op: 'lte', coluna, valor }); return q; },
  };
  return q;
}

describe('filtro de período — qual coluna é consultada', () => {
  it('"Fechamento" consulta prazo_resposta, nunca fechado_em', () => {
    const q = espiao();
    applyDateRangeFilter(q, '2026-08-01', '2026-08-31', 'prazo_resposta');
    expect(q.chamadas.map(c => c.coluna)).toEqual(['prazo_resposta', 'prazo_resposta']);
    expect(q.chamadas.map(c => c.coluna)).not.toContain('fechado_em');
  });

  it('"Criação" consulta data_pedido', () => {
    const q = espiao();
    applyDateRangeFilter(q, '2026-08-01', '2026-08-31', 'data_pedido');
    expect(q.chamadas.map(c => c.coluna)).toEqual(['data_pedido', 'data_pedido']);
  });

  it('sem escolha explícita, cai em data_pedido (comportamento histórico)', () => {
    const q = espiao();
    applyDateRangeFilter(q, '2026-08-01', '2026-08-31', undefined);
    expect(q.chamadas.map(c => c.coluna)).toEqual(['data_pedido', 'data_pedido']);
  });

  it('compara a data crua, sem limites de início/fim de dia', () => {
    // prazo_resposta e data_pedido são DATE puro. Mandar "2026-08-01T00:00:00" aqui
    // faria o PostgREST comparar texto com data e devolver resultado errado ou vazio.
    const q = espiao();
    applyDateRangeFilter(q, '2026-08-01', '2026-08-31', 'prazo_resposta');
    expect(q.chamadas.map(c => c.valor)).toEqual(['2026-08-01', '2026-08-31']);
  });

  it('aplica só o limite informado quando falta uma ponta', () => {
    const soInicio = espiao();
    applyDateRangeFilter(soInicio, '2026-08-01', undefined, 'prazo_resposta');
    expect(soInicio.chamadas).toEqual([{ op: 'gte', coluna: 'prazo_resposta', valor: '2026-08-01' }]);

    const soFim = espiao();
    applyDateRangeFilter(soFim, undefined, '2026-08-31', 'data_pedido');
    expect(soFim.chamadas).toEqual([{ op: 'lte', coluna: 'data_pedido', valor: '2026-08-31' }]);
  });

  it('sem datas, não filtra nada', () => {
    const q = espiao();
    applyDateRangeFilter(q, undefined, undefined, 'prazo_resposta');
    expect(q.chamadas).toEqual([]);
  });
});
