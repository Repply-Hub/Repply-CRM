import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import logoUrl from '@/assets/logo-md.webp';

interface PedidoRow {
  cliente: string;
  obra: string;
  fabricante: string;
  vendedor: string;
  valor: number;
  etapa: string;
  data: string;
}

const BRAND_ORANGE: [number, number, number] = [240, 106, 0];
const BRAND_ORANGE_LIGHT: [number, number, number] = [255, 237, 222];

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function generatePedidosPdf(pedidos: PedidoRow[], titulo: string = 'Relatório de Orçamentos') {
  const doc = new jsPDF('landscape', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(...BRAND_ORANGE);
  doc.rect(0, 0, pageWidth, 3, 'F');

  try {
    const img = await loadImage(logoUrl);
    doc.addImage(img, 'WEBP', 14, 8, 30, 12);
  } catch {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BRAND_ORANGE);
    doc.text('MD Representações', 14, 16);
  }

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(50, 50, 50);
  doc.text(titulo, 50, 14);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120);
  doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, 50, 20);

  const totalValor = pedidos.reduce((acc, p) => acc + p.valor, 0);
  doc.text(`${pedidos.length} pedidos · Total: ${totalValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`, 50, 25);

  doc.setTextColor(0);

  autoTable(doc, {
    startY: 32,
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
    styles: { fontSize: 8, cellPadding: 3, textColor: [50, 50, 50] },
    headStyles: { fillColor: BRAND_ORANGE, fontStyle: 'bold', fontSize: 8, textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: BRAND_ORANGE_LIGHT },
    margin: { left: 14, right: 14 },
    didDrawPage: () => {
      doc.setFillColor(...BRAND_ORANGE);
      doc.rect(0, 0, pageWidth, 3, 'F');
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFontSize(7);
      doc.setTextColor(160);
      doc.text('MD Representações', 14, pageHeight - 6);
      doc.text(`Página ${doc.getCurrentPageInfo().pageNumber}`, pageWidth - 14, pageHeight - 6, { align: 'right' });
    },
  });

  doc.save(`orcamentos-${new Date().toISOString().slice(0, 10)}.pdf`);
}
