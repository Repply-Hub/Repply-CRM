import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

/**
 * `useTrocarPosicaoImagemDaAjuda` troca a ORDEM de duas fotos já enviadas, mexendo só no
 * campo `chave` (chave primária) — nunca no `path` (arquivo de verdade no balde). Como
 * `chave` é única, a troca precisa de uma chave temporária no meio do caminho (o mesmo
 * truque de trocar duas variáveis sem uma terceira, só que aqui cada passo é uma chamada de
 * rede separada). O que se prende aqui é exatamente essa dança de 3 passos: o caminho feliz
 * e o que acontece quando a regra de acesso barra um dos passos no meio.
 *
 * Nomes inventados — não há dado de cliente aqui.
 */

const updateEq = vi.fn();
const update = vi.fn();
const from = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...a: unknown[]) => from(...a) },
}));

import { useTrocarPosicaoImagemDaAjuda } from './use-ajuda-imagens';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  from.mockReset().mockReturnValue({ update });
  update.mockReset().mockReturnValue({ eq: updateEq });
  updateEq.mockReset();
});

describe('useTrocarPosicaoImagemDaAjuda — caminho feliz', () => {
  it('faz os 3 passos na ordem (A → temporária, B → A, temporária → B)', async () => {
    updateEq
      .mockResolvedValueOnce({ error: null, count: 1 }) // passo 1: A -> temporária
      .mockResolvedValueOnce({ error: null, count: 1 }) // passo 2: B -> A
      .mockResolvedValueOnce({ error: null, count: 1 }); // passo 3: temporária -> B

    const { result } = renderHook(() => useTrocarPosicaoImagemDaAjuda(), { wrapper });
    result.current.mutate({ chaveA: 'topico-1', chaveB: 'topico-2' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(updateEq).toHaveBeenCalledTimes(3);
    // Passo 1: a foto A vai para uma chave temporária baseada nela mesma.
    expect(update.mock.calls[0][0].chave).toMatch(/^topico-1--trocando-/);
    expect(updateEq.mock.calls[0]).toEqual(['chave', 'topico-1']);
    // Passo 2: a foto B assume a chave A (a posição original da primeira).
    expect(update.mock.calls[1][0]).toEqual({ chave: 'topico-1' });
    expect(updateEq.mock.calls[1]).toEqual(['chave', 'topico-2']);
    // Passo 3: a foto A (na temporária) assume a chave B.
    expect(update.mock.calls[2][0]).toEqual({ chave: 'topico-2' });
  });
});

describe('useTrocarPosicaoImagemDaAjuda — recusa no passo 1 (a própria foto A)', () => {
  it('zero linhas no primeiro passo recusa a troca sem tentar os passos seguintes', async () => {
    updateEq.mockResolvedValueOnce({ error: null, count: 0 });

    const { result } = renderHook(() => useTrocarPosicaoImagemDaAjuda(), { wrapper });
    result.current.mutate({ chaveA: 'topico-1', chaveB: 'topico-2' });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(updateEq).toHaveBeenCalledTimes(1);
    expect(result.current.error?.message).toMatch(/A ordem NÃO foi trocada/);
  });
});

describe('useTrocarPosicaoImagemDaAjuda — recusa no passo 2 (a foto B)', () => {
  it('desfaz o passo 1 (devolve A para a chave original) antes de recusar', async () => {
    updateEq
      .mockResolvedValueOnce({ error: null, count: 1 }) // passo 1: ok
      .mockResolvedValueOnce({ error: null, count: 0 }) // passo 2: recusado
      .mockResolvedValueOnce({ error: null, count: 1 }); // desfazer: temporária -> A de volta

    const { result } = renderHook(() => useTrocarPosicaoImagemDaAjuda(), { wrapper });
    result.current.mutate({ chaveA: 'topico-1', chaveB: 'topico-2' });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(updateEq).toHaveBeenCalledTimes(3);
    // A terceira chamada é o desfazer: bate a chave temporária de volta para "topico-1".
    expect(update.mock.calls[2][0]).toEqual({ chave: 'topico-1' });
    expect(result.current.error?.message).toMatch(/A ordem NÃO foi trocada/);
  });
});

describe('useTrocarPosicaoImagemDaAjuda — falha no passo 3 (o fecho)', () => {
  it('avisa que a troca ficou pela metade, sem tentar desfazer sozinho', async () => {
    updateEq
      .mockResolvedValueOnce({ error: null, count: 1 })
      .mockResolvedValueOnce({ error: null, count: 1 })
      .mockResolvedValueOnce({ error: null, count: 0 }); // passo 3 falha

    const { result } = renderHook(() => useTrocarPosicaoImagemDaAjuda(), { wrapper });
    result.current.mutate({ chaveA: 'topico-1', chaveB: 'topico-2' });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(updateEq).toHaveBeenCalledTimes(3);
    expect(result.current.error?.message).toMatch(/ficou pela metade/);
  });
});
