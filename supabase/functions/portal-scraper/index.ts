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
  natal: { id: 'natal', name: 'Diário Oficial de Natal', url: 'https://www.natal.rn.gov.br/dom/' },
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
      if (isFirst && headers.length > 0) {
        isFirst = false;
        continue;
      }
      isFirst = false;
      const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let tdMatch;
      const row: Record<string, string> = {};
      let colIdx = 0;
      while ((tdMatch = tdRegex.exec(trMatch[1])) !== null) {
        const key = headers[colIdx] || `col_${colIdx}`;
        row[key] = tdMatch[1]
          .replace(/<br\s*\/?\s*>/gi, ' | ')
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/gi, ' ')
          .trim();
        colIdx++;
      }
      if (Object.keys(row).length > 0) rows.push(row);
    }
  }
  return rows;
}

function formatDateBR(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function parseSetCookieToCookieHeader(setCookie: string | null): string {
  if (!setCookie) return '';
  return setCookie
    .split(/,(?=\s*[^;]+=)/)
    .map(part => part.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
}

function getIdemaFormAction(html: string, baseUrl: string): string {
  const formRegex = /<form[^>]*>([\s\S]*?)<\/form>/gi;
  let bestAction = baseUrl;
  let bestScore = -1;
  let match: RegExpExecArray | null;

  while ((match = formRegex.exec(html)) !== null) {
    const fullForm = match[0];
    const body = match[1];
    const actionMatch = fullForm.match(/action=["']([^"']*)["']/i);
    const actionRaw = (actionMatch?.[1] || '').trim();

    const score =
      Number(/cnpj/i.test(body)) +
      Number(/cpf/i.test(body)) +
      Number(/processo/i.test(body)) +
      Number(/data|per[ií]odo/i.test(body));

    if (score > bestScore) {
      bestScore = score;
      bestAction = actionRaw ? new URL(actionRaw, baseUrl).toString() : baseUrl;
    }
  }

  return bestAction;
}

function extractFormHiddenFields(html: string): Record<string, string> {
  const hidden: Record<string, string> = {};
  const inputRegex = /<input[^>]*>/gi;
  let inputMatch: RegExpExecArray | null;

  while ((inputMatch = inputRegex.exec(html)) !== null) {
    const input = inputMatch[0];
    const type = (input.match(/type=["']([^"']+)["']/i)?.[1] || '').toLowerCase();
    const name = (input.match(/name=["']([^"']+)["']/i)?.[1] || '').trim();
    const value = (input.match(/value=["']([^"']*)["']/i)?.[1] || '').trim();

    if (type === 'hidden' && name) hidden[name] = value;
  }

  return hidden;
}

function extractFormFieldNames(html: string): string[] {
  const names = new Set<string>();
  const fieldRegex = /<(input|select|textarea)[^>]*name=["']([^"']+)["'][^>]*>/gi;
  let fieldMatch: RegExpExecArray | null;

  while ((fieldMatch = fieldRegex.exec(html)) !== null) {
    names.add(fieldMatch[2].trim());
  }

  return [...names];
}

function pickFieldName(fieldNames: string[], patterns: string[]): string | null {
  const lower = fieldNames.map(name => ({ original: name, lower: name.toLowerCase() }));
  for (const pattern of patterns) {
    const found = lower.find(field => field.lower.includes(pattern.toLowerCase()));
    if (found) return found.original;
  }
  return null;
}

function buildIdemaFilterPayload(baseHtml: string, search?: string): URLSearchParams {
  const payload = new URLSearchParams();
  const hidden = extractFormHiddenFields(baseHtml);
  Object.entries(hidden).forEach(([name, value]) => payload.set(name, value));

  const fieldNames = extractFormFieldNames(baseHtml);
  const setIfFound = (patterns: string[], value: string) => {
    const field = pickFieldName(fieldNames, patterns);
    if (field) payload.set(field, value);
    return field;
  };

  const now = new Date();
  const from = new Date(now);
  from.setDate(now.getDate() - 90);

  const startDate = formatDateBR(from);
  const endDate = formatDateBR(now);

  setIfFound(['data_inicial', 'dt_inicial', 'inicio', 'de', 'periodo_ini'], startDate);
  setIfFound(['data_final', 'dt_final', 'fim', 'ate', 'periodo_fim'], endDate);

  const q = (search || '').trim();
  const digits = q.replace(/\D/g, '');

  if (digits.length === 14) {
    setIfFound(['cnpj'], digits);
  } else if (digits.length === 11) {
    setIfFound(['cpf'], digits);
  } else if (q) {
    const processField = setIfFound(['processo', 'protocolo', 'numero_processo'], q);
    if (!processField) {
      setIfFound(['empreendimento', 'razao', 'interessado', 'termo', 'busca', 'search'], q);
    }
  }

  setIfFound(['acao', 'action', 'op', 'submit', 'buscar', 'pesquisar', 'consultar'], 'Buscar');
  return payload;
}

function selectMostRelevantIdemaTable(tables: Array<Record<string, string>>): Array<Record<string, string>> {
  if (tables.length === 0) return [];

  const relevant = tables.filter((row) => {
    const joinedKeys = Object.keys(row).join(' ').toLowerCase();
    const joinedValues = Object.values(row).join(' ').toLowerCase();
    return /(licen|cnpj|cpf|processo|empreendimento|validade|emiss)/.test(joinedKeys + ' ' + joinedValues);
  });

  return relevant.length > 0 ? relevant : tables;
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
  nome_contato: string;
  email: string;
  fase_obra: string;
  construtora: string;
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

function normalizeExtremozLicenseType(text: string): string {
  const lower = text.toLowerCase();
  if (/\bLP\b/i.test(text) || lower.includes('licença prévia')) return 'Licença Prévia';
  if (/\bLI\b/i.test(text) || lower.includes('licença de instalação')) return 'Licença de Instalação';
  if (/\bLO\b/i.test(text) || lower.includes('licença de operação')) return 'Licença de Operação';
  return '';
}

function extractCompanyName(text: string, cnpj: string): string {
  const escaped = cnpj.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`([A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ][A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ\\s\\-\\.]{3,80}?)\\s*,?\\s*(?:CNPJ|C\\.N\\.P\\.J)[:\\s/nº]*${escaped}`, 'i');
  const match = text.match(pattern);
  if (match) return match[1].replace(/\s+/g, ' ').trim().toUpperCase();
  return '';
}

function extractEmail(text: string): string {
  const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match?.[0] || '';
}

function extractContato(text: string): string {
  const patterns = [
    /(?:contato|responsável|requerente|interessado)[:\s]+([A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ][A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ\s]{4,80})/i,
    /([A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ][A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ\s]{4,80})\s*,\s*e-?mail/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].replace(/\s+/g, ' ').trim();
  }
  return '';
}

function extractFaseObra(text: string): string {
  const patterns = [
    /(implantação[^,\.]{0,80})/i,
    /(instalação[^,\.]{0,80})/i,
    /(operação[^,\.]{0,80})/i,
    /(construção[^,\.]{0,80})/i,
    /(ampliação[^,\.]{0,80})/i,
    /(reforma[^,\.]{0,80})/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].replace(/\s+/g, ' ').trim();
  }
  return '';
}

function extractObraDescricao(text: string): string {
  const patterns = [
    /(?:para\s+(?:a\s+|o\s+)?)((?:CONSTRUÇÃO|REFORMA|AMPLIAÇÃO|IMPLANTAÇÃO|PAVIMENTAÇÃO|LOTEAMENTO)[\s\S]{3,120}?)(?:[,.]|\s+localiz)/i,
    /empreendimento\s+(?:imobiliário\s+)?denominado\s+([\s\S]{5,100}?)(?:[,.]|\s+localiz)/i,
    /(construção\s+residencial\s+[^,\.]{0,80})/i,
    /(pavimentação[^,\.]{3,100})/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].replace(/\s+/g, ' ').trim();
  }
  return '';
}

function isRelevantExtremozEntry(entry: ExtremozEntry): boolean {
  return Boolean(
    entry.tipo_licenca && (
      entry.fase_obra ||
      entry.nome_contato ||
      entry.email ||
      entry.construtora ||
      entry.razao_social ||
      entry.obra_descricao
    )
  );
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
    if (buffer.length > 2 * 1024 * 1024) return entries;

    const text = extractPdfText(buffer);
    if (!text || text.length < 20) return entries;

    const cnpjs = parseCnpjs(text);
    const contexts: string[] = [];

    if (cnpjs.length > 0) {
      for (const cnpj of cnpjs) {
        const idx = text.indexOf(cnpj);
        if (idx !== -1) contexts.push(text.substring(Math.max(0, idx - 350), Math.min(text.length, idx + 500)));
      }
    } else {
      contexts.push(text.substring(0, 1200));
    }

    for (const context of contexts) {
      const tipo = normalizeExtremozLicenseType(context);
      if (!tipo) continue;

      const cnpjMatch = context.match(/\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2}/);
      const cnpj = cnpjMatch ? cnpjMatch[0].replace(/\s/g, '') : '';
      const razao = cnpj ? extractCompanyName(context, cnpj) : '';
      const email = extractEmail(context);
      const nomeContato = extractContato(context);
      const faseObra = extractFaseObra(context);
      const obra = extractObraDescricao(context);
      const construtora = razao || obra;

      const entry: ExtremozEntry = {
        data_edicao: date || title,
        tipo_licenca: tipo,
        cnpj,
        razao_social: razao,
        nome_contato: nomeContato,
        email,
        fase_obra: faseObra,
        construtora,
        obra_descricao: obra,
        pdf_nome: pdfFilename,
        pdf_link: href,
        bloco_texto: context.substring(0, 300),
      };

      if (isRelevantExtremozEntry(entry)) {
        entries.push(entry);
      }
    }
  } catch (err) {
    console.error(`PDF error ${pdfFilename}:`, err);
  }

  return entries;
}

async function fetchExtremozPdfLinks(year: string, limit: number): Promise<Array<{ href: string; title: string; date: string }>> {
  const url = `https://extremoz.rn.gov.br/diario-oficial/diario-oficial-${year}/`;
  console.log(`Fetching Extremoz listing: ${url}`);
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const resp = await fetch(url, { signal: controller.signal, headers: FETCH_HEADERS });
    clearTimeout(timeout);
    
    if (!resp.ok) return [];
    
    const html = await resp.text();
    const links: Array<{ href: string; title: string; date: string }> = [];
    
    // Regex to find PDF links in the listing
    const regex = /<a\s+[^>]*href=["']([^"']+\.pdf)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    
    while ((match = regex.exec(html)) !== null) {
      const href = match[1];
      const text = match[2].replace(/<[^>]+>/g, '').trim();
      
      // Extract date if present in text or href
      const dateMatch = text.match(/(\d{2}\/\d{2}\/\d{4})/) || href.match(/(\d{2}-\d{2}-\d{4})/);
      const date = dateMatch ? dateMatch[1].replace(/-/g, '/') : '';
      
      links.push({ href, title: text || `Edição ${date}`, date });
      if (links.length >= limit) break;
    }
    
    return links;
  } catch (err) {
    console.error('fetchExtremozPdfLinks error:', err);
    return [];
  }
}


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
        'Fase da Obra': e.fase_obra,
        'Construtora / Obra': e.construtora,
        'Contato': e.nome_contato,
        'Email': e.email,
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

    // ─── Natal ────────────────────────────────────────────────────
    if (site_id === 'natal') {
      const targetYear = year || new Date().getFullYear().toString();
      const targetMonth = body.month || String(new Date().getMonth() + 1).padStart(2, '0');
      const pdfLimit = Math.min(max_pdfs || 5, 10);

      console.log(`Natal: year=${targetYear}, month=${targetMonth}, limit=${pdfLimit}`);

      // Fetch listing page via POST
      const formData = new URLSearchParams();
      formData.append('mes', targetMonth);
      formData.append('ano', targetYear);
      formData.append('list', 'Listar');

      let listingHtml = '';
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const resp = await fetch('https://www.natal.rn.gov.br/dom/', {
          method: 'POST',
          signal: controller.signal,
          headers: { ...FETCH_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formData.toString(),
        });
        clearTimeout(timeout);
        if (!resp.ok) throw new Error(`Status ${resp.status}`);
        listingHtml = await resp.text();
      } catch (err) {
        console.error('Natal listing error:', err);
        return new Response(
          JSON.stringify({ success: false, error: 'Não foi possível acessar o DOM de Natal', fallback_url: site.url }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Extract PDF links
      const pdfLinks: Array<{ href: string; title: string; date: string; numero: string }> = [];
      const linkRegex = /<a\s+href="(https?:\/\/www2\.natal\.rn\.gov\.br\/_anexos\/publicacao\/dom\/[^"]+\.pdf)"[^>]*>([^<]+)<\/a>/gi;
      let linkMatch;
      while ((linkMatch = linkRegex.exec(listingHtml)) !== null) {
        const href = linkMatch[1];
        const title = linkMatch[2].trim();
        if (pdfLinks.some(p => p.href === href)) continue;
        // Extract date and number from title like "Ano XXVI - Num. 6029 - 18/03/2026"
        const dateMatch = title.match(/(\d{2}\/\d{2}\/\d{4})/);
        const numMatch = title.match(/Num\.\s*(\d+)/i);
        pdfLinks.push({
          href,
          title,
          date: dateMatch ? dateMatch[1] : '',
          numero: numMatch ? numMatch[1] : '',
        });
      }

      console.log(`Found ${pdfLinks.length} PDFs for ${targetMonth}/${targetYear}`);

      if (pdfLinks.length === 0) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Nenhum diário oficial encontrado para ${targetMonth}/${targetYear}`,
            fallback_url: site.url,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Process PDFs (reuse same logic as Extremoz)
      const toProcess = pdfLinks.slice(0, pdfLimit);
      const allEntries: ExtremozEntry[] = [];

      for (const pdf of toProcess) {
        const entries = await processOnePdf(pdf.href, pdf.date, pdf.title);
        // Add numero_dom info
        for (const e of entries) {
          (e as any).numero_dom = pdf.numero;
        }
        allEntries.push(...entries);
      }

      console.log(`Extracted ${allEntries.length} entries from ${toProcess.length} PDFs`);

      // Filter
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
        'Nº DOM': (e as any).numero_dom || '',
        'Tipo de Licença': e.tipo_licenca,
        'CNPJ': e.cnpj,
        'Razão Social': e.razao_social,
        'Obra / Descrição': e.obra_descricao,
        'PDF': e.pdf_nome,
        'Link PDF': e.pdf_link,
        'Texto Encontrado': e.bloco_texto.substring(0, 200),
      }));

      const linksList = pdfLinks.map(p => ({ text: p.title, href: p.href }));

      return new Response(
        JSON.stringify({
          success: true,
          site: { id: 'natal', name: site.name, url: site.url },
          data: { text: `${allEntries.length} menções encontradas em ${toProcess.length} de ${pdfLinks.length} edições (${targetMonth}/${targetYear}).`, links: linksList, table: tableData },
          meta: { year: targetYear, month: targetMonth, total_pdfs: pdfLinks.length, processed_pdfs: toProcess.length, total_entries: allEntries.length, filtered_entries: filtered.length },
          fetched_at: new Date().toISOString(),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ─── IDEMA ────────────────────────────────────────────────────
    if (site_id === 'idema') {
      const urls = [
        'https://siga.idema.rn.gov.br/servicos/licencas_emitidas/',
        'https://sistemas.idema.rn.gov.br/servicos/licencas_emitidas/',
      ];

      let baseHtml = '';
      let resultHtml = '';
      let usedUrl = '';
      let actionUrl = '';

      type IdemaBaseResult = { html: string; url: string; cookieHeader: string };
      const baseAttempts: Promise<IdemaBaseResult>[] = urls.map((tryUrl) => (async () => {
        console.log(`Trying IDEMA with filters: ${tryUrl}`);
        const getController = new AbortController();
        const getTimeout = setTimeout(() => getController.abort(), 25000);
        const getResp = await fetch(tryUrl, { signal: getController.signal, headers: FETCH_HEADERS });
        clearTimeout(getTimeout);
        if (!getResp.ok) throw new Error(`GET ${tryUrl} status ${getResp.status}`);

        const html = await getResp.text();
        return {
          html,
          url: tryUrl,
          cookieHeader: parseSetCookieToCookieHeader(getResp.headers.get('set-cookie')),
        };
      })());

      let baseResult: IdemaBaseResult | null = null;
      try {
        baseResult = await Promise.any(baseAttempts);
      } catch (err) {
        console.log('All IDEMA base attempts failed:', err);
      }

      if (baseResult) {
        baseHtml = baseResult.html;
        usedUrl = baseResult.url;
        
        // DEBUG: Log all form fields found
        const allFieldNames = extractFormFieldNames(baseHtml);
        console.log('IDEMA form field names:', JSON.stringify(allFieldNames));
        const hiddenFields = extractFormHiddenFields(baseHtml);
        console.log('IDEMA hidden fields:', JSON.stringify(hiddenFields));
        
        // DEBUG: Log all forms found
        const formRegex2 = /<form[^>]*>/gi;
        const forms = baseHtml.match(formRegex2) || [];
        console.log('IDEMA forms found:', JSON.stringify(forms));
        
        // DEBUG: Log select elements
        const selectRegex = /<select[^>]*name=["']([^"']+)["'][^>]*>/gi;
        const selects: string[] = [];
        let selMatch;
        while ((selMatch = selectRegex.exec(baseHtml)) !== null) {
          selects.push(selMatch[1]);
        }
        console.log('IDEMA select fields:', JSON.stringify(selects));
        
        // DEBUG: Log button/submit elements
        const buttonRegex = /<(button|input)[^>]*(?:type=["']submit["']|type=["']button["'])[^>]*>/gi;
        const buttons: string[] = [];
        let btnMatch;
        while ((btnMatch = buttonRegex.exec(baseHtml)) !== null) {
          buttons.push(btnMatch[0].substring(0, 200));
        }
        console.log('IDEMA buttons:', JSON.stringify(buttons));

        actionUrl = getIdemaFormAction(baseHtml, usedUrl);
        console.log('IDEMA action URL resolved:', actionUrl);

        try {
          const payload = buildIdemaFilterPayload(baseHtml, search);
          console.log('IDEMA POST payload:', payload.toString());
          
          const postController = new AbortController();
          const postTimeout = setTimeout(() => postController.abort(), 25000);
          const postResp = await fetch(actionUrl, {
            method: 'POST',
            signal: postController.signal,
            headers: {
              ...FETCH_HEADERS,
              'Content-Type': 'application/x-www-form-urlencoded',
              'Origin': new URL(usedUrl).origin,
              'Referer': usedUrl,
              ...(baseResult.cookieHeader ? { 'Cookie': baseResult.cookieHeader } : {}),
            },
            body: payload.toString(),
          });
          clearTimeout(postTimeout);

          if (!postResp.ok) {
            resultHtml = baseHtml;
            console.log(`IDEMA POST failed (${postResp.status}) for ${actionUrl}, using GET HTML fallback`);
          } else {
            resultHtml = await postResp.text();
            console.log(`IDEMA POST success from ${actionUrl}: ${resultHtml.length} chars`);
            
            // DEBUG: Log table extraction results
            const postTables = extractTableData(resultHtml);
            console.log(`IDEMA POST tables extracted: ${postTables.length} rows`);
            if (postTables.length > 0) {
              console.log('IDEMA first row keys:', JSON.stringify(Object.keys(postTables[0])));
              console.log('IDEMA first row values:', JSON.stringify(postTables[0]));
            } else {
              // Check if there's a table tag at all
              const tableCount = (resultHtml.match(/<table/gi) || []).length;
              console.log(`IDEMA POST HTML has ${tableCount} table tags`);
              // Log a snippet of the HTML around any table
              const tableIdx = resultHtml.indexOf('<table');
              if (tableIdx >= 0) {
                console.log('IDEMA table snippet:', resultHtml.substring(tableIdx, tableIdx + 500));
              }
            }
          }
        } catch (err) {
          console.log('IDEMA POST failed, using GET HTML fallback:', err);
          resultHtml = baseHtml;
        }
      }

      const html = resultHtml || baseHtml;
      if (!html) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Site do IDEMA está inacessível no momento. Tente novamente mais tarde.',
            fallback_url: site.url,
          }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const textContent = extractTextContent(html);
      const links = extractLinks(html, usedUrl || site.url);
      const tableData = selectMostRelevantIdemaTable(extractTableData(html));

      let filteredLinks = links;
      let filteredText = textContent;
      let filteredTable = tableData;

      if (search) {
        const q = search.toLowerCase();
        filteredLinks = links.filter(l => l.text.toLowerCase().includes(q) || l.href.toLowerCase().includes(q));
        filteredTable = tableData.filter(row => Object.values(row).some(v => v.toLowerCase().includes(q)));
        filteredText = textContent.split(/[.!?]+/).filter(s => s.toLowerCase().includes(q)).join('. ').trim();
      }

      const normalizedContent = `${filteredText} ${filteredLinks.map((l) => `${l.text} ${l.href}`).join(' ')}`.toLowerCase();
      const hasRelevantIdemaContent =
        filteredTable.length > 0 ||
        filteredLinks.some((l) => /validar|pdf_licenca|licen/i.test(`${l.text} ${l.href}`)) ||
        /(licen[çc]a|cnpj|empreendimento|processo|validade|emiss[aã]o|tec\/)/i.test(normalizedContent);

      const looksLikeGenericServicesPage =
        filteredTable.length === 0 &&
        /(procedimentos normativos|ascom\/idema|servi[cç]os prestados|área específica)/i.test(normalizedContent);

      if (!hasRelevantIdemaContent || looksLikeGenericServicesPage) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'O portal do IDEMA não retornou resultados válidos no momento.',
            fallback_url: actionUrl || usedUrl || site.url,
            site: { id: site.id, name: site.name, url: site.url },
            meta: {
              action_url: actionUrl || usedUrl || site.url,
              filter_applied: true,
            },
            fetched_at: new Date().toISOString(),
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          site: { id: site.id, name: site.name, url: site.url },
          data: {
            text: filteredText.substring(0, 5000),
            links: filteredLinks.slice(0, 50),
            table: filteredTable.slice(0, 200),
          },
          meta: {
            action_url: actionUrl || usedUrl || site.url,
            filter_applied: true,
          },
          fetched_at: new Date().toISOString(),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ─── Generic fallback ───────────────────────────────────────
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
