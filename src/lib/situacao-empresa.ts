/**
 * Tradução do estado técnico da assinatura para a leitura comercial.
 *
 * Módulo puro, sem React e sem I/O, pelo mesmo motivo de `plano-gate.ts`: é uma
 * regra de negócio que vira número na tela e decisão de cobrar ou não alguém,
 * então precisa ser testável sem mock nenhum.
 *
 * O banco guarda `plan_status` (vocabulário do Stripe) e `origem` (como a
 * empresa chegou ao estado atual). Nenhum dos dois responde sozinho a pergunta
 * que o painel faz: "essa empresa paga, testa, ganhou de graça ou parou?".
 */

export type SituacaoCS =
  | 'pagante'
  | 'trial'
  | 'trial_vencido'
  | 'cortesia'
  | 'nunca_pagou'
  | 'bloqueada';

/** O mínimo que a classificação precisa. Mantido estreito de propósito. */
export interface EstadoAssinatura {
  plan_status: string | null;
  origem: string | null;
  current_period_end: string | null;
  tem_customer_stripe: boolean;
}

export const ROTULO_SITUACAO: Record<SituacaoCS, string> = {
  pagante: 'Pagante',
  trial: 'Em teste',
  trial_vencido: 'Teste vencido',
  cortesia: 'Cortesia',
  nunca_pagou: 'Cadastrou, não pagou',
  bloqueada: 'Pagamento parado',
};

export function situacaoDaEmpresa(e: EstadoAssinatura): SituacaoCS {
  const status = (e.plan_status ?? '').trim().toLowerCase();
  const origem = (e.origem ?? '').trim().toLowerCase();

  if (status === 'trialing') {
    // Espelha o gate do banco: data ausente ou ilegível continua valendo como
    // teste em andamento, porque o webhook do Stripe já gravou trial sem
    // `current_period_end` e trancar por campo vazio custa mais que liberar.
    const fim = e.current_period_end ? new Date(e.current_period_end) : null;
    const vencido = !!fim && !Number.isNaN(fim.getTime()) && fim.getTime() <= Date.now();
    return vencido ? 'trial_vencido' : 'trial';
  }

  if (['inactive', 'canceled', 'unpaid', 'incomplete_expired'].includes(status)) {
    // Nunca teve customer no Stripe = cadastrou e não chegou a pagar. Já ter
    // tido customer significa que pagou e depois caiu — são dois trabalhos de
    // CS diferentes: um é ativação, o outro é retenção.
    return e.tem_customer_stripe ? 'bloqueada' : 'nunca_pagou';
  }

  // 'legacy' são as empresas que já usavam antes de existir cobrança;
  // 'cortesia' foram liberadas de propósito pelo painel. Nenhuma das duas paga,
  // e é isso que interessa na leitura comercial.
  if (origem === 'legacy' || origem === 'cortesia') return 'cortesia';

  // "Pagante" exige customer no Stripe, não só status ativo. Sem essa condição,
  // uma linha `active` sem cobrança nenhuma por trás — um ajuste manual no
  // banco, uma origem inesperada — seria contada como receita. De todos os
  // rótulos, este é o que não pode estar errado.
  return e.tem_customer_stripe ? 'pagante' : 'cortesia';
}

/** Dias restantes de um teste. Negativo = venceu. `null` = não é teste com prazo. */
export function diasDeTrial(e: EstadoAssinatura): number | null {
  if ((e.plan_status ?? '').toLowerCase() !== 'trialing' || !e.current_period_end) return null;
  const fim = new Date(e.current_period_end);
  if (Number.isNaN(fim.getTime())) return null;
  return Math.ceil((fim.getTime() - Date.now()) / 86_400_000);
}
