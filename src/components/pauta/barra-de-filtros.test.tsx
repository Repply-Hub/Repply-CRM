import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';

// A barra lê três listas por hook; aqui elas vêm vazias — o que se prova é o PERÍODO, que aparece
// independentemente da chave `pauta_de_todos` (ao contrário do filtro de responsável).
vi.mock('@/hooks/use-kanban-colunas', () => ({ useKanbanColunasEmpresa: () => ({ data: [] }) }));
vi.mock('@/hooks/use-clientes', () => ({
  useVendedores: () => ({ data: [] }),
  useFabricantes: () => ({ data: [] }),
}));

import { BarraDeFiltros } from './BarraDeFiltros';

const vazio = { etapas: [], fabricantes: [], responsaveis: [] };

afterEach(cleanup);

describe('BarraDeFiltros — o período vale para todos', () => {
  it('mostra "Período" para quem VÊ a carteira da equipe', () => {
    render(
      <BarraDeFiltros empresaId="emp-1" filtros={vazio} onChange={() => {}} podeFiltrarPorResponsavel />,
    );
    expect(screen.getByRole('button', { name: 'Período' })).toBeInTheDocument();
  });

  it('mostra "Período" TAMBÉM para quem só vê a própria carteira, e aí o responsável some', () => {
    render(
      <BarraDeFiltros
        empresaId="emp-1"
        filtros={vazio}
        onChange={() => {}}
        podeFiltrarPorResponsavel={false}
      />,
    );
    expect(screen.getByRole('button', { name: 'Período' })).toBeInTheDocument();
    // O responsável é gated pela chave; o período não. Este é o contraste que o pedido pede.
    expect(screen.queryByText('Responsável')).toBeNull();
  });
});
