import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, cleanup, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RESPOSTAS_VAZIAS, type RespostasDaVisita } from '@/lib/analise-da-visita';

/**
 * `useMarcarVisitaRealizada` grava (ou apaga) as respostas da visita — e, desde a Tarefa 7a
 * (16/09/2026), também pode criar a TAREFA do próximo passo.
 *
 * 🔴 DESMARCAR NÃO APAGA A ANOTAÇÃO — decisão do dono do produto de 16/09/2026, a mesma regra
 * que `NovaRotaVisitaDialog.tsx` já segue. Ao desmarcar, o `update` manda SÓ `visita_realizada:
 * false`: nenhuma das outras colunas aparece no payload, então nenhuma delas é tocada. Apagar
 * de propósito continua possível — é marcar de novo, limpar os campos e salvar.
 *
 * 🔴 ZERO LINHAS NÃO É SUCESSO (CLAUDE.md §4.6). A política de `eventos` pode recusar o
 * `UPDATE` sem erro nenhum — o `USING` não acha a linha e a resposta volta com `count: 0`. Sem
 * conferir a contagem, a tela comemoraria uma gravação que não aconteceu.
 *
 * 🔴 A TAREFA DO PRÓXIMO PASSO É CONSEQUÊNCIA, NÃO É O TRABALHO (Tarefa 7a). A visita tem que
 * gravar sozinha, sempre — a segunda descrição de testes abaixo prova isso: a tarefa só nasce
 * com texto + data + caixinha marcada, e a FALHA dela não pode derrubar a gravação da visita.
 */

const toastAviso = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    warning: (...a: unknown[]) => toastAviso(...a),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

let respostaDoUpdate: { error: unknown; count: number | null } = { error: null, count: 1 };
let respostaDoUsuario: { data: unknown; error: unknown } = {
  data: { id: 'usuario-1', nome: 'Ana Souza' },
  error: null,
};
let respostaDoInsertTarefa: { error: unknown } = { error: null };

const atualizou = vi.fn();
const filtrouPorGrupo = vi.fn();
const inseriuTarefa = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (tabela: string) => {
      if (tabela === 'eventos') {
        return {
          update: (payload: unknown, options?: unknown) => {
            atualizou(payload, options);
            return {
              eq: (coluna: string, valor: unknown) => {
                filtrouPorGrupo(coluna, valor);
                return Promise.resolve(respostaDoUpdate);
              },
            };
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

const RESPOSTAS: RespostasDaVisita = {
  fase: 'acabamento',
  concorrentes: 'Marca Exemplo',
  contatoId: 'contato-1',
  proximoPasso: 'Mandar proposta de louças',
  proximoPassoEm: '2026-09-20',
  observacao: 'Obra parada por chuva',
  criarTarefa: true,
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
  respostaDoUsuario = { data: { id: 'usuario-1', nome: 'Ana Souza' }, error: null };
  respostaDoInsertTarefa = { error: null };
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

describe('useMarcarVisitaRealizada — a tarefa do próximo passo (Tarefa 7a)', () => {
  const NOME_OBRA = 'Obra Exemplo';
  const CLIENTE_ID = 'cliente-1';

  function respostasComProximoPasso(patch: Partial<RespostasDaVisita> = {}): RespostasDaVisita {
    return {
      ...RESPOSTAS_VAZIAS,
      proximoPasso: 'Mandar proposta de louças',
      proximoPassoEm: '2026-09-20',
      ...patch,
    };
  }

  it('próximo passo com data e caixinha marcada vira tarefa, com o nome da obra no título', async () => {
    const { wrapper } = envolver();
    const { result } = renderHook(() => useMarcarVisitaRealizada(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        grupoId: 'grupo-1',
        obraId: 'obra-1',
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
        grupoId: 'grupo-1',
        obraId: 'obra-1',
        realizada: true,
        observacao: '',
        respostas: respostasComProximoPasso({ criarTarefa: true }),
        nomeObra: NOME_OBRA,
        clienteId: CLIENTE_ID,
      });
    });

    // A visita gravou — o `update` de `eventos` rodou e a promessa não foi rejeitada.
    expect(atualizou).toHaveBeenCalled();
    expect(retorno?.avisoDaTarefa).toMatch(/tarefa do próximo passo não/i);
  });

  it('sem data, nenhuma tarefa é criada', async () => {
    const { wrapper } = envolver();
    const { result } = renderHook(() => useMarcarVisitaRealizada(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        grupoId: 'grupo-1',
        obraId: 'obra-1',
        realizada: true,
        observacao: '',
        respostas: { ...RESPOSTAS_VAZIAS, proximoPasso: 'Voltar lá', proximoPassoEm: '', criarTarefa: true },
        nomeObra: NOME_OBRA,
        clienteId: CLIENTE_ID,
      });
    });

    expect(inseriuTarefa).not.toHaveBeenCalled();
    expect(atualizou).toHaveBeenCalled();
  });

  it('caixinha desmarcada (criarTarefa: false) NÃO cria tarefa mesmo com data', async () => {
    const { wrapper } = envolver();
    const { result } = renderHook(() => useMarcarVisitaRealizada(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        grupoId: 'grupo-1',
        obraId: 'obra-1',
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
        grupoId: 'grupo-1',
        obraId: 'obra-1',
        realizada: false,
      });
    });

    expect(inseriuTarefa).not.toHaveBeenCalled();
    expect(atualizou).toHaveBeenCalled();
  });
});
