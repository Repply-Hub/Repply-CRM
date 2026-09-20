import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PedidoWithRelations } from '@/hooks/use-pedidos';

/**
 * Tarefa 4 do desenho "Duplicar negócio" (docs/superpowers/specs/2026-09-12-duplicar-negocio-design.md):
 * o botão Duplicar do rodapé do painel navega para `/pedidos/novo?copiaDe=<id>` — quem monta a
 * cópia é `NovoPedido.tsx` (Tarefa 3), não este painel. Este arquivo prova só o que é do botão:
 * ele existe, navega com o id certo, respeita o mesmo `disabled` do Editar enquanto o negócio
 * carrega, e não grava nada no clique.
 *
 * Dado sempre inventado (CLAUDE.md §6.9): 'negocio-1', 'cliente-1', 'fab-1', 'user-1',
 * "Empresa Exemplo Ltda", "Fábrica Exemplo", 180000. O repositório é público.
 */

const {
  usePedidoPorIdMock,
  usePedidoHistoricoStatusMock,
  useHistoricoContatosMock,
  useTarefasPorPedidoMock,
  useTarefasKanbanColunasMock,
  useKanbanColunasMock,
  useSecaoLigadaMock,
  useMinhaPermissaoMock,
  useAuthMock,
  inserirFalso,
  atualizarFalso,
  excluirFalso,
} = vi.hoisted(() => ({
  usePedidoPorIdMock: vi.fn(),
  usePedidoHistoricoStatusMock: vi.fn(),
  useHistoricoContatosMock: vi.fn(),
  useTarefasPorPedidoMock: vi.fn(),
  useTarefasKanbanColunasMock: vi.fn(),
  useKanbanColunasMock: vi.fn(),
  useSecaoLigadaMock: vi.fn(),
  useMinhaPermissaoMock: vi.fn(),
  useAuthMock: vi.fn(),
  inserirFalso: vi.fn(),
  atualizarFalso: vi.fn(),
  excluirFalso: vi.fn(),
}));

vi.mock('@/hooks/use-pedidos', () => ({
  usePedidoPorId: usePedidoPorIdMock,
  usePedidoHistoricoStatus: usePedidoHistoricoStatusMock,
  useHistoricoContatos: useHistoricoContatosMock,
}));
vi.mock('@/hooks/use-tarefas', () => ({ useTarefasPorPedido: useTarefasPorPedidoMock }));
vi.mock('@/hooks/use-tarefas-kanban-colunas', () => ({ useTarefasKanbanColunas: useTarefasKanbanColunasMock }));
vi.mock('@/hooks/use-kanban-colunas', () => ({ useKanbanColunas: useKanbanColunasMock }));
vi.mock('@/hooks/use-secoes', () => ({ useSecaoLigada: useSecaoLigadaMock }));
vi.mock('@/hooks/use-minha-permissao', () => ({ useMinhaPermissao: useMinhaPermissaoMock }));
vi.mock('@/hooks/use-auth', () => ({ useAuth: useAuthMock }));

// 🔴 Dublê genérico do cliente Supabase: cobre os ganchos que o painel arrasta consigo (contatos
// da empresa, responsáveis, comentários, vendedores...) sem precisar dublar cada um — nenhum é
// desta tarefa, e todos resolvem a mesma consulta vazia. `insert`/`update`/`delete` são espiões
// PRÓPRIOS: é a prova de que clicar em Duplicar não grava nada (item c do brief).
interface ConsultaFalsa {
  select: (...args: unknown[]) => ConsultaFalsa;
  eq: (...args: unknown[]) => ConsultaFalsa;
  neq: (...args: unknown[]) => ConsultaFalsa;
  in: (...args: unknown[]) => ConsultaFalsa;
  is: (...args: unknown[]) => ConsultaFalsa;
  not: (...args: unknown[]) => ConsultaFalsa;
  order: (...args: unknown[]) => ConsultaFalsa;
  limit: (...args: unknown[]) => ConsultaFalsa;
  range: (...args: unknown[]) => ConsultaFalsa;
  maybeSingle: () => Promise<{ data: null; error: null }>;
  single: () => Promise<{ data: null; error: null }>;
  insert: (...args: unknown[]) => ConsultaFalsa;
  update: (...args: unknown[]) => ConsultaFalsa;
  upsert: (...args: unknown[]) => ConsultaFalsa;
  delete: (...args: unknown[]) => ConsultaFalsa;
  then: <T>(
    resolver: (v: { data: unknown[]; error: null }) => T,
    rejeitador?: (e: unknown) => T,
  ) => Promise<T>;
}

function criarConstrutorDeConsultaFalso(): ConsultaFalsa {
  const construtor: ConsultaFalsa = {
    select: vi.fn(() => construtor),
    eq: vi.fn(() => construtor),
    neq: vi.fn(() => construtor),
    in: vi.fn(() => construtor),
    is: vi.fn(() => construtor),
    not: vi.fn(() => construtor),
    order: vi.fn(() => construtor),
    limit: vi.fn(() => construtor),
    range: vi.fn(() => construtor),
    maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
    single: vi.fn(() => Promise.resolve({ data: null, error: null })),
    insert: (...args: unknown[]) => { inserirFalso(...args); return construtor; },
    update: (...args: unknown[]) => { atualizarFalso(...args); return construtor; },
    upsert: (...args: unknown[]) => { atualizarFalso(...args); return construtor; },
    delete: (...args: unknown[]) => { excluirFalso(...args); return construtor; },
    then: (resolver, rejeitador) =>
      Promise.resolve({ data: [] as unknown[], error: null }).then(resolver, rejeitador),
  };
  return construtor;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => criarConstrutorDeConsultaFalso()),
    rpc: vi.fn(() => Promise.resolve({ data: [], error: null })),
  },
}));

import { PainelDoNegocio } from './PainelDoNegocio';

const NEGOCIO_PADRAO: PedidoWithRelations = {
  id: 'negocio-1',
  status: 'novo',
  nome: 'Negócio Exemplo',
  valor_total: 180000,
  data_pedido: '2026-09-01',
  created_at: '2026-09-01T10:00:00Z',
  observacoes: null,
  cliente_id: 'cliente-1',
  fabricante_id: 'fab-1',
  usuario_id: 'user-1',
  obra_id: null,
  funil_id: 'funil-1',
  endereco_entrega: null,
  prazo_resposta: null,
  pdf_url: null,
  campos_extras: null,
  marcador_id: null,
  cliente: { id: 'cliente-1', empresa: 'Empresa Exemplo Ltda' },
  fabricante: { id: 'fab-1', nome: 'Fábrica Exemplo' },
  vendedor: { id: 'user-1', nome: 'Vendedor Um' },
  obra: null,
  marcador: null,
};

/** Sonda: imprime o endereço em que a navegação pousou, para provar a query string de verdade. */
function SondaDeRota() {
  const location = useLocation();
  return <div data-testid="sonda-rota">{location.pathname}{location.search}</div>;
}

function renderizar({
  pedidoId = 'negocio-1' as string | null,
  negocioJaCarregado,
}: { pedidoId?: string | null; negocioJaCarregado?: PedidoWithRelations } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/negocios']}>
        <Routes>
          <Route
            path="/negocios"
            element={
              <PainelDoNegocio
                pedidoId={pedidoId}
                onClose={() => {}}
                negocioJaCarregado={negocioJaCarregado}
              />
            }
          />
          <Route path="/pedidos/novo" element={<SondaDeRota />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('PainelDoNegocio — o botão Duplicar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ profile: { id: 'user-1', empresa_id: 'empresa-1', role: 'vendedor' }, loading: false });
    usePedidoPorIdMock.mockReturnValue({ data: undefined, isLoading: false, error: null });
    usePedidoHistoricoStatusMock.mockReturnValue({ data: [] });
    useHistoricoContatosMock.mockReturnValue({ data: [] });
    useTarefasPorPedidoMock.mockReturnValue({ data: [] });
    useTarefasKanbanColunasMock.mockReturnValue({ data: [] });
    useKanbanColunasMock.mockReturnValue({ data: [] });
    // Sem seção nenhuma "ligada": esconde Obra e Tarefas, que não são desta tarefa — o rodapé
    // (onde mora o Duplicar) é o mesmo com ou sem elas.
    useSecaoLigadaMock.mockReturnValue({ ligada: false });
    useMinhaPermissaoMock.mockReturnValue({ permitido: true, carregando: false });
  });

  afterEach(() => cleanup());

  it('com o negócio já carregado, o botão Duplicar navega para /pedidos/novo?copiaDe=<id>', () => {
    renderizar({ negocioJaCarregado: NEGOCIO_PADRAO });

    const botao = screen.getByRole('button', { name: /duplicar/i });
    expect(botao).toBeEnabled();

    fireEvent.click(botao);

    const sonda = screen.getByTestId('sonda-rota');
    expect(sonda.textContent).toBe('/pedidos/novo?copiaDe=negocio-1');
  });

  it('enquanto o negócio ainda está carregando, o botão Duplicar existe e fica desabilitado', () => {
    usePedidoPorIdMock.mockReturnValue({ data: undefined, isLoading: true, error: null });
    renderizar();

    const botao = screen.getByRole('button', { name: /duplicar/i });
    expect(botao).toBeDisabled();
    expect(screen.queryByTestId('sonda-rota')).not.toBeInTheDocument();
  });

  it('clicar em Duplicar não grava nada: nenhum insert/update/delete do Supabase é chamado', () => {
    renderizar({ negocioJaCarregado: NEGOCIO_PADRAO });

    fireEvent.click(screen.getByRole('button', { name: /duplicar/i }));

    expect(inserirFalso).not.toHaveBeenCalled();
    expect(atualizarFalso).not.toHaveBeenCalled();
    expect(excluirFalso).not.toHaveBeenCalled();
  });
});
