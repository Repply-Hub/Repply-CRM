/** Resolução de conflito e proteções da sincronização — puras, para testar sem banco/rede. */

/** Mais recente vence; empate favorece o Repply (a fonte oficial do evento). */
export function quemVence(repplyAtualizadoEm: string, googleAtualizadoEm: string): 'repply' | 'google' {
  const r = new Date(repplyAtualizadoEm).getTime();
  const g = new Date(googleAtualizadoEm).getTime();
  return g > r ? 'google' : 'repply';
}

/** Disjuntor: acima disto, uma passada de sincronização PARA em vez de apagar em massa. */
export const LIMITE_EXCLUSAO_EM_LOTE = 20;

export function excedeDisjuntor(qtdParaApagar: number): boolean {
  return qtdParaApagar > LIMITE_EXCLUSAO_EM_LOTE;
}

/** ZERO LINHAS NÃO É SUCESSO (CLAUDE.md §4.6): count===0 é recusa; null nunca é. */
export function deveTratarComoRecusa(count: number | null): boolean {
  return count === 0;
}
