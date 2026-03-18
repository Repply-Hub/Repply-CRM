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

const EXTREMOZ_YEARS = ['2026', '2025', '2024', '2023', '2022'];

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
  clean = clean.replace(/<header[\s\S]*?<\/header>/gi, '');
  clean = clean.replace(/<footer[\s\S]*?<\/footer>/gi, '');
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

// ─── PDF Text extraction (basic - works for text-based PDFs) ────────

function extractPdfText(buffer: Uint8Array): string {
  // Convert to string to search for text streams
  const decoder = new TextDecoder('latin1');
  const raw = decoder.decode(buffer);
  const textParts: string[] = [];

  // Method 1: Extract text between BT and ET (text objects)
  const btEtRegex = /BT\s([\s\S]*?)ET/g;
  let btMatch;
  while ((btMatch = btEtRegex.exec(raw)) !== null) {
    const block = btMatch[1];
    // Extract text from Tj and TJ operators
    const tjRegex = /\(([^)]*)\)\s*Tj/g;
    let tjMatch;
    while ((tjMatch = tjRegex.exec(block)) !== null) {
      const decoded = decodePdfString(tjMatch[1]);
      if (decoded.trim()) textParts.push(decoded.trim());
    }
    // TJ array operator
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

  // Method 2: Try to find stream content between stream/endstream
  if (textParts.length < 5) {
    const streamRegex = /stream\r?\n([\s\S]*?)endstream/g;
    let streamMatch;
    while ((streamMatch = streamRegex.exec(raw)) !== null) {
      const content = streamMatch[1];
      // Look for readable text patterns
      const readable = content.replace(/[^\x20-\x7E\xC0-\xFF\n]/g, ' ');
      const words = readable.match(/[A-Za-zÀ-ÿ]{3,}/g);
      if (words && words.length > 5) {
        textParts.push(readable.replace(/\s+/g, ' ').trim());
      }
    }
  }

  return textParts.join('\n');
}

function decodePdfString(s: string): string {
  // Handle PDF escape sequences
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\');
}

// ─── Extremoz-specific: structured data extraction ──────────────────

interface ExtremozLicenca {
  data_edicao: string;
  tipo_licenca: string;
  cnpj: string;
  razao_social: string;
  obra_descricao: string;
  pdf_link: string;
  pdf_nome: string;
  bloco_texto: string;
}

function parseCnpjs(text: string): string[] {
  const cnpjRegex = /\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2}/g;
  const matches = text.match(cnpjRegex) || [];
  return [...new Set(matches.map(c => c.replace(/[\s]/g, '')))];
}

function detectLicenseType(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('licença prévia') || lower.includes('licenca previa') || lower.includes('pedido de licença prévia') || lower.includes('(lp)')) return 'Licença Prévia';
  if (lower.includes('licença de instalação') || lower.includes('licenca de instalacao') || lower.includes('(li)')) return 'Licença de Instalação';
  if (lower.includes('licença de operação') || lower.includes('licenca de operacao') || lower.includes('(lo)')) return 'Licença de Operação';
  if (lower.includes('licença simplificada') || lower.includes('licenca simplificada') || lower.includes('(ls)')) return 'Licença Simplificada';
  if (lower.includes('renovação de licença') || lower.includes('renovacao de licenca')) return 'Renovação de Licença';
  if (lower.includes('licença ambiental') || lower.includes('licenca ambiental')) return 'Licença Ambiental';
  if (lower.includes('autorização ambiental') || lower.includes('autorizacao ambiental')) return 'Autorização Ambiental';
  return '';
}

function extractCompanyName(text: string, cnpj: string): string {
  // Try to find company name near the CNPJ
  const escaped = cnpj.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Pattern: "COMPANY NAME, CNPJ: XX.XXX.XXX/XXXX-XX" or "COMPANY NAME, CNPJ XX.XXX.XXX/XXXX-XX"
  const beforeCnpj = new RegExp(`([A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ][A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ\\s\\-\\.]+?)\\s*,?\\s*(?:CNPJ|C\\.N\\.P\\.J)[:\\s/nº]*${escaped}`, 'i');
  const match = text.match(beforeCnpj);
  if (match) {
    let name = match[1].trim();
    // Clean up common prefixes
    name = name.replace(/^(PREFEITURA\s+MUNICIPAL\s+DE\s+EXTREMOZ\s*,?\s*)/i, '');
    if (name.length > 3) return name.toUpperCase();
  }

  // Pattern: After CNPJ number
  const afterCnpj = new RegExp(`${escaped}[,\\s]*(?:torna público|torna publico)`, 'i');
  const match2 = text.match(afterCnpj);
  if (match2) {
    // Look back from the CNPJ position
    const idx = text.indexOf(cnpj);
    if (idx > 0) {
      const before = text.substring(Math.max(0, idx - 200), idx);
      const lines = before.split(/[\n,]/);
      const lastLine = lines[lines.length - 1]?.trim();
      if (lastLine && lastLine.length > 3) return lastLine.toUpperCase();
    }
  }

  return '';
}

function extractObraDescricao(text: string): string {
  const patterns = [
    /(?:para\s+(?:a|o)\s+)((?:CONSTRUÇÃO|REFORMA|AMPLIAÇÃO|IMPLANTAÇÃO|PAVIMENTAÇÃO|URBANIZAÇÃO|LOTEAMENTO)[\s\S]{5,120}?)(?:[,.]|\s+localizada|\s+situada)/i,
    /empreendimento\s+(?:imobiliário\s+)?denominado\s+([\s\S]{5,100}?)(?:[,.]|\s+localiz)/i,
    /(?:obra|serviço)\s+de\s+([\s\S]{5,100}?)(?:[,.]|\s+localiz)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].replace(/\s+/g, ' ').trim();
  }
  return '';
}

function splitTextIntoBlocks(text: string): string[] {
  // Split into paragraphs/sections at key boundaries
  const blocks: string[] = [];
  // Split by CNPJ mentions - each CNPJ is likely a different notice
  const cnpjPositions: number[] = [];
  const cnpjRegex = /\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2}/g;
  let m;
  while ((m = cnpjRegex.exec(text)) !== null) {
    cnpjPositions.push(m.index);
  }

  if (cnpjPositions.length === 0) {
    if (text.trim()) blocks.push(text.trim());
    return blocks;
  }

  // For each CNPJ, take surrounding context (200 chars before, 500 after)
  for (const pos of cnpjPositions) {
    const start = Math.max(0, pos - 200);
    const end = Math.min(text.length, pos + 500);
    blocks.push(text.substring(start, end).trim());
  }

  return blocks;
}

async function fetchExtremozPdfLinks(year: string, maxPages = 3): Promise<Array<{ date: string; title: string; href: string }>> {
  const results: Array<{ date: string; title: string; href: string }> = [];
  const baseUrl = `https://extremoz.rn.gov.br/diario-oficial/diario-oficial-${year}/`;

  for (let page = 1; page <= maxPages; page++) {
    const url = page === 1 ? baseUrl : `${baseUrl}page/${page}/`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const resp = await fetch(url, { signal: controller.signal, headers: FETCH_HEADERS });
      clearTimeout(timeout);
      if (!resp.ok) break;
      const html = await resp.text();

      // Extract PDF links - pattern from the site: links to wp-content/uploads/YYYY/MM/filename.pdf
      const linkRegex = /<a\s+[^>]*href=["'](https?:\/\/extremoz\.rn\.gov\.br\/wp-content\/uploads\/\d{4}\/\d{2}\/[^"']+\.(?:pdf|doc\.pdf))["'][^>]*>([\s\S]*?)<\/a>/gi;
      let linkMatch;
      while ((linkMatch = linkRegex.exec(html)) !== null) {
        const href = linkMatch[1];
        const rawText = linkMatch[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        
        // Extract date from the link text or filename
        const filename = href.split('/').pop() || '';
        const title = rawText || filename.replace(/\.pdf$/i, '').replace(/-/g, ' ');
        
        // Parse date from filename like "13-de-Julho-de-2022.pdf"
        const dateStr = filename.replace(/\.doc\.pdf$|\.pdf$/i, '').replace(/-/g, ' ');
        
        if (!results.some(r => r.href === href)) {
          results.push({ date: dateStr, title, href });
        }
      }

      // Check if there's a next page
      if (!html.includes(`page/${page + 1}`)) break;
    } catch {
      break;
    }
  }

  return results;
}

async function processExtremozPdf(pdfUrl: string, dateStr: string): Promise<ExtremozLicenca[]> {
  const licencas: ExtremozLicenca[] = [];
  const pdfFilename = pdfUrl.split('/').pop() || '';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const resp = await fetch(pdfUrl, { signal: controller.signal, headers: FETCH_HEADERS });
    clearTimeout(timeout);
    if (!resp.ok) return licencas;

    const buffer = new Uint8Array(await resp.arrayBuffer());
    const text = extractPdfText(buffer);

    if (!text || text.length < 20) {
      // PDF might be image-based, return minimal entry
      return [{
        data_edicao: dateStr,
        tipo_licenca: '',
        cnpj: '',
        razao_social: '',
        obra_descricao: '',
        pdf_link: pdfUrl,
        pdf_nome: pdfFilename,
        bloco_texto: '(PDF baseado em imagem - texto não extraível)',
      }];
    }

    // Split text into blocks and process each
    const blocks = splitTextIntoBlocks(text);
    const processedCnpjs = new Set<string>();

    for (const block of blocks) {
      const cnpjs = parseCnpjs(block);
      if (cnpjs.length === 0) continue;

      for (const cnpj of cnpjs) {
        if (processedCnpjs.has(cnpj)) continue;
        processedCnpjs.add(cnpj);

        const tipo = detectLicenseType(block);
        const razaoSocial = extractCompanyName(block, cnpj);
        const obra = extractObraDescricao(block);

        // Only include entries that have license-related content
        const hasLicenseContent = tipo || 
          block.toLowerCase().includes('licen') || 
          block.toLowerCase().includes('alvará') || 
          block.toLowerCase().includes('empreendimento') ||
          block.toLowerCase().includes('construção') ||
          block.toLowerCase().includes('loteamento');

        if (hasLicenseContent || razaoSocial) {
          licencas.push({
            data_edicao: dateStr,
            tipo_licenca: tipo || 'Não identificada',
            cnpj,
            razao_social: razaoSocial || '',
            obra_descricao: obra || '',
            pdf_link: pdfUrl,
            pdf_nome: pdfFilename,
            bloco_texto: block.substring(0, 500),
          });
        }
      }
    }

    // If no license entries found but text exists, return one general entry
    if (licencas.length === 0 && text.length > 50) {
      const cnpjs = parseCnpjs(text);
      if (cnpjs.length > 0) {
        licencas.push({
          data_edicao: dateStr,
          tipo_licenca: detectLicenseType(text) || 'Não identificada',
          cnpj: cnpjs[0],
          razao_social: extractCompanyName(text, cnpjs[0]),
          obra_descricao: extractObraDescricao(text),
          pdf_link: pdfUrl,
          pdf_nome: pdfFilename,
          bloco_texto: text.substring(0, 500),
        });
      }
    }
  } catch (err) {
    console.error(`Error processing PDF ${pdfUrl}:`, err);
  }

  return licencas;
}

// ─── Main handler ───────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { site_id, search, year, max_pdfs } = await req.json();

    if (!site_id || !SITES[site_id]) {
      return new Response(
        JSON.stringify({ success: false, error: 'Site inválido. Use: idema, natal, extremoz' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const site = SITES[site_id];

    // ─── Extremoz special handling ──────────────────────────────
    if (site_id === 'extremoz') {
      const targetYear = year || '2026';
      const pdfLimit = Math.min(max_pdfs || 5, 15); // Cap at 15 to avoid timeouts

      console.log(`Fetching Extremoz year=${targetYear}, max_pdfs=${pdfLimit}`);

      // Step 1: Get PDF links from listing pages
      const pdfLinks = await fetchExtremozPdfLinks(targetYear, 7);
      console.log(`Found ${pdfLinks.length} PDF links for ${targetYear}`);

      if (pdfLinks.length === 0) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Nenhum diário oficial encontrado para ${targetYear}`,
            fallback_url: `https://extremoz.rn.gov.br/diario-oficial/diario-oficial-${targetYear}/`,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Step 2: Process PDFs (limited to avoid timeout)
      const pdfsToProcess = pdfLinks.slice(0, pdfLimit);
      const allLicencas: ExtremozLicenca[] = [];
      
      for (const pdf of pdfsToProcess) {
        const licencas = await processExtremozPdf(pdf.href, pdf.date);
        allLicencas.push(...licencas);
      }

      console.log(`Extracted ${allLicencas.length} license entries from ${pdfsToProcess.length} PDFs`);

      // Step 3: Filter by search term if provided
      let filtered = allLicencas;
      if (search) {
        const q = search.toLowerCase();
        filtered = allLicencas.filter(l =>
          l.cnpj.includes(q) ||
          l.razao_social.toLowerCase().includes(q) ||
          l.obra_descricao.toLowerCase().includes(q) ||
          l.bloco_texto.toLowerCase().includes(q) ||
          l.tipo_licenca.toLowerCase().includes(q)
        );
      }

      // Convert to table format
      const tableData = filtered.map(l => ({
        'Data da Edição': l.data_edicao,
        'Tipo de Licença': l.tipo_licenca,
        'CNPJ': l.cnpj,
        'Razão Social': l.razao_social,
        'Obra / Descrição': l.obra_descricao,
        'PDF': l.pdf_nome,
        'Link PDF': l.pdf_link,
        'Texto Encontrado': l.bloco_texto.substring(0, 300),
      }));

      // Also return PDF links list
      const linksList = pdfLinks.map(p => ({ text: p.title || p.date, href: p.href }));

      return new Response(
        JSON.stringify({
          success: true,
          site: { id: site.id, name: site.name, url: `https://extremoz.rn.gov.br/diario-oficial/diario-oficial-${targetYear}/` },
          data: {
            text: `${allLicencas.length} licenças/menções encontradas em ${pdfsToProcess.length} edições do Diário Oficial de Extremoz (${targetYear}). ${pdfLinks.length} edições disponíveis no total.`,
            links: linksList,
            table: tableData,
          },
          meta: {
            year: targetYear,
            total_pdfs: pdfLinks.length,
            processed_pdfs: pdfsToProcess.length,
            total_licencas: allLicencas.length,
            filtered_licencas: filtered.length,
            available_years: EXTREMOZ_YEARS,
          },
          fetched_at: new Date().toISOString(),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ─── Generic site handling (IDEMA, Natal) ───────────────────
    const url = site.searchUrl && search ? site.searchUrl(search) : site.url;
    console.log(`Fetching ${site.name}: ${url}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal, headers: FETCH_HEADERS });
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

    let filteredLinks = links;
    let filteredText = textContent;
    let filteredTable = tableData;

    if (search) {
      const q = search.toLowerCase();
      filteredLinks = links.filter(l => l.text.toLowerCase().includes(q) || l.href.toLowerCase().includes(q));
      filteredTable = tableData.filter(row => Object.values(row).some(v => v.toLowerCase().includes(q)));
      const sentences = textContent.split(/[.!?]+/);
      filteredText = sentences.filter(s => s.toLowerCase().includes(q)).join('. ').trim();
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
