/**
 * Quais mensagens de uma conversa começam ABERTAS (expandidas) ao entrar nela,
 * no leitor por conversa (estilo Gmail): a mensagem que a pessoa clicou para
 * chegar aqui, mais toda mensagem RECEBIDA não lida. As demais começam
 * recolhidas (uma linha, clica para abrir).
 */
export function idsAbertasPorPadrao(
  mensagens: { id: string; tipo: "sent" | "received"; lido?: boolean }[],
  idAberto: string | null | undefined,
): Set<string> {
  const abertas = new Set<string>();
  const existe = new Set(mensagens.map((m) => m.id));
  if (idAberto && existe.has(idAberto)) abertas.add(idAberto);
  for (const m of mensagens) {
    // Enviada não tem estado de leitura — nunca conta como "não lida".
    if (m.tipo === "received" && m.lido === false) abertas.add(m.id);
  }
  return abertas;
}
