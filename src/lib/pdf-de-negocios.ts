import type { PedidoWithRelations } from '@/hooks/use-pedidos';
import type { PedidoRow } from '@/lib/generate-pdf';

/**
 * Regras do PDF de negócios (o "Exportar → PDF" da tela de Negócios).
 *
 * O PDF sai com o FILTRO INTEIRO, buscado no servidor do mesmo jeito que o Excel, até este teto.
 * Até 22/09/2026 ele saía só com o que estava carregado na tela — os cartões visíveis de cada
 * coluna do Kanban, ou a página da Lista —, mas com o título "Orçamentos - Pipeline Completo" e
 * um "N negócios · Total: R$ X" somado só sobre essas linhas. O documento que ia para fora do
 * sistema mostrava um total várias vezes menor que o real, sem nada indicar que era parcial.
 *
 * Decisão do Lucas em 22/09/2026: filtro inteiro até 1.000 negócios (umas 30 páginas, montadas
 * no navegador); acima disso a tela avisa e sugere filtrar mais ou usar o Excel, que leva tudo.
 * O teto existe porque o funil inteiro da MD passaria de 250 páginas — ninguém lê, e o navegador
 * monta o arquivo inteiro na memória.
 */
export const PDF_NEGOCIOS_TETO = 1000;

export function pdfCabeNoTeto(totalDoFiltro: number): boolean {
  return totalDoFiltro <= PDF_NEGOCIOS_TETO;
}

/**
 * "Pipeline Completo" só quando não há filtro nenhum. `filtrado` segue a mesma regra do Excel
 * (qualquer filtro do painel OU busca): a regra antiga da Lista olhava só a etapa e escrevia
 * "Todos" num arquivo filtrado por vendedor.
 */
export function tituloDoPdfDeNegocios(filtrado: boolean): string {
  return filtrado ? 'Orçamentos - Filtrado' : 'Orçamentos - Pipeline Completo';
}

/**
 * Uma linha do PDF por negócio recebido — todos, sem recorte. `participantesPorNegocio` é o mapa
 * de `useParticipantesDosNegocios`, que cobre todos os negócios da empresa (não só os da tela).
 * A coluna "Obra" vai preenchida mesmo com a seção desligada: quem decide se ela entra no arquivo
 * é o gerador, pelo `comObra` que a tela passa.
 */
export function linhasDoPdfDeNegocios(
  negocios: PedidoWithRelations[],
  participantesPorNegocio: Map<string, { nome: string }[]> | undefined,
  rotuloDaEtapa: (slug: string) => string,
): PedidoRow[] {
  return negocios.map(p => ({
    cliente: p.cliente?.empresa ?? '-',
    obra: p.obra?.nome_obra ?? '-',
    fabricante: p.fabricante?.nome ?? '-',
    vendedor: p.vendedor?.nome ?? '-',
    participantes: (participantesPorNegocio?.get(p.id) ?? []).map(r => r.nome).join(', '),
    valor: p.valor_total ?? 0,
    etapa: rotuloDaEtapa(p.status),
    data: p.data_pedido,
  }));
}
