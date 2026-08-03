/**
 * Catálogo de planos exibido na landing e na tela de assinatura.
 *
 * Fonte única enquanto o backend de cobrança não existe. Na Fase 3 estes dados
 * passam a vir da tabela `planos` (que também guarda o `stripe_price_id`), e este
 * arquivo dá lugar a um hook — o formato abaixo já espelha o das colunas para a
 * troca não mexer nos componentes.
 */
export interface Plano {
  slug: string;
  nome: string;
  descricao: string;
  /** Valor mensal em reais. */
  precoMensal: number;
  destaque: boolean;
  selo?: string;
  beneficios: string[];
}

export const PLANOS: Plano[] = [
  {
    slug: 'lancamento',
    nome: 'Plano de Lançamento',
    descricao: 'Acesso completo ao Repply para toda a sua equipe comercial.',
    precoMensal: 2997,
    destaque: true,
    selo: 'Condição de lançamento',
    // Curtos de propósito: são exibidos numa linha só, lado a lado.
    beneficios: [
      'Usuários ilimitados',
      'Todos os módulos',
      'WhatsApp e e-mail',
      'Importação da sua base',
      'Suporte direto com o time',
    ],
  },
];

export function formatarPrecoBRL(valor: number): string {
  return valor.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}
