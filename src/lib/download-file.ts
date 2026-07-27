/**
 * Baixa um arquivo forçando o download em vez de abrir em outra aba.
 *
 * O atributo `download` de um <a> é ignorado pelo navegador quando o link
 * aponta para outra origem (caso do Supabase Storage), então o clique só
 * abria o arquivo numa nova aba. Aqui buscamos o conteúdo via fetch e
 * disparamos o download a partir de um blob local, que sempre respeita o
 * nome de arquivo escolhido.
 */
export async function downloadFile(url: string, filename: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`status ${res.status}`);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
  } catch {
    // Fallback: abre em outra aba se o fetch falhar (ex.: CORS bloqueado).
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

/** Extrai o nome do arquivo a partir do último segmento de uma URL. */
export function filenameFromUrl(url: string, fallback = 'arquivo'): string {
  try {
    const path = new URL(url).pathname;
    const last = decodeURIComponent(path.split('/').pop() || '');
    return last || fallback;
  } catch {
    return fallback;
  }
}
