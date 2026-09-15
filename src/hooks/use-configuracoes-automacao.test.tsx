import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PADROES_DA_PAUTA, useConfiguracoesAutomacao } from './use-configuracoes-automacao';

// O que o banco "devolve" na leitura — trocado por teste.
const linhasGuardadas = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: linhasGuardadas(), error: null }),
      }),
    }),
  },
}));

function comProvedor() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe('configurações da pauta — excluídos do e-mail', () => {
  beforeEach(() => linhasGuardadas.mockReset());

  it('o padrão é ninguém excluído', () => {
    expect(PADROES_DA_PAUTA.pauta_resumo_excluidos).toEqual([]);
  });

  it('aceita a lista de excluídos gravada (array de texto)', async () => {
    linhasGuardadas.mockReturnValue([{ chave: 'pauta_resumo_excluidos', valor: ['u-1', 'u-2'] }]);
    const { result } = renderHook(() => useConfiguracoesAutomacao('empresa-1'), {
      wrapper: comProvedor(),
    });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.pauta_resumo_excluidos).toEqual(['u-1', 'u-2']);
  });

  it('lista corrompida (número no lugar de texto) cai no padrão vazio', async () => {
    linhasGuardadas.mockReturnValue([{ chave: 'pauta_resumo_excluidos', valor: [123] }]);
    const { result } = renderHook(() => useConfiguracoesAutomacao('empresa-1'), {
      wrapper: comProvedor(),
    });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.pauta_resumo_excluidos).toEqual([]);
  });
});
