/**
 * Os filtros do painel "No geral" da tela "Hoje", guardados no ENDEREÇO da página.
 *
 * Endereço e não armazenamento local, de propósito: sobrevive ao recarregar, dá para mandar por
 * link, e não fica preso a um navegador. O precedente de filtro guardado no navegador está na
 * tela de Negócios, e é um dos quatro motivos do defeito do painel corrigido em 05/09/2026 —
 * a pessoa chegava pela pauta e caía num recorte que ela nunca escolheu.
 */
export interface FiltrosDoPainel {
  etapas: string[];       // slugs de kanban_colunas, que é o que `pedidos.status` guarda
  fabricantes: string[];  // ids
  responsaveis: string[]; // ids de usuarios.id
}

const CHAVES = ['etapas', 'fabricantes', 'responsaveis'] as const;

function lerLista(params: URLSearchParams, chave: string): string[] {
  return (params.get(chave) ?? '')
    .split(',')
    .map((p) => p.trim())
    // Pedaço vazio viraria filtro por texto vazio, que não casa com nada e esvazia o painel
    // sem explicação nenhuma na tela.
    .filter(Boolean);
}

export function lerFiltrosDoEndereco(params: URLSearchParams): FiltrosDoPainel {
  return {
    etapas: lerLista(params, 'etapas'),
    fabricantes: lerLista(params, 'fabricantes'),
    responsaveis: lerLista(params, 'responsaveis'),
  };
}

/** Devolve uma cópia — nunca altera o que recebeu, e preserva parâmetro de terceiros (`negocio`). */
export function escreverFiltrosNoEndereco(
  params: URLSearchParams,
  filtros: FiltrosDoPainel,
): URLSearchParams {
  const saida = new URLSearchParams(params);
  for (const chave of CHAVES) {
    const valores = filtros[chave];
    if (valores.length > 0) saida.set(chave, valores.join(','));
    else saida.delete(chave);
  }
  return saida;
}
