const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface SiteConfig {
  id: string;
  name: string;
  url: string;
}

const SITES: Record<string, SiteConfig> = {
  idema: { id: 'idema', name: 'IDEMA - Licenças Emitidas', url: 'https://siga.idema.rn.gov.br/servicos/licencas_emitidas/' },
  natal: { id: 'natal', name: 'Diário Oficial de Natal', url: 'https://www.natal.rn.gov.br/dom' },
  extremoz: { id: 'extremoz', name: 'Diário Oficial de Extremoz', url: 'https://extremoz.rn.gov.br/diario-oficial/diario-oficial-2026/' },
};

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
};

// ─── Generic helpers ────────────────────────────────────────────────

function extractTextContent(html: string): string {
  let clean = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  clean = clean.replace(/<style[\s\S]*?<\/style>/gi, '');
  clean = clean.replace(/<nav[\s\S]*?<\/nav>/gi, '');
  clean = clean.replace(/<[^>]+>/g, ' ');
  clean = clean.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  clean = clean.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
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
    if (href.startsWith('/')) {
      const url = new URL(baseUrl);
      href = `${url.protocol}//${url.host}${href}`;
    } else if (!href.startsWith('http')) {
      href = `${baseUrl.replace(/\/$/, '')}/${href}`;
    }
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
    const headerRegex = /<th[^>]*>([\s\S]*?)<\/th>/gi;
    const headers: string[] = [];
    let hMatch;
    while ((hMatch = headerRegex.exec(table)) !== null) {
      headers.push(hMatch[1].replace(/<[^>]+>/g, '').trim());
    }
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

// ─── PDF text extraction (basic) ────────────────────────────────────

function decodePdfString(s: string): string {
  return s
    .replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(').replace(/\\\)/g, ')').replace(/\\\\/g, '\\');
}

function extractPdfText(buffer: Uint8Array): string {
  const decoder = new TextDecoder('latin1');
  const raw = decoder.decode(buffer);
  const textParts: string[] = [];

  const btEtRegex = /BT\s([\s\S]*?)ET/g;
  let btMatch;
  while ((btMatch = btEtRegex.exec(raw)) !== null) {
    const block = btMatch[1];
    const tjRegex = /\(([^)]*)\)\s*Tj/g;
    let tjMatch;
    while ((tjMatch = tjRegex.exec(block)) !== null) {
      const decoded = decodePdfString(tjMatch[1]);
      if (decoded.trim()) textParts.push(decoded.trim());
    }
    const tjArrayRegex = /\[([\s\S]*?)\]\s*TJ/g;
    let tjArrMatch;
    while ((tjArrMatch = tjArrayRegex.exec(block)) !== null) {
      const arr = tjArrMatch[1];
      const strRegex = /\(([^)]*)\)/g;
      let strMatch;
      const parts: string[] = [];
      while ((strMatch = strRegex.exec(arr)) !== null) {
        parts.push(decodePdfString(strMatch[1]));
      }
      const joined = parts.join('');
      if (joined.trim()) textParts.push(joined.trim());
    }
  }

  return textParts.join('\n');
}

// ─── Extremoz parsing ───────────────────────────────────────────────

interface ExtremozEntry {
  data_edicao: string;
  tipo_licenca: string;
  cnpj: string;
  razao_social: string;
  obra_descricao: string;
  pdf_nome: string;
  pdf_link: string;
  bloco_texto: string;
}

function parseCnpjs(text: string): string[] {
  const cnpjRegex = /\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2}/g;
  const matches = text.match(cnpjRegex) || [];
  return [...new Set(matches.map(c => c.replace(/\s/g, '')))];
}

function detectLicenseType(text: string): string {
  const lower = text.toLowerCase();
  // Abbreviations first (common in Extremoz PDFs)
  if (/\bLIO\s+para\b/i.test(text)) return 'Licença de Instalação e Operação';
  if (/\bLP\s+para\b/i.test(text)) return 'Licença Prévia';
  if (/\bLS\s+para\b/i.test(text)) return 'Licença Simplificada';
  if (/\bLI\s+para\b/i.test(text)) return 'Licença de Instalação';
  if (/\bLO\s+para\b/i.test(text)) return 'Licença de Operação';
  // Full names
  if (lower.includes('renovação de licença simplificada')) return 'Renovação de Licença Simplificada';
  if (lower.includes('renovação de licença')) return 'Renovação de Licença';
  if (lower.includes('licença prévia') || lower.includes('(lp)')) return 'Licença Prévia';
  if (lower.includes('licença de instalação e operação')) return 'Licença de Instalação e Operação';
  if (lower.includes('licença de instalação') || lower.includes('(li)')) return 'Licença de Instalação';
  if (lower.includes('licença de operação') || lower.includes('(lo)')) return 'Licença de Operação';
  if (lower.includes('licença simplificada') || lower.includes('(ls)')) return 'Licença Simplificada';
  if (lower.includes('licença ambiental')) return 'Licença Ambiental';
  if (lower.includes('autorização ambiental')) return 'Autorização Ambiental';
  if (lower.includes('dispensa de licen')) return 'Dispensa de Licença';
  if (/tomada de preços|concorrência|pregão/i.test(text)) return 'Licitação';
  return '';
}

function extractCompanyName(text: string, cnpj: string): string {
  const escaped = cnpj.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`([A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ][A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ\\s\\-\\.]{3,80}?)\\s*,?\\s*(?:CNPJ|C\\.N\\.P\\.J)[:\\s/nº]*${escaped}`, 'i');
  const match = text.match(pattern);
  if (match) return match[1].trim().toUpperCase();
  return '';
}

function extractObraDescricao(text: string): string {
  const patterns = [
    /(?:para\s+(?:a|o)\s+)((?:CONSTRUÇÃO|REFORMA|AMPLIAÇÃO|IMPLANTAÇÃO|PAVIMENTAÇÃO|LOTEAMENTO)[\s\S]{5,120}?)(?:[,.]|\s+localizada)/i,
    /empreendimento\s+(?:imobiliário\s+)?denominado\s+([\s\S]{5,100}?)(?:[,.]|\s+localiz)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].replace(/\s+/g, ' ').trim();
  }
  return '';
}

/** Extract PDF links from Extremoz listing page HTML */
function extractExtremozPdfLinks(html: string): Array<{ date: string; title: string; href: string }> {
  const results: Array<{ date: string; title: string; href: string }> = [];
  const seen = new Set<string>();

  // Primary: match href to PDF files on the Extremoz domain
  const hrefRegex = /href="(https?:\/\/extremoz\.rn\.gov\.br\/wp-content\/uploads\/[^"]+\.(?:pdf|doc\.pdf))"/gi;
  let match;
  while ((match = hrefRegex.exec(html)) !== null) {
    const href = match[1];
    if (seen.has(href)) continue;
    seen.add(href);

    const filename = href.split('/').pop() || '';
    const title = filename.replace(/\.doc\.pdf$|\.pdf$/i, '').replace(/-/g, ' ');

    // Try to find date near this link (look for dd/mm/yyyy pattern nearby)
    const pos = match.index;
    const nearby = html.substring(pos, Math.min(html.length, pos + 500));
    const dateMatch = nearby.match(/(\d{2}\/\d{2}\/\d{4})/);
    const date = dateMatch ? dateMatch[1] : '';

    results.push({ date, title, href });
  }

  return results;
}

async function fetchExtremozPdfLinks(year: string, maxPages: number): Promise<Array<{ date: string; title: string; href: string }>> {
  const results: Array<{ date: string; title: string; href: string }> = [];
  const baseUrl = `https://extremoz.rn.gov.br/diario-oficial/diario-oficial-${year}/`;

  for (let page = 1; page <= maxPages; page++) {
    const url = page === 1 ? baseUrl : `${baseUrl}page/${page}/`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const resp = await fetch(url, { signal: controller.signal, headers: FETCH_HEADERS });
      clearTimeout(timeout);
      console.log(`Page ${page}: status=${resp.status}`);
      if (!resp.ok) {
        console.log(`Page ${page} failed with status ${resp.status}`);
        break;
      }
      const html = await resp.text();
      console.log(`Page ${page}: ${html.length} chars, has wp-content: ${html.includes('wp-content/uploads')}`)

      const links = extractExtremozPdfLinks(html);
      console.log(`Page ${page}: found ${links.length} links`);
      for (const link of links) {
        if (!results.some(r => r.href === link.href)) {
          results.push(link);
        }
      }

      // Check for next page
      if (!html.includes(`/page/${page + 1}`)) break;
    } catch (err) {
      console.error(`Page ${page} error:`, err);
      break;
    }
  }

  return results;
}

async function processOnePdf(href: string, date: string, title: string): Promise<ExtremozEntry[]> {
  const entries: ExtremozEntry[] = [];
  const pdfFilename = href.split('/').pop() || '';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const resp = await fetch(href, { signal: controller.signal, headers: FETCH_HEADERS });
    clearTimeout(timeout);
    if (!resp.ok) return entries;

    const buffer = new Uint8Array(await resp.arrayBuffer());
    
    // Limit buffer size to avoid CPU issues (skip PDFs > 2MB)
    if (buffer.length > 2 * 1024 * 1024) {
      return [{
        data_edicao: date || title,
        tipo_licenca: '',
        cnpj: '',
        razao_social: '',
        obra_descricao: '',
        pdf_nome: pdfFilename,
        pdf_link: href,
        bloco_texto: '(PDF muito grande para processamento automático)',
      }];
    }

    const text = extractPdfText(buffer);

    if (!text || text.length < 20) {
      return [{
        data_edicao: date || title,
        tipo_licenca: '',
        cnpj: '',
        razao_social: '',
        obra_descricao: '',
        pdf_nome: pdfFilename,
        pdf_link: href,
        bloco_texto: '(Texto não extraível - PDF baseado em imagem)',
      }];
    }

    // Find CNPJs and extract entries
    const cnpjs = parseCnpjs(text);
    const processedCnpjs = new Set<string>();

    for (const cnpj of cnpjs) {
      if (processedCnpjs.has(cnpj)) continue;
      processedCnpjs.add(cnpj);

      // Get context around CNPJ
      const idx = text.indexOf(cnpj);
      const context = text.substring(Math.max(0, idx - 300), Math.min(text.length, idx + 400));

      const tipo = detectLicenseType(context);
      const razao = extractCompanyName(context, cnpj);
      const obra = extractObraDescricao(context);

      const hasRelevant = tipo || context.toLowerCase().includes('licen') ||
        context.toLowerCase().includes('construção') || context.toLowerCase().includes('loteamento') ||
        context.toLowerCase().includes('empreendimento');

      if (hasRelevant || razao) {
        entries.push({
          data_edicao: date || title,
          tipo_licenca: tipo || 'Não identificada',
          cnpj,
          razao_social: razao,
          obra_descricao: obra,
          pdf_nome: pdfFilename,
          pdf_link: href,
          bloco_texto: context.substring(0, 300),
        });
      }
    }

    if (entries.length === 0 && cnpjs.length > 0) {
      entries.push({
        data_edicao: date || title,
        tipo_licenca: detectLicenseType(text) || 'Não identificada',
        cnpj: cnpjs[0],
        razao_social: extractCompanyName(text, cnpjs[0]),
        obra_descricao: extractObraDescricao(text),
        pdf_nome: pdfFilename,
        pdf_link: href,
        bloco_texto: text.substring(0, 300),
      });
    }
  } catch (err) {
    console.error(`PDF error ${pdfFilename}:`, err);
  }

  return entries;
}

// ─── Main ───────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { site_id, search, year, max_pdfs } = body;

    if (!site_id || !SITES[site_id]) {
      return new Response(
        JSON.stringify({ success: false, error: 'Site inválido. Use: idema, natal, extremoz' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const site = SITES[site_id];

    // ─── Extremoz ───────────────────────────────────────────────
    if (site_id === 'extremoz') {
      const targetYear = year || '2026';
      const pdfLimit = Math.min(max_pdfs || 3, 8);

      console.log(`Extremoz: year=${targetYear}, limit=${pdfLimit}`);

      // Step 1: Get PDF links
      const pdfLinks = await fetchExtremozPdfLinks(targetYear, 7);
      console.log(`Found ${pdfLinks.length} PDFs for ${targetYear}`);

      if (pdfLinks.length === 0) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Nenhum diário oficial encontrado para ${targetYear}`,
            fallback_url: `https://extremoz.rn.gov.br/diario-oficial/diario-oficial-${targetYear}/`,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Step 2: Process PDFs sequentially (limited)
      const toProcess = pdfLinks.slice(0, pdfLimit);
      const allEntries: ExtremozEntry[] = [];

      for (const pdf of toProcess) {
        const entries = await processOnePdf(pdf.href, pdf.date, pdf.title);
        allEntries.push(...entries);
      }

      console.log(`Extracted ${allEntries.length} entries from ${toProcess.length} PDFs`);

      // Step 3: Filter
      let filtered = allEntries;
      if (search) {
        const q = search.toLowerCase();
        filtered = allEntries.filter(e =>
          e.cnpj.includes(q) || e.razao_social.toLowerCase().includes(q) ||
          e.obra_descricao.toLowerCase().includes(q) || e.bloco_texto.toLowerCase().includes(q)
        );
      }

      const tableData = filtered.map(e => ({
        'Data da Edição': e.data_edicao,
        'Tipo de Licença': e.tipo_licenca,
        'CNPJ': e.cnpj,
        'Razão Social': e.razao_social,
        'Obra / Descrição': e.obra_descricao,
        'PDF': e.pdf_nome,
        'Link PDF': e.pdf_link,
        'Texto Encontrado': e.bloco_texto.substring(0, 200),
      }));

      const linksList = pdfLinks.map(p => ({ text: p.title || p.date, href: p.href }));

      return new Response(
        JSON.stringify({
          success: true,
          site: { id: 'extremoz', name: site.name, url: `https://extremoz.rn.gov.br/diario-oficial/diario-oficial-${targetYear}/` },
          data: {
            text: `${allEntries.length} menções encontradas em ${toProcess.length} de ${pdfLinks.length} edições (${targetYear}).`,
            links: linksList,
            table: tableData,
          },
          meta: {
            year: targetYear,
            total_pdfs: pdfLinks.length,
            processed_pdfs: toProcess.length,
            total_entries: allEntries.length,
            filtered_entries: filtered.length,
            available_years: ['2026', '2025', '2024', '2023', '2022'],
          },
          fetched_at: new Date().toISOString(),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ─── Generic (IDEMA, Natal) ─────────────────────────────────
    const url = site.url;
    console.log(`Fetching ${site.name}: ${url}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal, headers: FETCH_HEADERS });
    } catch {
      clearTimeout(timeout);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Não foi possível acessar ${site.name}.`,
          fallback_url: site.url,
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    clearTimeout(timeout);

    if (!response.ok) {
      return new Response(
        JSON.stringify({ success: false, error: `${site.name} retornou status ${response.status}`, fallback_url: site.url }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const html = await response.text();
    const textContent = extractTextContent(html);
    const links = extractLinks(html, site.url);
    const tableData = extractTableData(html);

    let filteredLinks = links;
    let filteredText = textContent;
    let filteredTable = tableData;

    if (search) {
      const q = search.toLowerCase();
      filteredLinks = links.filter(l => l.text.toLowerCase().includes(q) || l.href.toLowerCase().includes(q));
      filteredTable = tableData.filter(row => Object.values(row).some(v => v.toLowerCase().includes(q)));
      filteredText = textContent.split(/[.!?]+/).filter(s => s.toLowerCase().includes(q)).join('. ').trim();
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
    console.error('portal-scraper error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
