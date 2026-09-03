import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, cleanup, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * A camada de dados dos responsáveis de um negócio.
 *
 * 🔴 DUAS COISAS AQUI SÃO DECISÃO DE NEGÓCIO, não detalhe técnico, e por isso têm teste:
 *
 *   1. ACRESCENTAR PARTICIPANTE NÃO MEXE EM DINHEIRO. Só trocar a estrela move o valor do
 *      negócio de uma pessoa para outra. Se as duas ações recarregassem os oito painéis de
 *      dinheiro, a diferença entre elas ficaria invisível no código — e a primeira pessoa a
 *      "simplificar" juntaria as duas.
 *
 *   2. A RECUSA DA REGRA DE SEGURANÇA NÃO DEVOLVE ERRO. Ela devolve sucesso com zero linhas.
 *      Sem conferir, a tela diz "responsável adicionado" sobre gravação que não aconteceu.
 */

const toastSucesso = vi.fn();
const toastErro = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...a: unknown[]) => toastSucesso(...a),
    error: (...a: unknown[]) => toastErro(...a),
  },
}));

const invalidouPaineis = vi.fn();
vi.mock('@/hooks/use-pedidos', () => ({
  invalidarPaineisDeNegocios: (...a: unknown[]) => invalidouPaineis(...a),
}));

let respostaDaLista: { data: unknown; error: unknown } = { data: [], error: null };
let respostaDoInsert: { data: unknown; error: unknown } = { data: [{ usuario_id: 'u2' }], error: null };
let respostaDoDelete: { error: unknown } = { error: null };
let respostaDaRpc: { error: unknown } = { error: null };
const inseriu = vi.fn();
const chamouRpc = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: async () => respostaDaLista }),
      insert: (payload: unknown) => {
        inseriu(payload);
        return { select: async () => respostaDoInsert };
      },
      delete: () => ({ eq: () => ({ eq: async () => respostaDoDelete }) }),
    }),
    rpc: (nome: string, args: unknown) => {
      chamouRpc(nome, args);
      return Promise.resolve(respostaDaRpc);
    },
  },
}));

import {
  useResponsaveisDoNegocio,
  useAdicionarResponsavel,
  useRemoverResponsavel,
  useDefinirPrincipal,
} from './use-responsaveis-do-negocio';

const PEDIDO = 'ped-1';

function envolver() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { wrapper, client };
}

beforeEach(() => {
  respostaDaLista = { data: [], error: null };
  respostaDoInsert = { data: [{ usuario_id: 'u2' }], error: null };
  respostaDoDelete = { error: null };
  respostaDaRpc = { error: null };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('useResponsaveisDoNegocio', () => {
  it('🔴 o principal vem primeiro, e o resto em ordem alfabética', async () => {
    respostaDaLista = {
      data: [
        { usuario_id: 'u3', principal: false, usuarios: { nome: 'Zeca', avatar_url: null } },
        { usuario_id: 'u1', principal: false, usuarios: { nome: 'Ana', avatar_url: null } },
        { usuario_id: 'u2', principal: true, usuarios: { nome: 'Mario', avatar_url: null } },
      ],
      error: null,
    };
    const { wrapper } = envolver();
    const { result } = renderHook(() => useResponsaveisDoNegocio(PEDIDO), { wrapper });

    await waitFor(() => expect(result.current.data).toHaveLength(3));
    expect(result.current.data!.map((r) => r.nome)).toEqual(['Mario', 'Ana', 'Zeca']);
    expect(result.current.data![0].principal).toBe(true);
  });

  it('pessoa sem nome não quebra a lista', async () => {
    respostaDaLista = {
      data: [{ usuario_id: 'u1', principal: true, usuarios: null }],
      error: null,
    };
    const { wrapper } = envolver();
    const { result } = renderHook(() => useResponsaveisDoNegocio(PEDIDO), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(result.current.data![0].nome).toBe('Sem nome');
  });

  it('sem negócio não consulta nada', () => {
    const { wrapper } = envolver();
    const { result } = renderHook(() => useResponsaveisDoNegocio(null), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('acrescentar responsável', () => {
  it('entra como PARTICIPANTE, nunca como principal', async () => {
    const { wrapper } = envolver();
    const { result } = renderHook(() => useAdicionarResponsavel(PEDIDO), { wrapper });

    await act(async () => { await result.current.mutateAsync('u2'); });
    expect(inseriu).toHaveBeenCalledWith({ pedido_id: PEDIDO, usuario_id: 'u2', principal: false });
  });

  it('🔴 zero linhas NÃO é sucesso — é recusa silenciosa da regra de segurança', async () => {
    respostaDoInsert = { data: [], error: null };
    const { wrapper } = envolver();
    const { result } = renderHook(() => useAdicionarResponsavel(PEDIDO), { wrapper });

    await act(async () => { await result.current.mutateAsync('u2').catch(() => {}); });
    expect(toastErro).toHaveBeenCalled();
    expect(toastSucesso).not.toHaveBeenCalled();
    expect(toastErro.mock.calls[0][0]).toMatch(/não autorizou/i);
  });

  it('🔴 acrescentar participante NÃO recarrega os painéis de dinheiro', async () => {
    // Nenhum valor mudou de dono. Recarregar os oito painéis pesados a cada participante
    // seria trabalho à toa — e apagaria, no código, a diferença entre participar e levar.
    const { wrapper } = envolver();
    const { result } = renderHook(() => useAdicionarResponsavel(PEDIDO), { wrapper });

    await act(async () => { await result.current.mutateAsync('u2'); });
    expect(invalidouPaineis).not.toHaveBeenCalled();
  });
});

describe('remover responsável', () => {
  it('🔴 a recusa do banco chega inteira à tela', async () => {
    // O banco recusa remover o principal com uma frase pronta em português. Ela é melhor que
    // qualquer coisa que a tela invente, porque diz o que fazer: passar a estrela antes.
    respostaDoDelete = {
      error: {
        code: '23514',
        message: 'Este é o responsável principal do negócio. Passe a estrela para outra pessoa antes de removê-lo.',
      },
    };
    const { wrapper } = envolver();
    const { result } = renderHook(() => useRemoverResponsavel(PEDIDO), { wrapper });

    await act(async () => { await result.current.mutateAsync('u1').catch(() => {}); });
    expect(toastErro.mock.calls[0][0]).toMatch(/passe a estrela/i);
  });
});

describe('trocar quem leva o valor', () => {
  it('🔴 passa pela função do banco, não por dois updates da tela', async () => {
    // O banco proíbe dois principais: promover antes de rebaixar é recusado. A função faz a
    // ordem certa numa chamada só.
    const { wrapper } = envolver();
    const { result } = renderHook(() => useDefinirPrincipal(PEDIDO), { wrapper });

    await act(async () => { await result.current.mutateAsync('u2'); });
    expect(chamouRpc).toHaveBeenCalledWith('definir_responsavel_principal', {
      p_pedido_id: PEDIDO,
      p_usuario_id: 'u2',
    });
  });

  it('🔴 AQUI SIM recarrega os painéis de dinheiro — o valor mudou de dono', async () => {
    const { wrapper } = envolver();
    const { result } = renderHook(() => useDefinirPrincipal(PEDIDO), { wrapper });

    await act(async () => { await result.current.mutateAsync('u2'); });
    expect(invalidouPaineis).toHaveBeenCalled();
  });

  it('e o aviso diz o que aconteceu com o dinheiro, não "salvo"', async () => {
    const { wrapper } = envolver();
    const { result } = renderHook(() => useDefinirPrincipal(PEDIDO), { wrapper });

    await act(async () => { await result.current.mutateAsync('u2'); });
    expect(toastSucesso.mock.calls[0][0]).toMatch(/valor deste negócio/i);
  });

  it('falha na função não finge que deu certo', async () => {
    respostaDaRpc = { error: { message: 'Esta pessoa não é responsável por este negócio.' } };
    const { wrapper } = envolver();
    const { result } = renderHook(() => useDefinirPrincipal(PEDIDO), { wrapper });

    await act(async () => { await result.current.mutateAsync('u9').catch(() => {}); });
    expect(toastSucesso).not.toHaveBeenCalled();
    expect(invalidouPaineis).not.toHaveBeenCalled();
  });
});
