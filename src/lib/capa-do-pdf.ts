/**
 * A capa do cartão: o pedaço COM CONTEÚDO da primeira página do PDF.
 *
 * 🔴 NÃO É O TOPO DA PÁGINA. Era, até 26/08/2026 — e o primeiro catálogo real anexado, o
 * Portfólio Geral de Louças da Deca, tem uma faixa PRETA SÓLIDA no topo. A capa virou um
 * retângulo preto. Capa de catálogo com faixa, borda ou respiro no topo não é exceção: é o
 * layout comum de material de fábrica.
 *
 * Agora o recorte procura onde a página tem detalhe de verdade. Ver `melhorRecorte`.
 *
 * 🔴 RODA AO ANEXAR, NUNCA AO EXIBIR. Gerar na hora de mostrar obrigaria a baixar o PDF
 * inteiro — até 50 MB — só para desenhar um quadrado, toda vez que alguém abrisse a ficha da
 * fábrica. Gerada aqui, uma vez, o cartão carrega dezenas de KB.
 *
 * 🔴 FALHAR NÃO É ERRO. PDF protegido por senha, arquivo corrompido, formato exótico: devolve
 * `null` e o cartão mostra o ícone do formato. Travar o anexo por causa da miniatura seria
 * trocar a funcionalidade pelo enfeite dela.
 */

/** Largura da capa em pixels. O cartão tem tamanho conhecido; maior só engorda o upload. */
const LARGURA = 400;

/** Proporção do quadro da capa no cartão (h-36 numa coluna de grade). */
const PROPORCAO = 3 / 4;

/** Qualidade do JPEG. 0.8 mantém a capa legível na casa das dezenas de KB. */
const QUALIDADE = 0.8;

/**
 * De que altura começar o recorte, dada uma pontuação de conteúdo por linha da página.
 *
 * A pontuação de cada linha mede DETALHE, não brilho: uma faixa preta sólida e uma faixa
 * branca sólida pontuam igual — zero. O que pontua é a variação de um pixel para o vizinho,
 * que é o que texto, foto e desenho têm e cor chapada não tem.
 *
 * Empate fica com a janela mais alta: em capa de catálogo o topo costuma ser a marca, e
 * subir é a escolha menos surpreendente quando não há razão para descer.
 *
 * Função pura, separada do desenho, porque é a parte que dá para fixar em teste — os 9 casos
 * estão em `capa-do-pdf.test.ts`, incluindo o do catálogo da Deca que originou tudo isto.
 */
export function melhorRecorte(pontuacoes: number[], alturaDaJanela: number): number {
  const total = pontuacoes.length;
  if (total === 0 || alturaDaJanela <= 0 || alturaDaJanela >= total) return 0;

  // Soma deslizante: sem ela, uma página A4 a 400px daria ~500 linhas × 500 janelas.
  let soma = 0;
  for (let i = 0; i < alturaDaJanela; i++) soma += pontuacoes[i];

  let melhorSoma = soma;
  let melhorInicio = 0;

  for (let inicio = 1; inicio + alturaDaJanela <= total; inicio++) {
    soma += pontuacoes[inicio + alturaDaJanela - 1] - pontuacoes[inicio - 1];
    // `>` e não `>=`: o empate fica com a janela mais alta, que é a primeira encontrada.
    if (soma > melhorSoma) {
      melhorSoma = soma;
      melhorInicio = inicio;
    }
  }

  return melhorInicio;
}

/**
 * Quanto de detalhe cada linha da imagem tem.
 *
 * Mede a diferença de luminosidade entre pixels VIZINHOS na horizontal. Cor chapada — preta,
 * branca ou laranja — dá zero; texto, foto e desenho dão valores altos.
 *
 * Amostra de 4 em 4 pixels: numa página A4 a 400px isso é a diferença entre ~200 mil e ~50
 * mil comparações, sem mudar qual janela vence.
 */
function pontuarLinhas(dados: ImageData): number[] {
  const { width, height, data } = dados;
  const pontos = new Array<number>(height).fill(0);
  const PASSO = 4;

  for (let y = 0; y < height; y++) {
    let soma = 0;
    let anterior = -1;
    for (let x = 0; x < width; x += PASSO) {
      const i = (y * width + x) * 4;
      // Luminosidade aproximada, sem a conta completa: o que importa é a VARIAÇÃO.
      const luz = (data[i] * 3 + data[i + 1] * 6 + data[i + 2]) / 10;
      if (anterior >= 0) soma += Math.abs(luz - anterior);
      anterior = luz;
    }
    pontos[y] = soma;
  }

  return pontos;
}

export async function gerarCapaDoPdf(arquivo: File): Promise<Blob | null> {
  const ehPdf =
    arquivo.type === 'application/pdf' || arquivo.name.toLowerCase().endsWith('.pdf');
  if (!ehPdf) return null;

  try {
    const pdfjs = await import('pdfjs-dist');

    // O worker precisa vir por URL: o pdf.js roda a leitura numa thread separada para não
    // travar a tela enquanto desenha. `?url` faz o Vite empacotar o arquivo e devolver o
    // endereço dele em vez do conteúdo.
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

    const doc = await pdfjs.getDocument({ data: await arquivo.arrayBuffer() }).promise;
    const pagina = await doc.getPage(1);

    const base = pagina.getViewport({ scale: 1 });
    const viewport = pagina.getViewport({ scale: LARGURA / base.width });

    // 1. Desenha a página INTEIRA, para poder escolher de onde recortar.
    const inteira = document.createElement('canvas');
    inteira.width = Math.round(viewport.width);
    inteira.height = Math.round(viewport.height);

    const ctxInteira = inteira.getContext('2d', { willReadFrequently: true });
    if (!ctxInteira) return null;

    // Fundo branco antes de desenhar: PDF com fundo transparente viraria uma capa preta no
    // tema escuro, o que parece defeito.
    ctxInteira.fillStyle = '#ffffff';
    ctxInteira.fillRect(0, 0, inteira.width, inteira.height);
    await pagina.render({ canvas: inteira, canvasContext: ctxInteira, viewport }).promise;

    // 2. Escolhe a janela com mais conteúdo.
    const alturaDaJanela = Math.min(Math.round(inteira.width * PROPORCAO), inteira.height);
    const pontos = pontuarLinhas(ctxInteira.getImageData(0, 0, inteira.width, inteira.height));
    const inicio = melhorRecorte(pontos, alturaDaJanela);

    // 3. Recorta.
    const capa = document.createElement('canvas');
    capa.width = inteira.width;
    capa.height = alturaDaJanela;
    const ctxCapa = capa.getContext('2d');
    if (!ctxCapa) return null;
    ctxCapa.drawImage(
      inteira,
      0, inicio, inteira.width, alturaDaJanela,
      0, 0, inteira.width, alturaDaJanela,
    );

    return await new Promise<Blob | null>((resolver) =>
      capa.toBlob(resolver, 'image/jpeg', QUALIDADE),
    );
  } catch {
    // Silêncio de propósito: quem chama decide o que fazer com `null`, e o caminho normal é
    // simplesmente anexar sem capa.
    return null;
  }
}
