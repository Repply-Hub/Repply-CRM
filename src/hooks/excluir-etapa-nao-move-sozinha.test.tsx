import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, cleanup, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * O QUE ESTE ARQUIVO PRENDE: que excluir uma etapa do funil NUNCA mova negócio quando a
 * exclusão não acontece.
 *
 * 🔴 POR QUE ELE EXISTE (item 39 da dívida técnica). A tela fazia duas gravações em sequência,
 * pelo navegador: primeiro movia os negócios da etapa para o destino, depois apagava a coluna.
 * Só a segunda é protegida (`kanban_colunas_delete` exige gestor), e apagar zero linhas não
 * devolve erro. Um vendedor comum — 12 dos 26 usuários não são gestores — via "Coluna excluída
 * e negócios remanejados", a coluna continuava lá, e os negócios dele tinham saído dela.
 *
 * 🔴 E MEXE NO DINHEIRO: se o destino for Fechamento ou Perdido, o gatilho
 * `fn_set_pedido_fechado_em` carimba a data de fechamento de HOJE em cada negócio movido. Eles
 * passam a contar como vendas fechadas hoje no Faturamento, no Ticket Médio e no Plano de
 * Vendas — podem ser centenas de uma vez, e a data verdadeira se perde.
 *
 * O conserto não foi inverter a ordem no navegador: duas gravações separadas sempre têm uma
 * janela entre elas (apagar a coluna e falhar ao mover deixaria os negócios numa etapa que não
 * existe mais). As duas viraram UMA operação no banco, `excluir_etapa_do_funil`, que ou
 * acontece inteira ou não acontece — e que recusa quando a regra de acesso não deixa apagar.
 *
 * Por isso o teste mais importante daqui é o primeiro: o navegador não pode ter um caminho
 * próprio para mover negócio ao excluir etapa. Dado sempre inventado (CLAUDE.md §6.9).
 */

const resposta: { data: unknown; error: unknown } = { data: 0, error: null };

/** Tudo que o hook pediu ao servidor — é o que prova que não sobrou gravação solta. */
const pedidosAoServidor: Array<{ op: string; alvo?: string; args?: unknown }> = [];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: async (nome: string, args: unknown) => {
      pedidosAoServidor.push({ op: 'rpc', alvo: nome, args });
      return { ...resposta };
    },
    from: (tabela: string) => ({
      update: () => {
        pedidosAoServidor.push({ op: 'update', alvo: tabela });
        return { eq: () => ({ eq: async () => ({ error: null }) }) };
      },
      delete: () => {
        pedidosAoServidor.push({ op: 'delete', alvo: tabela });
        return { eq: async () => ({ error: null }) };
      },
      select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }),
    }),
  },
}));

import { useDeleteKanbanColuna } from './use-kanban-colunas';

function envolver() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { wrapper };
}

const ENTRADA = { id: 'coluna-1', slug: 'proposta', targetSlug: 'negociacao', funilId: 'funil-1' };

beforeEach(() => {
  resposta.data = 0;
  resposta.error = null;
  pedidosAoServidor.length = 0;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('excluir etapa do funil', () => {
  it('🔴 o navegador NÃO move negócio: exclusão e remanejamento vão juntos, numa operação só', async () => {
    const { wrapper } = envolver();
    const { result } = renderHook(() => useDeleteKanbanColuna(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(ENTRADA);
    });

    expect(pedidosAoServidor.filter(p => p.alvo === 'pedidos')).toHaveLength(0);
    expect(pedidosAoServidor.map(p => p.op)).toEqual(['rpc']);
  });

  it('manda a etapa e o destino para a operação do banco', async () => {
    const { wrapper } = envolver();
    const { result } = renderHook(() => useDeleteKanbanColuna(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(ENTRADA);
    });

    expect(pedidosAoServidor[0]).toEqual({
      op: 'rpc',
      alvo: 'excluir_etapa_do_funil',
      args: { p_coluna_id: 'coluna-1', p_destino: 'negociacao' },
    });
  });

  it('🔴 quando o banco recusa a exclusão, a mutação falha e nenhum negócio é tocado', async () => {
    // 42501 é a recusa barulhenta da regra de acesso. `mensagemDeErro` a traduz na frase padrão
    // do projeto, que diz a causa e a saída (`recusa-do-banco.ts`) — por isso o teste cobra a
    // recusa e o silêncio sobre `pedidos`, não o texto exato.
    resposta.error = { message: 'permission denied', code: '42501' };
    const { wrapper } = envolver();
    const { result } = renderHook(() => useDeleteKanbanColuna(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync(ENTRADA)).rejects.toThrow();
    });

    expect(pedidosAoServidor.filter(p => p.alvo === 'pedidos')).toHaveLength(0);
  });

  it('devolve quantos negócios foram remanejados, para a tela poder dizer o número', async () => {
    resposta.data = 37;
    const { wrapper } = envolver();
    const { result } = renderHook(() => useDeleteKanbanColuna(), { wrapper });

    let movidos: unknown;
    await act(async () => {
      movidos = await result.current.mutateAsync(ENTRADA);
    });

    expect(movidos).toBe(37);
  });
});
