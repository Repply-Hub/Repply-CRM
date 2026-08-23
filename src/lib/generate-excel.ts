import * as XLSX from 'xlsx';
import type { PedidoRow } from '@/lib/generate-pdf';

/**
 * `opcoes.comObra` desliga a coluna "Obra" da planilha.
 *
 * Mesmo caminho do gerador de PDF: isto é função pura, então não pode perguntar a um hook
 * se a empresa contratou a seção Obras — quem chama informa. E o padrão é "com obra", para
 * chamador ainda não atualizado continuar gerando a planilha de sempre.
 */
export function generatePedidosExcel(
  pedidos: PedidoRow[],
  titulo: string = 'Relatório de Orçamentos',
  opcoes: { comObra?: boolean } = {},
) {
  const comObra = opcoes.comObra !== false;
  const rows = pedidos.map(p => ({
    Cliente: p.cliente,
    // O espalhamento condicional preserva a ORDEM das chaves, e a ordem é o que o
    // `json_to_sheet` usa para montar o cabeçalho da planilha.
    ...(comObra ? { Obra: p.obra ?? '-' } : {}),
    Fabricante: p.fabricante,
    Vendedor: p.vendedor,
    Valor: p.valor,
    Etapa: p.etapa,
    Data: p.data ? new Date(p.data).toLocaleDateString('pt-BR') : '-',
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  // As larguras andam junto com as colunas: tirar a coluna Obra e esquecer a largura dela
  // desalinha TODAS as colunas seguintes da planilha.
  ws['!cols'] = [
    { wch: 28 }, // Cliente
    ...(comObra ? [{ wch: 28 }] : []), // Obra
    { wch: 22 }, // Fabricante
    { wch: 22 }, // Vendedor
    { wch: 16 }, // Valor
    { wch: 18 }, // Etapa
    { wch: 12 }, // Data
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Orçamentos');

  const fileName = `${titulo.replace(/[^a-zA-Z0-9À-ÿ -]/g, '').trim() || 'orcamentos'}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
