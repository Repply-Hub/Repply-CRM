import type { MelhorOrdemDoServico } from './osrm';

/**
 * Vale a pena sugerir outra ordem para as paradas?
 *
 * 🔴 O LIMIAR NÃO É ENFEITE. O tempo vem de um serviço público que não conhece trânsito: é
 * ESTIMATIVA. Sugerir remontar a rota por dois minutos gasta a confiança da pessoa no aviso —
 * e, quando o aviso realmente importar (meia hora a mais de estrada), ela já terá aprendido a
 * ignorá-lo.
 */
export const GANHO_MINIMO_S = 5 * 60;

export type CasoDaOrdem = 'ja_otima' | 'ordem_melhor' | 'sem_sugestao';

export interface AvaliacaoDaOrdem {
  caso: CasoDaOrdem;
  /** Segundos economizados. Zero quando não há o que economizar. */
  ganhoS: number;
  /** Os índices das paradas na ordem sugerida — só em `ordem_melhor`. */
  ordem: number[] | null;
}

const SEM_SUGESTAO: AvaliacaoDaOrdem = { caso: 'sem_sugestao', ganhoS: 0, ordem: null };
const JA_OTIMA: AvaliacaoDaOrdem = { caso: 'ja_otima', ganhoS: 0, ordem: null };

function ehMesmaOrdem(ordem: readonly number[]): boolean {
  return ordem.every((indice, lugar) => indice === lugar);
}

export function avaliarOrdemDaRota({
  duracaoAtualS,
  melhorOrdem,
}: {
  duracaoAtualS?: number | null;
  melhorOrdem?: MelhorOrdemDoServico | null;
}): AvaliacaoDaOrdem {
  // Sem os dois números não há comparação — e "não sei" nunca vira conselho.
  if (!Number.isFinite(duracaoAtualS as number) || !melhorOrdem) return SEM_SUGESTAO;
  const ordem = melhorOrdem.ordem;
  if (!Array.isArray(ordem) || ordem.length === 0) return SEM_SUGESTAO;
  if (!Number.isFinite(melhorOrdem.duracaoS)) return SEM_SUGESTAO;

  if (ehMesmaOrdem(ordem)) return JA_OTIMA;

  const ganhoS = Math.round((duracaoAtualS as number) - melhorOrdem.duracaoS);
  if (ganhoS < GANHO_MINIMO_S) return JA_OTIMA;

  return { caso: 'ordem_melhor', ganhoS, ordem: [...ordem] };
}
