import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import logoUrl from '@/assets/logo-md.webp';

export interface ConversaExportRow {
  dataHora: string;
  remetente: string;
  tipo: string;
  mensagem: string;
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

// A fonte padrão do jsPDF (Helvetica, via WinAnsiEncoding) só desenha Latin-1
// — emoji e outros símbolos fora desse conjunto não ficam em branco, saem como
// lixo binário (o byte da codificação UTF-8 do emoji, reinterpretado letra a
// letra). Troca cada emoji por "[emoji]", no mesmo padrão de "[Áudio]" e
// "[Mensagem apagada]" usado pro resto da transcrição — silenciosamente sumir
// com o caractere escondia que ali existia uma reação/conteúdo do usuário.
// `for...of` itera por code point (não por unidade UTF-16), então um emoji
// composto por par substituto + seletor de tom de pele + ZWJ (ex.: aperto de
// mãos com tons de pele) é tratado como uma sequência só, não um marcador por
// code point.
function sanitizeForPdf(texto: string): string {
  if (!texto) return texto;
  let resultado = '';
  let emojiAberto = false;
  for (const ch of texto) {
    if ((ch.codePointAt(0) ?? 0) <= 0xff) {
      resultado += ch;
      emojiAberto = false;
    } else if (!emojiAberto) {
      resultado += '[emoji]';
      emojiAberto = true;
    }
  }
  return resultado;
}

export async function generateConversaPdf(linhas: ConversaExportRow[], contato: string, periodo: string) {
  const doc = new jsPDF('portrait', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(...BRAND_ORANGE);
  doc.rect(0, 0, pageWidth, 3, 'F');

  try {
    const img = await loadImage(logoUrl);
    const maxWidth = 26;
    const maxHeight = 10;
    const ratio = Math.min(maxWidth / img.width, maxHeight / img.height);
    const imgWidth = img.width * ratio;
    const imgHeight = img.height * ratio;

    doc.addImage(img, 'WEBP', 14, 8, imgWidth, imgHeight);
  } catch {
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BRAND_ORANGE);
    doc.text('MD Representações', 14, 15);
  }

  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(50, 50, 50);
  doc.text(`Conversa — ${sanitizeForPdf(contato)}`, 46, 13);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120);
  doc.text(`Período: ${periodo}`, 46, 18);
  doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, 46, 22.5);

  doc.setTextColor(0);

  autoTable(doc, {
    startY: 28,
    head: [['Data/Hora', 'Remetente', 'Tipo', 'Mensagem']],
    body: linhas.map(l => [l.dataHora, sanitizeForPdf(l.remetente), l.tipo, sanitizeForPdf(l.mensagem)]),
    styles: { fontSize: 8, cellPadding: 2.5, textColor: [50, 50, 50], valign: 'top' },
    headStyles: { fillColor: BRAND_ORANGE, fontStyle: 'bold', fontSize: 8, textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: BRAND_ORANGE_LIGHT },
    columnStyles: {
      0: { cellWidth: 26 },
      1: { cellWidth: 32 },
      2: { cellWidth: 20 },
      3: { cellWidth: 'auto' },
    },
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

  const nomeArquivo = contato.replace(/[^a-zA-Z0-9À-ÿ -]/g, '').trim() || 'conversa';
  doc.save(`conversa-${nomeArquivo}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
