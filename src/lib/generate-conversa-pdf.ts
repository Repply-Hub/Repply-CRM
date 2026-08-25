import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import logoUrl from '@/assets/logo-md.webp';

export interface ConversaExportRow {
  dataHora: string;
  remetente: string;
  tipo: string;
  mensagem: string;
}

export interface ConversaParaExportar {
  nomeContato: string;
  linhas: ConversaExportRow[];
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

// Cabeçalho de marca (faixa laranja + logo/nome) e título da seção — usado
// tanto na conversa única quanto em cada conversa dentro da exportação "todas
// as conversas", onde cada uma começa em página nova com o próprio título no
// topo, pra dar pra saber de cara, rolando o PDF, onde uma conversa termina e
// a próxima começa.
function desenharCabecalho(
  doc: jsPDF,
  pageWidth: number,
  img: HTMLImageElement | null,
  titulo: string,
  periodo: string,
) {
  doc.setFillColor(...BRAND_ORANGE);
  doc.rect(0, 0, pageWidth, 3, 'F');

  if (img) {
    const maxWidth = 26;
    const maxHeight = 10;
    const ratio = Math.min(maxWidth / img.width, maxHeight / img.height);
    const imgWidth = img.width * ratio;
    const imgHeight = img.height * ratio;
    doc.addImage(img, 'WEBP', 14, 8, imgWidth, imgHeight);
  } else {
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BRAND_ORANGE);
    doc.text('MD Representações', 14, 15);
  }

  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(50, 50, 50);
  doc.text(sanitizeForPdf(titulo), 46, 13);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120);
  doc.text(`Período: ${periodo}`, 46, 18);
  doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, 46, 22.5);

  doc.setTextColor(0);
}

function desenharTabelaMensagens(
  doc: jsPDF,
  pageWidth: number,
  rodapeLabel: string,
  linhas: ConversaExportRow[],
) {
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
      doc.text(rodapeLabel, 14, pageHeight - 6);
      doc.text(`Página ${doc.getCurrentPageInfo().pageNumber}`, pageWidth - 14, pageHeight - 6, { align: 'right' });
    },
  });
}

export async function generateConversaPdf(linhas: ConversaExportRow[], contato: string, periodo: string) {
  const doc = new jsPDF('portrait', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const img = await loadImage(logoUrl).catch(() => null);

  desenharCabecalho(doc, pageWidth, img, `Conversa — ${contato}`, periodo);
  desenharTabelaMensagens(doc, pageWidth, 'MD Representações', linhas);

  const nomeArquivo = contato.replace(/[^a-zA-Z0-9À-ÿ -]/g, '').trim() || 'conversa';
  doc.save(`conversa-${nomeArquivo}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

// Exportação consolidada: um único PDF com todas as conversas, cada uma
// começando em página nova e com o próprio nome como título no topo da
// seção — ver comentário de `desenharCabecalho`.
export async function generateConversasPdf(conversas: ConversaParaExportar[], periodo: string) {
  const doc = new jsPDF('portrait', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const img = await loadImage(logoUrl).catch(() => null);

  conversas.forEach((conversa, i) => {
    if (i > 0) doc.addPage();
    desenharCabecalho(doc, pageWidth, img, `Conversa — ${conversa.nomeContato}`, periodo);
    desenharTabelaMensagens(doc, pageWidth, conversa.nomeContato, conversa.linhas);
  });

  doc.save(`todas-as-conversas-${new Date().toISOString().slice(0, 10)}.pdf`);
}
