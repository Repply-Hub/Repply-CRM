/**
 * Preparo do arquivo de logo antes de ele subir: normaliza, encolhe e avisa.
 *
 * 🔴 POR QUE NÃO MANDAR O ARQUIVO COMO VEIO.
 *
 * 1. FORMATO. O jsPDF só conhece PNG, JPEG, GIF, BMP, TIFF e WEBP — SVG derruba a exportação.
 *    E SVG num balde público é XML com script dentro, servido de um domínio nosso. Passar tudo
 *    pelo `canvas` resolve os dois: o navegador desenha o que souber, e o que sai é PNG.
 * 2. TAMANHO. O balde aceita até 5 MB, mas a logo entra num retângulo de 30 mm no papel. Uma
 *    foto de 4000 px viraria megabytes dentro de cada PDF exportado, todo dia.
 * 3. LOGO BRANCA SOME. Logo clara com fundo transparente é comum — é a versão para fundo
 *    escuro. No papel branco ela fica invisível, e a pessoa só descobre ao abrir o PDF já
 *    enviado ao cliente. Aqui a gente percebe e AVISA, sem recusar: pode ser exatamente o que
 *    ela quer, e recusar arquivo legítimo é pior que avisar.
 */

/** Maior lado depois de encolher. Mesmo teto do `marca-do-pdf.ts`, pelo mesmo motivo. */
export const MAIOR_LADO = 600;

/** Teto do arquivo escolhido, antes da conversão. O balde aceita 5 MB; isto é o bom senso. */
export const MAXIMO_DE_BYTES = 5 * 1024 * 1024;

export interface PreparoDaLogo {
  blob: Blob;
  largura: number;
  altura: number;
  /** A logo é tão clara que sumiria no papel branco? Vira aviso, nunca recusa. */
  quaseInvisivelNoBranco: boolean;
}

/** A escala para caber em `maior`, ou 1 quando já cabe. Nunca aumenta uma imagem pequena. */
export function escalaParaCaber(largura: number, altura: number, maior = MAIOR_LADO): number {
  const lado = Math.max(largura, altura);
  if (!lado) return 1;
  return lado > maior ? maior / lado : 1;
}

/**
 * Os pixels visíveis são quase todos claros?
 *
 * Recebe os dados crus do canvas (grupos de 4: vermelho, verde, azul, opacidade) e só olha o
 * que tem opacidade de verdade — o fundo transparente não conta, senão TODA logo com fundo
 * vazado seria acusada de clara.
 *
 * Função pura, separada do desenho, porque é a parte que dá para fixar em teste.
 */
export function quaseInvisivelNoBranco(pixels: ArrayLike<number>): boolean {
  let visiveis = 0;
  let claros = 0;

  for (let i = 0; i < pixels.length; i += 4) {
    const opacidade = pixels[i + 3];
    if (opacidade < 32) continue; // praticamente transparente: não é desenho
    visiveis++;
    // Luminância aproximada. 235 de 255 é "quase branco" — abaixo disso ainda se enxerga.
    const luz = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
    if (luz >= 235) claros++;
  }

  // Sem pixel visível nenhum a imagem é vazia: também some no papel.
  if (visiveis === 0) return true;
  return claros / visiveis >= 0.9;
}

/** Lê o arquivo como imagem. Rejeita o que o navegador não souber desenhar. */
function carregarArquivo(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Não consegui abrir este arquivo como imagem.'));
    };
    img.src = url;
  });
}

export async function prepararLogo(file: File): Promise<PreparoDaLogo> {
  if (file.size > MAXIMO_DE_BYTES) {
    throw new Error('A imagem passa de 5 MB. Escolha uma menor.');
  }

  const img = await carregarArquivo(file);
  const larguraOriginal = img.naturalWidth || img.width;
  const alturaOriginal = img.naturalHeight || img.height;
  if (!larguraOriginal || !alturaOriginal) {
    throw new Error('Não consegui ler o tamanho desta imagem.');
  }

  const escala = escalaParaCaber(larguraOriginal, alturaOriginal);
  const largura = Math.max(1, Math.round(larguraOriginal * escala));
  const altura = Math.max(1, Math.round(alturaOriginal * escala));

  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Este navegador não conseguiu preparar a imagem.');

  // 🔴 DESENHA SOBRE TRANSPARENTE, e é de propósito: é assim que dá para medir se a logo é
  // clara. Pintar branco antes tornaria toda logo "clara" e o aviso nunca apareceria.
  ctx.drawImage(img, 0, 0, largura, altura);

  let clara = false;
  try {
    clara = quaseInvisivelNoBranco(ctx.getImageData(0, 0, largura, altura).data);
  } catch {
    // Canvas contaminado por imagem de outra origem — não dá para medir, e não medir não é
    // motivo para barrar o envio.
    clara = false;
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Não consegui converter a imagem para PNG.');

  return { blob, largura, altura, quaseInvisivelNoBranco: clara };
}

/** O caminho da logo dentro do balde `branding`. A pasta é a EMPRESA — ver a migration. */
export function caminhoDaLogo(empresaId: string): string {
  return `${empresaId}/logo.png`;
}
