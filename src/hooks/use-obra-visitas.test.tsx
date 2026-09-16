import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, cleanup, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * `useMarcarVisitaRealizada` grava (ou apaga) as respostas da visita.
 *
 * 🔴 DESMARCAR NÃO APAGA A ANOTAÇÃO — decisão do dono do produto de 16/09/2026, a mesma regra
 * que `NovaRotaVisitaDialog.tsx` já segue. Ao desmarcar, o `update` manda SÓ `visita_realizada:
 * false`: nenhuma das outras colunas aparece no payload, então nenhuma delas é tocada. Apagar
 * de propósito continua possível — é marcar de novo, limpar os campos e salvar.
 *
 * 🔴 ZERO LINHAS NÃO É SUCESSO (CLAUDE.md §4.6). A política de `eventos` pode recusar o
 * `UPDATE` sem erro nenhum — o `USING` não acha a linha e a resposta volta com `count: 0`. Sem
 * conferir a contagem, a tela comemoraria uma gravação que não aconteceu.
 */

let respostaDoUpdate: { error: unknown; count: number | null } = { error: null, count: 1 };
const atualizou = vi.fn();
const filtrouPorGrupo = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      update: (payload: unknown, options?: unknown) => {
        atualizou(payload, options);
        return {
          eq: (coluna: string, valor: unknown) => {
            filtrouPorGrupo(coluna, valor);
            return Promise.resolve(respostaDoUpdate);
          },
        };
      },
    }),
  },
}));

import { useMarcarVisitaRealizada, type RespostasDaVisita } from './use-obra-visitas';

const RESPOSTAS: RespostasDaVisita = {
  fase: 'acabamento',
  concorrentes: 'Marca Exemplo',
  contatoId: 'contato-1',
  proximoPasso: 'Mandar proposta de louças',
  proximoPassoEm: '2026-09-20',
  observacao: 'Obra parada por chuva',
};

function envolver() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { wrapper };
}

beforeEach(() => {
  respostaDoUpdate = { error: null, count: 1 };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('useMarcarVisitaRealizada', () => {
  it('marcar como realizada grava as cinco colunas da análise, com vazio virando null', async () => {
    const { wrapper } = envolver();
    const { result } = renderHook(() => useMarcarVisitaRealizada(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        grupoId: 'grupo-1',
        obraId: 'obra-1',
        realizada: true,
        observacao: RESPOSTAS.observacao,
        respostas: { ...RESPOSTAS, concorrentes: '' },
      });
    });

    expect(atualizou).toHaveBeenCalledWith(
      {
        visita_realizada: true,
        visita_observacao: 'Obra parada por chuva',
        visita_fase: 'acabamento',
        visita_concorrentes: null,
        visita_contato_id: 'contato-1',
        visita_proximo_passo: 'Mandar proposta de louças',
        visita_proximo_passo_em: '2026-09-20',
      },
      { count: 'exact' },
    );
    expect(filtrouPorGrupo).toHaveBeenCalledWith('grupo_id', 'grupo-1');
  });

  it('🔴 marcar como realizada SEM respostas não apaga a análise já salva — nenhuma das cinco chaves entra no payload', async () => {
    const { wrapper } = envolver();
    const { result } = renderHook(() => useMarcarVisitaRealizada(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        grupoId: 'grupo-1',
        obraId: 'obra-1',
        realizada: true,
        observacao: 'Obra parada por chuva',
      });
    });

    const payloadEnviado = atualizou.mock.calls[0][0];
    expect(Object.keys(payloadEnviado)).toEqual(['visita_realizada', 'visita_observacao']);
    expect(payloadEnviado).toEqual({ visita_realizada: true, visita_observacao: 'Obra parada por chuva' });
  });

  it('🔴 desmarcar manda SÓ visita_realizada: false — nenhuma outra chave no payload', async () => {
    const { wrapper } = envolver();
    const { result } = renderHook(() => useMarcarVisitaRealizada(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        grupoId: 'grupo-1',
        obraId: 'obra-1',
        realizada: false,
      });
    });

    expect(atualizou).toHaveBeenCalledWith({ visita_realizada: false }, { count: 'exact' });
    const payloadEnviado = atualizou.mock.calls[0][0];
    expect(Object.keys(payloadEnviado)).toEqual(['visita_realizada']);
    expect(filtrouPorGrupo).toHaveBeenCalledWith('grupo_id', 'grupo-1');
  });

  it('🔴 zero linhas não é sucesso — a mutação erra em vez de fingir que gravou', async () => {
    respostaDoUpdate = { error: null, count: 0 };
    const { wrapper } = envolver();
    const { result } = renderHook(() => useMarcarVisitaRealizada(), { wrapper });

    await act(async () => {
      await result.current
        .mutateAsync({ grupoId: 'grupo-1', obraId: 'obra-1', realizada: true, respostas: RESPOSTAS })
        .catch(() => {});
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toMatch(/NÃO foi/i);
  });

  it('🔴 desmarcar com zero linhas usa frase própria — não reaproveita "Registrar visita"', async () => {
    respostaDoUpdate = { error: null, count: 0 };
    const { wrapper } = envolver();
    const { result } = renderHook(() => useMarcarVisitaRealizada(), { wrapper });

    await act(async () => {
      await result.current
        .mutateAsync({ grupoId: 'grupo-1', obraId: 'obra-1', realizada: false })
        .catch(() => {});
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    const mensagem = (result.current.error as Error).message;
    expect(mensagem).toMatch(/NÃO foi desmarcada/i);
    expect(mensagem).not.toMatch(/Registrar visita/i);
  });

  it('count nulo (sem cabeçalho de contagem) NÃO é tratado como recusa', async () => {
    respostaDoUpdate = { error: null, count: null };
    const { wrapper } = envolver();
    const { result } = renderHook(() => useMarcarVisitaRealizada(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ grupoId: 'grupo-1', obraId: 'obra-1', realizada: false });
    });

    expect(result.current.isError).toBe(false);
  });
});
