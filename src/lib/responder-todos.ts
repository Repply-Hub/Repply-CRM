/**
 * Monta o campo "Cc" de um "Responder a todos" a partir do original.
 *
 * Regra (modelo Gmail): o remetente vai para o "Para" (feito na tela); TODO o
 * resto — os outros destinatários mais quem estava em cópia — vai para o "Cc",
 * menos duas pessoas: o próprio remetente (já está no "Para") e a caixa da
 * empresa (não faz sentido me copiar na minha própria resposta).
 *
 * Devolve uma STRING no formato que o campo de cópia aceita ("Nome <email>"
 * quando há nome, senão só o endereço), separada por ", " — a mesma que
 * `parseEnderecos` lê depois no envio.
 */
export function montarCcResponderATodos(
  remetenteEmail: string,
  destinatarios: { name?: string | null; email?: string | null }[] = [],
  cc: { name?: string | null; email?: string | null }[] = [],
  euEmail = "",
): string {
  // Quem NÃO entra na cópia: o remetente (vai para o "Para") e a própria caixa.
  const excluir = new Set(
    [remetenteEmail, euEmail].map((e) => (e || "").trim().toLowerCase()).filter(Boolean),
  );

  const vistos = new Set<string>();
  const saida: string[] = [];

  for (const item of [...(destinatarios ?? []), ...(cc ?? [])]) {
    const email = (item?.email ?? "").trim();
    if (!email) continue;
    const chave = email.toLowerCase();
    if (excluir.has(chave) || vistos.has(chave)) continue;
    vistos.add(chave);
    const nome = (item?.name ?? "").trim();
    saida.push(nome ? `${nome} <${email}>` : email);
  }

  return saida.join(", ");
}
