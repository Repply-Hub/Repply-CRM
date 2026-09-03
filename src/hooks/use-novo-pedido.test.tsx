import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, cleanup, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * A gravação dos responsáveis além do principal, na CRIAÇÃO do negócio.
 *
 * 🔴 As três coisas testadas aqui são decisão, não detalhe — e todas quebram EM SILÊNCIO:
 *
 *   1. O PRINCIPAL NÃO É GRAVADO DE NOVO. O gatilho do banco já criou a linha dele; mandá-la
 *      outra vez viola a chave primária e derruba a criação inteira.
 *
 *   2. FALHA AO GRAVAR PARTICIPANTE NÃO DERRUBA A CRIAÇÃO. O negócio já existe neste ponto;
 *      lançar o erro deixaria o formulário aberto e o próximo clique criaria um DUPLICADO.
 *
 *   3. QUEM FALHOU É AVISADO. Sem o aviso, some a informação de que faltou alguém — e a
 *      pessoa só descobriria olhando a ficha depois.
 */

const toastAviso = vi.fn();
vi.mock('sonner', () => ({
  toast: { warning: (...a: unknown[]) => toastAviso(...a), success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/hooks/use-pedidos', () => ({ invalidarPaineisDeNegocios: vi.fn() }));

const inseriuEm = vi.fn();
let erroDosParticipantes: unknown = null;

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (tabela: string) => ({
      insert: (payload: unknown) => {
        inseriuEm(tabela, payload);
        if (tabela === 'pedidos') {
          return {
            select: () => ({ single: async () => ({ data: { id: 'ped-novo' }, error: null }) }),
          };
        }
        return Promise.resolve({
          error: tabela === 'pedido_responsaveis' ? erroDosParticipantes : null,
        });
      },
    }),
  },
}));

import { useCreatePedidoCompleto } from './use-novo-pedido';

const BASE = {
  cliente_id: 'cli-1',
  fabricante_id: 'fab-1',
  usuario_id: 'u-principal',
  funil_id: 'fun-1',
  data_pedido: '2026-09-03',
};

function envolver() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  };
}

/** As linhas que foram para `pedido_responsaveis`, ou `null` se a tabela nem foi tocada. */
function linhasDeResponsaveis() {
  const chamada = inseriuEm.mock.calls.find(([tabela]) => tabela === 'pedido_responsaveis');
  return chamada ? (chamada[1] as Array<{ usuario_id: string; principal: boolean }>) : null;
}

beforeEach(() => {
  erroDosParticipantes = null;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('useCreatePedidoCompleto — os responsáveis além do principal', () => {
  it('🔴 não grava o principal de novo: o gatilho do banco já criou a linha dele', async () => {
    const { wrapper } = envolver();
    const { result } = renderHook(() => useCreatePedidoCompleto(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ ...BASE, participantes: ['u-principal', 'u2', 'u3'] });
    });

    const linhas = linhasDeResponsaveis();
    expect(linhas?.map((l) => l.usuario_id)).toEqual(['u2', 'u3']);
    expect(linhas?.every((l) => l.principal === false)).toBe(true);
  });

  it('sem participantes, não encosta na tabela de responsáveis', async () => {
    const { wrapper } = envolver();
    const { result } = renderHook(() => useCreatePedidoCompleto(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ ...BASE, participantes: [] });
    });

    expect(linhasDeResponsaveis()).toBeNull();
  });

  it('só o principal na lista também não encosta na tabela', async () => {
    const { wrapper } = envolver();
    const { result } = renderHook(() => useCreatePedidoCompleto(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ ...BASE, participantes: ['u-principal'] });
    });

    expect(linhasDeResponsaveis()).toBeNull();
  });

  it('🔴 recusa ao gravar participante NÃO derruba a criação — senão o próximo clique duplica o negócio', async () => {
    erroDosParticipantes = { code: '42501', message: 'new row violates row-level security policy' };
    const { wrapper } = envolver();
    const { result } = renderHook(() => useCreatePedidoCompleto(), { wrapper });

    let criado: { id: string } | undefined;
    await act(async () => {
      criado = await result.current.mutateAsync({ ...BASE, participantes: ['u2'] });
    });

    expect(criado?.id).toBe('ped-novo');
    await waitFor(() => expect(toastAviso).toHaveBeenCalled());
    expect(String(toastAviso.mock.calls[0][0])).toMatch(/negócio foi criado/i);
  });

  it('quando tudo grava, não avisa nada', async () => {
    const { wrapper } = envolver();
    const { result } = renderHook(() => useCreatePedidoCompleto(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ ...BASE, participantes: ['u2'] });
    });

    expect(toastAviso).not.toHaveBeenCalled();
  });
});
