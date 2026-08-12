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
