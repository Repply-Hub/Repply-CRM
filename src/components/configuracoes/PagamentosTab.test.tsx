import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

/**
 * A aba Pagamentos fala com SEIS situações, e a errada nunca aparece.
 *
 * 🔴 O QUE ESTE TESTE PROTEGE, em ordem de gravidade:
 *
 *   1. CORTESIA NÃO PODE VER "CANCELAR". Não existe assinatura por trás — o botão levaria a
 *      um erro do Stripe, e hoje 5 das 10 empresas são cortesia. É o caso mais provável de
 *      quebrar e o mais fácil de não perceber.
 *   2. QUEM NÃO DEVE NÃO PODE SER ACUSADO DE DEVER. "Pagamento pendente" para quem nunca
 *      pagou é o mesmo erro que o painel de admin cometeu até 29/08/2026.
 *   3. PAGANTE PRECISA CHEGAR ÀS FATURAS. Era o buraco que a aba veio tapar: até
 *      30/08/2026 só quem estava bloqueado alcançava a tela de cobrança.
 */

const useAuthFalso = vi.fn();
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => useAuthFalso() }));

vi.mock('@/hooks/use-planos', () => ({
  usePlanos: () => ({
    planos: [
      {
        slug: 'lancamento',
        nome: 'Plano de Lançamento',
        descricao: '',
        preco: 2997,
        intervalo: 'year',
        destaque: true,
        selo: 'Condição de lançamento',
        beneficios: ['Usuários ilimitados', 'WhatsApp integrado'],
      },
    ],
    carregando: false,
  }),
}));

const assinarFalso = vi.fn();
const abrirPortalFalso = vi.fn();
vi.mock('@/hooks/use-assinatura', () => ({
  useAssinatura: () => ({
    assinar: assinarFalso,
    abrirPortal: abrirPortalFalso,
    processando: null,
  }),
}));

vi.mock('@/hooks/use-assinatura-motivos', () => ({
  useRegistrarMotivoDeCancelamento: () => ({ mutateAsync: vi.fn().mockResolvedValue(undefined) }),
}));

import { PagamentosTab } from './PagamentosTab';

afterEach(() => {
  cleanup();
  useAuthFalso.mockReset();
});

const AMANHA = new Date(Date.now() + 5 * 86_400_000).toISOString();
const ONTEM = new Date(Date.now() - 86_400_000).toISOString();

function comAssinatura(assinatura: Record<string, unknown> | null) {
  useAuthFalso.mockReturnValue({
    profile: {
      id: 'usuario-1',
      role: 'gestor',
      empresas: { id: 'empresa-1', nome: 'Construtora Meridiano', empresa_assinaturas: assinatura },
    },
    session: { user: { id: 'auth-1' } },
  });
}

const PAGANTE = {
  plan_status: 'active',
  origem: 'stripe',
  current_period_end: AMANHA,
  stripe_customer_id: 'cus_1',
  stripe_subscription_id: 'sub_1',
};

describe('PagamentosTab', () => {
  it('🔴 CORTESIA não vê "cancelar" — não há assinatura para cancelar', () => {
    comAssinatura({ plan_status: 'active', origem: 'cortesia' });
    render(<PagamentosTab />);

    expect(screen.getByText(/acesso por cortesia/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /cancelar assinatura/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /faturas/i })).toBeNull();
    // Nem oferece assinar: quem tem cortesia não precisa pagar.
    expect(screen.queryByRole('button', { name: /^assinar$/i })).toBeNull();
  });

  it('as 3 empresas "legacy" também caem em cortesia, e não veem cancelar', () => {
    comAssinatura({ plan_status: 'active', origem: 'legacy' });
    render(<PagamentosTab />);
    expect(screen.getByText(/acesso por cortesia/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /cancelar assinatura/i })).toBeNull();
  });

  it('🔴 PAGANTE alcança as faturas — era exatamente o buraco que esta aba tapa', () => {
    comAssinatura(PAGANTE);
    render(<PagamentosTab />);

    expect(screen.getByText(/assinatura ativa/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /faturas e forma de pagamento/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /cancelar assinatura/i })).toBeTruthy();
    expect(screen.getByText(/renova em/i)).toBeTruthy();
  });

  it('pagante NÃO vê a lista de planos — já tem um', () => {
    comAssinatura(PAGANTE);
    render(<PagamentosTab />);
    expect(screen.queryByRole('button', { name: /^assinar$/i })).toBeNull();
  });

  it('EM TESTE mostra os dias restantes e oferece assinar', () => {
    comAssinatura({ plan_status: 'trialing', origem: 'trial', current_period_end: AMANHA });
    render(<PagamentosTab />);

    expect(screen.getByText(/período de teste/i)).toBeTruthy();
    expect(screen.getByText(/dias restantes/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^assinar$/i })).toBeTruthy();
  });

  it('TESTE VENCIDO diz que o acesso ficou de leitura, sem acusar de dívida', () => {
    comAssinatura({ plan_status: 'trialing', origem: 'trial', current_period_end: ONTEM });
    render(<PagamentosTab />);

    expect(screen.getByText(/seu teste terminou/i)).toBeTruthy();
    expect(screen.queryByText(/pagamento pendente/i)).toBeNull();
  });

  it('🔴 quem NUNCA pagou não é acusado de pagamento pendente', () => {
    comAssinatura({ plan_status: 'inactive', origem: 'stripe' });
    render(<PagamentosTab />);

    expect(screen.getByText(/assinatura ainda não ativa/i)).toBeTruthy();
    expect(screen.queryByText(/pagamento pendente/i)).toBeNull();
  });

  it('🔴 abrir o checkout não conta como ter pago', () => {
    comAssinatura({ plan_status: 'inactive', origem: 'stripe', stripe_customer_id: 'cus_1' });
    render(<PagamentosTab />);
    expect(screen.getByText(/assinatura ainda não ativa/i)).toBeTruthy();
  });

  it('quem era pagante e caiu vê "pagamento pendente" e a saída', () => {
    comAssinatura({
      plan_status: 'unpaid',
      origem: 'stripe',
      stripe_customer_id: 'cus_1',
      stripe_subscription_id: 'sub_1',
    });
    render(<PagamentosTab />);

    expect(screen.getByText(/pagamento pendente/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^assinar$/i })).toBeTruthy();
  });

  it('o preço aparece formatado em real, com o ciclo', () => {
    comAssinatura({ plan_status: 'inactive', origem: 'stripe' });
    render(<PagamentosTab />);

    expect(screen.getByText(/2\.997,00/)).toBeTruthy();
    expect(screen.getByText(/\/ ano/)).toBeTruthy();
  });

  it('perfil sem assinatura avisa, em vez de inventar um estado', () => {
    comAssinatura(null);
    render(<PagamentosTab />);
    expect(screen.getByText(/não foi possível carregar/i)).toBeTruthy();
  });
});
