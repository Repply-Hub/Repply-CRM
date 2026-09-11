import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

/**
 * O QUE ESTE ARQUIVO PRENDE: a ordem do Radar na tela "Hoje" — os três cartões de risco, depois a
 * tabela do time, depois os dois gráficos.
 *
 * Pedido do dono do produto em 10/09/2026: a tabela é onde se AGE ("Abrir negócio" e "Retomar
 * depois" em cada linha), e ficava embaixo de dois gráficos. Uma troca de lugar volta sem ninguém
 * notar numa edição distraída — por isso a posição é conferida no componente montado.
 *
 * A tabela e a barra de filtros viram esboços: cada uma tem consultas próprias, e aqui só a
 * POSIÇÃO delas importa. Nomes e valores são inventados (CLAUDE.md §6.9).
 */

vi.mock('@/hooks/use-dashboard', () => ({
  useDashboardNegociosRisco: () => ({
    data: {
      qtd_parados: 3,
      valor_parados: 90000,
      qtd_sem_proxima_acao: 2,
      valor_sem_proxima_acao: 40000,
      valor_risco_total: 120000,
      risco_por_vendedor: [{ vendedor: 'Ana Souza', valor: 70000 }],
      risco_por_fabricante: [{ fabrica: 'Fabricante Exemplo', qtd: 3, valor: 90000 }],
    },
  }),
}));
vi.mock('@/components/pauta/TabelaDoTime', () => ({
  TabelaDoTime: () => <div data-testid="tabela-do-time" />,
}));
vi.mock('@/components/pauta/BarraDeFiltros', () => ({
  BarraDeFiltros: () => <div data-testid="barra-de-filtros" />,
}));

import { RadarDeRisco } from './RadarDeRisco';
import { lerFiltrosDoEndereco } from '@/lib/filtros-do-painel';

afterEach(cleanup);

function desenhar() {
  render(
    <RadarDeRisco
      empresaId="emp-1"
      filtros={lerFiltrosDoEndereco(new URLSearchParams())}
      onChangeFiltros={() => {}}
      podeFiltrarPorResponsavel
      onAbrirNegocio={() => {}}
      onRetomarNegocio={() => {}}
    />,
  );
}

/** `a` vem antes de `b` na ordem do documento. */
const vemAntes = (a: Node, b: Node) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe('a ordem do Radar', () => {
  it('🔴 a tabela do time vem ANTES dos dois gráficos', () => {
    desenhar();
    const tabela = screen.getByTestId('tabela-do-time');
    expect(vemAntes(tabela, screen.getByText(/Risco por Vendedor/))).toBe(true);
    expect(vemAntes(tabela, screen.getByText(/Resumo por fabricante/))).toBe(true);
  });

  it('os três cartões de risco continuam no topo, antes da tabela', () => {
    desenhar();
    expect(vemAntes(screen.getByText('Negócios Parados'), screen.getByTestId('tabela-do-time'))).toBe(true);
  });
});
