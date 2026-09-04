/**
 * Converte uma imagem escolhida pelo usuário no formato de figurinha do WhatsApp:
 * quadrado 512x512, WEBP, fundo transparente, imagem inteira contida e centralizada.
 *
 * Por que converter aqui em vez de deixar a uazapi fazer: enviar um PNG/JPG cru
 * para `/send/media type=sticker` é uma aposta — algumas versões da uazapi recusam
 * o que não for webp, e a falha aparece só depois do upload, em produção. Gerar o
 * webp no navegador tira essa incerteza e garante o tamanho certo.
 *
 * Limitação conhecida: GIF animado vira figurinha estática (só o primeiro quadro).
 */
export async function arquivoParaFigurinhaWebp(file: File): Promise<File> {
  const LADO = 512;

  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = LADO;
    canvas.height = LADO;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas indisponível');

    // "contain": a imagem inteira cabe no quadrado, sem cortar, centralizada.
    const escala = Math.min(LADO / bitmap.width, LADO / bitmap.height);
    const largura = bitmap.width * escala;
    const altura = bitmap.height * escala;
    ctx.drawImage(
      bitmap,
      (LADO - largura) / 2,
      (LADO - altura) / 2,
      largura,
      altura,
    );

    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('não foi possível gerar a figurinha'))),
        'image/webp',
        0.92,
      );
    });

    return new File([blob], 'figurinha.webp', { type: 'image/webp' });
  } finally {
    bitmap.close();
  }
}

/**
 * Quem pode TIRAR uma figurinha da grade.
 *
 * Tirar não é preferência pessoal: a figurinha some para todos que atendem aquele número.
 * Por isso é do gestor, e não de quem estiver com o mouse em cima do "x".
 *
 * Salvar continua livre para qualquer pessoa vinculada ao número — é aditivo, e um gestor
 * desfaz. A mesma assimetria está na política `wa_figurinhas_update`
 * (20260903200000_so_gestor_tira_figurinha_da_grade.sql), que olha se `removida_em` fica
 * preenchida. Os três papéis aqui são os mesmos de lá de propósito: se divergissem, o "x"
 * apareceria para alguém que o banco vai recusar.
 */
export function podeGerenciarFigurinhas(papel: string | null | undefined): boolean {
  return papel === 'empresa' || papel === 'gestor' || papel === 'admin';
}

/** sha256 do conteúdo de um arquivo, em hexadecimal — chave de dedupe das figurinhas. */
export async function sha256Hex(data: Blob): Promise<string> {
  const buffer = await data.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
