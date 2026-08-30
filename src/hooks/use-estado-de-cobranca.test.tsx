import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * 🔴 ESTE ARQUIVO EXISTE POR CAUSA DE UM DEFEITO REAL, relatado pelo Lucas em 30/08/2026:
 *
 *   "fiz o teste de bloquear e mesmo assim ainda era possível de eu clicar em criar contatos,
 *    criar negócios, etc, não aparecia nenhum aviso de bloqueio"
 *
 * O bloqueio funcionava no banco — a gravação era recusada. O que não funcionava era a TELA:
 * ela lia o `profile`, um retrato tirado no login e guardado. Bloquear alguém que já estava
 * com o sistema aberto não mudava esse retrato, então nenhum aviso aparecia e a pessoa só
 * descobria ao tentar salvar.
 *
 * O que os testes daqui fixam é exatamente isso: QUANDO OS DOIS DISCORDAM, VALE O BANCO.
 */

const useAuthFalso = vi.fn();
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => useAuthFalso() }));

const rpcFalso = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...a) => rpcFalso(...a) } }));

import { useEstadoDeCobranca } from './use-estado-de-cobranca';

/** Um perfil de empresa PAGANTE e em dia — o retrato velho, o que a tela acreditava. */
function perfilEmDia(over: Record<string, unknown> = {}) {
  useAuthFalso.mockReturnValue({
    profile: {
      role: 'gestor',
      empresa_id: 'empresa-1',
      empresas: {
        id: 'empresa-1',
        empresa_assinaturas: { plan_status: 'active', inadimplente_desde: null },
      },
      ...over,
    },
  });
}

function bancoResponde(estado: Record<string, unknown>) {
  rpcFalso.mockResolvedValue({ data: estado, error: null });
}

function desenhar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useEstadoDeCobranca(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

afterEach(() => {
  cleanup();
  useAuthFalso.mockReset();
  rpcFalso.mockReset();
});

describe('useEstadoDeCobranca', () => {
  it('🔴 o banco vence o perfil guardado — é o defeito de 30/08/2026', async () => {
    perfilEmDia(); // o retrato do login diz que está tudo certo
    bancoResponde({ encerrada: false, bloqueado: true, motivo: 'nunca_ativou', degrau: 'em_dia' });

    const { result } = desenhar();
    await waitFor(() => expect(result.current.bloqueado).toBe(true));
    expect(result.current.motivo).toBe('nunca_ativou');
  });

  it('🔴 e vence no sentido contrário também — desbloquear não obriga a sair e entrar', async () => {
    // Perfil de quem entrou bloqueado. O admin liberou no meio da sessão.
    useAuthFalso.mockReturnValue({
      profile: {
        role: 'gestor',
        empresa_id: 'empresa-1',
        empresas: { id: 'empresa-1', empresa_assinaturas: { plan_status: 'canceled' } },
      },
    });
    bancoResponde({ encerrada: false, bloqueado: false, motivo: null, degrau: 'em_dia' });

    const { result } = desenhar();
    await waitFor(() => expect(result.current.bloqueado).toBe(false));
  });

  it('enquanto a resposta não chega, vale o perfil — a faixa não pisca para dentro', () => {
    useAuthFalso.mockReturnValue({
      profile: {
        role: 'gestor',
        empresa_id: 'empresa-1',
        empresas: { id: 'empresa-1', empresa_assinaturas: { plan_status: 'canceled' } },
      },
    });
    bancoResponde({ encerrada: false, bloqueado: true, motivo: 'nunca_ativou', degrau: 'em_dia' });

    // Sem esperar: é o primeiro quadro, antes de a consulta responder.
    expect(desenhar().result.current.bloqueado).toBe(true);
  });

  it('🔴 quem está em dia não recebe motivo — senão a faixa acende para quem não deve nada', async () => {
    perfilEmDia();
    // O banco calcula `motivo` mesmo para quem não está bloqueado. Usar esse valor solto
    // acenderia a faixa de "cadastrou e não pagou" em cima de uma empresa pagante.
    bancoResponde({ encerrada: false, bloqueado: false, motivo: 'nunca_ativou', degrau: 'em_dia' });

    const { result } = desenhar();
    await waitFor(() => expect(rpcFalso).toHaveBeenCalled());
    expect(result.current.motivo).toBeNull();
    expect(result.current.bloqueado).toBe(false);
  });

  it('conta encerrada chega separada do bloqueio', async () => {
    perfilEmDia();
    bancoResponde({ encerrada: true, bloqueado: true, motivo: 'nunca_ativou', degrau: 'em_dia' });

    const { result } = desenhar();
    await waitFor(() => expect(result.current.encerrada).toBe(true));
  });

  it('a régua vem do banco, com os dias', async () => {
    perfilEmDia();
    bancoResponde({
      encerrada: false,
      bloqueado: true,
      motivo: 'pagamento_parou',
      dias_inadimplencia: 45,
      degrau: 'suspensa',
    });

    const { result } = desenhar();
    await waitFor(() => expect(result.current.degrau).toBe('suspensa'));
    expect(result.current.diasInadimplencia).toBe(45);
  });

  it('🔴 admin global não consulta — ele não tem empresa e nunca é bloqueado', () => {
    useAuthFalso.mockReturnValue({ profile: { role: 'admin', empresa_id: 'empresa-1' } });
    const { result } = desenhar();

    expect(rpcFalso).not.toHaveBeenCalled();
    expect(result.current.bloqueado).toBe(false);
  });

  it('sem empresa não consulta, e não quebra', () => {
    useAuthFalso.mockReturnValue({ profile: null });
    expect(() => desenhar()).not.toThrow();
    expect(rpcFalso).not.toHaveBeenCalled();
  });

  it('🔴 banco fora do ar não bloqueia ninguém por engano', async () => {
    perfilEmDia();
    rpcFalso.mockResolvedValue({ data: null, error: { message: 'timeout' } });

    const { result } = desenhar();
    await waitFor(() => expect(rpcFalso).toHaveBeenCalled());
    // Cai no perfil, que diz "em dia". Tirar o acesso de um pagante por causa de uma consulta
    // que falhou seria trocar um aviso que faltou por um cliente parado.
    expect(result.current.bloqueado).toBe(false);
  });
});
