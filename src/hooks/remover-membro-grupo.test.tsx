import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, cleanup, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * O QUE ESTE ARQUIVO PRENDE: que remover participante de grupo pare de dizer que removeu
 * quando não removeu.
 *
 * 🔴 POR QUE ELE EXISTE (CLAUDE.md §4.6 / AGENTS.md §7). A política de segurança do
 * `chat_grupo_membros` só deixa remover quem criou o grupo ou é gestor. Quem não passa NÃO
 * recebe erro: a cláusula `USING` da regra não encontra a linha, o `DELETE` mexe em zero
 * registros e a resposta volta com `error: null`. O `catch` nunca dispara, e a tela
 * comemoraria por engano se não pedisse a contagem.
 *
 * Mesmo modelo de mock de `src/hooks/zero-linhas-nao-e-sucesso.test.tsx` (esse arquivo é o
 * padrão a copiar), adaptado à cadeia real deste hook: `.delete({count}).eq('grupo_id',
 * ...).in('usuario_id', ...)`.
 */

/** A resposta que o esboço do Supabase devolve. Cada teste ajusta antes de chamar o hook. */
const resposta: { error: unknown; count: number | null | undefined } = { error: null, count: null };

/** O que foi pedido ao servidor, para provar que a contagem foi solicitada de verdade. */
const pedidosAoServidor: Array<{ op: string; count: unknown }> = [];

/** Os argumentos do encadeamento, para provar que grupoId e usuarioIds vão para as colunas certas. */
const argumentosDoFiltro: { grupoId?: string; usuarioIds?: string[] } = {};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      delete: (opcoes?: { count?: string }) => {
        pedidosAoServidor.push({ op: 'delete', count: opcoes?.count });
        return {
          eq: (_coluna: string, valor: string) => {
            argumentosDoFiltro.grupoId = valor;
            return {
              in: async (_coluna2: string, valores: string[]) => {
                argumentosDoFiltro.usuarioIds = valores;
                return { ...resposta };
              },
            };
          },
        };
      },
    }),
  },
}));

import { useRemoveChatGrupoMembros } from './use-chat';

function envolver() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { wrapper };
}

beforeEach(() => {
  resposta.error = null;
  resposta.count = null;
  pedidosAoServidor.length = 0;
  argumentosDoFiltro.grupoId = undefined;
  argumentosDoFiltro.usuarioIds = undefined;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('remover participante do grupo', () => {
  it('🔴 zero linhas removidas NÃO é sucesso — a regra de acesso recusou em silêncio', async () => {
    resposta.count = 0;
    const { wrapper } = envolver();
    const { result } = renderHook(() => useRemoveChatGrupoMembros(), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ grupoId: 'g1', usuarioIds: ['u1'] }),
      ).rejects.toThrow();
    });
  });

  it('uma linha removida é sucesso', async () => {
    resposta.count = 1;
    const { wrapper } = envolver();
    const { result } = renderHook(() => useRemoveChatGrupoMembros(), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ grupoId: 'g1', usuarioIds: ['u1'] }),
      ).resolves.toBeUndefined();
    });
  });

  it('pede a contagem ao servidor — sem isso não há o que conferir', async () => {
    resposta.count = 1;
    const { wrapper } = envolver();
    const { result } = renderHook(() => useRemoveChatGrupoMembros(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ grupoId: 'g1', usuarioIds: ['u1'] });
    });

    expect(pedidosAoServidor).toContainEqual({ op: 'delete', count: 'exact' });
  });

  it('filtra por grupo e pelos participantes pedidos', async () => {
    resposta.count = 1;
    const { wrapper } = envolver();
    const { result } = renderHook(() => useRemoveChatGrupoMembros(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ grupoId: 'g1', usuarioIds: ['u1', 'u2'] });
    });

    expect(argumentosDoFiltro.grupoId).toBe('g1');
    expect(argumentosDoFiltro.usuarioIds).toEqual(['u1', 'u2']);
  });

  it('seleção vazia não fala com o banco', async () => {
    const { wrapper } = envolver();
    const { result } = renderHook(() => useRemoveChatGrupoMembros(), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ grupoId: 'g1', usuarioIds: [] }),
      ).resolves.toBeUndefined();
    });

    expect(pedidosAoServidor).toHaveLength(0);
  });

  it('erro de verdade continua chegando inteiro', async () => {
    resposta.error = { code: '23503', message: 'violates foreign key constraint', details: 'na tabela x' };
    resposta.count = null;
    const { wrapper } = envolver();
    const { result } = renderHook(() => useRemoveChatGrupoMembros(), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ grupoId: 'g1', usuarioIds: ['u1'] }),
      ).rejects.toMatchObject({ code: '23503' });
    });
  });
});
