/**
 * O mês da edição, traduzido entre o que o banco guarda e o que o seletor da tela fala.
 *
 * 🔴 `edicao_mes` é NULO para a fábrica que faz catálogo anual — e nulo não é "vazio por
 * esquecimento", é uma resposta legítima ("o ano inteiro"). O Radix, porém, não aceita item de
 * Select com valor vazio, então a tela precisa de um texto para representar esse nulo. As duas
 * conversões vivem aqui, juntas, porque errar UMA das pontas é o bastante para transformar
 * "o ano inteiro" em janeiro — e o mês manda na ordem da prateleira.
 *
 * Arquivo separado do componente de propósito: constante e função exportadas do mesmo arquivo
 * que um componente derrubam o recarregamento instantâneo do Vite (`react-refresh`).
 */

/** Rótulos por extenso, como o seletor mostra. A etiqueta curta do cartão é outra lista, em `src/lib/fabricante-arquivos.ts`. */
export const MESES = [
  { v: '1', l: 'Janeiro' }, { v: '2', l: 'Fevereiro' }, { v: '3', l: 'Março' },
  { v: '4', l: 'Abril' }, { v: '5', l: 'Maio' }, { v: '6', l: 'Junho' },
  { v: '7', l: 'Julho' }, { v: '8', l: 'Agosto' }, { v: '9', l: 'Setembro' },
  { v: '10', l: 'Outubro' }, { v: '11', l: 'Novembro' }, { v: '12', l: 'Dezembro' },
];

/** O valor do Select para "sem mês". Radix não aceita item com valor vazio. */
export const ANO_INTEIRO = 'ano-inteiro';

/** O que a coluna `edicao_mes` guarda (`null` = o ano inteiro) virando o valor do Select. */
export function mesParaSelect(mes: number | null | undefined): string {
  return mes == null ? ANO_INTEIRO : String(mes);
}

/** O caminho de volta: o valor do Select virando o que a coluna `edicao_mes` guarda. */
export function selectParaMes(valor: string): number | null {
  return valor === ANO_INTEIRO ? null : Number.parseInt(valor, 10);
}
