import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMelhorOrdem } from './use-melhor-ordem';

/**
 * Testes do gancho de rede da melhor ordem das paradas.
 *
 * 🔴 Diferente de `useRotaOsrm`, aqui erro NUNCA sobe como `isError` — o próprio `queryFn`
 * engole qualquer falha (resposta ruim, servidor fora, JSON estranho) e devolve `null`. É o
 * contrato descrito no comentário do hook: sem sugestão, e sem barulho na tela.
 *
 * Coordenadas de Natal/RN, inventadas — nunca dado real de obra (CLAUDE.md §6.9).
 */

const TRES_PONTOS = [
  { lat: -5.79, lng: -35.21 },
  { lat: -5.81, lng: -35.23 },
  { lat: -5.75, lng: -35.25 },
];

function respostaOk(camposExtras: Record<string, unknown> = {}) {
  return {
    ok: true,
    json: async () => ({
      code: 'Ok',
      trips: [{ duration: 1800 }],
      waypoints: [{ waypoint_index: 0 }, { waypoint_index: 2 }, { waypoint_index: 1 }],
      ...camposExtras,
    }),
  };
}

function desenhar(pontos: typeof TRES_PONTOS | null | undefined) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useMelhorOrdem(pontos), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useMelhorOrdem', () => {
  it('com menos de 3 pontos, não chama o serviço — `urlDaMelhorOrdem` já devolve vazio', async () => {
    const fetchFalso = vi.fn();
    vi.stubGlobal('fetch', fetchFalso);

    const { result } = desenhar(TRES_PONTOS.slice(0, 2));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(fetchFalso).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });

  it('resposta válida do /trip: devolve a ordem e a duração', async () => {
    const fetchFalso = vi.fn().mockResolvedValue(respostaOk());
    vi.stubGlobal('fetch', fetchFalso);

    const { result } = desenhar(TRES_PONTOS);

    await waitFor(() => expect(result.current.data).toEqual({ ordem: [0, 2, 1], duracaoS: 1800 }));
    expect(fetchFalso).toHaveBeenCalledTimes(1);
    expect(fetchFalso.mock.calls[0][0]).toContain('/trip/v1/driving/');
  });

  it('resposta com ok:false: null, sem erro subindo para a tela', async () => {
    const fetchFalso = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal('fetch', fetchFalso);

    const { result } = desenhar(TRES_PONTOS);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
    expect(result.current.isError).toBe(false);
  });

  it('resposta com code NoRoute (obras em lados opostos de um rio, por exemplo): null', async () => {
    const fetchFalso = vi.fn().mockResolvedValue(respostaOk({ code: 'NoRoute', trips: [], waypoints: [] }));
    vi.stubGlobal('fetch', fetchFalso);

    const { result } = desenhar(TRES_PONTOS);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('🔴 fetch rejeitando (servidor de demonstração fora do ar): null, e nunca `isError`', async () => {
    const fetchFalso = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchFalso);

    const { result } = desenhar(TRES_PONTOS);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
    expect(result.current.isError).toBe(false);
  });
});
