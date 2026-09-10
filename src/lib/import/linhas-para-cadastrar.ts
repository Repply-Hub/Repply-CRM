/**
 * Escolhe, dentre as linhas já enriquecidas para cadastro, só as que a prévia marcou para
 * virar negócio novo.
 *
 * 🔴 POR QUE ESTA FUNÇÃO EXISTE, EM VEZ DE UM `.filter()` INLINE. O índice de uma linha
 * DEPOIS do filtro de Cliente/Fabricante (`linhas`, que é `enrichedRows` em
 * `ImportPedidosDialog.tsx`) NÃO é o índice que a prévia usou para classificar por
 * Código/ID (`indicesEscolhidos`, que vem de `reencontro.classificacao`) — sempre que
 * alguma linha anterior foi descartada por falta de Cliente ou Fabricante, as duas listas
 * desalinham. Confundir as duas cadastra a linha ERRADA: a planilha entra com o conteúdo de
 * uma linha no lugar de outra, sem erro nenhum aparecer na tela. Foi exatamente esse o
 * defeito do plano original desta funcionalidade — pego só na revisão, nunca em teste.
 *
 * `linhas` e `indicesDaPrevia` andam lado a lado, posição a posição
 * (`indicesDaPrevia[j]` é o índice de prévia de `linhas[j]`) — é o par que
 * `ImportPedidosDialog.tsx` monta em `linhasComIndicePrevia`, antes de enriquecer as linhas.
 * Isolar essa correspondência numa função pura, testável sem React nem banco, é a rede de
 * segurança contra alguém "simplificar" o filtro de volta para `has(j)` — a posição crua na
 * lista já filtrada — daqui a três meses.
 */
export function escolherLinhasParaCadastrar<T>(
  linhas: T[],
  indicesDaPrevia: number[],
  indicesEscolhidos: ReadonlySet<number>,
): T[] {
  return linhas.filter((_, j) => indicesEscolhidos.has(indicesDaPrevia[j]));
}
