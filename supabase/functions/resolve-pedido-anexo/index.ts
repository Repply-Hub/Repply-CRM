import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STORAGE_BUCKET = "pedido-anexos";
const BITRIX_CDN_PATTERN = /cdn\.bitrix24\.com\.br/i;
const CORRUPTED_BITRIX_DOMAIN = /cdn,bitrix24,com,br/i;
const FETCH_TIMEOUT_MS = 15000;
const DOWNLOAD_CONCURRENCY = 5;
// Protege o tempo de execução da function (fetch externo é o gargalo) — o
// cliente deve mandar lotes menores que isso; ver src/lib/import/resolve-pedido-pdf.ts.
const MAX_URLS_PER_REQUEST = 50;

interface ResolvePdfResult {
  url: string;
  falhaDownload: boolean;
}

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/zip": "zip",
  "text/plain": "txt",
};

// Planilhas exportadas com locale BR às vezes trocam todos os pontos por vírgula na URL
// do Bitrix (ex: "cdn,bitrix24,com,br/.../arquivo,pdf") — corrige antes de checar o domínio.
// Réplica de src/lib/repair-bitrix-url.ts (Deno não importa módulos de src/ diretamente).
function repairCorruptedBitrixUrl(url: string): string {
  if (!url || !CORRUPTED_BITRIX_DOMAIN.test(url)) return url;
  return url
    .replace(/cdn,bitrix24,com,br/gi, "cdn.bitrix24.com.br")
    .replace(/,([a-zA-Z0-9]{2,5})$/, ".$1");
}

function inferExtension(url: string, contentType: string): string {
  const base = contentType.split(";")[0].trim().toLowerCase();
  if (EXTENSION_BY_CONTENT_TYPE[base]) return EXTENSION_BY_CONTENT_TYPE[base];

  const urlExt = url.split(/[?#]/)[0].split(".").pop();
  if (urlExt && urlExt.length <= 5 && /^[a-z0-9]+$/i.test(urlExt)) return urlExt.toLowerCase();

  return "bin";
}

/**
 * Baixa um anexo do Bitrix24 e reidrata no bucket "pedido-anexos". Roda server-side
 * (Edge Function) porque a CDN do Bitrix24 não envia Access-Control-Allow-Origin —
 * um fetch() direto do navegador é bloqueado por CORS antes mesmo de chegar aqui
 * (confirmado com curl contra a CDN: resposta 200 sem nenhum header de CORS).
 */
async function resolvePdfUrl(
  supabase: ReturnType<typeof createClient>,
  rawUrl: string,
  empresaId: string,
): Promise<ResolvePdfResult> {
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
      console.warn(`[resolve-pedido-anexo] Download falhou (status ${res.status}): ${url}`);
      return { url, falhaDownload: true };
    }

    const bytes = new Uint8Array(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") || "application/octet-stream";
    const ext = inferExtension(url, contentType);
    const path = `${empresaId}/${crypto.randomUUID()}-anexo.${ext}`;

    const { data: uploaded, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, bytes, { contentType, upsert: false });

    if (error) {
      console.warn("[resolve-pedido-anexo] Upload para o Storage falhou:", error.message);
      return { url, falhaDownload: true };
    }

    const { data: { publicUrl } } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(uploaded.path);
    return { url: publicUrl, falhaDownload: false };
  } catch (err) {
    console.warn("[resolve-pedido-anexo] Erro ao processar anexo:", (err as Error).message);
    return { url, falhaDownload: true };
  }
}

async function resolveBatch(
  supabase: ReturnType<typeof createClient>,
  urls: Array<string | null | undefined>,
  empresaId: string,
): Promise<ResolvePdfResult[]> {
  const results: ResolvePdfResult[] = new Array(urls.length);
  let nextIndex = 0;

  async function worker() {
    for (;;) {
      const i = nextIndex++;
      if (i >= urls.length) return;
      const raw = urls[i];
      results[i] = raw ? await resolvePdfUrl(supabase, raw, empresaId) : { url: "", falhaDownload: false };
    }
  }

  const workerCount = Math.min(DOWNLOAD_CONCURRENCY, urls.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { urls, empresaId } = await req.json();

    if (!empresaId || typeof empresaId !== "string") {
      return new Response(JSON.stringify({ error: "empresaId é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!Array.isArray(urls) || urls.length === 0) {
      return new Response(JSON.stringify({ error: "urls deve ser um array não vazio" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (urls.length > MAX_URLS_PER_REQUEST) {
      return new Response(
        JSON.stringify({ error: `no máximo ${MAX_URLS_PER_REQUEST} urls por chamada` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const results = await resolveBatch(supabase, urls, empresaId);

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[resolve-pedido-anexo] error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
