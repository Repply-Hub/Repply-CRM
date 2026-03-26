import { Buffer } from "node:buffer";
import pdfParse from "npm:pdf-parse@1.1.1/lib/pdf-parse.js";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const normalizeLicenseType = (value: string) => {
  const text = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (text.includes('licenca previa') || text === 'lp') return 'Licença Prévia';
  if (text.includes('licenca de instalacao') || text === 'li') return 'Licença de Instalação';
  if (text.includes('licenca de operacao') || text === 'lo') return 'Licença de Operação';
  return '';
};

const isRelevantEntry = (entry: Record<string, unknown>) => {
  const tipo = normalizeLicenseType(String(entry.tipo_licenca || ''));
  const hasCoreData = Boolean(
    String(entry.fase_obra || '').trim() ||
    String(entry.nome_contato || '').trim() ||
    String(entry.email || '').trim() ||
    String(entry.construtora || '').trim() ||
    String(entry.razao_social || '').trim() ||
    String(entry.obra_descricao || '').trim() ||
    String(entry.endereco_obra || '').trim()
  );
  return Boolean(tipo && hasCoreData);
};

const sanitizeEntry = (entry: Record<string, unknown>) => ({
  tipo_licenca: normalizeLicenseType(String(entry.tipo_licenca || '')),
  fase_obra: String(entry.fase_obra || '').trim(),
  construtora: String(entry.construtora || '').trim(),
  cnpj: String(entry.cnpj || '').trim(),
  razao_social: String(entry.razao_social || '').trim(),
  nome_contato: String(entry.nome_contato || '').trim(),
  email: String(entry.email || '').trim(),
  telefone: '',
  endereco_obra: String(entry.endereco_obra || '').trim(),
  obra_descricao: String(entry.obra_descricao || '').trim(),
  bloco_texto: String(entry.bloco_texto || '').trim().slice(0, 300),
});

const extractJsonObject = (content: string) => {
  const fencedMatch = content.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) return fencedMatch[1].trim();

  const start = content.indexOf('{');
  if (start === -1) return '';

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < content.length; i++) {
    const char = content[i];
    if (inString) {
      if (escaped) { escaped = false; }
      else if (char === '\\') { escaped = true; }
      else if (char === '"') { inString = false; }
      continue;
    }
    if (char === '"') { inString = true; continue; }
    if (char === '{') depth++;
    if (char === '}') {
      depth--;
      if (depth === 0) return content.slice(start, i + 1);
    }
  }
  return content.slice(start).trim();
};

async function extractTextFromPdf(pdfBuffer: ArrayBuffer): Promise<string> {
  try {
    const buffer = Buffer.from(pdfBuffer);
    const data = await pdfParse(buffer);
    return data.text || '';
  } catch (err) {
    console.error('pdf-parse extraction error:', err);
    return '';
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pdf_url, pdf_date, pdf_numero } = await req.json();

    if (!pdf_url) {
      return new Response(
        JSON.stringify({ success: false, error: 'pdf_url is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'LOVABLE_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching PDF:', pdf_url);

    const pdfResp = await fetch(pdf_url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });

    if (!pdfResp.ok) {
      return new Response(
        JSON.stringify({ success: false, error: `Failed to fetch PDF: ${pdfResp.status}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const pdfBuffer = await pdfResp.arrayBuffer();
    console.log(`PDF fetched, size: ${pdfBuffer.byteLength} bytes`);

    // Extract text using pdf-parse
    const pdfText = await extractTextFromPdf(pdfBuffer);
    console.log(`PDF text extracted, length: ${pdfText.length} chars`);

    if (!pdfText || pdfText.length < 50) {
      console.log('PDF text too short or empty');
      return new Response(
        JSON.stringify({
          success: true,
          entries: [{
            data_edicao: pdf_date || '',
            numero_dom: pdf_numero || '',
            tipo_licenca: '', fase_obra: '', construtora: '', cnpj: '',
            razao_social: '', nome_contato: '', email: '', telefone: '',
            endereco_obra: '', obra_descricao: '',
            bloco_texto: '(Não foi possível extrair texto do PDF)',
          }],
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Truncate for AI context window
    const truncatedText = pdfText.length > 15000
      ? pdfText.slice(0, 15000) + '\n\n[... texto truncado ...]'
      : pdfText;

    const prompt = `Analise o texto abaixo extraído de um Diário Oficial de Natal/RN e extraia APENAS publicações relacionadas aos seguintes tipos de licença ambiental:

- Licença Prévia (LP)
- Licença de Instalação (LI)
- Licença de Operação (LO)

IGNORE completamente qualquer outro conteúdo (extratos de contrato, aditivos, avisos, nomeações, licitações, funcionamento, serviços, compras, decretos, alvarás de funcionamento, licenças de funcionamento, etc.).

Para cada item válido com LP, LI ou LO, extraia:
- tipo_licenca: "Licença Prévia", "Licença de Instalação" ou "Licença de Operação"
- fase_obra: momento/fase da obra
- construtora: construtora ou responsável pela obra
- razao_social: razão social da empresa
- cnpj: CNPJ se houver
- nome_contato: nome do contato/responsável
- email: email se houver
- endereco_obra: endereço da obra
- obra_descricao: descrição da obra
- bloco_texto: trecho resumido do texto fonte (máx 300 chars)

Regras:
1. Não invente dados. Se não encontrar, retorne string vazia.
2. Não retorne itens sem LP, LI ou LO.
3. Se não encontrar nenhuma licença válida, retorne: {"entries": []}
4. Responda APENAS JSON válido, sem markdown.

Formato: {"entries": [...]}

TEXTO DO DIÁRIO OFICIAL:
${truncatedText}`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 4096,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errText);
      return new Response(
        JSON.stringify({ success: false, error: `AI API error: ${aiResponse.status}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || '';
    console.log('AI response length:', content.length);
    console.log('AI response preview:', content.substring(0, 500));

    let entries: any[] = [];
    try {
      const parsedContent = extractJsonObject(content);
      if (parsedContent) {
        const parsed = JSON.parse(parsedContent);
        entries = Array.isArray(parsed.entries) ? parsed.entries : [];
      }
    } catch (parseErr) {
      console.error('Failed to parse AI response:', parseErr);
    }

    const filteredEntries = entries
      .map((entry: any) => sanitizeEntry(entry))
      .filter((entry) => isRelevantEntry(entry));

    const enrichedEntries = filteredEntries.map((entry: any) => ({
      ...entry,
      data_edicao: pdf_date || '',
      numero_dom: pdf_numero || '',
    }));

    if (enrichedEntries.length === 0) {
      enrichedEntries.push({
        data_edicao: pdf_date || '',
        numero_dom: pdf_numero || '',
        tipo_licenca: '', fase_obra: '', construtora: '', cnpj: '',
        razao_social: '', nome_contato: '', email: '', telefone: '',
        endereco_obra: '', obra_descricao: '',
        bloco_texto: '(Nenhuma Licença Prévia, Licença de Instalação ou Licença de Operação identificada neste diário)',
      });
    }

    console.log(`Extracted ${enrichedEntries.length} entries from PDF`);

    return new Response(
      JSON.stringify({ success: true, entries: enrichedEntries }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
