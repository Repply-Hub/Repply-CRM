// Relay de rede para o Diário Oficial de Natal (DOM).
//
// Existe porque o runner do GitHub Actions está bloqueado por um firewall (FortiGate) na
// frente de natal.rn.gov.br — medido em 10/09 e 14/09/2026, três execuções, três falhas
// idênticas de `ConnectTimeoutError`. A infraestrutura do Supabase NÃO está bloqueada
// (confirmado com a função de diagnóstico `diag-dom-natal-network`, mesma investigação:
// listagem e download de PDF completo, os dois passaram sem erro). Ver
// docs/investigacao-falhas-scraper-dom-natal.md para o histórico completo.
//
// Esta função faz a chamada de rede NO LUGAR do runner: recebe uma URL do domínio da
// Prefeitura, busca e devolve a resposta (listagem JSON OU PDF) — sem abrir o PDF, sem
// extrair texto. É só repasse de bytes. A extração pesada continua no GitHub Action
// (scripts/scrape-dom-natal-licencas.ts), que troca "fetch direto" por "fetch através
// deste relay" quando `process.env.GITHUB_ACTIONS === 'true'`.
//
// Segurança: só repassa para os hosts do domínio da Prefeitura (allow-list abaixo) — não
// é um proxy genérico, para não virar um SSRF aberto. `verify_jwt` fica no padrão do
// projeto (sem entrada em config.toml = true): quem chama precisa de uma chave válida do
// projeto Supabase. O GitHub Action usa a `service_role_key`, que já é secret do
// repositório para gravar em `licencas_natal`.

const HOSTS_PERMITIDOS = new Set(['www.natal.rn.gov.br', 'natal.rn.gov.br']);

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const TIMEOUT_MS = 30_000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const alvo = new URL(req.url).searchParams.get('url');
  if (!alvo) {
    return new Response(JSON.stringify({ error: 'parâmetro "url" é obrigatório' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let urlAlvo: URL;
  try {
    urlAlvo = new URL(alvo);
  } catch {
    return new Response(JSON.stringify({ error: 'url inválida' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (urlAlvo.protocol !== 'https:' || !HOSTS_PERMITIDOS.has(urlAlvo.hostname)) {
    return new Response(JSON.stringify({ error: `host não permitido: ${urlAlvo.hostname}` }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const resp = await fetch(urlAlvo.toString(), {
      headers: {
        Accept: 'application/json, text/javascript, application/pdf, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: 'https://www.natal.rn.gov.br/dom',
        'User-Agent': BROWSER_UA,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    // Repassa o corpo em stream, sem materializar em memória — o motivo desta função
    // existir é justamente não repetir aqui o estouro de memória que a EXTRAÇÃO de texto
    // causava na Edge Function antiga (§3 do documento de investigação); esta função não
    // extrai nada, só repassa bytes, então nem precisa se preocupar com isso — mas manter
    // o stream em vez de `arrayBuffer()` custa zero e deixa a margem de segurança maior.
    return new Response(resp.body, {
      status: resp.status,
      headers: {
        ...corsHeaders,
        'Content-Type': resp.headers.get('content-type') ?? 'application/octet-stream',
      },
    });
  } catch (err) {
    const e = err as { name?: string; message?: string; cause?: unknown };
    return new Response(
      JSON.stringify({
        error: 'falha ao buscar a URL de destino',
        erro_name: e?.name ?? null,
        erro_mensagem: e?.message ?? String(err),
        erro_causa: e?.cause !== undefined ? String(e.cause) : null,
      }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
