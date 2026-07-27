import { supabase } from '@/integrations/supabase/client';
import { repairCorruptedBitrixUrl } from '@/lib/repair-bitrix-url';

const BITRIX_CDN_PATTERN = /cdn\.bitrix24\.com\.br/i;
const FETCH_TIMEOUT_MS = 15000;
const UPLOAD_CONCURRENCY = 4;
const STORAGE_BUCKET = 'pedido-anexos';

export interface ResolvePdfResult {
  url: string;
  falhaDownload: boolean;
}

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/zip': 'zip',
  'text/plain': 'txt',
};

/** Deriva a extensão do anexo a partir do content-type da resposta, com fallback na URL de origem. */
function inferExtension(url: string, contentType: string): string {
  const base = contentType.split(';')[0].trim().toLowerCase();
  if (EXTENSION_BY_CONTENT_TYPE[base]) return EXTENSION_BY_CONTENT_TYPE[base];

  const urlExt = url.split(/[?#]/)[0].split('.').pop();
  if (urlExt && urlExt.length <= 5 && /^[a-z0-9]+$/i.test(urlExt)) return urlExt.toLowerCase();

  return 'bin';
}

/**
 * Baixa um anexo do negócio (PDF de cotação, espelho ou outro arquivo) hospedado no
 * CDN do Bitrix24 e reidrata no bucket "pedido-anexos", eliminando a dependência do
 * link externo (que expira).
 * Replica o padrão de download+upload de supabase/functions/whatsapp-webhook/index.ts:95-114.
 * Links fora do domínio do Bitrix são devolvidos como vieram, sem novo download.
 */
export async function resolveEspelhoPdfUrl(rawUrl: string, empresaId: string): Promise<ResolvePdfResult> {
  // Planilhas exportadas com locale BR às vezes trocam todos os pontos por vírgula na URL
  // do Bitrix (ex: "cdn,bitrix24,com,br/.../arquivo,pdf") — corrige antes de checar o domínio.
  const url = repairCorruptedBitrixUrl(rawUrl.trim());
  if (!url || !BITRIX_CDN_PATTERN.test(url)) {
    return { url, falhaDownload: false };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!res.ok) {
      console.warn(`[import-pedidos] Download do anexo do Bitrix falhou (status ${res.status})`);
      return { url, falhaDownload: true };
    }

    const bytes = new Uint8Array(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') || 'application/octet-stream';
    const ext = inferExtension(url, contentType);
    const path = `${empresaId}/${crypto.randomUUID()}-anexo.${ext}`;

    const { data: uploaded, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, bytes, { contentType, upsert: false });

    if (error) {
      console.warn('[import-pedidos] Upload do anexo para o Storage falhou:', error.message);
      return { url, falhaDownload: true };
    }

    console.log(`[import-pedidos] Anexo reidratado no Storage: ${path} (${bytes.byteLength} bytes)`);

    const { data: { publicUrl } } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(uploaded.path);
    return { url: publicUrl, falhaDownload: false };
  } catch (err) {
    console.warn('[import-pedidos] Erro ao processar anexo do Bitrix:', (err as Error).message);
    return { url, falhaDownload: true };
  }
}

/**
 * Resolve vários links de anexo em paralelo, com concorrência limitada, para não
 * estourar rate limit do Bitrix durante import de planilhas grandes.
 */
export async function resolveEspelhoPdfUrls(
  urls: Array<string | undefined>,
  empresaId: string
): Promise<Array<ResolvePdfResult | undefined>> {
  const results: Array<ResolvePdfResult | undefined> = new Array(urls.length);
  let nextIndex = 0;

  async function worker() {
    for (;;) {
      const i = nextIndex++;
      if (i >= urls.length) return;
      const raw = urls[i];
      results[i] = raw ? await resolveEspelhoPdfUrl(raw, empresaId) : undefined;
    }
  }

  const workerCount = Math.min(UPLOAD_CONCURRENCY, urls.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
