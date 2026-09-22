export type ModoCaixaWhatsapp = 'repply' | 'lista_unica';

/** Traduz o booleano da empresa no modo da caixa. Ausente/desconhecido → repply (padrão seguro). */
export function modoCaixaDaEmpresa(listaUnica: boolean | null | undefined): ModoCaixaWhatsapp {
  return listaUnica ? 'lista_unica' : 'repply';
}

/**
 * Quais elementos de atribuição a caixa mostra em cada modo. Fonte única da verdade —
 * para a decisão não ficar espalhada dentro do componente de ~9.900 linhas.
 */
export interface ElementosDaCaixa {
  mostrarAbasDeGrupo: boolean;          // Todos/Não atribuído/Meus chats/Outros no dropdown
  agruparConversas: boolean;            // grupos por responsável e por instância
  mostrarAvisoSemResponsavel: boolean;  // bloco "Conversa sem responsável!" + Assumir/Direcionar
  mostrarVisualizadores: boolean;       // pilha "Visualizaram sem assumir"
  mostrarTracoResponsavel: boolean;     // avatar de quem vem atendendo (só no modo lista única)
}

export function elementosDaCaixa(modo: ModoCaixaWhatsapp): ElementosDaCaixa {
  const listaUnica = modo === 'lista_unica';
  return {
    mostrarAbasDeGrupo: !listaUnica,
    agruparConversas: !listaUnica,
    mostrarAvisoSemResponsavel: !listaUnica,
    mostrarVisualizadores: !listaUnica,
    mostrarTracoResponsavel: listaUnica,
  };
}

/**
 * "Quem vem atendendo": o responsável de `atribuido_em` mais recente. Como responder já
 * marca a pessoa como responsável (ensureResponsavel em whatsapp-send), na prática é quem
 * respondeu por último. Sem data ou empate → mantém o primeiro estável. Vazio → undefined.
 * Genérico de propósito: não importa nada do hook e compila antes da Task 4 adicionar
 * `atribuido_em` a WaResponsavel.
 */
export function ultimoResponsavel<T extends { atribuido_em?: string }>(
  responsaveis: T[] | undefined,
): T | undefined {
  if (!responsaveis || responsaveis.length === 0) return undefined;
  return responsaveis.reduce((maisRecente, r) =>
    (r.atribuido_em ?? '') > (maisRecente.atribuido_em ?? '') ? r : maisRecente,
  );
}
