import jsPDF from 'jspdf';
import { desenharMarca, encurtar, type MarcaDaEmpresa } from '@/lib/marca-do-pdf';

const BRAND_ORANGE: [number, number, number] = [240, 106, 0];

/**
 * Captura `element` como imagem (html2canvas) e monta um PDF paginado em A4,
 * com o mesmo cabeçalho de marca usado em generate-pdf.ts. O cabeçalho com
 * logo/título só é desenhado na primeira página; nas seguintes só a faixa
 * laranja é repetida.
 */
export async function generateDashboardPdf(
  element: HTMLElement,
  marca: MarcaDaEmpresa,
  subtitulo: string,
  titulo: string = 'Dashboard'
) {
  const { default: html2canvas } = await import('html2canvas');

  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
  });

  // 🔴 `compress: true` NÃO É AFINAÇÃO FINA AQUI. Cada página deste PDF é uma FATIA DE IMAGEM
  // do painel, capturada em dobro de resolução. Medido na jsPDF 4.2.0: uma fatia de 1200x1800
  // custa 6,18 MB sem compressão e 0,31 MB com — e a fatia real é maior que essa. Um painel de
  // quatro páginas passava de 25 MB.
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;
  const headerHeight = 32;
  const contentWidth = pageWidth - margin * 2;
  const pxPerMm = canvas.width / contentWidth;

  const drawTopBar = () => {
    doc.setFillColor(...BRAND_ORANGE);
    doc.rect(0, 0, pageWidth, 3, 'F');
  };

  const drawFirstPageHeader = async () => {
    drawTopBar();
    const xDoTexto = margin + 36;

    const { larguraDisponivelParaTexto } = await desenharMarca(doc, {
      marca,
      larguraDaPagina: pageWidth,
      margemDireita: margin,
      xDoTexto,
      caixaDoCliente: { x: margin, y: 8, maxLargura: 30, maxAltura: 12 },
      corDoNome: BRAND_ORANGE,
    });

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(50, 50, 50);
    doc.text(encurtar(doc, titulo, larguraDisponivelParaTexto), xDoTexto, 14);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120);
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, xDoTexto, 20);
    if (subtitulo) {
      // 🔴 CORTADO PARA CABER. O subtítulo do painel (o período escolhido, os filtros) já
      // passava da margem direita em casos reais ANTES da logo da Repply existir — e o jsPDF
      // não corta: ele desenha para fora da página, e o texto some sem aviso.
      doc.text(encurtar(doc, subtitulo, larguraDisponivelParaTexto), xDoTexto, 25);
    }
    doc.setTextColor(0);
  };

  let renderedPx = 0;
  let page = 0;

  while (renderedPx < canvas.height) {
    if (page > 0) doc.addPage();

    if (page === 0) {
      await drawFirstPageHeader();
    } else {
      drawTopBar();
    }

    const startY = page === 0 ? headerHeight : margin;
    const availableMm = pageHeight - startY - margin;
    const availablePx = Math.min(Math.round(availableMm * pxPerMm), canvas.height - renderedPx);

    const sliceCanvas = document.createElement('canvas');
    sliceCanvas.width = canvas.width;
    sliceCanvas.height = availablePx;
    const ctx = sliceCanvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(canvas, 0, renderedPx, canvas.width, availablePx, 0, 0, canvas.width, availablePx);
      doc.addImage(sliceCanvas.toDataURL('image/png'), 'PNG', margin, startY, contentWidth, availablePx / pxPerMm, undefined, 'FAST');
    }

    renderedPx += availablePx;
    page += 1;
  }

  doc.save(`dashboard-${new Date().toISOString().slice(0, 10)}.pdf`);
}
