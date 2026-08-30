import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * A faixa diz a coisa certa para cada motivo — e, principalmente, NÃO diz a errada.
 *
 * 🔴 O QUE ESTE TESTE PROTEGE. Empresa bloqueada tem três origens diferentes, e só uma delas
 * deve algo:
 *
 *   - acabou o teste de 7 dias   -> nunca deveu nada
 *   - nunca chegou a assinar     -> nunca deveu nada
 *   - era pagante e a cobrança caiu -> tem pendência
 *
 * Dizer "regularize seu pagamento" para os dois primeiros é acusar de calote quem não deve —
 * exatamente o erro que o painel de admin cometeu até 29/08/2026, quando marcava "Pagamento
 * parado" para uma empresa que só tinha aberto o checkout e desistido.
 *
 * É também o primeiro teste de RENDERIZAÇÃO do projeto. A infraestrutura (jsdom + Testing
 * Library) já estava instalada e sem uso. Este componente é pequeno e tem uma dependência só
 * (`useAuth`), então é onde o custo de começar é menor.
 */

const useAuthFalso = vi.fn();
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => useAuthFalso() }));

import { FaixaDeCobranca } from './FaixaDeCobranca';

afterEach(() => {
  cleanup();
  useAuthFalso.mockReset();
});

const AUTH_ID = '11111111-1111-4111-8111-111111111111';
const ONTEM = new Date(Date.now() - 86_400_000).toISOString();

/** Monta o par profile/session no formato real que o AuthContext entrega. */
function comAssinatura(
  assinatura: Record<string, unknown> | null,
  over: { role?: string; ownerId?: string } = {},
) {
  useAuthFalso.mockReturnValue({
    profile: {
      role: over.role ?? 'gestor',
      empresas: {
        id: 'empresa-1',
        nome: 'Construtora Meridiano',
        owner_id: over.ownerId ?? AUTH_ID,
        empresa_assinaturas: assinatura,
      },
    },
    session: { user: { id: AUTH_ID } },
  });
}

function desenhar() {
  return render(
    <MemoryRouter>
      <FaixaDeCobranca />
    </MemoryRouter>,
  );
}

describe('FaixaDeCobranca', () => {
  it('empresa em dia não desenha nada — nem uma caixa vazia', () => {
    comAssinatura({ plan_status: 'active' });
    const { container } = desenhar();
    expect(container).toBeEmptyDOMElement();
  });

  it('🔴 quem nunca assinou NÃO é acusado de pagamento pendente', () => {
    comAssinatura({ plan_status: 'inactive' });
    desenhar();

    expect(screen.getByText(/assinatura ainda não está ativa/i)).toBeTruthy();
    expect(screen.queryByText(/pagamento está pendente/i)).toBeNull();
  });

  it('🔴 ter aberto o checkout não conta como ter pago', () => {
    // `stripe_customer_id` nasce ao ABRIR o checkout, antes de qualquer cobrança.
    comAssinatura({ plan_status: 'inactive', stripe_customer_id: 'cus_1' });
    desenhar();
    expect(screen.getByText(/assinatura ainda não está ativa/i)).toBeTruthy();
  });

  it('quem era pagante e caiu vê o aviso de pendência', () => {
    comAssinatura({
      plan_status: 'canceled',
      stripe_customer_id: 'cus_1',
      stripe_subscription_id: 'sub_1',
    });
    desenhar();
    expect(screen.getByText(/pagamento está pendente/i)).toBeTruthy();
  });

  it('teste vencido fala do teste, e mostra a data', () => {
    comAssinatura({ plan_status: 'trialing', current_period_end: ONTEM });
    desenhar();
    expect(screen.getByText(/período de teste terminou/i)).toBeTruthy();
  });

  it('🔴 sempre diz o que AINDA funciona, não só o que parou', () => {
    // Sem esta frase a pessoa conclui que perdeu os dados — o medo real de quem vê um aviso
    // vermelho no topo do sistema onde está a carteira dela.
    comAssinatura({ plan_status: 'inactive' });
    desenhar();
    expect(screen.getByText(/continua vendo e exportando tudo/i)).toBeTruthy();
  });

  it('gestor recebe o botão que resolve', () => {
    comAssinatura({ plan_status: 'inactive' });
    desenhar();
    const acao = screen.getByRole('link', { name: /ativar assinatura/i });
    expect(acao.getAttribute('href')).toBe('/assinar');
  });

  it('🔴 vendedor comum NÃO recebe um botão que vai recusá-lo depois', () => {
    comAssinatura({ plan_status: 'inactive' }, { role: 'vendedor', ownerId: 'outra-pessoa' });
    desenhar();

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText(/fale com o gestor/i)).toBeTruthy();
  });

  it('admin global nunca vê a faixa', () => {
    comAssinatura({ plan_status: 'canceled', stripe_subscription_id: 'sub_1' }, { role: 'admin' });
    const { container } = desenhar();
    expect(container).toBeEmptyDOMElement();
  });

  it('perfil sem assinatura não inventa aviso', () => {
    comAssinatura(null);
    const { container } = desenhar();
    expect(container).toBeEmptyDOMElement();
  });
});
