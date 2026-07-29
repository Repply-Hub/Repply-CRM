import { supabase } from '@/integrations/supabase/client';
import { repairCorruptedBitrixUrl } from '@/lib/repair-bitrix-url';

const BITRIX_CDN_PATTERN = /cdn\.bitrix24\.com\.br/i;
// Deve ser <= MAX_URLS_PER_REQUEST em supabase/functions/resolve-pedido-anexo/index.ts.
const EDGE_FUNCTION_CHUNK_SIZE = 40;
const EDGE_FUNCTION_CONCURRENCY = 3;

export interface ResolvePdfResult {
  url: string;
  falhaDownload: boolean;
}

interface EdgeFunctionResponse {
  results: ResolvePdfResult[];
}

/**
 * Resolve vários links de anexo em paralelo, delegando o download+upload de fato à
 * Edge Function "resolve-pedido-anexo". Não dá pra baixar o PDF direto do navegador:
 * a CDN do Bitrix24 não envia Access-Control-Allow-Origin (confirmado com curl), então
 * um fetch() client-side é bloqueado por CORS antes mesmo de tentar — o download server-side
 * não sofre essa restrição (CORS é imposto pelo navegador, não pelo servidor de destino).
 */
export async function resolveEspelhoPdfUrls(
  urls: Array<string | undefined>,
  empresaId: string
): Promise<Array<ResolvePdfResult | undefined>> {
  const results: Array<ResolvePdfResult | undefined> = new Array(urls.length);

  // Filtra localmente (sem rede) quais URLs realmente precisam passar pela Edge Function —
  // evita gastar invocações com linhas sem anexo ou com links que não são do Bitrix.
  const candidates: Array<{ index: number; url: string }> = [];
  urls.forEach((raw, index) => {
    if (!raw) {
      results[index] = undefined;
      return;
    }
    const repaired = repairCorruptedBitrixUrl(raw.trim());
    if (!repaired || !BITRIX_CDN_PATTERN.test(repaired)) {
      results[index] = { url: repaired, falhaDownload: false };
      return;
    }
    candidates.push({ index, url: repaired });
  });

  const chunks: Array<typeof candidates> = [];
  for (let i = 0; i < candidates.length; i += EDGE_FUNCTION_CHUNK_SIZE) {
    chunks.push(candidates.slice(i, i + EDGE_FUNCTION_CHUNK_SIZE));
  }

  let nextChunkIndex = 0;
  async function worker() {
    for (;;) {
      const i = nextChunkIndex++;
      if (i >= chunks.length) return;
      const chunk = chunks[i];

      try {
        const { data, error } = await supabase.functions.invoke<EdgeFunctionResponse>('resolve-pedido-anexo', {
          body: { urls: chunk.map(c => c.url), empresaId },
        });

        if (error || !data?.results) {
          console.warn('[import-pedidos] Chamada à Edge Function de anexos falhou, mantendo links originais:', error?.message);
          chunk.forEach(c => { results[c.index] = { url: c.url, falhaDownload: true }; });
          continue;
        }

        chunk.forEach((c, ci) => { results[c.index] = data.results[ci] ?? { url: c.url, falhaDownload: true }; });
      } catch (err) {
        console.warn('[import-pedidos] Erro ao chamar Edge Function de anexos:', (err as Error).message);
        chunk.forEach(c => { results[c.index] = { url: c.url, falhaDownload: true }; });
      }
    }
  }

  const workerCount = Math.min(EDGE_FUNCTION_CONCURRENCY, chunks.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}

/** Resolve um único link de anexo (usada fora do fluxo de import em lote). */
export async function resolveEspelhoPdfUrl(rawUrl: string, empresaId: string): Promise<ResolvePdfResult> {
  const [result] = await resolveEspelhoPdfUrls([rawUrl], empresaId);
  return result ?? { url: rawUrl, falhaDownload: false };
}
