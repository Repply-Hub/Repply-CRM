import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, cleanup, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * A reconciliação dos responsáveis ao SALVAR a edição de um negócio.
 *
 * 🔴 Três decisões, todas com falha silenciosa se alguém as desfizer:
 *
 *   1. O PRINCIPAL NUNCA ENTRA NA CONTA DE REMOÇÃO. Ele é definido pelo `usuario_id` do
 *      negócio, e o banco recusa a remoção dele — uma conta que o incluísse derrubaria o
 *      salvamento inteiro numa situação corriqueira (trocar a estrela e salvar).
 *
 *   2. LÊ O ESTADO ATUAL, não a foto de quando a tela abriu. Comparar com foto velha desfaz
 *      a mudança que outra pessoa fez pelo painel de detalhe nesse meio-tempo.
 *
 *   3. A LEITURA VEM DEPOIS DO UPDATE. Trocar `usuario_id` move a estrela sozinho pelo
 *      espelho do banco; ler antes veria a configuração velha.
 */

vi.mock('sonner', () => ({ toast: { warning: vi.fn(), success: vi.fn(), error: vi.fn() } }));

const invalidouPaineis = vi.fn();
vi.mock('@/hooks/use-pedidos', () => ({
  invalidarPaineisDeNegocios: (...a: unknown[]) => invalidouPaineis(...a),
}));

const ordemDasChamadas: string[] = [];
const inseriu = vi.fn();
const removeu = vi.fn();
/** O que o banco devolve na LEITURA (já refletindo o espelho, pois ela vem depois do update). */
let linhasNoBanco: Array<{ usuario_id: string; principal: boolean }> = [];
let erroDoInsert: unknown = null;
let erroDoDelete: unknown = null;

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (tabela: string) => ({
      update: () => ({
        eq: async () => {
          ordemDasChamadas.push('update:pedidos');
          return { error: null };
        },
      }),
      select: () => ({
        eq: async () => {
          ordemDasChamadas.push('leitura:responsaveis');
          return { data: linhasNoBanco, error: null };
        },
      }),
      insert: (payload: unknown) => {
        inseriu(payload);
        return Promise.resolve({ error: erroDoInsert });
      },
      delete: () => ({
        eq: () => ({
          in: (_coluna: string, ids: string[]) => {
            removeu(ids);
            return Promise.resolve({ error: erroDoDelete });
          },
        }),
      }),
    }),
  },
}));

import { useUpdatePedidoCompleto } from './use-edit-pedido';

const BASE = {
  pedido_id: 'ped-1',
  cliente_id: 'cli-1',
  fabricante_id: 'fab-1',
  usuario_id: 'A',
  data_pedido: '2026-09-03',
  status: 'novo_lead',
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

function idsInseridos() {
  return inseriu.mock.calls.length
    ? (inseriu.mock.calls[0][0] as Array<{ usuario_id: string }>).map((l) => l.usuario_id)
    : [];
}

beforeEach(() => {
  linhasNoBanco = [];
  erroDoInsert = null;
  erroDoDelete = null;
  ordemDasChamadas.length = 0;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('useUpdatePedidoCompleto — reconciliação dos responsáveis', () => {
  it('acrescenta quem entrou e remove quem saiu', async () => {
    // No banco: A é principal, B participa. A tela quer A principal com C participando.
    linhasNoBanco = [
      { usuario_id: 'A', principal: true },
      { usuario_id: 'B', principal: false },
    ];
    const { wrapper } = envolver();
    const { result } = renderHook(() => useUpdatePedidoCompleto(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ ...BASE, participantes: ['C'] });
    });

    expect(idsInseridos()).toEqual(['C']);
    expect(removeu).toHaveBeenCalledWith(['B']);
  });

  it('🔴 nunca remove o principal, mesmo que ele não esteja na lista de participantes', async () => {
    // Situação corriqueira: a estrela passou de B para A. Depois do update, o espelho do banco
    // já pôs A como principal e B como participante — e a tela manda participantes: ['B'].
    linhasNoBanco = [
      { usuario_id: 'A', principal: true },
      { usuario_id: 'B', principal: false },
    ];
    const { wrapper } = envolver();
    const { result } = renderHook(() => useUpdatePedidoCompleto(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ ...BASE, usuario_id: 'A', participantes: ['B'] });
    });

    expect(removeu).not.toHaveBeenCalled();
    expect(idsInseridos()).toEqual([]);
  });

  it('🔴 o principal na lista de participantes é ignorado, não gravado duas vezes', async () => {
    linhasNoBanco = [{ usuario_id: 'A', principal: true }];
    const { wrapper } = envolver();
    const { result } = renderHook(() => useUpdatePedidoCompleto(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ ...BASE, usuario_id: 'A', participantes: ['A', 'B'] });
    });

    expect(idsInseridos()).toEqual(['B']);
  });

  it('🔴 lê a lista DEPOIS de gravar o negócio — antes veria a estrela no lugar velho', async () => {
    linhasNoBanco = [{ usuario_id: 'A', principal: true }];
    const { wrapper } = envolver();
    const { result } = renderHook(() => useUpdatePedidoCompleto(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ ...BASE, participantes: [] });
    });

    expect(ordemDasChamadas).toEqual(['update:pedidos', 'leitura:responsaveis']);
  });

  it('sem a lista no payload, não encosta em responsável nenhum', async () => {
    const { wrapper } = envolver();
    const { result } = renderHook(() => useUpdatePedidoCompleto(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ ...BASE });
    });

    expect(ordemDasChamadas).toEqual(['update:pedidos']);
    expect(inseriu).not.toHaveBeenCalled();
    expect(removeu).not.toHaveBeenCalled();
  });

  it('lista vazia esvazia os participantes e mantém só o principal', async () => {
    linhasNoBanco = [
      { usuario_id: 'A', principal: true },
      { usuario_id: 'B', principal: false },
      { usuario_id: 'C', principal: false },
    ];
    const { wrapper } = envolver();
    const { result } = renderHook(() => useUpdatePedidoCompleto(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ ...BASE, participantes: [] });
    });

    expect(removeu).toHaveBeenCalledWith(['B', 'C']);
  });

  it('🔴 falha na lista recarrega os painéis antes de reclamar — o negócio já foi salvo', async () => {
    erroDoInsert = { code: '42501', message: 'row-level security' };
    linhasNoBanco = [{ usuario_id: 'A', principal: true }];
    const { wrapper } = envolver();
    const { result } = renderHook(() => useUpdatePedidoCompleto(), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ ...BASE, participantes: ['B'] }),
      ).rejects.toThrow(/negócio foi salvo/i);
    });

    expect(invalidouPaineis).toHaveBeenCalled();
  });
});
