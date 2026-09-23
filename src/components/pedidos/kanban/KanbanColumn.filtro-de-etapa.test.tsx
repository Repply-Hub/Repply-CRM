import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DragDropContext } from '@hello-pangea/dnd';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { PedidoWithRelations, PedidosFilters } from '@/hooks/use-pedidos';
import { KanbanColumn } from './KanbanColumn';

/**
 * O QUE ESTE ARQUIVO PRENDE: que marcar uma etapa no filtro "Etapa" esvazie de verdade as
 * colunas que ficaram de fora (item 49 da dívida técnica).
 *
 * 🔴 POR QUE. O filtro de Etapa não esconde colunas — quais colunas aparecem é outra
 * configuração ("Colunas", guardada por funil). O filtro só desligava a busca da coluna
 * excluída (`enabled: false`). Só que desligar a busca **não apaga o que já foi buscado**: a
 * chave de cache da coluna é a mesma com ou sem o filtro, então o TanStack Query devolve as
 * linhas guardadas e a coluna continua mostrando os cartões e a contagem de antes.
 *
 * O caminho que expõe isso é o comum: abrir o quadro (todas as colunas carregam), depois marcar
 * uma etapa. Quem abre o quadro já filtrado não vê nada de errado, porque não houve busca
 * anterior para ficar no cache — e é por isso que o defeito sobreviveu.
 *
 * Desde 22/09/2026 ficou pior de ler: o conserto do valor em reais (item 50) passou a mostrar
 * R$ 0,00 na coluna excluída, enquanto o selo de contagem e os cartões continuavam os antigos.
 * Três números sobre a mesma coluna, dois deles mentindo.
 *
 * E o estrago passa da tela: a coluna reporta ao pai os cartões que "tem"
 * (`onOrdersChange`), e é desse conjunto que sai o PDF do pipeline.
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

function negocio(id: string): PedidoWithRelations {
  return {
    id,
    nome: `Negócio ${id}`,
    valor_total: 1000,
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

/** O que ficou no cache da coluna "Fechamento" de uma abertura anterior do quadro. */
const NO_CACHE = [negocio('n1'), negocio('n2')];
const FILTROS: PedidosFilters = { funilId: 'funil-1' };

function renderizarColuna(etapaFilter?: string[], onOrdersChange?: (k: string, r: PedidoWithRelations[]) => void) {
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
            etapaFilter={etapaFilter}
            onOrdersChange={onOrdersChange}
          />
        </DragDropContext>
      </TooltipProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  // O cliente de dados devolve o que está no cache MESMO com a busca desligada — é exatamente
  // isso que acontece de verdade, e é o que a coluna precisa deixar de acreditar.
  usePedidosMock.mockReturnValue({
    data: { data: NO_CACHE, count: 50 },
    isLoading: false,
    isFetching: false,
  });
  usePedidosStatsMock.mockReturnValue({ data: { count: 50, valor: 2000 } });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('KanbanColumn — filtro "Etapa"', () => {
  it('🔴 coluna fora do filtro não mostra os cartões que sobraram no cache', () => {
    renderizarColuna(['prospeccao']);

    expect(screen.queryByText('Negócio n1')).not.toBeInTheDocument();
    expect(screen.queryByText('Negócio n2')).not.toBeInTheDocument();
  });

  it('🔴 coluna fora do filtro mostra contagem zero, não a contagem de antes', () => {
    renderizarColuna(['prospeccao']);

    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.queryByText('50')).not.toBeInTheDocument();
  });

  it('🔴 coluna fora do filtro não oferece "Ver mais" — não há mais nada para ver', () => {
    renderizarColuna(['prospeccao']);

    expect(screen.queryByRole('button', { name: /ver mais/i })).not.toBeInTheDocument();
  });

  it('🔴 coluna fora do filtro não entrega cartões ao quadro (o PDF do pipeline sai daqui)', () => {
    const recebido: Array<{ etapa: string; quantos: number }> = [];

    renderizarColuna(['prospeccao'], (etapa, linhas) =>
      recebido.push({ etapa, quantos: linhas.length }),
    );

    expect(recebido.every(r => r.quantos === 0)).toBe(true);
  });

  it('coluna DENTRO do filtro continua mostrando tudo', () => {
    renderizarColuna(['fechamento']);

    expect(screen.getByText('Negócio n1')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
  });

  it('sem filtro de etapa nenhum, nada muda', () => {
    renderizarColuna(undefined);

    expect(screen.getByText('Negócio n1')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
  });
});
