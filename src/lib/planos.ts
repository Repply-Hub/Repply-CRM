/**
 * Catálogo de planos exibido na landing e na tela de assinatura.
 *
 * Fonte única enquanto o backend de cobrança não existe. Na Fase 3 estes dados
 * passam a vir da tabela `planos` (que também guarda o `stripe_price_id`), e este
 * arquivo dá lugar a um hook — o formato abaixo já espelha o das colunas para a
 * troca não mexer nos componentes.
 */
/** Periodicidade da cobrança, no vocabulário do Stripe (`recurring.interval`). */
export type IntervaloPlano = 'month' | 'year';

export interface Plano {
  slug: string;
  nome: string;
  descricao: string;
  /**
   * Valor em reais por ciclo de cobrança. O nome não diz "mensal" de propósito:
   * o ciclo é o `intervalo`, e um campo que afirmasse a periodicidade no nome
   * ficaria mentindo assim que ela mudasse — foi o que aconteceu na virada de
   * mensal para anual.
   */
  preco: number;
  intervalo: IntervaloPlano;
  destaque: boolean;
  selo?: string;
  beneficios: string[];
}

export const PLANOS: Plano[] = [
  {
    slug: 'lancamento',
    nome: 'Plano de Lançamento',
    descricao: 'Acesso completo ao Repply para toda a sua equipe comercial.',
    preco: 2997,
    intervalo: 'year',
    destaque: true,
    selo: 'Condição de lançamento',
    // Curtos de propósito: são exibidos numa linha só, lado a lado.
    // "Todos os módulos" saiu em 21/08/2026. Com o controle de acesso por empresa, o
    // assinante NÃO recebe todos: o Portal de Consultas é exclusivo da MD Representações
    // (SPEC.md §11). Prometer "todos" e entregar menos é o tipo de coisa que o cliente
    // descobre sozinho, no pior momento. A lista agora nomeia o que ele de fato recebe.
    beneficios: [
      'Usuários ilimitados',
      'Funil, clientes, obras e catálogo',
      'WhatsApp e e-mail',
      'Importação da sua base',
      'Suporte direto com o time',
    ],
  },
];

/**
 * Sufixo do preço na tela ("/ano", "/mês").
 *
 * Deriva do intervalo em vez de ser texto fixo: a periodicidade vem da coluna
 * `intervalo` da tabela `planos`, então trocá-la no banco muda o rótulo sem
 * precisar de deploy do front.
 */
export function rotuloIntervalo(intervalo: IntervaloPlano): string {
  return intervalo === 'year' ? '/ano' : '/mês';
}

/** Mesma ideia, para frases corridas ("Cobrança anual no cartão."). */
export function adjetivoIntervalo(intervalo: IntervaloPlano): string {
  return intervalo === 'year' ? 'anual' : 'mensal';
}

export function formatarPrecoBRL(valor: number): string {
  return valor.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}
