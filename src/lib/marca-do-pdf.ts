import type jsPDF from 'jspdf';
import repplyWordmark from '@/assets/repply-wordmark-preto.png';

/**
 * O cabeçalho de marca dos PDFs exportados: a logo do CLIENTE à esquerda, a da Repply à
 * direita.
 *
 * 🔴 O QUE ISTO CONSERTA. Até 31/08/2026 os três geradores de PDF (`generate-pdf.ts`,
 * `generate-dashboard-pdf.ts`, `generate-conversa-pdf.ts`) importavam `@/assets/logo-md.webp`
 * e escreviam o texto "MD Representações" — para TODA empresa. Quando a JHS exportava a
 * carteira dela, o relatório saía com a marca de outra representação. O PDF é o documento que
 * mais sai do sistema: vai por e-mail para o cliente do representante.
 *
 * Este módulo é a única fonte do cabeçalho. Os três geradores repetiam `loadImage` byte a byte
 * e o rodapé quase igual; agora repetem nada.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 TRÊS ARMADILHAS DO jsPDF, TODAS MEDIDAS NA VERSÃO 4.2.0 INSTALADA
 *
 * 1. PASSAR UM <img> COM URL DA INTERNET TRAVA A ABA. O `addImage` do jsPDF, ao receber um
 *    elemento de imagem cujo endereço não começa com `data:`, IGNORA a imagem que o navegador
 *    já baixou e refaz o download por conta própria — com XMLHttpRequest SÍNCRONO. A aba
 *    congela até a resposta chegar, o `crossOrigin` que pedimos no primeiro download não vale
 *    para o segundo, e na exportação de "todas as conversas" isso é uma requisição por
 *    conversa. Por isso tudo aqui vira `data:` antes de tocar no jsPDF.
 *
 * 2. SEM COMPRESSÃO, UMA LOGO VIRA MEGABYTES. O jsPDF embute a imagem crua quando ninguém
 *    pede o contrário. Medido: o wordmark da Repply em 2048px entra com 5,6 MB; o mesmo com
 *    compressão, 71 kB. Um relatório de duas páginas passaria de 11 MB — e e-mail de cliente
 *    recusa anexo desse tamanho. Daí o redimensionamento antes e o `'FAST'` no `addImage`.
 *
 * 3. SVG NÃO ENTRA. O `addImage` só conhece PNG, JPEG, GIF, BMP, TIFF e WEBP. Um cliente que
 *    subisse a logo em SVG quebraria a exportação. Como tudo passa pelo canvas aqui, o
 *    navegador desenha o que souber e o que sai é sempre PNG.
 */

/** A identidade da empresa dona do relatório. Vem por parâmetro, nunca de hook: os geradores
 *  são funções puras que rodam fora do React (ver o cabeçalho de `generate-pdf.ts`). */
export interface MarcaDaEmpresa {
  /** Razão social ou nome fantasia. Usado no rodapé e quando não há logo. */
  nome: string;
  /** Endereço público da logo. `null` para quem ainda não subiu — é o caso normal. */
  logoUrl?: string | null;
}

export interface LogoPronta {
  /** Já em `data:` — ver armadilha 1. */
  dataUrl: string;
  largura: number;
  altura: number;
}

/**
 * Maior lado da imagem embutida, em pixels.
 *
 * A logo ocupa cerca de 30 mm no papel. A 300 pontos por polegada isso dá ~354 px, então 600
 * é folga de sobra para impressão — e é o que impede um arquivo de 4000 px do cliente de
 * entrar inteiro no PDF.
 */
const MAIOR_LADO = 600;

/**
 * Baixa e converte para `data:`, redimensionando se preciso.
 *
 * Devolve `null` em qualquer falha, de propósito: logo é enfeite do relatório, e derrubar a
 * exportação inteira porque uma imagem não carregou trocaria a funcionalidade pelo adorno.
 * Quem chama desenha o nome da empresa no lugar.
 */
export async function carregarLogo(src: string | null | undefined): Promise<LogoPronta | null> {
  if (!src) return null;

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      // Necessário para o canvas não ficar "contaminado" e recusar o `toDataURL`. O balde
      // `branding` é público e responde com a liberação de origem que isto exige.
      el.crossOrigin = 'anonymous';
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('não carregou'));
      el.src = src;
    });

    const maior = Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height);
    if (!maior) return null;

    const escala = maior > MAIOR_LADO ? MAIOR_LADO / maior : 1;
    const largura = Math.max(1, Math.round((img.naturalWidth || img.width) * escala));
    const altura = Math.max(1, Math.round((img.naturalHeight || img.height) * escala));

    const canvas = document.createElement('canvas');
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // 🔴 FUNDO BRANCO POR BAIXO. Logo com fundo transparente é o caso comum, e o papel do PDF
    // é branco — mas o PNG que sai do canvas sem esta pintura leva um canal alfa que alguns
    // leitores desenham como preto. Pintar de branco antes deixa o resultado igual ao papel.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, largura, altura);
    ctx.drawImage(img, 0, 0, largura, altura);

    return { dataUrl: canvas.toDataURL('image/png'), largura, altura };
  } catch {
    return null;
  }
}

/** A logo da Repply, do pacote do site. Uma vez por sessão — ela nunca muda. */
let repplyEmCache: Promise<LogoPronta | null> | null = null;
export function carregarLogoRepply(): Promise<LogoPronta | null> {
  if (!repplyEmCache) repplyEmCache = carregarLogo(repplyWordmark);
  return repplyEmCache;
}

/** Só para os testes: esquece a logo da Repply já carregada. */
export function limparCacheDaLogoRepply(): void {
  repplyEmCache = null;
}

/** O retângulo que a imagem ocupa ao caber dentro de `maxL` × `maxA`, sem distorcer. */
export function encaixar(
  logo: { largura: number; altura: number },
  maxL: number,
  maxA: number,
): { largura: number; altura: number } {
  const razao = Math.min(maxL / logo.largura, maxA / logo.altura);
  return { largura: logo.largura * razao, altura: logo.altura * razao };
}

/**
 * Corta o texto com reticências para caber em `larguraMax` milímetros.
 *
 * 🔴 NÃO É PRECAUÇÃO TEÓRICA: o subtítulo do Dashboard e o título da exportação de conversa
 * já hoje passam da margem direita em casos reais — nome de contato longo, período por
 * extenso — e o jsPDF não corta nada sozinho: ele desenha para fora da página, e some. Agora
 * que a logo da Repply ocupa a direita, a faixa disponível ficou menor, então cortar deixou
 * de ser opcional.
 */
export function encurtar(doc: jsPDF, texto: string, larguraMax: number): string {
  if (!texto || larguraMax <= 0) return texto ?? '';
  if (doc.getTextWidth(texto) <= larguraMax) return texto;

  let corte = texto.length;
  while (corte > 1 && doc.getTextWidth(texto.slice(0, corte) + '…') > larguraMax) corte--;
  return texto.slice(0, corte).trimEnd() + '…';
}

export interface CaixaDaMarca {
  /** Onde a logo do cliente começa. */
  x: number;
  y: number;
  maxLargura: number;
  maxAltura: number;
}

export interface ResultadoDaMarca {
  /** Onde o texto do cabeçalho pode ir sem passar por cima da logo da Repply. */
  larguraDisponivelParaTexto: number;
}

/** Tamanhos que o nome da empresa tenta, do maior para o menor, antes de aceitar o corte. */
const TAMANHOS_DO_NOME = [14, 12, 10, 8.5];

/**
 * Escreve o nome da empresa na caixa da logo, quando não há logo.
 *
 * 🔴 DIMINUI E QUEBRA ANTES DE CORTAR, e isso foi medido num PDF de verdade. Com um tamanho
 * fixo, "PR & COCENTINO REPRESENTACOES COMERCIAIS LTDA" — uma empresa real desta base —
 * aparecia como "PR & COCEN…", que não identifica ninguém. O nome é a única identificação do
 * documento para quem ainda não subiu logo, então ele merece as duas linhas.
 *
 * Duas linhas é o teto: a caixa tem 12 mm de altura e divide o topo com o título ao lado.
 */
function desenharNome(
  doc: jsPDF,
  nome: string,
  caixa: {
    x: number;
    y: number;
    largura: number;
    altura: number;
    tamanhoMaximo: number;
    cor: [number, number, number];
  },
): void {
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...caixa.cor);

  const candidatos = TAMANHOS_DO_NOME.filter((t) => t <= caixa.tamanhoMaximo);
  let tamanho = candidatos[candidatos.length - 1] ?? caixa.tamanhoMaximo;
  let linhas: string[] = [nome];

  for (const t of candidatos) {
    doc.setFontSize(t);
    const quebrado = doc.splitTextToSize(nome, caixa.largura) as string[];
    if (quebrado.length <= 2) {
      tamanho = t;
      linhas = quebrado;
      break;
    }
    // Guarda o menor tentado: se nenhum couber em duas linhas, é este que corta.
    tamanho = t;
    linhas = quebrado;
  }

  doc.setFontSize(tamanho);
  // Mais de duas linhas não cabe na caixa: fica com as duas primeiras e a segunda leva as
  // reticências, para não dar a impressão de que o nome acabou ali.
  if (linhas.length > 2) {
    linhas = [linhas[0], encurtar(doc, linhas.slice(1).join(' '), caixa.largura)];
  }

  // Centraliza o bloco na altura da caixa — uma linha fica no meio, duas ficam equilibradas.
  const alturaDaLinha = tamanho * 0.42;
  const alturaTotal = alturaDaLinha * linhas.length;
  let y = caixa.y + (caixa.altura - alturaTotal) / 2 + alturaDaLinha * 0.85;

  for (const linha of linhas) {
    doc.text(linha, caixa.x, y);
    y += alturaDaLinha;
  }
}

/**
 * Desenha as duas logos e devolve quanto espaço sobrou para o título.
 *
 * A da empresa fica onde a da MD ficava — é o lugar de destaque, e o documento é dela. A da
 * Repply entra menor, encostada na margem direita: é assinatura de ferramenta, não de dono.
 */
export async function desenharMarca(
  doc: jsPDF,
  opcoes: {
    marca: MarcaDaEmpresa;
    /** Largura da página, para encostar a logo da Repply na direita. */
    larguraDaPagina: number;
    margemDireita: number;
    /** Onde o texto do cabeçalho começa, para calcular o espaço que sobra. */
    xDoTexto: number;
    caixaDoCliente: CaixaDaMarca;
    /** Tamanho da fonte do nome da empresa, quando não há logo. */
    tamanhoDoNome?: number;
    corDoNome: [number, number, number];
  },
): Promise<ResultadoDaMarca> {
  const { marca, larguraDaPagina, margemDireita, xDoTexto, caixaDoCliente, corDoNome } = opcoes;

  // ── A logo do cliente, ou o nome dele ──────────────────────────────────────
  const logo = await carregarLogo(marca.logoUrl);
  if (logo) {
    const { largura, altura } = encaixar(logo, caixaDoCliente.maxLargura, caixaDoCliente.maxAltura);
    doc.addImage(logo.dataUrl, 'PNG', caixaDoCliente.x, caixaDoCliente.y, largura, altura, undefined, 'FAST');
  } else if (marca.nome) {
    // 🔴 O NOME DA EMPRESA, e não um nome fixo. Este ramo era onde estava escrito "MD
    // Representações" — e ele deixou de ser exceção: a maioria das empresas ainda não subiu
    // logo nenhuma, então é por aqui que o PDF delas passa todo dia.
    //
    // Nome vazio não desenha nada: espaço em branco é melhor que um nome inventado num
    // documento que vai para o cliente do cliente.
    desenharNome(doc, marca.nome, {
      x: caixaDoCliente.x,
      y: caixaDoCliente.y,
      largura: xDoTexto - caixaDoCliente.x - 4,
      altura: caixaDoCliente.maxAltura,
      tamanhoMaximo: opcoes.tamanhoDoNome ?? 14,
      cor: corDoNome,
    });
  }

  // ── A da Repply, encostada na direita ─────────────────────────────────────
  const repply = await carregarLogoRepply();
  let ocupadoNaDireita = 0;
  if (repply) {
    // Menor que a do cliente de propósito: 22 mm contra 30 mm.
    const { largura, altura } = encaixar(repply, 22, 8);
    const x = larguraDaPagina - margemDireita - largura;
    doc.addImage(repply.dataUrl, 'PNG', x, caixaDoCliente.y + 1, largura, altura, undefined, 'FAST');
    ocupadoNaDireita = largura + 4; // o respiro que separa o texto da logo
  }

  doc.setTextColor(0);
  return {
    larguraDisponivelParaTexto: Math.max(
      10,
      larguraDaPagina - margemDireita - ocupadoNaDireita - xDoTexto,
    ),
  };
}

/**
 * O rodapé: o nome da EMPRESA à esquerda, o número da página à direita.
 *
 * Estava escrito "MD Representações" em toda página de todo relatório de toda empresa — e
 * este, ao contrário do nome acima, nunca foi ramo de exceção: era o caminho comum.
 */
export function desenharRodape(
  doc: jsPDF,
  opcoes: { marca: MarcaDaEmpresa; larguraDaPagina: number; margem?: number },
): void {
  const margem = opcoes.margem ?? 14;
  const alturaDaPagina = doc.internal.pageSize.getHeight();

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(160);
  if (opcoes.marca.nome) {
    doc.text(encurtar(doc, opcoes.marca.nome, 90), margem, alturaDaPagina - 6);
  }
  doc.text(
    `Página ${doc.getCurrentPageInfo().pageNumber}`,
    opcoes.larguraDaPagina - margem,
    alturaDaPagina - 6,
    { align: 'right' },
  );
  doc.setTextColor(0);
}
