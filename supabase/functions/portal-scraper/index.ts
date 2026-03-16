const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface SiteConfig {
  id: string;
  name: string;
  url: string;
  searchUrl?: (query: string) => string;
}

const SITES: Record<string, SiteConfig> = {
  idema: {
    id: 'idema',
    name: 'IDEMA - Licenças Emitidas',
    url: 'https://siga.idema.rn.gov.br/servicos/licencas_emitidas/',
  },
  natal: {
    id: 'natal',
    name: 'Diário Oficial de Natal',
    url: 'https://www.natal.rn.gov.br/dom',
  },
  extremoz: {
    id: 'extremoz',
    name: 'Diário Oficial de Extremoz',
    url: 'https://extremoz.rn.gov.br/diario-oficial/diario-oficial-2026/',
  },
};

function extractTextContent(html: string): string {
  // Remove scripts and styles
  let clean = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  clean = clean.replace(/<style[\s\S]*?<\/style>/gi, '');
  clean = clean.replace(/<nav[\s\S]*?<\/nav>/gi, '');
  clean = clean.replace(/<header[\s\S]*?<\/header>/gi, '');
  clean = clean.replace(/<footer[\s\S]*?<\/footer>/gi, '');
  // Replace tags with spaces
  clean = clean.replace(/<[^>]+>/g, ' ');
  // Decode common entities
  clean = clean.replace(/&amp;/g, '&');
  clean = clean.replace(/&lt;/g, '<');
  clean = clean.replace(/&gt;/g, '>');
  clean = clean.replace(/&quot;/g, '"');
  clean = clean.replace(/&#39;/g, "'");
  clean = clean.replace(/&nbsp;/g, ' ');
  // Collapse whitespace
  clean = clean.replace(/\s+/g, ' ').trim();
  return clean;
}

function extractLinks(html: string, baseUrl: string): Array<{ text: string; href: string }> {
  const links: Array<{ text: string; href: string }> = [];
  const regex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    let href = match[1];
    const text = match[2].replace(/<[^>]+>/g, '').trim();
    if (!text || text.length < 3) continue;
    // Resolve relative URLs
    if (href.startsWith('/')) {
      const url = new URL(baseUrl);
      href = `${url.protocol}//${url.host}${href}`;
    } else if (!href.startsWith('http')) {
      href = `${baseUrl.replace(/\/$/, '')}/${href}`;
    }
    // Filter out non-useful links
    if (href.includes('javascript:') || href.startsWith('#') || href.startsWith('mailto:')) continue;
    links.push({ text, href });
  }
  return links;
}

function extractTableData(html: string): Array<Record<string, string>> {
  const rows: Array<Record<string, string>> = [];
  const tableRegex = /<table[\s\S]*?<\/table>/gi;
  const tables = html.match(tableRegex);
  if (!tables) return rows;

  for (const table of tables) {
    // Extract headers
    const headerRegex = /<th[^>]*>([\s\S]*?)<\/th>/gi;
    const headers: string[] = [];
    let hMatch;
    while ((hMatch = headerRegex.exec(table)) !== null) {
      headers.push(hMatch[1].replace(/<[^>]+>/g, '').trim());
    }

    // Extract rows
    const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let trMatch;
    let isFirst = true;
    while ((trMatch = trRegex.exec(table)) !== null) {
      if (isFirst && headers.length > 0) { isFirst = false; continue; }
      isFirst = false;
      const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let tdMatch;
      const row: Record<string, string> = {};
      let colIdx = 0;
      while ((tdMatch = tdRegex.exec(trMatch[1])) !== null) {
        const key = headers[colIdx] || `col_${colIdx}`;
        row[key] = tdMatch[1].replace(/<[^>]+>/g, '').trim();
        colIdx++;
      }
      if (Object.keys(row).length > 0) rows.push(row);
    }
  }
  return rows;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { site_id, search } = await req.json();

    if (!site_id || !SITES[site_id]) {
      return new Response(
        JSON.stringify({ success: false, error: 'Site inválido. Use: idema, natal, extremoz' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const site = SITES[site_id];
    const url = site.searchUrl && search ? site.searchUrl(search) : site.url;

    console.log(`Fetching ${site.name}: ${url}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    let response: Response;
    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
        },
      });
    } catch (fetchErr) {
      clearTimeout(timeout);
      console.error(`Fetch failed for ${site.name}:`, fetchErr);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Não foi possível acessar ${site.name}. O site pode estar fora do ar ou bloqueando acesso externo.`,
          fallback_url: site.url,
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    clearTimeout(timeout);

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `${site.name} retornou status ${response.status}`,
          fallback_url: site.url,
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const html = await response.text();
    const textContent = extractTextContent(html);
    const links = extractLinks(html, site.url);
    const tableData = extractTableData(html);

    // Filter by search term if provided
    let filteredLinks = links;
    let filteredText = textContent;
    let filteredTable = tableData;

    if (search) {
      const q = search.toLowerCase();
      filteredLinks = links.filter(
        (l) => l.text.toLowerCase().includes(q) || l.href.toLowerCase().includes(q)
      );
      filteredTable = tableData.filter((row) =>
        Object.values(row).some((v) => v.toLowerCase().includes(q))
      );
      // Extract relevant text snippets
      const sentences = textContent.split(/[.!?]+/);
      filteredText = sentences.filter((s) => s.toLowerCase().includes(q)).join('. ').trim();
    }

    return new Response(
      JSON.stringify({
        success: true,
        site: { id: site.id, name: site.name, url: site.url },
        data: {
          text: filteredText.substring(0, 5000),
          links: filteredLinks.slice(0, 50),
          table: filteredTable.slice(0, 100),
        },
        fetched_at: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in portal-scraper:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
