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

function desenhar(podeFiltrarPorResponsavel = true) {
  render(
    <RadarDeRisco
      empresaId="emp-1"
      filtros={lerFiltrosDoEndereco(new URLSearchParams())}
      onChangeFiltros={() => {}}
      podeFiltrarPorResponsavel={podeFiltrarPorResponsavel}
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

/**
 * O subtítulo do "No geral" diz de QUEM são os números — e isso depende da MESMA propriedade
 * que decide o resto do painel. Desde a migration 20260912110000_risco_segue_a_chave.sql, sem a
 * chave `pauta_de_todos` os cartões acima já mostram só os negócios da pessoa; o texto tinha
 * ficado para trás, dizendo "empresa inteira" por cima de um número que não é mais isso.
 */
describe('o subtítulo do "No geral"', () => {
  it('com a chave, o subtítulo continua dizendo "empresa inteira"', () => {
    desenhar(true);
    expect(screen.getByText(/empresa inteira/)).toBeInTheDocument();
  });

  it('🔴 sem a chave, o subtítulo diz "A sua carteira" — os cartões acima já são só dela', () => {
    desenhar(false);
    expect(screen.getByText(/A sua carteira/)).toBeInTheDocument();
  });
});

describe('o rótulo dos cartões', () => {
  it('o rótulo dos cartões sai do cinza em caixa-alta, pelo contraste de 14/09/2026', () => {
    desenhar();
    const rotulo = screen.getByText('Negócios Parados');
    expect(rotulo.className).not.toContain('uppercase');
    expect(rotulo.className).toContain('text-card-foreground');
  });
});
