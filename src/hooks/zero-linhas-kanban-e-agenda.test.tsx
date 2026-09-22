import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, cleanup, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * O QUE ESTE ARQUIVO PRENDE: que reordenar etapas do funil e excluir compromisso da agenda
 * parem de dizer que gravaram quando não gravaram (item 47 da dívida técnica).
 *
 * 🔴 ZERO LINHAS NÃO É SUCESSO (CLAUDE.md §4.6). Quando a regra de acesso barra um `UPDATE` ou
 * um `DELETE`, o banco não reclama: a cláusula `USING` não encontra a linha, o comando mexe em
 * zero registros e a resposta volta com `error: null`. O `catch` nunca dispara.
 *
 * As duas telas erravam de jeitos diferentes, e por isso os dois blocos abaixo:
 *   · reordenar etapas nem o erro conferia — um `Promise.all` de gravações cujo resultado era
 *     descartado. A ordem voltava sozinha ao recarregar, sem nada explicar;
 *   · excluir compromisso conferia o erro, mas não quantas linhas saíram. A consequência é de
 *     mundo real: a tela diz "excluído para todos os participantes", o compromisso segue na
 *     agenda de todo mundo, e alguém aparece numa visita cancelada.
 *
 * A causa mais provável dos dois hoje não é falta de permissão: é **empresa bloqueada por
 * cobrança**. As políticas `<tabela>_exige_plano_*` são restritivas e usam `USING`, então
 * zeram as linhas de TODA escrita do sistema, em silêncio.
 *
 * 🔴 O CASO QUE PARECE SOBRANDO É O MAIS IMPORTANTE: `count` nulo NÃO é recusa. Trocar
 * `count === 0` por `!count` grita "não foi excluído" em cima de exclusões que funcionaram.
 *
 * Dado sempre inventado (CLAUDE.md §6.9).
 */

const resposta: { error: unknown; count: number | null | undefined } = { error: null, count: 1 };

/** O que foi pedido ao servidor — prova que a contagem foi solicitada de verdade. */
const pedidosAoServidor: Array<{ op: string; tabela: string; count: unknown }> = [];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (tabela: string) => ({
      update: (_valores: unknown, opcoes?: { count?: string }) => {
        pedidosAoServidor.push({ op: 'update', tabela, count: opcoes?.count });
        return { eq: async () => ({ ...resposta }) };
      },
      delete: (opcoes?: { count?: string }) => {
        pedidosAoServidor.push({ op: 'delete', tabela, count: opcoes?.count });
        return { eq: async () => ({ ...resposta }) };
      },
    }),
  },
}));

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'auth-1' } }),
}));

import { useReorderKanbanColunas } from './use-kanban-colunas';
import { useDeleteEvento } from './use-eventos';
import { esquecerEstadoDeCobranca, registrarEstadoDeCobranca } from '@/lib/recusa-do-banco';

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
  resposta.count = 1;
  pedidosAoServidor.length = 0;
  // Empresa em dia: sobra a permissão como causa, e a frase fica determinística.
  registrarEstadoDeCobranca({ bloqueado: false, encerrada: false });
});

afterEach(() => {
  cleanup();
  esquecerEstadoDeCobranca();
  vi.clearAllMocks();
});

describe('reordenar etapas do funil', () => {
  it('🔴 nenhuma linha mexida NÃO é sucesso — a ordem voltaria ao recarregar, sem aviso', async () => {
    resposta.count = 0;
    const { wrapper } = envolver();
    const { result } = renderHook(() => useReorderKanbanColunas(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync(['c1', 'c2'])).rejects.toThrow(/ordem/i);
    });
  });

  it('pede a contagem ao servidor em cada gravação', async () => {
    const { wrapper } = envolver();
    const { result } = renderHook(() => useReorderKanbanColunas(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(['c1', 'c2', 'c3']);
    });

    expect(pedidosAoServidor).toHaveLength(3);
    expect(pedidosAoServidor.every(p => p.count === 'exact')).toBe(true);
  });

  it('erro do banco continua subindo', async () => {
    resposta.error = { message: 'boom', code: 'XX000' };
    const { wrapper } = envolver();
    const { result } = renderHook(() => useReorderKanbanColunas(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync(['c1'])).rejects.toThrow();
    });
  });

  it('🔴 contagem nula não é recusa: o servidor só não mandou o número', async () => {
    resposta.count = null;
    const { wrapper } = envolver();
    const { result } = renderHook(() => useReorderKanbanColunas(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync(['c1'])).resolves.not.toThrow();
    });
  });
});

describe('excluir compromisso da agenda', () => {
  const COMPROMISSO = { id: 'ev-1', grupoId: 'grupo-1', criadoPor: 'auth-1' };

  it('🔴 zero linhas apagadas NÃO é sucesso — o compromisso seguiria na agenda de todos', async () => {
    resposta.count = 0;
    const { wrapper } = envolver();
    const { result } = renderHook(() => useDeleteEvento(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync(COMPROMISSO)).rejects.toThrow(/não foi excluído/i);
    });
  });

  it('pede a contagem ao servidor', async () => {
    const { wrapper } = envolver();
    const { result } = renderHook(() => useDeleteEvento(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(COMPROMISSO);
    });

    expect(pedidosAoServidor[0]).toEqual({ op: 'delete', tabela: 'eventos', count: 'exact' });
  });

  it('🔴 contagem nula não é recusa', async () => {
    resposta.count = null;
    const { wrapper } = envolver();
    const { result } = renderHook(() => useDeleteEvento(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync(COMPROMISSO)).resolves.not.toThrow();
    });
  });

  it('quem só participa continua conseguindo sair do compromisso', async () => {
    const { wrapper } = envolver();
    const { result } = renderHook(() => useDeleteEvento(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: 'ev-1', grupoId: 'grupo-1', criadoPor: 'outra-pessoa' });
    });

    expect(pedidosAoServidor[0].op).toBe('delete');
  });
});
