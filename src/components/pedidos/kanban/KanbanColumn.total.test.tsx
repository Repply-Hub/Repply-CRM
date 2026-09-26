import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DragDropContext } from '@hello-pangea/dnd';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { PedidoWithRelations, PedidosFilters } from '@/hooks/use-pedidos';
import { KanbanColumn } from './KanbanColumn';

/**
 * O valor em reais embaixo do nome de cada coluna do Kanban é o total DA ETAPA INTEIRA.
 *
 * Até 22/09/2026 ele era a soma só dos cartões carregados na tela (os primeiros N, mais o
 * que o "Ver mais" trouxesse), enquanto o selo ao lado já mostrava a contagem exata do
 * servidor. Medido em produção naquele dia, numa coluna Fechamento com milhares de
 * negócios: a tela mostrava 0,16% do valor verdadeiro. O número mais visível do produto
 * estava errado e parecia certo.
 *
 * O total vem de `usePedidosStats` (a RPC `pedidos_stats`), a mesma conta do rodapé da
 * visão Lista, com os mesmos filtros do quadro e a etapa desta coluna.
 *
 * Dado sempre inventado (CLAUDE.md §6.9): o repositório é público.
 */

const { usePedidosMock, usePedidosStatsMock } = vi.hoisted(() => ({
  usePedidosMock: vi.fn(),
  usePedidosStatsMock: vi.fn(),
}));

vi.mock('@/hooks/use-pedidos', () => ({
  usePedidos: usePedidosMock,
  usePedidosStats: usePedidosStatsMock,
}));

// O KanbanCard agora mostra a foto do vendedor (ResponsavelComFoto → useVendedores). Sem banco no
// teste, devolvemos lista vazia: a peça cai nas iniciais e a coluna renderiza normalmente.
vi.mock('@/hooks/use-clientes', () => ({
  useVendedores: () => ({ data: [] }),
}));

function negocio(id: string, valor: number): PedidoWithRelations {
  return {
    id,
    nome: `Negócio ${id}`,
    valor_total: valor,
    status: 'fechamento',
    created_at: '2026-09-01T12:00:00Z',
    data_pedido: '2026-09-01',
    cliente: { empresa: 'Empresa Exemplo Ltda' },
    obra: null,
    fabricante: { nome: 'Fábrica Exemplo' },
    vendedor: { nome: 'Ana Souza' },
    campos_extras: {},
    marcador: null,
    observacoes: null,
    prazo_resposta: null,
    anexos: [],
    pdf_url: null,
  } as unknown as PedidoWithRelations;
}

// A coluna carregou só 2 cartões (R$ 100 + R$ 200), mas a etapa tem 50 negócios no servidor.
const CARREGADOS = [negocio('n1', 100), negocio('n2', 200)];
const FILTROS: PedidosFilters = { funilId: 'funil-1' };

function renderizarColuna() {
  return render(
    <MemoryRouter>
      <TooltipProvider>
        <DragDropContext onDragEnd={() => {}}>
          <KanbanColumn
            stageKey="fechamento"
            label="Fechamento"
            colorClass="success"
            pageSize={20}
            empresaId="empresa-1"
            filters={FILTROS}
          />
        </DragDropContext>
      </TooltipProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  usePedidosMock.mockReturnValue({
    data: { data: CARREGADOS, count: 50 },
    isLoading: false,
    isFetching: false,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('KanbanColumn — total em reais da coluna', () => {
  it('mostra o total da etapa inteira vindo do servidor, não a soma dos cartões carregados', () => {
    usePedidosStatsMock.mockReturnValue({ data: { count: 50, valor: 99999 }, isLoading: false });

    renderizarColuna();

    expect(screen.getByText(/99\.999,00/)).toBeTruthy();
    expect(screen.queryByText(/R\$\s*300,00/)).toBeNull();
  });

  it('pede ao servidor o total da própria etapa, com os mesmos filtros do quadro', () => {
    usePedidosStatsMock.mockReturnValue({ data: { count: 50, valor: 99999 }, isLoading: false });

    renderizarColuna();

    expect(usePedidosStatsMock).toHaveBeenCalledWith('empresa-1', ['fechamento'], FILTROS, true);
  });

  it('enquanto o total do servidor não chega, não mostra a soma parcial como se fosse o total', () => {
    usePedidosStatsMock.mockReturnValue({ data: undefined, isLoading: true });

    renderizarColuna();

    expect(screen.queryByText(/R\$\s*300,00/)).toBeNull();
  });
});
