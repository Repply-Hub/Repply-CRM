import { describe, expect, it } from 'vitest';
import { situacaoDaEmpresa, diasDeTrial, type EstadoAssinatura , situacaoNoPainel, ROTULO_NO_PAINEL } from './situacao-empresa';

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

describe('🔴 abrir o checkout NÃO é pagar', () => {
  /**
   * O caso real que denunciou isto, em 29/08/2026: a empresa "Teste Empresa" tinha cadastro
   * no Stripe (`stripe_customer_id`) e NENHUMA assinatura (`stripe_subscription_id` nulo).
   * Ela aparecia no painel como "Pagamento parado" — como se tivesse dado calote.
   *
   * O cadastro no Stripe nasce quando a pessoa ABRE o checkout, antes de qualquer cobrança.
   */
  const chegouNoCheckoutEDesistiu = {
    plan_status: 'inactive',
    origem: 'stripe',
    current_period_end: null,
    tem_customer_stripe: true,
    tem_assinatura_stripe: false,
  };

  it('quem abriu o checkout e desistiu é "cadastrou, não pagou" — não "pagamento parado"', () => {
    expect(situacaoDaEmpresa(chegouNoCheckoutEDesistiu)).toBe('nunca_pagou');
  });

  it('quem assinou de verdade e caiu continua sendo "pagamento parado"', () => {
    expect(
      situacaoDaEmpresa({ ...chegouNoCheckoutEDesistiu, tem_assinatura_stripe: true }),
    ).toBe('bloqueada');
  });

  it('active com assinatura de verdade é pagante', () => {
    expect(
      situacaoDaEmpresa({
        plan_status: 'active',
        origem: 'stripe',
        current_period_end: null,
        tem_customer_stripe: true,
        tem_assinatura_stripe: true,
      }),
    ).toBe('pagante');
  });

  it('🔴 active com cadastro mas SEM assinatura não entra na conta de receita', () => {
    // Antes desta correção isto seria contado como "Pagante" e inventaria receita.
    expect(
      situacaoDaEmpresa({
        plan_status: 'active',
        origem: 'stripe',
        current_period_end: null,
        tem_customer_stripe: true,
        tem_assinatura_stripe: false,
      }),
    ).toBe('cortesia');
  });

  it('sem o sinal novo, mantém o comportamento antigo — nada quebra em quem não o envia', () => {
    // `tem_assinatura_stripe` é opcional de propósito: ausente, vale `tem_customer_stripe`.
    expect(
      situacaoDaEmpresa({
        plan_status: 'inactive',
        origem: 'stripe',
        current_period_end: null,
        tem_customer_stripe: true,
      }),
    ).toBe('bloqueada');
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * situacaoNoPainel — o estado de AGORA, e a ordem em que ele vence
 * ──────────────────────────────────────────────────────────────────────────── */

describe('situacaoNoPainel', () => {
  const cortesiaAtiva = {
    plan_status: 'active',
    origem: 'cortesia',
    current_period_end: null,
    tem_customer_stripe: false,
    tem_assinatura_stripe: false,
  };
  const pagante = {
    plan_status: 'active',
    origem: 'stripe',
    current_period_end: null,
    tem_customer_stripe: true,
    tem_assinatura_stripe: true,
  };
  const hojeMenos = (dias: number) => new Date(Date.now() - dias * 86_400_000).toISOString();

  it('sem nada acontecendo, devolve a leitura comercial de sempre', () => {
    expect(situacaoNoPainel(cortesiaAtiva)).toBe('cortesia');
    expect(situacaoNoPainel(pagante)).toBe('pagante');
  });

  it('🔴 excluída vence tudo — foi o defeito relatado em 30/08/2026', () => {
    // A empresa "Repply" era cortesia, foi bloqueada e depois excluída. O painel continuava
    // escrevendo "Cadastrou, não pagou" — o rótulo comercial, correto e inútil ali.
    expect(
      situacaoNoPainel({
        ...cortesiaAtiva,
        plan_status: 'inactive',
        excluida_em: hojeMenos(1),
        bloqueada_em: hojeMenos(2),
        inadimplente_desde: hojeMenos(40),
      }),
    ).toBe('excluida');
  });

  it('🔴 bloqueio do painel não se confunde com "cadastrou e não pagou"', () => {
    // As duas gravam `plan_status = 'inactive'`. O que separa é o registro do bloqueio.
    const dados = { ...cortesiaAtiva, plan_status: 'inactive' };
    expect(situacaoNoPainel(dados)).toBe('nunca_pagou');
    expect(situacaoNoPainel({ ...dados, bloqueada_em: hojeMenos(1) })).toBe('bloqueada_admin');
  });

  it('🔴 empresa que voltou a pagar não fica escrita "Bloqueada"', () => {
    // O Stripe reativa por fora, pelo webhook, sem passar pelo painel — então o registro do
    // bloqueio pode sobrar. Quem manda é o status: se ela tem acesso, não está bloqueada.
    expect(situacaoNoPainel({ ...pagante, bloqueada_em: hojeMenos(30) })).toBe('pagante');
  });

  it('a régua de cobrança aparece com os mesmos degraus do banco', () => {
    const naRegua = (dias: number) =>
      situacaoNoPainel({ ...pagante, inadimplente_desde: hojeMenos(dias) });

    expect(naRegua(1)).toBe('tolerancia');
    expect(naRegua(14)).toBe('tolerancia');
    expect(naRegua(15)).toBe('somente_leitura');
    expect(naRegua(29)).toBe('somente_leitura');
    expect(naRegua(30)).toBe('suspensa');
    expect(naRegua(89)).toBe('suspensa');
    expect(naRegua(90)).toBe('prazo_esgotado');
  });

  it('bloqueio do painel vence a régua — quem cortou foi a decisão de vocês', () => {
    expect(
      situacaoNoPainel({
        ...pagante,
        plan_status: 'inactive',
        bloqueada_em: hojeMenos(1),
        inadimplente_desde: hojeMenos(40),
      }),
    ).toBe('bloqueada_admin');
  });

  it('data ilegível não inventa degrau nenhum', () => {
    expect(situacaoNoPainel({ ...pagante, inadimplente_desde: 'nao-e-data' })).toBe('pagante');
  });

  it('todo rótulo novo tem texto — nada de aparecer em branco na tela', () => {
    const todos = [
      'excluida', 'bloqueada_admin', 'tolerancia', 'somente_leitura', 'suspensa', 'prazo_esgotado',
      'pagante', 'trial', 'trial_vencido', 'cortesia', 'nunca_pagou', 'bloqueada',
    ] as const;
    for (const s of todos) expect(ROTULO_NO_PAINEL[s]?.length).toBeGreaterThan(0);
  });
});
