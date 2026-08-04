import { describe, expect, it } from 'vitest';
import { situacaoDaEmpresa, diasDeTrial, type EstadoAssinatura } from './situacao-empresa';

const ONTEM = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
const AMANHA = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

function estado(over: Partial<EstadoAssinatura> = {}): EstadoAssinatura {
  return {
    plan_status: 'active',
    origem: 'stripe',
    current_period_end: null,
    tem_customer_stripe: true,
    ...over,
  };
}

describe('pagante — o rótulo que não pode estar errado', () => {
  it('active com customer no Stripe é pagante', () => {
    expect(situacaoDaEmpresa(estado())).toBe('pagante');
  });

  it('active SEM customer no Stripe não é pagante', () => {
    // Sem esta regra, uma linha ativa sem cobrança nenhuma por trás — ajuste
    // manual no banco, origem inesperada — entraria na contagem de receita.
    expect(situacaoDaEmpresa(estado({ tem_customer_stripe: false }))).toBe('cortesia');
  });

  it('past_due com customer continua pagante (Stripe ainda tentando)', () => {
    // Cortar na primeira falha de cartão gera cancelamento em vez de pagamento.
    expect(situacaoDaEmpresa(estado({ plan_status: 'past_due' }))).toBe('pagante');
  });
});

describe('teste de 7 dias', () => {
  it('dentro do prazo é teste em andamento', () => {
    expect(situacaoDaEmpresa(estado({ plan_status: 'trialing', current_period_end: AMANHA })))
      .toBe('trial');
  });

  it('fora do prazo é teste vencido', () => {
    expect(situacaoDaEmpresa(estado({ plan_status: 'trialing', current_period_end: ONTEM })))
      .toBe('trial_vencido');
  });

  it('sem data continua valendo — espelha o gate do banco', () => {
    expect(situacaoDaEmpresa(estado({ plan_status: 'trialing', current_period_end: null })))
      .toBe('trial');
  });

  it('data ilegível não vira vencido', () => {
    expect(situacaoDaEmpresa(estado({ plan_status: 'trialing', current_period_end: 'xx' })))
      .toBe('trial');
  });

  it('teste vencido não vira "não pagou": são conversas de CS diferentes', () => {
    const s = situacaoDaEmpresa(estado({ plan_status: 'trialing', current_period_end: ONTEM }));
    expect(s).not.toBe('nunca_pagou');
  });
});

describe('cortesia e legacy — quem tem acesso sem pagar', () => {
  it('origem legacy é cortesia', () => {
    expect(situacaoDaEmpresa(estado({ origem: 'legacy', tem_customer_stripe: false })))
      .toBe('cortesia');
  });

  it('origem cortesia é cortesia', () => {
    expect(situacaoDaEmpresa(estado({ origem: 'cortesia', tem_customer_stripe: false })))
      .toBe('cortesia');
  });

  it('cortesia vence sobre customer existente', () => {
    // Empresa que já pagou e foi liberada de graça depois: o que vale para o
    // CS é que hoje ela não gera receita.
    expect(situacaoDaEmpresa(estado({ origem: 'cortesia', tem_customer_stripe: true })))
      .toBe('cortesia');
  });
});

describe('quem não paga — separando ativação de retenção', () => {
  it('inactive sem customer = cadastrou e nunca pagou', () => {
    expect(situacaoDaEmpresa(estado({ plan_status: 'inactive', tem_customer_stripe: false })))
      .toBe('nunca_pagou');
  });

  it('inactive COM customer = pagou e parou', () => {
    expect(situacaoDaEmpresa(estado({ plan_status: 'inactive', tem_customer_stripe: true })))
      .toBe('bloqueada');
  });

  it('canceled e unpaid seguem a mesma regra', () => {
    expect(situacaoDaEmpresa(estado({ plan_status: 'canceled', tem_customer_stripe: true })))
      .toBe('bloqueada');
    expect(situacaoDaEmpresa(estado({ plan_status: 'unpaid', tem_customer_stripe: false })))
      .toBe('nunca_pagou');
  });

  it('bloqueio pelo painel preserva a origem e ainda assim classifica como parada', () => {
    // admin_definir_plano('bloquear') mantém a origem anterior de propósito:
    // como a empresa chegou ali importa para a conversa seguinte.
    expect(situacaoDaEmpresa(estado({ plan_status: 'inactive', origem: 'cortesia', tem_customer_stripe: true })))
      .toBe('bloqueada');
  });
});

describe('robustez de entrada', () => {
  it('status nulo não quebra', () => {
    expect(situacaoDaEmpresa(estado({ plan_status: null, origem: null, tem_customer_stripe: false })))
      .toBe('cortesia');
  });

  it('caixa e espaços não mudam a classificação', () => {
    expect(situacaoDaEmpresa(estado({ plan_status: '  TRIALING ', current_period_end: ONTEM })))
      .toBe('trial_vencido');
    expect(situacaoDaEmpresa(estado({ origem: ' Legacy ', tem_customer_stripe: false })))
      .toBe('cortesia');
  });
});

describe('diasDeTrial', () => {
  it('conta os dias que faltam', () => {
    expect(diasDeTrial(estado({ plan_status: 'trialing', current_period_end: AMANHA }))).toBe(1);
  });

  it('devolve negativo quando venceu', () => {
    expect(diasDeTrial(estado({ plan_status: 'trialing', current_period_end: ONTEM }))!)
      .toBeLessThanOrEqual(0);
  });

  it('devolve null quando não é teste', () => {
    expect(diasDeTrial(estado({ plan_status: 'active', current_period_end: AMANHA }))).toBeNull();
    expect(diasDeTrial(estado({ plan_status: 'trialing', current_period_end: null }))).toBeNull();
  });
});
