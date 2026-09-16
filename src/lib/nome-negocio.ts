/** Formato automático padrão do nome de um negócio: "empresa | fabricante". */
export function getNomeNegocioAutomatico(
  cliente?: { empresa?: string | null } | null,
  fabricante?: { nome?: string | null } | null,
): string {
  return [cliente?.empresa, fabricante?.nome].filter(Boolean).join(' | ') || '—';
}

/** Nome exibido do negócio: usa `nome` customizado quando presente, senão cai no formato automático. */
export function getNomeNegocio(pedido: {
  nome?: string | null;
  cliente?: { empresa?: string | null } | null;
  fabricante?: { nome?: string | null } | null;
}): string {
  const custom = pedido.nome?.trim();
  return custom || getNomeNegocioAutomatico(pedido.cliente, pedido.fabricante);
}

/**
 * O negócio a exibir na ficha de uma tarefa, achado onde ele estiver.
 *
 * O seletor de negócios (`usePedidosOptions`) traz só os ~500 mais recentes da empresa — a MD
 * tem quase 12 mil. Uma tarefa ligada a um negócio mais antigo não é achada nessa lista, e a
 * ficha mostrava "—", como se o vínculo tivesse sumido (o `pedido_id` está gravado certo). A
 * saída é a mesma do formulário de tarefa: buscar aquele negócio pelo identificador
 * (`usePedidoOptionPorId`) e usá-lo quando a lista curta não o alcança.
 *
 * `porId` só é aceito quando o `id` dele bate com `pedidoId`: essa busca é assíncrona e pode,
 * por um instante, ainda trazer o negócio da tarefa aberta ANTES — usá-lo às cegas mostraria o
 * negócio errado.
 */
export function negocioParaFichaDaTarefa<T extends { id: string }>(
  pedidoId: string | null | undefined,
  opcoesRecentes: T[],
  porId: T | null | undefined,
): T | null {
  if (!pedidoId) return null;
  return (
    opcoesRecentes.find((o) => o.id === pedidoId) ??
    (porId && porId.id === pedidoId ? porId : null)
  );
}
