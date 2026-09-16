import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, cleanup, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RESPOSTAS_VAZIAS, type RespostasDaVisita } from '@/lib/analise-da-visita';

/**
 * `useMarcarVisitaRealizada` ganhou uma segunda gravação: quando a visita passa a realizada,
 * com próximo passo + data preenchidos e a caixinha `criarTarefa` marcada, ela também cria uma
 * TAREFA (via `useCreateTarefa`, de `use-tarefas.ts`).
 *
 * 🔴 A TAREFA É CONSEQUÊNCIA, NÃO É O TRABALHO. A visita é o registro de quem esteve em campo —
 * ela tem que gravar mesmo que a tarefa falhe. Por isso o teste mais importante aqui não é o que
 * cria a tarefa: é o que prova que a FALHA da tarefa não derruba a visita.
 */

const toastAviso = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    warning: (...a: unknown[]) => toastAviso(...a),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

let respostaDoUpdateEventos: { error: unknown; count: number | null } = { error: null, count: 1 };
let respostaDoUsuario: { data: unknown; error: unknown } = {
  data: { id: 'usuario-1', nome: 'Ana Souza' },
  error: null,
};
let respostaDoInsertTarefa: { error: unknown } = { error: null };

const atualizouEventos = vi.fn();
const inseriuTarefa = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (tabela: string) => {
      if (tabela === 'eventos') {
        return {
          update: (payload: unknown) => {
            atualizouEventos(payload);
            return { eq: async () => respostaDoUpdateEventos };
          },
        };
      }
      if (tabela === 'usuarios') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => respostaDoUsuario,
            }),
          }),
        };
      }
      if (tabela === 'tarefas') {
        return {
          insert: (payload: unknown) => {
            inseriuTarefa(payload);
            return Promise.resolve(respostaDoInsertTarefa);
          },
        };
      }
      throw new Error(`tabela não mockada neste teste: ${tabela}`);
    },
    auth: {
      getUser: async () => ({ data: { user: { id: 'auth-user-1' } } }),
    },
  },
}));

import { useMarcarVisitaRealizada } from './use-obra-visitas';

const GRUPO_ID = 'grupo-1';
const OBRA_ID = 'obra-1';
const CLIENTE_ID = 'cliente-1';
const NOME_OBRA = 'Obra Exemplo';

function envolver() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { wrapper, client };
}

function respostasComProximoPasso(patch: Partial<RespostasDaVisita> = {}): RespostasDaVisita {
  return {
    ...RESPOSTAS_VAZIAS,
    proximoPasso: 'Mandar proposta de louças',
    proximoPassoEm: '2026-09-20',
    ...patch,
  };
}

beforeEach(() => {
  respostaDoUpdateEventos = { error: null, count: 1 };
  respostaDoUsuario = { data: { id: 'usuario-1', nome: 'Ana Souza' }, error: null };
  respostaDoInsertTarefa = { error: null };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('useMarcarVisitaRealizada — a tarefa do próximo passo', () => {
  it('próximo passo com data e caixinha marcada vira tarefa, com o nome da obra no título', async () => {
    const { wrapper } = envolver();
    const { result } = renderHook(() => useMarcarVisitaRealizada(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        grupoId: GRUPO_ID,
        obraId: OBRA_ID,
        realizada: true,
        observacao: '',
        respostas: respostasComProximoPasso({ criarTarefa: true }),
        nomeObra: NOME_OBRA,
        clienteId: CLIENTE_ID,
      });
    });

    expect(inseriuTarefa).toHaveBeenCalledWith(
      expect.objectContaining({
        titulo: expect.stringContaining(NOME_OBRA),
        // 🔴 Âncora de meio-dia (CLAUDE.md §7.12): a coluna é timestamp, e a meia-noite
        // escorregaria de dia por causa do fuso.
        prazo_final: '2026-09-20T12:00:00',
        cliente_id: CLIENTE_ID,
      }),
    );
  });

  it('🔴 a visita continua gravada quando a tarefa falha, e a tela avisa', async () => {
    respostaDoInsertTarefa = { error: { message: 'não foi desta vez' } };
    const { wrapper } = envolver();
    const { result } = renderHook(() => useMarcarVisitaRealizada(), { wrapper });

    let retorno: { obraId: string; avisoDaTarefa: string | null } | undefined;
    await act(async () => {
      retorno = await result.current.mutateAsync({
        grupoId: GRUPO_ID,
        obraId: OBRA_ID,
        realizada: true,
        observacao: '',
        respostas: respostasComProximoPasso({ criarTarefa: true }),
        nomeObra: NOME_OBRA,
        clienteId: CLIENTE_ID,
      });
    });

    // A visita gravou — o `update` de `eventos` rodou e a promessa não foi rejeitada.
    expect(atualizouEventos).toHaveBeenCalled();
    expect(retorno?.avisoDaTarefa).toMatch(/tarefa do próximo passo não/i);
  });

  it('sem data, nenhuma tarefa é criada', async () => {
    const { wrapper } = envolver();
    const { result } = renderHook(() => useMarcarVisitaRealizada(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        grupoId: GRUPO_ID,
        obraId: OBRA_ID,
        realizada: true,
        observacao: '',
        respostas: { ...RESPOSTAS_VAZIAS, proximoPasso: 'Voltar lá', proximoPassoEm: '', criarTarefa: true },
        nomeObra: NOME_OBRA,
        clienteId: CLIENTE_ID,
      });
    });

    expect(inseriuTarefa).not.toHaveBeenCalled();
    expect(atualizouEventos).toHaveBeenCalled();
  });

  it('caixinha desmarcada (criarTarefa: false) NÃO cria tarefa mesmo com data', async () => {
    const { wrapper } = envolver();
    const { result } = renderHook(() => useMarcarVisitaRealizada(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        grupoId: GRUPO_ID,
        obraId: OBRA_ID,
        realizada: true,
        observacao: '',
        respostas: respostasComProximoPasso({ criarTarefa: false }),
        nomeObra: NOME_OBRA,
        clienteId: CLIENTE_ID,
      });
    });

    expect(inseriuTarefa).not.toHaveBeenCalled();
  });

  it('desmarcar a visita (realizada: false) NÃO cria tarefa', async () => {
    const { wrapper } = envolver();
    const { result } = renderHook(() => useMarcarVisitaRealizada(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        grupoId: GRUPO_ID,
        obraId: OBRA_ID,
        realizada: false,
      });
    });

    expect(inseriuTarefa).not.toHaveBeenCalled();
    expect(atualizouEventos).toHaveBeenCalled();
  });
});
