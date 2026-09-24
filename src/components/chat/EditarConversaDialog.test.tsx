import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import type { ChatGrupo } from '@/hooks/use-chat';
import { EditarConversaDialog } from './EditarConversaDialog';

// SeletorCorLivre abre um Popover próprio; como este teste não mexe em cor livre,
// mockamos por um placeholder inerte (mesmo padrão de SeletorDeAparencia.test.tsx).
vi.mock('@/components/shared/SeletorCorLivre', () => ({ SeletorCorLivre: () => null }));

const mocks = vi.hoisted(() => ({
  updateGrupo: vi.fn().mockResolvedValue(undefined),
  updateGeral: vi.fn().mockResolvedValue(undefined),
  addMembros: vi.fn().mockResolvedValue(undefined),
  removeMembros: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/hooks/use-chat', () => ({
  useUpdateChatGrupo: () => ({ mutateAsync: mocks.updateGrupo, isPending: false }),
  useUpdateChatGeralConfig: () => ({ mutateAsync: mocks.updateGeral, isPending: false }),
  useAddChatGrupoMembros: () => ({ mutateAsync: mocks.addMembros, isPending: false }),
  useRemoveChatGrupoMembros: () => ({ mutateAsync: mocks.removeMembros, isPending: false }),
}));

const grupo: ChatGrupo = {
  id: 'g1',
  nome: 'Grupo Exemplo',
  foto_url: null,
  icone: null,
  cor_fundo: null,
  cor_icone: null,
  empresa_id: 'empresa-1',
  criado_por: 'eu',
  created_at: '2026-01-01T00:00:00Z',
};

// Nomes e ids inventados (CLAUDE.md §6.9) — nenhum dado real de cliente ou equipe.
const membros = [
  { id: 'eu', nome: 'Eu Mesmo', role: 'gestor' },
  { id: 'ana', nome: 'Ana Souza', role: 'vendedor' },
  { id: 'bruno', nome: 'Bruno Lima', role: 'vendedor' },
];

function renderComQueryClient(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('EditarConversaDialog', () => {
  it('podeEditar=false não renderiza botão nenhum', () => {
    renderComQueryClient(
      <EditarConversaDialog
        alvo={{ tipo: 'grupo', grupo }}
        membros={membros}
        membrosAtuais={[{ id: 'ana' }]}
        meuId="eu"
        podeEditar={false}
      />,
    );
    expect(screen.queryByText('Editar grupo')).toBeNull();
  });

  it('grupo: desmarcar um membro atual e marcar um novo, ao Salvar chama updateGrupo/addGrupoMembros/removeGrupoMembros', async () => {
    renderComQueryClient(
      <EditarConversaDialog
        alvo={{ tipo: 'grupo', grupo }}
        membros={membros}
        membrosAtuais={[{ id: 'ana' }]}
        meuId="eu"
        podeEditar
      />,
    );

    fireEvent.click(screen.getByText('Editar grupo'));

    // Ana já é membro atual (parte de `membrosAtuais`) — desmarca.
    fireEvent.click(screen.getByText('Ana Souza'));
    // Bruno não estava no grupo — marca.
    fireEvent.click(screen.getByText('Bruno Lima'));

    fireEvent.click(screen.getByText('Salvar'));

    await waitFor(() => expect(mocks.updateGrupo).toHaveBeenCalled());

    expect(mocks.updateGrupo).toHaveBeenCalledWith(
      expect.objectContaining({ grupoId: 'g1', nome: 'Grupo Exemplo' }),
    );
    expect(mocks.addMembros).toHaveBeenCalledWith({ grupoId: 'g1', usuarioIds: ['bruno'] });
    expect(mocks.removeMembros).toHaveBeenCalledWith({ grupoId: 'g1', usuarioIds: ['ana'] });
  });
});
