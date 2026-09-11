import type { SituacaoCS } from './situacao-empresa';

/**
 * Desde quando a empresa assina — ou, na cortesia, desde quando usa.
 *
 * 🔴 NÃO É `ativado_em`. Aquele campo é regravado pelo webhook a cada evento que
 * libera acesso (renovação inclusive) e, nas legacy, guarda a hora da migration que
 * as liberou. A data de início vem de `assinatura_iniciada_em`, que o webhook
 * preenche com o `start_date` que o próprio provedor informa.
 *
 * Decisão do dono do produto (11/09/2026): pagante → início no provedor; cortesia →
 * criação da empresa; o resto não mostra data. Sem a data, não mostra — nunca chuta.
 */
export type RotuloDoInicio = 'Assinatura iniciada em' | 'Cortesia desde';

export interface InicioDaAssinatura {
  rotulo: RotuloDoInicio;
  /** ISO, como veio do banco. Quem desenha formata. */
  em: string;
}

export interface EntradaDoInicio {
  situacao: SituacaoCS | null;
  assinaturaIniciadaEm: unknown;
  empresaCriadaEm: unknown;
}

function isoValido(bruto: unknown): string | null {
  if (typeof bruto !== 'string' || !bruto.trim()) return null;
  return Number.isNaN(new Date(bruto).getTime()) ? null : bruto;
}

export function inicioDaAssinatura(e: EntradaDoInicio): InicioDaAssinatura | null {
  if (e.situacao === 'pagante') {
    const em = isoValido(e.assinaturaIniciadaEm);
    return em ? { rotulo: 'Assinatura iniciada em', em } : null;
  }
  if (e.situacao === 'cortesia') {
    const em = isoValido(e.empresaCriadaEm);
    return em ? { rotulo: 'Cortesia desde', em } : null;
  }
  return null;
}
