/**
 * Comparação de texto para BARRA DE BUSCA: sem acento, sem caixa, sem espaço nas pontas.
 *
 * 🔴 POR QUE EXISTE. Digitar "jeronimo" tem que achar "Jerônimo", e "sao" tem que achar
 * "São" — quem busca não põe acento. O mesmo par NFD + faixa de diacríticos já aparecia
 * espalhado em ~15 arquivos (cada lista de configuração, o seletor de contatos, a busca de
 * obras); os seletores genéricos `SearchableSelect` e `EmpresaSelector` ficaram de fora e
 * respondiam só com o texto idêntico. Um lugar só para todos casarem do mesmo jeito.
 */
export function normalizarParaBusca(valor?: string | null): string {
  return (valor ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * `alvo` contém `termo`, ignorando acento e caixa. `termo` vazio casa com tudo.
 */
export function correspondeBusca(alvo?: string | null, termo?: string | null): boolean {
  const t = normalizarParaBusca(termo);
  if (!t) return true;
  return normalizarParaBusca(alvo).includes(t);
}
