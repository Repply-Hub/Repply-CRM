/**
 * Computa SHA-256 de uma linha sanitizada para deduplicação de importação.
 * O objeto canônico usa chaves em ordem fixa e campos_extras com chaves ordenadas,
 * garantindo que linhas idênticas sempre produzam o mesmo hash independente de
 * inserção de propriedades ou ordem de campos extras.
 */
export async function computeRowHash(row: Record<string, unknown>): Promise<string> {
  const camposExtras = (row.campos_extras ?? {}) as Record<string, unknown>;
  const sortedExtras: Record<string, unknown> = {};
  Object.keys(camposExtras).sort().forEach(k => { sortedExtras[k] = camposExtras[k]; });

  const canonical = {
    negocio: row.negocio ?? null,
    cliente: row.cliente ?? null,
    contato: row.contato ?? null,
    obra: row.obra ?? null,
    fabricante: row.fabricante ?? null,
    valor: row.valor ?? null,
    vendedor: row.vendedor ?? null,
    observacoes: row.observacoes ?? null,
    status: row.status ?? null,
    data_pedido: row.data_pedido ?? null,
    prazo_resposta: row.prazo_resposta ?? null,
    campos_extras: sortedExtras,
  };

  const json = JSON.stringify(canonical);
  const encoded = new TextEncoder().encode(json);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
