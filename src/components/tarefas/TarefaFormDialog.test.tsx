import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Tarefa 2 do desenho "Ajustes na seção Tarefas" (`.superpowers/sdd/2026-09-24-ajustes-secao-tarefas/`):
 * item 1 (campo Obra no formulário, grava `tarefas.obra_id`) e item 5a (Empresa/Negócio deixam
 * de SUMIR quando a tarefa nasce vinculada a um negócio — aparecem preenchidos e desabilitados).
 *
 * Dado sempre inventado (CLAUDE.md §6.9): 'cliente-1', 'pedido-1', 'obra-1', 'user-1',
 * "Empresa Exemplo Ltda", "Obra Exemplo". O repositório é público.
 */

const {
  useVendedoresMock,
  useClientesMock,
  useObrasMock,
  usePedidosOptionsMock,
  usePedidoOptionPorIdMock,
  useAuthMock,
  createTarefaMock,
  updateTarefaMock,
} = vi.hoisted(() => ({
  useVendedoresMock: vi.fn(),
  useClientesMock: vi.fn(),
  useObrasMock: vi.fn(),
  usePedidosOptionsMock: vi.fn(),
  usePedidoOptionPorIdMock: vi.fn(),
  useAuthMock: vi.fn(),
  createTarefaMock: vi.fn(),
  updateTarefaMock: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

vi.mock('@/hooks/use-tarefas', () => ({
  useCreateTarefa: () => ({ mutateAsync: createTarefaMock, isPending: false }),
  useUpdateTarefa: () => ({ mutateAsync: updateTarefaMock, isPending: false }),
}));

vi.mock('@/hooks/use-clientes', () => ({
  useVendedores: useVendedoresMock,
  useClientes: useClientesMock,
}));

vi.mock('@/hooks/use-obras', () => ({
  useObras: useObrasMock,
}));

vi.mock('@/hooks/use-pedidos', () => ({
  usePedidosOptions: usePedidosOptionsMock,
  usePedidoOptionPorId: usePedidoOptionPorIdMock,
  PEDIDOS_OPTIONS_LIMITE_LISTA: 500,
  PEDIDOS_OPTIONS_LIMITE_BUSCA: 50,
  PEDIDOS_OPTIONS_MIN_BUSCA: 2,
}));

vi.mock('@/hooks/use-auth', () => ({
  useAuth: useAuthMock,
}));

vi.mock('@/hooks/use-tarefa-anexos', () => ({
  useAnexosDaTarefa: () => ({ data: [] }),
  useAdicionarAnexoDaTarefa: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoverAnexoDaTarefa: () => ({ mutate: vi.fn() }),
  enviarAnexoDeTarefa: vi.fn(),
}));

import { TarefaFormDialog } from './TarefaFormDialog';

const KANBAN_STAGES = [{ key: 'pendente', label: 'Pendente' }];

const CLIENTE_EXEMPLO = { id: 'cliente-1', empresa: 'Empresa Exemplo Ltda', razao_social: null, cnpj: null };

const PEDIDO_EXEMPLO = {
  id: 'pedido-1',
  status: 'novo',
  nome: 'Negócio Exemplo',
  cliente: { id: 'cliente-1', empresa: 'Empresa Exemplo Ltda' },
  fabricante: null,
};

const OBRA_EXEMPLO = {
  id: 'obra-1',
  nome_obra: 'Obra Exemplo',
  cliente_id: 'cliente-1',
  clientes: { empresa: 'Empresa Exemplo Ltda' },
};

function renderizar(props: Partial<React.ComponentProps<typeof TarefaFormDialog>> = {}) {
  const onOpenChange = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={client}>
      <TarefaFormDialog
        open
        onOpenChange={onOpenChange}
        editingTarefa={null}
        kanbanStages={KANBAN_STAGES}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { ...utils, onOpenChange };
}

/** O campo (Label + `SeletorComBusca`) pelo texto do rótulo — evita depender da ordem no DOM. */
function botaoDoCampo(rotulo: string) {
  const label = screen.getByText(rotulo);
  const container = label.closest('div');
  if (!container) throw new Error(`Campo "${rotulo}" sem container`);
  return within(container).getByRole('combobox');
}

describe('TarefaFormDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ profile: { id: 'user-1', nome: 'Fulano', empresa_id: 'empresa-1', role: 'vendedor' } });
    useVendedoresMock.mockReturnValue({ data: [] });
    useClientesMock.mockReturnValue({ data: [CLIENTE_EXEMPLO] });
    useObrasMock.mockReturnValue({ data: [OBRA_EXEMPLO] });
    usePedidosOptionsMock.mockReturnValue({ data: [], isFetching: false });
    usePedidoOptionPorIdMock.mockReturnValue({ data: null });
    createTarefaMock.mockResolvedValue({ id: 'tarefa-nova' });
    updateTarefaMock.mockResolvedValue(undefined);
  });

  afterEach(() => cleanup());

  describe('item 5a — Empresa e Negócio travados aparecem, não somem', () => {
    it('com extraFields de cliente e negócio, os dois campos aparecem preenchidos e desabilitados', () => {
      usePedidoOptionPorIdMock.mockReturnValue({ data: PEDIDO_EXEMPLO });

      renderizar({ extraFields: { cliente_id: 'cliente-1', pedido_id: 'pedido-1' } });

      // Aparecem — antes o bloco inteiro era escondido quando `clienteTravado`/`negocioTravado`.
      expect(screen.getByText('Empresa (cliente)')).toBeInTheDocument();
      expect(screen.getByText('Negócio')).toBeInTheDocument();

      // Desabilitados: a pessoa vê o vínculo, mas não pode trocá-lo por aqui.
      expect(botaoDoCampo('Empresa (cliente)')).toBeDisabled();
      expect(botaoDoCampo('Negócio')).toBeDisabled();

      // E com o valor do negócio, não em branco.
      expect(botaoDoCampo('Empresa (cliente)').textContent).toContain('Empresa Exemplo Ltda');
      expect(botaoDoCampo('Negócio').textContent).toContain('Negócio Exemplo');
    });

    it('sem extraFields, os dois campos aparecem habilitados (nenhuma trava)', () => {
      renderizar();

      expect(botaoDoCampo('Empresa (cliente)')).toBeEnabled();
      expect(botaoDoCampo('Negócio')).toBeEnabled();
    });
  });

  describe('item 1 — campo Obra', () => {
    it('aparece na tela, listando as obras de `useObras`', () => {
      renderizar();
      expect(screen.getByText('Obra')).toBeInTheDocument();
      expect(botaoDoCampo('Obra')).toBeEnabled();
    });

    it('escolher uma obra e salvar grava `obra_id` na tarefa criada', () => {
      renderizar();

      fireEvent.change(screen.getByPlaceholderText('Ex: Ligar para o cliente'), {
        target: { value: 'Visitar obra' },
      });

      fireEvent.click(botaoDoCampo('Obra'));
      fireEvent.click(screen.getByText('Obra Exemplo'));

      fireEvent.click(screen.getByRole('button', { name: /criar tarefa/i }));

      expect(createTarefaMock).toHaveBeenCalledTimes(1);
      expect(createTarefaMock).toHaveBeenCalledWith(
        expect.objectContaining({ titulo: 'Visitar obra', obra_id: 'obra-1' }),
      );
    });

    it('sem escolher obra, salva com `obra_id: null` (nunca string vazia)', () => {
      renderizar();

      fireEvent.change(screen.getByPlaceholderText('Ex: Ligar para o cliente'), {
        target: { value: 'Tarefa sem obra' },
      });
      fireEvent.click(screen.getByRole('button', { name: /criar tarefa/i }));

      expect(createTarefaMock).toHaveBeenCalledWith(
        expect.objectContaining({ obra_id: null }),
      );
    });

    it('a obra do negócio (`obraPadrao`) pré-preenche o campo, mas continua editável', () => {
      renderizar({ obraPadrao: 'obra-1' });

      expect(botaoDoCampo('Obra').textContent).toContain('Obra Exemplo');
      expect(botaoDoCampo('Obra')).toBeEnabled();
    });
  });
});
