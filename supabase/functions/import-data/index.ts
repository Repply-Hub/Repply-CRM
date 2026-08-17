// DEPRECATED/ÓRFÃ: esta function não está integrada ao fluxo padrão da UI (ver
// IMPORT_STRUCTURE.md, seção 10) e nada em src/ a invoca. O pipeline real de import
// (usado por ImportDataDialog, ImportPedidosDialog e ImportClientesDialog) faz o
// parsing de datas de forma 100% determinística — sem IA — em `sanitizeFieldValue`
// (src/components/import/MappingStep.tsx), incluindo a regra de desambiguação BR-first
// para datas tipo "05/03/2024". Essa function usa o Gemini para converter datas para
// ISO 8601 sem essa mesma regra explícita; se algum dia for integrada, alinhar a
// desambiguação com `sanitizeFieldValue` antes.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CLIENTES_SCHEMA = `{
  "empresa": "string | null — razão social ou nome fantasia da empresa",
  "razao_social": "string | null — razão social formal",
  "cnpj": "string | null — CNPJ apenas dígitos, sem formatação",
  "tipo": "string — obrigatório, ex: 'construtora', 'incorporadora', 'cliente'",
  "nome_contato": "string | null — nome do contato principal",
  "telefone": "string | null — telefone normalizado: apenas dígitos com DDD, ex: '84999998888'",
  "email": "string | null — e-mail em minúsculas",
  "classificacao": "string | null — classificação ou categoria do cliente",
  "logradouro": "string | null",
  "numero": "string | null",
  "complemento": "string | null",
  "bairro": "string | null",
  "cidade": "string | null",
  "uf": "string | null — sigla do estado em maiúsculas, ex: 'RN'",
  "cep": "string | null — apenas dígitos",
  "endereco": "string | null — endereço completo se não houver campos separados",
  "data_criacao": "string | null — data ISO 8601, ex: '2024-01-15'",
  "campos_extras": "object — campos que não se encaixam nos anteriores, padrão {}"
}`;

const NEGOCIOS_SCHEMA = `{
  "status": "string — status do negócio, ex: 'novo_lead', 'em_negociacao', 'fechado', 'perdido'",
  "data_pedido": "string | null — data ISO 8601, ex: '2024-01-15'",
  "prazo_resposta": "string | null — data ISO 8601 do prazo",
  "valor_total": "number | null — valor numérico sem símbolo de moeda",
  "observacoes": "string | null — observações gerais",
  "origem_lead": "string | null — fonte de origem do lead, ex: 'indicacao', 'site', 'telefone'",
  "endereco_entrega": "string | null — endereço de entrega",
  "campos_extras": "object — campos que não se encaixam nos anteriores, padrão {}"
}`;

function buildPrompt(fileContent: string, importType: 'clientes' | 'negocios'): string {
  const schema = importType === 'clientes' ? CLIENTES_SCHEMA : NEGOCIOS_SCHEMA;
  const tableName = importType === 'clientes' ? 'clientes' : 'pedidos (negocios)';

  return `Você é um especialista em migração de dados. Analise o conteúdo abaixo e mapeie cada registro para o schema da tabela "${tableName}".

REGRAS OBRIGATÓRIAS:
1. Retorne APENAS um JSON array válido, sem texto antes ou depois, sem markdown, sem explicações.
2. Telefones: normalize para apenas dígitos com DDD (2 dígitos) + número. Ex: "(84) 9 9999-8888" → "84999998888".
3. Datas: converta para ISO 8601 (YYYY-MM-DD). Ex: "15/01/2024" → "2024-01-15". Use null se não reconhecer.
4. Campos ausentes ou vazios: use null (não use string vazia "").
5. UF: sempre sigla em maiúsculas (2 letras).
6. CNPJ/CPF: apenas dígitos, sem pontos, barras ou hífens.
7. Valores monetários: apenas número (ex: "R$ 1.500,00" → 1500.00).
8. "campos_extras" deve ser um objeto JSON com campos que não se encaixam no schema; use {} se não houver.
9. Não invente dados. Se um campo não existir na fonte, use null.
10. A primeira linha do conteúdo é o cabeçalho (header) — não a trate como um registro.

SCHEMA ALVO:
${schema}

CONTEÚDO A IMPORTAR (lote):
${fileContent}

Retorne APENAS o JSON array:`;
}

function extractJsonArray(text: string): unknown[] {
  const trimmed = text.trim();
  if (trimmed.startsWith('[')) {
    return JSON.parse(trimmed);
  }

  const match = trimmed.match(/\[[\s\S]*\]/);
  if (match) {
    return JSON.parse(match[0]);
  }

  throw new Error('Não foi possível extrair um JSON array da resposta da IA');
}

function splitIntoChunks(fileContent: string, linesPerChunk: number): string[] {
  const lines = fileContent.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length <= 1) return [fileContent];

  const header = lines[0];
  const dataLines = lines.slice(1);
  const chunks: string[] = [];

  for (let i = 0; i < dataLines.length; i += linesPerChunk) {
    const chunkLines = dataLines.slice(i, i + linesPerChunk);
    chunks.push([header, ...chunkLines].join('\n'));
  }

  console.log(`[import-data] arquivo dividido em ${chunks.length} lote(s) de até ${linesPerChunk} linhas (total ${dataLines.length} linhas de dados)`);

  return chunks;
}

async function callGemini(geminiKey: string, prompt: string, timeoutMs: number): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    },
  );

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errBody}`);
  }

  const data = await res.json() as {
    candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
  };

  return data.candidates[0]?.content?.parts[0]?.text ?? '';
}

async function processChunksWithConcurrency(
  chunks: string[],
  importType: 'clientes' | 'negocios',
  geminiKey: string,
  concurrency: number,
  timeoutMs: number,
): Promise<{ records: unknown[]; errors: string[] }> {
  const records: unknown[] = [];
  const errors: string[] = [];
  let cursor = 0;

  async function worker() {
    while (cursor < chunks.length) {
      const current = cursor++;
      const chunk = chunks[current];
      const chunkStart = Date.now();
      try {
        const prompt = buildPrompt(chunk, importType);
        const rawText = await callGemini(geminiKey, prompt, timeoutMs);
        const parsed = extractJsonArray(rawText);
        records.push(...parsed);
        console.log(`[import-data] lote ${current + 1}/${chunks.length} OK em ${Date.now() - chunkStart}ms — ${parsed.length} registros`);
      } catch (err) {
        const msg = (err as Error).message;
        console.error(`[import-data] lote ${current + 1}/${chunks.length} FALHOU em ${Date.now() - chunkStart}ms:`, msg);
        errors.push(`Lote ${current + 1}/${chunks.length}: ${msg}`);
      }
    }
  }

  const workerCount = Math.min(concurrency, chunks.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return { records, errors };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestStart = Date.now();

  try {
    let body: { fileContent: string; importType: 'clientes' | 'negocios'; empresaId: string };
    try {
      body = await req.json();
    } catch (parseErr) {
      console.error('[import-data] erro ao parsear request body:', parseErr);
      return new Response(
        JSON.stringify({ success: false, error: 'Erro ao ler o corpo da requisição: ' + (parseErr as Error).message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { fileContent, importType, empresaId } = body;

    if (!fileContent || !importType || !empresaId) {
      return new Response(
        JSON.stringify({ error: 'Campos obrigatórios: fileContent, importType, empresaId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (importType !== 'clientes' && importType !== 'negocios') {
      return new Response(
        JSON.stringify({ error: 'importType deve ser "clientes" ou "negocios"' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`[import-data] início — importType=${importType}, empresaId=${empresaId}, tamanho do conteúdo=${fileContent.length} bytes`);

    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) throw new Error('GEMINI_API_KEY não configurada');

    const LINES_PER_CHUNK = 60;
    const CONCURRENCY = 4;
    const CHUNK_TIMEOUT_MS = 45_000;

    const chunks = splitIntoChunks(fileContent, LINES_PER_CHUNK);

    const { records, errors } = await processChunksWithConcurrency(
      chunks,
      importType,
      geminiKey,
      CONCURRENCY,
      CHUNK_TIMEOUT_MS,
    );

    console.log(`[import-data] processamento de lotes concluído em ${Date.now() - requestStart}ms — records=${records.length}, errors=${errors.length}`);

    if (records.length === 0) {
      return new Response(
        JSON.stringify({
          success: errors.length === 0,
          inserted: 0,
          total: 0,
          errors: errors.length > 0 ? errors : undefined,
        }),
        { status: errors.length > 0 ? 500 : 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const tableName = importType === 'clientes' ? 'clientes' : 'pedidos';
    const enriched = (records as Record<string, unknown>[]).map((row) => ({
      ...row,
      empresa_id: empresaId,
    }));

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) throw new Error('Variáveis SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configuradas');

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const INSERT_BATCH_SIZE = 500;
    let totalInserted = 0;
    const insertErrors: string[] = [];

    for (let i = 0; i < enriched.length; i += INSERT_BATCH_SIZE) {
      const batch = enriched.slice(i, i + INSERT_BATCH_SIZE);
      const insertStart = Date.now();
      const { error: insertError, count } = await supabase
        .from(tableName)
        .insert(batch, { count: 'exact' });

      if (insertError) {
        console.error(`[import-data] insert falhou (registros ${i + 1}-${i + batch.length}) em ${Date.now() - insertStart}ms:`, insertError.message);
        insertErrors.push(`Inserção (registros ${i + 1}-${i + batch.length}): ${insertError.message}`);
      } else {
        console.log(`[import-data] insert OK (registros ${i + 1}-${i + batch.length}) em ${Date.now() - insertStart}ms`);
        totalInserted += count ?? batch.length;
      }
    }

    const allErrors = [...errors, ...insertErrors];

    console.log(`[import-data] finalizado em ${Date.now() - requestStart}ms — inserted=${totalInserted}/${enriched.length}`);

    return new Response(
      JSON.stringify({
        success: insertErrors.length === 0,
        inserted: totalInserted,
        total: enriched.length,
        errors: allErrors.length > 0 ? allErrors : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[import-data] erro fatal:', (err as Error).message);
    console.error('[import-data] stack:', (err as Error).stack);
    console.error(`[import-data] tempo até falha: ${Date.now() - requestStart}ms`);
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
