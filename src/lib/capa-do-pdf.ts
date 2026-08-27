/**
 * A capa do cartão: a primeira página do PDF, desenhada numa imagem pequena.
 *
 * 🔴 RODA AO ANEXAR, NUNCA AO EXIBIR. Gerar na hora de mostrar obrigaria a baixar o PDF
 * inteiro — até 50 MB — só para desenhar um quadrado, toda vez que alguém abrisse a ficha da
 * fábrica. Gerada aqui, uma vez, o cartão carrega dezenas de KB.
 *
 * 🔴 FALHAR NÃO É ERRO. PDF protegido por senha, arquivo corrompido, formato exótico: devolve
 * `null` e o cartão mostra o ícone do formato. Travar o anexo por causa da miniatura seria
 * trocar a funcionalidade pelo enfeite dela.
 *
 * A biblioteca entra por `import()` dinâmico: ela só é baixada quando alguém vai anexar um
 * PDF, e não pesa no arquivo que todo mundo baixa ao abrir o sistema.
 */

/** Largura da capa em pixels. O cartão tem tamanho conhecido; maior só engorda o upload. */
const LARGURA = 400;

/** Qualidade do JPEG. 0.8 mantém a capa legível e a mantém na casa das dezenas de KB. */
const QUALIDADE = 0.8;

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

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Fundo branco antes de desenhar: PDF com fundo transparente viraria uma capa preta no
    // tema escuro, o que parece defeito.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await pagina.render({ canvas, canvasContext: ctx, viewport }).promise;

    return await new Promise<Blob | null>((resolver) =>
      canvas.toBlob(resolver, 'image/jpeg', QUALIDADE),
    );
  } catch {
    // Silêncio de propósito: quem chama decide o que fazer com `null`, e o caminho normal é
    // simplesmente anexar sem capa.
    return null;
  }
}
