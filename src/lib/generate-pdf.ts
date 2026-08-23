import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import logoUrl from '@/assets/logo-md.webp';

export interface PedidoRow {
  cliente: string;
  // Opcional porque, com a seção Obras desligada, quem monta as linhas não tem obra nenhuma
  // para informar — e obrigar um traço só para satisfazer o tipo escreveria no arquivo uma
  // coluna que não deveria existir.
  obra?: string;
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

/**
 * `opcoes.comObra` desliga a coluna "Obra" do relatório.
 *
 * Vem por PARÂMETRO, e não de hook, porque isto é função pura: roda fora do React e é
 * carregada sob demanda por `import()`. Quem chama (a tela de Negócios) é que sabe se a
 * empresa contratou a seção Obras.
 *
 * O padrão é "com obra": chamador que ainda não foi atualizado continua gerando o mesmo
 * arquivo de sempre, em vez de perder uma coluna sem ninguém pedir.
 */
export async function generatePedidosPdf(
  pedidos: PedidoRow[],
  titulo: string = 'Relatório de Orçamentos',
  opcoes: { comObra?: boolean } = {},
) {
  const comObra = opcoes.comObra !== false;
  const doc = new jsPDF('landscape', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(...BRAND_ORANGE);
  doc.rect(0, 0, pageWidth, 3, 'F');

  try {
    const img = await loadImage(logoUrl);
    const maxWidth = 30;
    const maxHeight = 12;
    const ratio = Math.min(maxWidth / img.width, maxHeight / img.height);
    const imgWidth = img.width * ratio;
    const imgHeight = img.height * ratio;
    
    doc.addImage(img, 'WEBP', 14, 8, imgWidth, imgHeight);
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
  doc.text(`${pedidos.length} negócios · Total: ${totalValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`, 50, 25);

  doc.setTextColor(0);

  autoTable(doc, {
    startY: 32,
    // Cabeçalho e corpo têm que cortar a coluna JUNTOS: tirar só um dos dois desloca todos
    // os valores uma casa para o lado e a tabela inteira sai trocada.
    head: [['Cliente', ...(comObra ? ['Obra'] : []), 'Fabricante', 'Vendedor', 'Valor', 'Etapa', 'Data']],
    body: pedidos.map(p => [
      p.cliente,
      ...(comObra ? [p.obra ?? '-'] : []),
      p.fabricante,
      p.vendedor,
      p.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      p.etapa,
      // Sem `new Date()`: a data vem como texto AAAA-MM-DD, e o JavaScript lê
      // isso como meia-noite UTC — no Brasil, 21h do DIA ANTERIOR. Todo negócio
      // do dia 1º saía no PDF com data do mês passado. Mesma armadilha do
      // CLAUDE.md §7.12 que já mordeu a exportação em Excel e os campos de data.
      p.data ? p.data.slice(0, 10).split('-').reverse().join('/') : '-',
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
