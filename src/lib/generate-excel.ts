import * as XLSX from 'xlsx';
import type { PedidoRow } from '@/lib/generate-pdf';

export function generatePedidosExcel(pedidos: PedidoRow[], titulo: string = 'Relatório de Orçamentos') {
  const rows = pedidos.map(p => ({
    Cliente: p.cliente,
    Obra: p.obra,
    Fabricante: p.fabricante,
    Vendedor: p.vendedor,
    Valor: p.valor,
    Etapa: p.etapa,
    Data: p.data ? new Date(p.data).toLocaleDateString('pt-BR') : '-',
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 28 }, // Cliente
    { wch: 28 }, // Obra
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
