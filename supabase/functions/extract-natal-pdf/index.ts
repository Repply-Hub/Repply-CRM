const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
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
    const prompt = `Analise este PDF do Diário Oficial de Natal/RN e extraia TODAS as licenças, alvarás, autorizações e publicações relacionadas a obras/construções/empreendimentos.

Para CADA licença/publicação encontrada, extraia as seguintes informações:

- tipo_licenca: O tipo (ex: "Licença Prévia", "Licença de Instalação", "Licença de Operação", "Licença Simplificada", "Alvará de Construção", "Alvará de Funcionamento", "Autorização Ambiental", etc.)
- fase_obra: A fase/momento da obra (ex: "Planejamento", "Instalação", "Construção", "Operação", "Reforma", "Ampliação", "Demolição")
- construtora: Nome da construtora/incorporadora/empresa responsável
- cnpj: CNPJ da empresa (formato XX.XXX.XXX/XXXX-XX)
- razao_social: Razão social da empresa
- nome_contato: Nome do responsável/requerente/proprietário
- email: Email de contato encontrado
- telefone: Telefone de contato encontrado
- endereco_obra: Endereço/localização da obra
- obra_descricao: Descrição da obra/empreendimento
- bloco_texto: Trecho resumido do texto relevante (max 300 caracteres)

Responda APENAS com um JSON válido no formato:
{"entries": [{"tipo_licenca": "...", "fase_obra": "...", "construtora": "...", "cnpj": "...", "razao_social": "...", "nome_contato": "...", "email": "...", "telefone": "...", "endereco_obra": "...", "obra_descricao": "...", "bloco_texto": "..."}]}

Se não encontrar nenhuma licença/obra relevante, retorne: {"entries": []}
Extraia o máximo de informações possível. Deixe campos vazios ("") quando não disponível.`;

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
        temperature: 0.1,
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
      const jsonMatch = content.match(/\{[\s\S]*"entries"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        entries = parsed.entries || [];
      }
    } catch (parseErr) {
      console.error('Failed to parse AI response:', parseErr);
      console.log('Raw content:', content.substring(0, 500));
    }

    // Add metadata to each entry
    const enrichedEntries = entries.map((entry: any) => ({
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
        telefone: '',
        endereco_obra: '',
        obra_descricao: '',
        bloco_texto: '(Nenhuma licença/obra identificada neste diário)',
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
