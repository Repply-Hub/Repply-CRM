import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface PedidoRow {
  cliente: string;
  obra: string;
  fabricante: string;
  vendedor: string;
  valor: number;
  etapa: string;
  data: string;
}

export function generatePedidosPdf(pedidos: PedidoRow[], titulo: string = 'Relatório de Orçamentos') {
  const doc = new jsPDF('landscape', 'mm', 'a4');

  // Header
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(titulo, 14, 18);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, 14, 25);
  doc.text(`Total de pedidos: ${pedidos.length}`, 14, 30);

  const totalValor = pedidos.reduce((acc, p) => acc + p.valor, 0);
  doc.text(
    `Valor total: ${totalValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`,
    14,
    35
  );

  doc.setTextColor(0);

  // Table
  autoTable(doc, {
    startY: 42,
    head: [['Cliente', 'Obra', 'Fabricante', 'Vendedor', 'Valor', 'Etapa', 'Data']],
    body: pedidos.map(p => [
      p.cliente,
      p.obra,
      p.fabricante,
      p.vendedor,
      p.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      p.etapa,
      p.data ? new Date(p.data).toLocaleDateString('pt-BR') : '-',
    ]),
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [41, 65, 122], fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [245, 245, 250] },
    margin: { left: 14, right: 14 },
  });

  doc.save(`orcamentos-${new Date().toISOString().slice(0, 10)}.pdf`);
}
