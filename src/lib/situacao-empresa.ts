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
  /**
   * Existe cadastro no Stripe. 🔴 NÃO significa que pagou.
   *
   * O cadastro é criado no instante em que a pessoa ABRE o checkout
   * (`stripe-checkout/index.ts:109`), antes de qualquer cobrança. Quem desistiu na tela do
   * cartão tem cadastro e nunca pagou um centavo.
   */
  tem_customer_stripe: boolean;
  /**
   * Existe ASSINATURA no Stripe — este é o sinal de que pagou de verdade.
   *
   * A RPC `admin_empresas_cs` já devolvia isto desde 04/08/2026
   * (`20260804142445_admin_cs_datas_entrada_e_pagamento.sql:64`), e esta função é que não
   * usava. Opcional para não quebrar quem monta o estado sem ele; ausente, cai no
   * comportamento antigo.
   */
  tem_assinatura_stripe?: boolean;
}

/**
 * Esta empresa chegou a ser cliente pagante alguma vez?
 *
 * 🔴 A DIFERENÇA ENTRE "ABRIU O CHECKOUT" E "PAGOU", e ela custou um rótulo mentindo na tela
 * do admin (achado em 29/08/2026, empresa "Teste Empresa").
 *
 * O código antigo respondia esta pergunta com `tem_customer_stripe`, e o comentário dizia:
 * "Já ter tido customer significa que pagou e depois caiu". Não significa. O cadastro no
 * Stripe nasce ao ABRIR o checkout. Quem desistiu na tela do cartão aparecia como "Pagamento
 * parado" — como se tivesse dado calote — em vez de "Cadastrou, não pagou".
 *
 * Não é só rótulo: é esse estado que a régua de cobrança usa para decidir quem é inadimplente.
 * Com o sinal errado, alguém que nunca foi cliente entraria na cobrança e acabaria marcado
 * para exclusão.
 *
 * Quando `tem_assinatura_stripe` não vier preenchido, cai no sinal antigo — é o comportamento
 * anterior, e é melhor que tratar ausência como "nunca pagou".
 */
function jaFoiPagante(e: EstadoAssinatura): boolean {
  return e.tem_assinatura_stripe ?? e.tem_customer_stripe;
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
    // Nunca chegou a assinar = cadastrou e não pagou. Ter assinado e caído é outra conversa:
    // um caso é ativação, o outro é retenção. Ver `jaFoiPagante` para o porquê de não ser
    // `tem_customer_stripe` — abrir o checkout não é pagar.
    return jaFoiPagante(e) ? 'bloqueada' : 'nunca_pagou';
  }

  // 'legacy' são as empresas que já usavam antes de existir cobrança;
  // 'cortesia' foram liberadas de propósito pelo painel. Nenhuma das duas paga,
  // e é isso que interessa na leitura comercial.
  if (origem === 'legacy' || origem === 'cortesia') return 'cortesia';

  // "Pagante" exige customer no Stripe, não só status ativo. Sem essa condição,
  // uma linha `active` sem cobrança nenhuma por trás — um ajuste manual no
  // banco, uma origem inesperada — seria contada como receita. De todos os
  // rótulos, este é o que não pode estar errado.
  return jaFoiPagante(e) ? 'pagante' : 'cortesia';
}

/** Dias restantes de um teste. Negativo = venceu. `null` = não é teste com prazo. */
export function diasDeTrial(e: EstadoAssinatura): number | null {
  if ((e.plan_status ?? '').toLowerCase() !== 'trialing' || !e.current_period_end) return null;
  const fim = new Date(e.current_period_end);
  if (Number.isNaN(fim.getTime())) return null;
  return Math.ceil((fim.getTime() - Date.now()) / 86_400_000);
}

/* ────────────────────────────────────────────────────────────────────────────
 * A camada de CIMA: o que está acontecendo com a empresa AGORA
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * 🔴 POR QUE ESTA SEGUNDA CAMADA EXISTE. Relato do Lucas em 30/08/2026, depois de bloquear e
 * excluir a empresa de testes:
 *
 *   "em ambas as situações lá na direita ainda continua com avisos como 'cadastrou, não
 *    pagou', 'cortesia', etc, não falava sobre o real estado atual do cliente"
 *
 * E o rótulo não estava errado por descuido: `situacaoDaEmpresa` responde "essa empresa paga,
 * testa ou ganhou de graça?" — uma pergunta COMERCIAL, sobre o vínculo. Uma empresa excluída
 * continua sendo, comercialmente, uma cortesia. O que faltava era a outra pergunta, a
 * OPERACIONAL: "o que está acontecendo com ela agora?".
 *
 * As duas convivem porque as duas são úteis, e por isso `situacaoNoPainel` não substitui a
 * primeira — ela a envolve, e só assume quando há algo mais urgente a dizer. A ordem é a
 * ordem de quem lê: excluída vence bloqueada, que vence a régua de cobrança, que vence o
 * vínculo comercial.
 */
export type SituacaoNoPainel =
  | SituacaoCS
  | 'excluida'
  | 'bloqueada_admin'
  | 'tolerancia'
  | 'somente_leitura'
  | 'suspensa'
  | 'prazo_esgotado';

export interface EstadoOperacional extends EstadoAssinatura {
  /** Quando foi excluída pelo painel. `null` = não foi. */
  excluida_em?: string | null;
  /** Quando foi bloqueada pelo painel. `null` = não foi. */
  bloqueada_em?: string | null;
  /** Quando o pagamento parou de passar. `null` = em dia. */
  inadimplente_desde?: string | null;
}

export const ROTULO_NO_PAINEL: Record<SituacaoNoPainel, string> = {
  ...ROTULO_SITUACAO,
  excluida: 'Excluída',
  bloqueada_admin: 'Bloqueada por vocês',
  tolerancia: 'Cobrança falhou',
  somente_leitura: 'Só leitura',
  suspensa: 'Suspensa',
  prazo_esgotado: 'Prazo esgotado',
};

/** Dias desde uma data. `null` quando não há data ou ela é ilegível. */
function diasDesde(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000));
}

/** Os mesmos degraus de `plano-gate.ts` e da função `degrau_da_regua` do banco. */
function degrauDaCobranca(dias: number): SituacaoNoPainel {
  if (dias < 15) return 'tolerancia';
  if (dias < 30) return 'somente_leitura';
  if (dias < 90) return 'suspensa';
  return 'prazo_esgotado';
}

export function situacaoNoPainel(e: EstadoOperacional): SituacaoNoPainel {
  if (e.excluida_em) return 'excluida';

  const status = (e.plan_status ?? '').trim().toLowerCase();
  const aindaSemAcesso = ['inactive', 'canceled', 'unpaid', 'incomplete_expired'].includes(status);

  /**
   * 🔴 O `aindaSemAcesso` NÃO É REDUNDANTE. O registro do bloqueio some quando alguém
   * desbloqueia pelo painel — mas o Stripe também reativa uma empresa por fora, pelo webhook,
   * sem passar por lá. Sem esta condição, o painel escreveria "Bloqueada por vocês" em cima
   * de um cliente que voltou a pagar e está usando o sistema normalmente.
   */
  if (e.bloqueada_em && aindaSemAcesso) return 'bloqueada_admin';

  const dias = diasDesde(e.inadimplente_desde);
  if (dias !== null) return degrauDaCobranca(dias);

  return situacaoDaEmpresa(e);
}
