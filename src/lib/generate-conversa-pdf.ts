import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { desenharMarca, desenharRodape, encurtar, type MarcaDaEmpresa } from '@/lib/marca-do-pdf';

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
async function desenharCabecalho(
  doc: jsPDF,
  pageWidth: number,
  marca: MarcaDaEmpresa,
  titulo: string,
  periodo: string,
) {
  doc.setFillColor(...BRAND_ORANGE);
  doc.rect(0, 0, pageWidth, 3, 'F');

  const X_DO_TEXTO = 46;
  const { larguraDisponivelParaTexto } = await desenharMarca(doc, {
    marca,
    larguraDaPagina: pageWidth,
    margemDireita: 14,
    xDoTexto: X_DO_TEXTO,
    caixaDoCliente: { x: 14, y: 8, maxLargura: 26, maxAltura: 10 },
    tamanhoDoNome: 13,
    corDoNome: BRAND_ORANGE,
  });

  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(50, 50, 50);
  // 🔴 CORTADO PARA CABER. "Conversa — <nome do contato>" já estourava a margem direita com
  // nome de contato longo, antes mesmo de a logo da Repply ocupar a direita.
  doc.text(encurtar(doc, sanitizeForPdf(titulo), larguraDisponivelParaTexto), X_DO_TEXTO, 13);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120);
  doc.text(encurtar(doc, `Período: ${periodo}`, larguraDisponivelParaTexto), X_DO_TEXTO, 18);
  doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, X_DO_TEXTO, 22.5);

  doc.setTextColor(0);
}

function desenharTabelaMensagens(
  doc: jsPDF,
  pageWidth: number,
  marcaDoRodape: MarcaDaEmpresa,
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
      desenharRodape(doc, { marca: marcaDoRodape, larguraDaPagina: pageWidth });
    },
  });
}

export async function generateConversaPdf(
  linhas: ConversaExportRow[],
  marca: MarcaDaEmpresa,
  contato: string,
  periodo: string,
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();

  await desenharCabecalho(doc, pageWidth, marca, `Conversa — ${contato}`, periodo);
  desenharTabelaMensagens(doc, pageWidth, marca, linhas);

  const nomeArquivo = contato.replace(/[^a-zA-Z0-9À-ÿ -]/g, '').trim() || 'conversa';
  doc.save(`conversa-${nomeArquivo}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

// Exportação consolidada: um único PDF com todas as conversas, cada uma
// começando em página nova e com o próprio nome como título no topo da
// seção — ver comentário de `desenharCabecalho`.
export async function generateConversasPdf(
  conversas: ConversaParaExportar[],
  marca: MarcaDaEmpresa,
  periodo: string,
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();

  // `for...of` e não `forEach`: o cabeçalho virou assíncrono (a logo do cliente vem de uma
  // URL), e `forEach` não espera promessa — as conversas sairiam sem logo, em ordem aleatória.
  for (const [i, conversa] of conversas.entries()) {
    if (i > 0) doc.addPage();
    await desenharCabecalho(doc, pageWidth, marca, `Conversa — ${conversa.nomeContato}`, periodo);
    // O rodapé leva a EMPRESA, não o nome do contato: é a identificação de quem exportou o
    // documento, e o contato já está no título da seção logo acima.
    desenharTabelaMensagens(doc, pageWidth, marca, conversa.linhas);
  }

  doc.save(`todas-as-conversas-${new Date().toISOString().slice(0, 10)}.pdf`);
}
