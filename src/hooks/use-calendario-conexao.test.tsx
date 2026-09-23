import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const invoke = vi.fn();
const from = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
    from: (...a: unknown[]) => from(...a),
  },
}));
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ profile: { user_id: 'u1', empresa_id: 'e1' } }) }));

import { useConexaoCalendario } from './use-calendario-conexao';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => { invoke.mockReset(); from.mockReset(); });

describe('useConexaoCalendario', () => {
  it('lê a conexão atual do vendedor (só colunas sem token)', async () => {
    const single = vi.fn().mockResolvedValue({
      data: { id: 'c1', provedor: 'google', conta_email: 'v@ex.com', status: 'conectada', ultimo_erro: null },
      error: null,
    });
    from.mockReturnValue({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: single }) }) }) });

    const { result } = renderHook(() => useConexaoCalendario(), { wrapper });
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.conexao?.contaEmail).toBe('v@ex.com');
    expect(result.current.conexao?.provedor).toBe('google');
  });

  it('iniciarGoogle chama a função de borda e redireciona para a URL de consentimento', async () => {
    from.mockReturnValue({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) }) });
    invoke.mockResolvedValue({ data: { url: 'https://accounts.google.com/o/oauth2/v2/auth?x=1' }, error: null });
    const assign = vi.fn();
    Object.defineProperty(window, 'location', { value: { assign, href: '' }, writable: true });

    const { result } = renderHook(() => useConexaoCalendario(), { wrapper });
    await waitFor(() => expect(result.current.carregando).toBe(false));
    await result.current.iniciarGoogle();
    expect(invoke).toHaveBeenCalledWith('calendario-conectar', expect.objectContaining({ body: { acao: 'iniciar', provedor: 'google' } }));
    expect(assign).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth?x=1');
  });
});
