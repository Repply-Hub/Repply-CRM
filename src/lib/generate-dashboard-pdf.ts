import jsPDF from 'jspdf';
import logoUrl from '@/assets/logo-md.webp';

const BRAND_ORANGE: [number, number, number] = [240, 106, 0];

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Captura `element` como imagem (html2canvas) e monta um PDF paginado em A4,
 * com o mesmo cabeçalho de marca usado em generate-pdf.ts. O cabeçalho com
 * logo/título só é desenhado na primeira página; nas seguintes só a faixa
 * laranja é repetida.
 */
export async function generateDashboardPdf(
  element: HTMLElement,
  subtitulo: string,
  titulo: string = 'Dashboard'
) {
  const { default: html2canvas } = await import('html2canvas');

  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
  });

  const doc = new jsPDF('portrait', 'mm', 'a4');
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
    try {
      const img = await loadImage(logoUrl);
      const maxWidth = 30;
      const maxHeight = 12;
      const ratio = Math.min(maxWidth / img.width, maxHeight / img.height);
      doc.addImage(img, 'WEBP', margin, 8, img.width * ratio, img.height * ratio);
    } catch {
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...BRAND_ORANGE);
      doc.text('MD Representações', margin, 16);
    }

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(50, 50, 50);
    doc.text(titulo, margin + 36, 14);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120);
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, margin + 36, 20);
    if (subtitulo) {
      doc.text(subtitulo, margin + 36, 25);
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
      doc.addImage(sliceCanvas.toDataURL('image/png'), 'PNG', margin, startY, contentWidth, availablePx / pxPerMm);
    }

    renderedPx += availablePx;
    page += 1;
  }

  doc.save(`dashboard-${new Date().toISOString().slice(0, 10)}.pdf`);
}
