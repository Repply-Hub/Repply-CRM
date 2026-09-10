import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, cleanup, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * O QUE ESTE ARQUIVO PRENDE: que a tela de Tarefas pare de dizer que gravou quando não gravou.
 *
 * 🔴 POR QUE ELE EXISTE. A política `tarefas_delete` só deixa apagar quem é gestor ou tem a
 * funcionalidade `tarefas.excluir`; a `tarefas_update`, só quem é dono da tarefa (ou gestor).
 * Quem não passa NÃO recebe erro: a cláusula `USING` da regra não encontra a linha, o comando
 * mexe em zero registros e a resposta volta com `error: null`. O `catch` nunca dispara.
 *
 * Medido em 09/09/2026 na empresa de demonstração, com um `vendedor` sem `tarefas.excluir`:
 * "Tarefa excluída" na tela, tarefa intacta depois de recarregar; e "Etapa atualizada." numa
 * tarefa de outra pessoa, com o `updated_at` do banco parado em 31/08.
 *
 * A armadilha é irmã da do `CLAUDE.md` §4.6 e NÃO é a mesma: lá o erro existe e o `instanceof
 * Error` o esconde; aqui não há erro nenhum para esconder. Um teste que só cobrisse o `error`
 * passaria com o defeito de pé — por isso todos os casos abaixo mandam `error: null`.
 *
 * 🔴 O CASO QUE PARECE SOBRANDO É O MAIS IMPORTANTE: `count` NULO NÃO É RECUSA. Se alguém
 * trocar `count === 0` por `!count`, a tela passa a gritar "não foi excluída" em cima de
 * exclusões que funcionaram — a mesma mentira, virada do avesso, e mais cara: a pessoa apaga
 * de novo o que já saiu.
 */

/** A resposta que o esboço do Supabase devolve. Cada teste ajusta antes de chamar o hook. */
const resposta: { error: unknown; count: number | null | undefined } = { error: null, count: null };

/** O que foi pedido ao servidor, para provar que a contagem foi solicitada de verdade. */
const pedidosAoServidor: Array<{ op: string; count: unknown }> = [];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: 'auth-1' } } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { id: 'u1', nome: 'Fulano' }, error: null }),
        }),
      }),
      insert: async () => ({ error: null }),
      update: (_valores: unknown, opcoes?: { count?: string }) => {
        pedidosAoServidor.push({ op: 'update', count: opcoes?.count });
        return { eq: async () => ({ ...resposta }) };
      },
      delete: (opcoes?: { count?: string }) => {
        pedidosAoServidor.push({ op: 'delete', count: opcoes?.count });
        return {
          eq: async () => ({ ...resposta }),
          in: async () => ({ ...resposta }),
        };
      },
    }),
  },
}));

import {
  useDeleteTarefa,
  useUpdateTarefa,
  useBulkDeleteTarefas,
  frasesDaExclusaoEmMassa,
} from './use-tarefas';
import { esquecerEstadoDeCobranca, registrarEstadoDeCobranca } from '@/lib/recusa-do-banco';

function envolver() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { wrapper, qc };
}

beforeEach(() => {
  resposta.error = null;
  resposta.count = null;
  pedidosAoServidor.length = 0;
  // Empresa em dia: sobra a permissão como causa, que é o caso medido.
  registrarEstadoDeCobranca({ bloqueado: false, encerrada: false });
});

afterEach(() => {
  cleanup();
  esquecerEstadoDeCobranca();
  vi.clearAllMocks();
});

describe('excluir tarefa', () => {
  it('🔴 zero linhas apagadas NÃO é sucesso — o banco recusou em silêncio', async () => {
    resposta.count = 0;
    const { wrapper } = envolver();
    const { result } = renderHook(() => useDeleteTarefa(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync('t1')).rejects.toThrow();
    });
  });

  it('🔴 a frase diz o que aconteceu E o que fazer — não "erro ao excluir"', async () => {
    resposta.count = 0;
    const { wrapper } = envolver();
    const { result } = renderHook(() => useDeleteTarefa(), { wrapper });

    let frase = '';
    await act(async () => {
      await result.current.mutateAsync('t1').catch((e: Error) => { frase = e.message; });
    });

    // O que aconteceu: a tarefa continua lá. Sem isto a pessoa acha que apagou.
    expect(frase).toContain('NÃO foi excluída');
    expect(frase).toContain('continua na lista');
    // O que fazer: a saída é pedir a permissão, não tentar de novo.
    expect(frase).toContain('permissão');
    expect(frase).toContain('gestor');
  });

  it('pede a contagem ao servidor — sem isso não há o que conferir', async () => {
    resposta.count = 1;
    const { wrapper } = envolver();
    const { result } = renderHook(() => useDeleteTarefa(), { wrapper });

    await act(async () => { await result.current.mutateAsync('t1'); });

    expect(pedidosAoServidor).toContainEqual({ op: 'delete', count: 'exact' });
  });

  it('uma linha apagada é sucesso', async () => {
    resposta.count = 1;
    const { wrapper } = envolver();
    const { result } = renderHook(() => useDeleteTarefa(), { wrapper });

    await act(async () => { await expect(result.current.mutateAsync('t1')).resolves.toBeUndefined(); });
  });

  it('🔴 contagem ausente NÃO é recusa — `!count` inventaria erro em exclusão que funcionou', async () => {
    const { wrapper } = envolver();
    const { result } = renderHook(() => useDeleteTarefa(), { wrapper });

    resposta.count = null;
    await act(async () => { await expect(result.current.mutateAsync('t1')).resolves.toBeUndefined(); });

    resposta.count = undefined;
    await act(async () => { await expect(result.current.mutateAsync('t2')).resolves.toBeUndefined(); });
  });

  it('erro de verdade continua chegando inteiro — a recusa muda não substituiu a barulhenta', async () => {
    resposta.error = { code: '23503', message: 'violates foreign key constraint', details: 'na tabela x' };
    resposta.count = null;
    const { wrapper } = envolver();
    const { result } = renderHook(() => useDeleteTarefa(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync('t1')).rejects.toMatchObject({ code: '23503' });
    });
  });
});

describe('alterar tarefa', () => {
  it('🔴 zero linhas alteradas NÃO é sucesso — arrastar o cartão no Kanban é o caminho comum', async () => {
    resposta.count = 0;
    const { wrapper } = envolver();
    const { result } = renderHook(() => useUpdateTarefa(), { wrapper });

    let frase = '';
    await act(async () => {
      await result.current.mutateAsync({ id: 't1', status: 'concluida' }).catch((e: Error) => { frase = e.message; });
    });

    expect(frase).toContain('NÃO foi alterada');
    expect(frase).toContain('continua como estava');
    expect(frase).toContain('gestor');
  });

  it('pede a contagem ao servidor', async () => {
    resposta.count = 1;
    const { wrapper } = envolver();
    const { result } = renderHook(() => useUpdateTarefa(), { wrapper });

    await act(async () => { await result.current.mutateAsync({ id: 't1', status: 'concluida' }); });

    expect(pedidosAoServidor).toContainEqual({ op: 'update', count: 'exact' });
  });

  it('uma linha alterada é sucesso', async () => {
    resposta.count = 1;
    const { wrapper } = envolver();
    const { result } = renderHook(() => useUpdateTarefa(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync({ id: 't1', status: 'concluida' })).resolves.toBeUndefined();
    });
  });
});

describe('excluir tarefas em massa', () => {
  it('🔴 devolve o que o banco apagou, não o que a tela pediu', async () => {
    resposta.count = 0;
    const { wrapper } = envolver();
    const { result } = renderHook(() => useBulkDeleteTarefas(), { wrapper });

    let resultado: { pedidas: number; removidas: number } | undefined;
    await act(async () => { resultado = await result.current.mutateAsync(['a', 'b', 'c']); });

    expect(resultado).toEqual({ pedidas: 3, removidas: 0 });
  });

  it('pede a contagem ao servidor em cada lote', async () => {
    resposta.count = 2;
    const { wrapper } = envolver();
    const { result } = renderHook(() => useBulkDeleteTarefas(), { wrapper });

    await act(async () => { await result.current.mutateAsync(['a', 'b']); });

    expect(pedidosAoServidor).toContainEqual({ op: 'delete', count: 'exact' });
  });

  it('seleção vazia não fala com o banco', async () => {
    const { wrapper } = envolver();
    const { result } = renderHook(() => useBulkDeleteTarefas(), { wrapper });

    let resultado: { pedidas: number; removidas: number } | undefined;
    await act(async () => { resultado = await result.current.mutateAsync([]); });

    expect(resultado).toEqual({ pedidas: 0, removidas: 0 });
    expect(pedidosAoServidor).toHaveLength(0);
  });
});

describe('frasesDaExclusaoEmMassa', () => {
  it('🔴 nenhuma removida é RECUSA, nunca "0 tarefa(s) removida(s)!"', () => {
    const { tipo, frase } = frasesDaExclusaoEmMassa({ pedidas: 4, removidas: 0 });

    expect(tipo).toBe('recusa');
    expect(frase).toContain('Nenhuma das 4');
    expect(frase).toContain('continuam na lista');
    expect(frase).toContain('gestor');
  });

  it('🔴 removida em parte é RESSALVA — dizer "4 removidas" com 2 na tela é o mesmo defeito', () => {
    const { tipo, frase } = frasesDaExclusaoEmMassa({ pedidas: 4, removidas: 2 });

    expect(tipo).toBe('parcial');
    expect(frase).toContain('2 de 4');
    expect(frase).toContain('As outras 2 continuam na lista');
  });

  it('todas removidas é sucesso, e o número é o que saiu', () => {
    expect(frasesDaExclusaoEmMassa({ pedidas: 3, removidas: 3 })).toEqual({
      tipo: 'sucesso',
      frase: '3 tarefas excluídas.',
    });
    expect(frasesDaExclusaoEmMassa({ pedidas: 1, removidas: 1 })).toEqual({
      tipo: 'sucesso',
      frase: 'Tarefa excluída.',
    });
  });

  it('🔴 empresa bloqueada muda a saída: pagar, não pedir permissão', () => {
    registrarEstadoDeCobranca({ bloqueado: true, encerrada: false });

    const { frase } = frasesDaExclusaoEmMassa({ pedidas: 2, removidas: 0 });

    expect(frase).toContain('bloqueado');
    expect(frase).toContain('regularizar');
    expect(frase).not.toContain('Peça a um gestor');
  });
});
