import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Buffer } from 'node:buffer';
import pdfParse from 'npm:pdf-parse@1.1.1/lib/pdf-parse.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Padrões de licença — sem \bLP\b isolado para evitar falsos positivos
const PADRAO_LP = /Licen[çc]a\s+Pr[ée]via(\s*[-–]?\s*LP)?/i;
const PADRAO_LI = /Licen[çc]a\s+de\s+Instala[çc][ãa]o(\s*[-–]?\s*LI)?/i;
const PADRAO_LO = /Licen[çc]a\s+(Ambiental\s+)?de\s+Opera[çc][ãa]o(\s*[-–]?\s*LO)?/i;
const PADRAO_PROCESSO = /Processo\s*n?[ºo°]?\.?\s*[:\-]?\s*([A-Z]{2,10}[-.]?\d{6,20})/i;
const PADRAO_CNPJ = /\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2}/g;
const PADRAO_EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

function detectTipo(texto: string): string {
  if (PADRAO_LP.test(texto)) return 'Licença Prévia';
  if (PADRAO_LI.test(texto)) return 'Licença de Instalação';
  if (PADRAO_LO.test(texto)) return 'Licença de Operação';
  return '';
}

function extrairLicencas(texto: string, dataEdicao: string, numeroDOM: string, pdfLink: string, pdfNome: string) {
  // Divide em blocos por parágrafo duplo
  const blocos = texto.split(/\n\s*\n/);
  const achados: Record<string, string>[] = [];

  for (const bloco of blocos) {
    const limpo = bloco.trim();
    if (!limpo) continue;

    const tipo = detectTipo(limpo);
    if (!tipo) continue;

    const processoMatch = PADRAO_PROCESSO.exec(limpo);
    const cnpjMatches = limpo.match(PADRAO_CNPJ);
    const emailMatch = PADRAO_EMAIL.exec(limpo);

    achados.push({
      data_edicao: dataEdicao,
      numero_dom: numeroDOM,
      tipo_licenca: tipo,
      processo: processoMatch?.[1] ?? '',
      cnpj: cnpjMatches?.[0]?.replace(/\s/g, '') ?? '',
      razao_social: '',
      email: emailMatch?.[0] ?? '',
      obra_descricao: '',
      pdf_nome: pdfNome,
      pdf_link: pdfLink,
      bloco_texto: limpo.slice(0, 300),
    });
  }

  return achados;
}

async function extractTextFromPdf(buffer: ArrayBuffer): Promise<string> {
  try {
    const data = await pdfParse(Buffer.from(buffer));
    return data.text ?? '';
  } catch {
    return '';
  }
}

interface PdfEntry {
  href: string;
  date: string;
  numero: string;
}

async function listarPDFs(mes: string, ano: string): Promise<PdfEntry[]> {
  // API JSON: GET /api/dom/data/{mes}/{ano}
  // Resposta: { "data": [["<a href='URL_PDF'> Ano X - Num. NNN - DD/MM/YYYY</a>"], ...] }
  const resp = await fetch(`https://www.natal.rn.gov.br/api/dom/data/${mes}/${ano}`, {
    headers: {
      'Accept': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': 'https://www.natal.rn.gov.br/dom',
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  if (!resp.ok) return [];

  const json = await resp.json() as { data?: string[][] };
  const rows = json?.data ?? [];

  const entries: PdfEntry[] = [];
  // href usa aspas simples: href='URL'
  const hrefRegex = /href='([^']+\.pdf)'/i;
  const dateRegex = /(\d{2}\/\d{2}\/\d{4})/;
  const numRegex = /Num\.\s*(\d+)/i;

  for (const row of rows) {
    const cell = row[0] ?? '';
    const hrefMatch = hrefRegex.exec(cell);
    if (!hrefMatch) continue;
    const href = hrefMatch[1];
    if (entries.some(e => e.href === href)) continue;
    entries.push({
      href,
      date: dateRegex.exec(cell)?.[1] ?? '',
      numero: numRegex.exec(cell)?.[1] ?? '',
    });
  }
  return entries;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const body = await req.json().catch(() => ({}));
    const now = new Date();

    // Aceita mes_inicio/mes_fim no formato "YYYY-MM" (ignora o dia)
    const parseYearMonth = (s: string): { year: number; month: number } => {
      const [y, m] = s.split('-').map(Number);
      return { year: y, month: m - 1 }; // month é 0-indexed
    };

    const inicio = body.mes_inicio
      ? parseYearMonth(body.mes_inicio)
      : { year: now.getFullYear(), month: now.getMonth() - 1 };
    const fim = body.mes_fim
      ? parseYearMonth(body.mes_fim)
      : { year: now.getFullYear(), month: now.getMonth() };

    // Gera lista de meses a varrer
    const meses: { mes: string; ano: string }[] = [];
    const cursor = new Date(inicio.year, inicio.month, 1);
    const fimDate = new Date(fim.year, fim.month, 1);
    while (cursor <= fimDate) {
      meses.push({
        mes: String(cursor.getMonth() + 1).padStart(2, '0'),
        ano: String(cursor.getFullYear()),
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }

    console.log(`[scrape-dom-natal] Varrendo ${meses.length} mês(es)`);

    // Coleta todos os PDFs dos meses
    const todosPDFs: PdfEntry[] = [];
    for (const { mes, ano } of meses) {
      const lista = await listarPDFs(mes, ano);
      for (const p of lista) {
        if (!todosPDFs.some(e => e.href === p.href)) todosPDFs.push(p);
      }
    }

    console.log(`[scrape-dom-natal] ${todosPDFs.length} PDFs encontrados`);

    if (todosPDFs.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'Nenhum PDF encontrado no período', processados: 0, inseridos: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Filtra PDFs já processados (qualquer registro com esse pdf_link)
    const { data: existentes } = await supabase
      .from('licencas_natal')
      .select('pdf_link');
    const linksExistentes = new Set((existentes ?? []).map(r => r.pdf_link).filter(Boolean));

    const novos = todosPDFs.filter(p => !linksExistentes.has(p.href));
    console.log(`[scrape-dom-natal] ${novos.length} PDFs novos para processar`);

    if (novos.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'Banco já atualizado', processados: 0, inseridos: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let processados = 0;
    let inseridos = 0;

    // Processa em lotes de no máximo 10 PDFs por execução
    const lote = novos.slice(0, 10);

    for (const pdf of lote) {
      processados++;
      const pdfNome = pdf.href.split('/').pop() ?? '';

      try {
        console.log(`[scrape-dom-natal] Baixando ${pdfNome}`);
        const pdfResp = await fetch(pdf.href, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DOMNatalBot/1.0)' },
          signal: AbortSignal.timeout(30_000),
        });
        if (!pdfResp.ok) {
          console.warn(`PDF inacessível: ${pdf.href} (${pdfResp.status})`);
          continue;
        }

        const buffer = await pdfResp.arrayBuffer();
        const texto = await extractTextFromPdf(buffer);

        if (!texto || texto.length < 50) {
          // Registra placeholder para não reprocessar
          await supabase.from('licencas_natal').insert({
            data_edicao: pdf.date,
            numero_dom: pdf.numero,
            pdf_nome: pdfNome,
            pdf_link: pdf.href,
            bloco_texto: '(Não foi possível extrair texto do PDF)',
          });
          inseridos++;
          continue;
        }

        const achados = extrairLicencas(texto, pdf.date, pdf.numero, pdf.href, pdfNome);

        if (achados.length === 0) {
          await supabase.from('licencas_natal').insert({
            data_edicao: pdf.date,
            numero_dom: pdf.numero,
            pdf_nome: pdfNome,
            pdf_link: pdf.href,
            bloco_texto: '(Nenhuma Licença Prévia, Licença de Instalação ou Licença de Operação identificada neste diário)',
          });
          inseridos++;
        } else {
          for (const achado of achados) {
            await supabase.from('licencas_natal').insert(achado);
            inseridos++;
          }
          console.log(`  → ${achados.length} licença(s) em ${pdfNome}`);
        }
      } catch (err) {
        console.error(`Erro ao processar ${pdf.href}:`, err);
      }
    }

    const restantes = novos.length - lote.length;
    return new Response(
      JSON.stringify({
        success: true,
        processados,
        inseridos,
        restantes,
        message: restantes > 0
          ? `${inseridos} registros importados de ${processados} PDFs. ${restantes} PDFs restantes — execute novamente para continuar.`
          : `${inseridos} registros importados de ${processados} PDFs.`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('[scrape-dom-natal] Erro fatal:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
