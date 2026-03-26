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
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') depth++;
    if (char === '}') {
      depth--;
      if (depth === 0) return content.slice(start, i + 1);
    }
  }

  return content.slice(start).trim();
};

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

    // Fetch the PDF
    const pdfResp = await fetch(pdf_url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!pdfResp.ok) {
      return new Response(
        JSON.stringify({ success: false, error: `Failed to fetch PDF: ${pdfResp.status}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const pdfBuffer = await pdfResp.arrayBuffer();
    const base64Pdf = btoa(
      new Uint8Array(pdfBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    );

    console.log(`PDF fetched, size: ${pdfBuffer.byteLength} bytes`);

    // If PDF is too large (>5MB), skip AI processing
    if (pdfBuffer.byteLength > 5 * 1024 * 1024) {
      return new Response(
        JSON.stringify({
          success: true,
          entries: [{
            data_edicao: pdf_date || '',
            numero_dom: pdf_numero || '',
            tipo_licenca: '',
            fase_obra: '',
            construtora: '',
            cnpj: '',
            razao_social: '',
            nome_contato: '',
            email: '',
            telefone: '',
            endereco_obra: '',
            obra_descricao: '',
            bloco_texto: '(PDF muito grande para processamento)',
          }],
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Call Gemini with the PDF for structured extraction
    const prompt = `Analise este PDF do Diário Oficial de Natal/RN e extraia APENAS publicações de obras relacionadas aos seguintes tipos de licença:

- Licença Prévia
- Licença de Instalação
- Licença de Operação

IGNORE completamente qualquer outro conteúdo, como extratos de contrato, aditivos, avisos, nomeações, licitações, funcionamento, serviços, compras, decretos ou publicações sem uma dessas três licenças.

Para cada item válido, extraia SOMENTE estes campos:
- tipo_licenca: deve ser exatamente "Licença Prévia", "Licença de Instalação" ou "Licença de Operação"
- fase_obra: momento da obra
- construtora: de quem é a construtora / de quem é a obra
- razao_social: razão social da empresa, se houver
- cnpj: CNPJ se houver
- nome_contato: nome do contato/responsável
- email: email do contato
- endereco_obra: endereço da obra, se houver
- obra_descricao: descrição objetiva da obra
- bloco_texto: trecho resumido do texto fonte com no máximo 300 caracteres

Regras obrigatórias:
1. Não invente dados.
2. Não retorne itens sem um dos 3 tipos de licença permitidos.
3. Se o texto citar construção/obra mas sem LP/LI/LO explícita, ignore.
4. Se não houver email, retorne string vazia.
5. Responda APENAS JSON válido, sem markdown.

Formato exato de resposta:
{"entries": [{"tipo_licenca": "Licença Prévia", "fase_obra": "", "construtora": "", "cnpj": "", "razao_social": "", "nome_contato": "", "email": "", "endereco_obra": "", "obra_descricao": "", "bloco_texto": ""}]}

Se não encontrar nenhuma publicação válida, retorne exatamente: {"entries": []}`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:application/pdf;base64,${base64Pdf}`,
                },
              },
            ],
          },
        ],
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

    // Parse JSON from AI response
    let entries: any[] = [];
    try {
      // Extract JSON from response (may be wrapped in ```json blocks)
      const parsedContent = extractJsonObject(content);
      if (parsedContent) {
        const parsed = JSON.parse(parsedContent);
        entries = Array.isArray(parsed.entries) ? parsed.entries : [];
      }
    } catch (parseErr) {
      console.error('Failed to parse AI response:', parseErr);
      console.log('Raw content:', content.substring(0, 500));
    }

    const filteredEntries = entries
      .map((entry: any) => sanitizeEntry(entry))
      .filter((entry) => isRelevantEntry(entry));

    // Add metadata to each entry
    const enrichedEntries = filteredEntries.map((entry: any) => ({
      ...entry,
      data_edicao: pdf_date || '',
      numero_dom: pdf_numero || '',
    }));

    // If no entries found, still return one entry so we don't reprocess
    if (enrichedEntries.length === 0) {
      enrichedEntries.push({
        data_edicao: pdf_date || '',
        numero_dom: pdf_numero || '',
        tipo_licenca: '',
        fase_obra: '',
        construtora: '',
        cnpj: '',
        razao_social: '',
        nome_contato: '',
        email: '',
        endereco_obra: '',
        obra_descricao: '',
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
