/**
 * Ordem das marcas representadas nas listas de ESCOLHA.
 *
 * Regra do produto: uma fábrica marcada como **Inativa** é uma marca que o representante
 * não representa mais. Ela **não sai do sistema** — continua ligada aos negócios antigos,
 * continua contando no faturamento histórico e nos relatórios, continua selecionável num
 * filtro salvo. O que muda é só a POSIÇÃO: ela desce para o fim de toda lista onde alguém
 * escolhe uma fábrica.
 *
 * Isto vive num arquivo próprio porque QUATRO telas ordenam fabricante por conta própria
 * (página Fabricantes, ficha do cliente e dois pontos do Plano de Vendas), além dos dois
 * canos de consulta. Regra repetida em quatro lugares diverge — é defeito conhecido deste
 * projeto.
 *
 * 🔴 Onde a regra NÃO se aplica: gráfico e painel que agregam por fabricante e ordenam por
 * VALOR (pizza de faturamento, radar de risco, vendas por obra, as RPCs do Dashboard).
 * Ali a marca inativa simplesmente vai ter valor baixo — empurrá-la para o fim mentiria
 * sobre o histórico de venda dela.
 */

export interface FabricanteOrdenavel {
  nome?: string | null;
  ativo?: boolean | null;
}

/**
 * Ausência de informação não é informação: uma lista que não trouxe a coluna `ativo`
 * (o embed de `pedidos`, o retorno de uma RPC, um cadastro antigo) não está dizendo que a
 * marca foi desativada. Sem o dado, a marca conta como ATIVA e a ordem fica idêntica à de
 * antes — ninguém desce para o fim da lista por engano.
 */
export function fabricanteEstaAtivo(f: FabricanteOrdenavel | null | undefined): boolean {
  return f?.ativo !== false;
}

/**
 * Só o critério de status, para quem já tem uma ordem própria DEPOIS dele: a ordem
 * arrastada à mão do Plano de Vendas, o valor da meta, a ordem que a RPC devolveu.
 *
 * Devolve 0 quando as duas marcas têm o mesmo status, deixando o próximo critério decidir.
 * É por isso que ele existe separado de `compararFabricantes`: no Plano de Vendas, "inativa
 * por último" precisa vir ANTES da ordem arrastada — senão uma marca que alguém arrastou
 * para o topo antes de desativá-la continua no topo para sempre.
 */
export function compararStatusDeFabricante(
  a: FabricanteOrdenavel | null | undefined,
  b: FabricanteOrdenavel | null | undefined,
): number {
  const aAtivo = fabricanteEstaAtivo(a);
  const bAtivo = fabricanteEstaAtivo(b);
  if (aAtivo === bAtivo) return 0;
  return aAtivo ? -1 : 1;
}

/**
 * Nome, em pt-BR. O `localeCompare` sem locale explícito herda o do navegador — e num
 * navegador em inglês "Ábaco" cai depois de "Zurique".
 */
export function compararNomeDeFabricante(
  a: FabricanteOrdenavel | null | undefined,
  b: FabricanteOrdenavel | null | undefined,
): number {
  return (a?.nome ?? '').localeCompare(b?.nome ?? '', 'pt-BR');
}

/** A ordem completa de uma lista de escolha: inativa por último, alfabética dentro de cada grupo. */
export function compararFabricantes(
  a: FabricanteOrdenavel | null | undefined,
  b: FabricanteOrdenavel | null | undefined,
): number {
  return compararStatusDeFabricante(a, b) || compararNomeDeFabricante(a, b);
}

/** Cópia ordenada. Não mexe no array recebido — várias telas recebem a lista do cache do React Query. */
export function ordenarFabricantes<T extends FabricanteOrdenavel>(lista: readonly T[] | null | undefined): T[] {
  return [...(lista ?? [])].sort(compararFabricantes);
}

/** O termo que o dono do produto escolheu. Está aqui para a tela toda dizer a mesma palavra. */
export const SELO_FABRICANTE_INATIVA = 'Inativa';

/** Rótulo do selo, ou `undefined` quando a marca está ativa (não há nada a sinalizar). */
export function seloDeFabricante(f: FabricanteOrdenavel | null | undefined): string | undefined {
  return fabricanteEstaAtivo(f) ? undefined : SELO_FABRICANTE_INATIVA;
}
