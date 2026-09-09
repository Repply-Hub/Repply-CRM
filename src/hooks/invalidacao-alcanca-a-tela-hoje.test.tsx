import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, cleanup, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * O QUE ESTE ARQUIVO PRENDE: que trabalhar um negócio pelo painel atualize a tela "Hoje".
 *
 * 🔴 POR QUE ELE EXISTE. Até 09/09/2026 o botão "Nova Tarefa" e a estrela de responsável só
 * existiam DENTRO da tela de Negócios, que não mostra nem a fila nem a tabela de risco. Quando o
 * painel do negócio passou a abrir por cima da tela "Hoje", o gesto ficou a um clique da tela que
 * ele muda — e as invalidações não foram junto. O resultado media-se em meia hora de tela errada
 * (`usePauta` guarda 30 minutos e o app não refaz consulta ao voltar o foco): a pessoa criava a
 * tarefa, a fila não se mexia, e a leitura natural era "não salvou".
 *
 * As duas consultas da tela "Hoje" usam "tem tarefa aberta" como critério, e é isso que as
 * amarra a uma tabela que não é a delas:
 *
 *   · a FILA (`pauta_do_dia_de`) põe a tarefa com prazo hoje na lista como compromisso E desconta
 *     uma vaga (`v_vagas = v_max - v_compromissos`), então um negócio parado sai no mesmo gesto;
 *   · a TABELA DE RISCO (`dashboard_negocios_risco`) calcula `sem_proxima_acao` como
 *     `NOT EXISTS (tarefas do negócio com status <> 'concluida')`.
 *
 * A fila depende ainda do NEGÓCIO em si: ela junta `pedidos` por `usuario_id` e desenha valor,
 * etapa e data — por isso `'pauta-do-dia'` também entrou em `invalidarPaineisDeNegocios`.
 *
 * 🔴 A LISTA TAMBÉM É CURTA DE PROPÓSITO, e o último caso prende isso. Invalidação a mais é
 * requisição paga numa tela pesada: criar tarefa não move dinheiro nenhum, então os painéis de
 * faturamento ficam de fora. Se alguém acrescentar chave aqui, que seja sabendo dizer por quê.
 */

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
      update: () => ({ eq: async () => ({ error: null }) }),
      delete: () => ({ eq: async () => ({ error: null }) }),
    }),
  },
}));

import { useCreateTarefa, useUpdateTarefa, useDeleteTarefa } from './use-tarefas';
import { invalidarPaineisDeNegocios } from './use-pedidos';

/** A chave da fila, como `usePauta` a escreve — com HÍFEN. Com sublinhado não casa nada. */
const FILA = ['pauta-do-dia'];

/**
 * A chave da tabela de risco como a TELA a monta, com os seis recortes na cauda
 * (`use-dashboard.ts`). Está inteira aqui de propósito: é ela que prova que invalidar por
 * `['dashboard_negocios_risco']` alcança a consulta de verdade — `invalidateQueries` compara
 * elemento a elemento, e a chave mais curta casa as mais longas que começam igual.
 */
const RISCO = ['dashboard_negocios_risco', 'emp-1', null, null, null, 7, null];

const TAREFAS_DO_NEGOCIO = ['tarefas_por_pedido', 'ped-1'];

function envolver() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  // Semeia o cache como a tela o deixaria. Sem observador montado, `invalidateQueries` marca a
  // consulta como velha sem disparar requisição — e é essa marca que se lê aqui.
  qc.setQueryData(FILA, []);
  qc.setQueryData(RISCO, {});
  qc.setQueryData(TAREFAS_DO_NEGOCIO, []);
  qc.setQueryData(['pedidos_stats'], {});
  qc.setQueryData(['vw_faturamento_mensal'], []);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { wrapper, qc };
}

const velha = (qc: QueryClient, chave: unknown[]) => qc.getQueryState(chave)?.isInvalidated === true;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('criar tarefa', () => {
  it('🔴 recarrega a fila da tela "Hoje" — a tarefa entra nela e empurra um negócio para fora', async () => {
    const { wrapper, qc } = envolver();
    const { result } = renderHook(() => useCreateTarefa(), { wrapper });

    await act(async () => { await result.current.mutateAsync({ titulo: 'Ligar amanhã', pedido_id: 'ped-1' }); });

    expect(velha(qc, FILA)).toBe(true);
  });

  it('🔴 recarrega a tabela "Os 10 maiores em risco" — o negócio deixa de estar sem próxima ação', async () => {
    const { wrapper, qc } = envolver();
    const { result } = renderHook(() => useCreateTarefa(), { wrapper });

    await act(async () => { await result.current.mutateAsync({ titulo: 'Ligar amanhã', pedido_id: 'ped-1' }); });

    expect(velha(qc, RISCO)).toBe(true);
  });

  it('🔴 NÃO recarrega os painéis de dinheiro — nenhum valor mudou de lugar', async () => {
    const { wrapper, qc } = envolver();
    const { result } = renderHook(() => useCreateTarefa(), { wrapper });

    await act(async () => { await result.current.mutateAsync({ titulo: 'Ligar amanhã', pedido_id: 'ped-1' }); });

    expect(velha(qc, ['pedidos_stats'])).toBe(false);
    expect(velha(qc, ['vw_faturamento_mensal'])).toBe(false);
  });
});

describe('editar tarefa', () => {
  it('🔴 recarrega a fila e a tabela de risco — concluir ou mudar o prazo tira a tarefa das duas', async () => {
    const { wrapper, qc } = envolver();
    const { result } = renderHook(() => useUpdateTarefa(), { wrapper });

    await act(async () => { await result.current.mutateAsync({ id: 't1', status: 'concluida' }); });

    expect(velha(qc, FILA)).toBe(true);
    expect(velha(qc, RISCO)).toBe(true);
  });

  it('🔴 recarrega a tabela de tarefas do próprio painel, mesmo sem saber de qual negócio', async () => {
    // A tela de Tarefas manda só `{ id, status }` ao arrastar o card: o negócio não chega aqui.
    // Por isso a invalidação é pela chave curta, que casa toda busca por negócio.
    const { wrapper, qc } = envolver();
    const { result } = renderHook(() => useUpdateTarefa(), { wrapper });

    await act(async () => { await result.current.mutateAsync({ id: 't1', status: 'concluida' }); });

    expect(velha(qc, TAREFAS_DO_NEGOCIO)).toBe(true);
  });
});

describe('excluir tarefa', () => {
  it('🔴 recarrega a fila, a tabela de risco e a tabela do painel', async () => {
    const { wrapper, qc } = envolver();
    const { result } = renderHook(() => useDeleteTarefa(), { wrapper });

    await act(async () => { await result.current.mutateAsync('t1'); });

    expect(velha(qc, FILA)).toBe(true);
    expect(velha(qc, RISCO)).toBe(true);
    expect(velha(qc, TAREFAS_DO_NEGOCIO)).toBe(true);
  });
});

describe('invalidarPaineisDeNegocios', () => {
  it('🔴 alcança a fila da tela "Hoje" — trocar o responsável tira o negócio da fila de quem passou', () => {
    const { qc } = envolver();

    invalidarPaineisDeNegocios(qc);

    expect(velha(qc, FILA)).toBe(true);
  });
});
