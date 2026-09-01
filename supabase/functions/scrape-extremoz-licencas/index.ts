import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Buffer } from 'node:buffer';
import pdfParse from 'npm:pdf-parse@1.1.1/lib/pdf-parse.js';
import { extrairPublicacoesDeLicenca, parseDataEdicao } from './licencas.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BASE_URL = 'https://extremoz.rn.gov.br';
const STORAGE_BUCKET = 'extremoz-dom';

// User-Agent de navegador. Mesmo cuidado dos outros scrapers: um UA não-navegador é o
// primeiro a ser bloqueado no dia em que o portal ganhar um WAF. Medido em 01/09/2026
// (Fase 0): o servidor de Extremoz respondeu 200 para a Edge Function com este UA, tanto
// na listagem quanto no PDF — NÃO há bloqueio de IP de datacenter.
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Teto de PDFs processados por execução.
//
// 🔴 BAIXO DE PROPÓSITO. `pdf-parse` (pdf.js) é guloso de memória: cada diário (~1 MB,
// municipal, várias páginas) chega a 30-60 MB de heap durante o parse, e o worker da
// Edge Function tem teto apertado. Lote de 25 estourou com WORKER_RESOURCE_LIMIT na
// primeira execução (01/09/2026). 3 por vez roda folgado; o cron é DIÁRIO (ver
// 20260901160100) e o diário de Extremoz sai ~5x/semana, então 3/dia (21/semana)
// acompanha de sobra. No backfill, `parcial: true` no retorno pede outra chamada:
//   select public.chamar_edge_function('scrape-extremoz-licencas', '{}'::jsonb, 300000, true);
const MAX_PDF_POR_EXECUCAO = 3;

// PDF acima disto não é processado (vira placeholder para não voltar toda semana). Um
// diário municipal raramente passa de 2-3 MB; 12 MB é folga. Sem esse corte, um anexo
// escaneado gigante derruba o worker inteiro (OOM) e leva os outros 4 PDFs junto.
const MAX_PDF_BYTES = 12 * 1024 * 1024;

// Pausa entre downloads de PDF. Extremoz é WordPress atrás de nginx; não se sabe o quão
// sensível é a rajada. 1,5 s é o valor que o scraper Python do DOM Natal usava e que
// nunca deu erro de conexão.
const PAUSA_ENTRE_DOWNLOADS_MS = 1500;

// Quantas páginas da listagem paginada varrer por ano. A listagem mostra ~10 edições por
// página; 30 páginas cobrem um ano inteiro (~250 edições) com folga.
const MAX_PAGINAS_LISTAGEM = 30;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const RE_PDF_HREF =
  /href=["'](https?:\/\/extremoz\.rn\.gov\.br\/wp-content\/uploads\/[^"']+?\.(?:pdf|doc\.pdf))["']/gi;
const RE_ANO_MES_NA_URL = /\/uploads\/(\d{4})\/(\d{2})\//;

interface Edicao {
  url: string;
  dataIso: string | null; // AAAA-MM-DD, deduzida do nome do arquivo
  arquivo: string;
  ano: string;
  mes: string; // '01'..'12' ou 'sem-mes'
}

function papelDoToken(token: string): string {
  try {
    const payload = token.split('.')[1];
    if (!payload) return '';
    const norm = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(atob(norm.padEnd(Math.ceil(norm.length / 4) * 4, '=')));
    return typeof json?.role === 'string' ? json.role : '';
  } catch {
    return '';
  }
}

async function sha256Hex(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Anos a varrer: o corrente, e o anterior também quando estamos no comecinho de janeiro
 *  (senão as edições de dezembro ficariam órfãs até o próximo ano). Fuso de Brasília. */
function anosDaJanela(): string[] {
  const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const anos = [String(agora.getFullYear())];
  if (agora.getMonth() === 0 && agora.getDate() <= 15) {
    anos.push(String(agora.getFullYear() - 1));
  }
  return anos;
}

/**
 * Percorre a listagem paginada de um ano e ACRESCENTA em `novasAcc` só as edições que
 * ainda não estão na tabela. Para de paginar assim que `novasAcc` chega em `alvo` — em
 * regime permanente as edições novas estão na página 1, então isso lê 1-2 páginas em vez
 * de 25. Só o backfill (poucas linhas na tabela) pagina fundo.
 */
async function coletarNovasDoAno(
  ano: string,
  linksExistentes: Set<string>,
  novasAcc: Edicao[],
  alvo: number,
): Promise<void> {
  const vistos = new Set<string>();

  for (let pagina = 1; pagina <= MAX_PAGINAS_LISTAGEM; pagina++) {
    if (novasAcc.length >= alvo) return;

    const url =
      pagina === 1
        ? `${BASE_URL}/diario-oficial/diario-oficial-${ano}/`
        : `${BASE_URL}/diario-oficial/diario-oficial-${ano}/page/${pagina}/`;

    let html = '';
    try {
      const resp = await fetch(url, {
        headers: {
          'User-Agent': BROWSER_UA,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
        },
        signal: AbortSignal.timeout(30_000),
      });
      if (!resp.ok) break; // 404 = passou da última página
      html = await resp.text();
    } catch {
      break;
    }

    let achouNesta = 0;
    for (const m of html.matchAll(RE_PDF_HREF)) {
      const pdfUrl = m[1];
      if (vistos.has(pdfUrl)) continue;
      vistos.add(pdfUrl);
      achouNesta++;

      if (linksExistentes.has(pdfUrl)) continue;
      if (novasAcc.some((e) => e.url === pdfUrl)) continue;

      const arquivo = pdfUrl.split('/').pop() ?? `${ano}-edicao.pdf`;
      const am = RE_ANO_MES_NA_URL.exec(pdfUrl);
      novasAcc.push({
        url: pdfUrl,
        dataIso: parseDataEdicao(pdfUrl),
        arquivo,
        ano: am?.[1] ?? ano,
        mes: am?.[2] ?? 'sem-mes',
      });
      if (novasAcc.length >= alvo) return;
    }

    // Sem link nenhum E sem link para a próxima página → acabou o ano.
    if (achouNesta === 0 && !html.includes(`/page/${pagina + 1}/`)) break;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const authHeader = req.headers.get('Authorization') ?? '';
    const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();

    // Dois caminhos, igual scrape-dom-natal-licencas / scrape-licencas-idema:
    //  • pg_cron -> Bearer <service_role JWT> montado por chamar_edge_function. Confiável.
    //  • Portal  -> Bearer <JWT do usuário>. Exige a seção 'portal'.
    const isServiceCall =
      papelDoToken(bearer) === 'service_role' ||
      (serviceKey.length > 0 && bearer.length > 0 && bearer === serviceKey);

    if (!isServiceCall) {
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: 'Sessão não identificada. Entre novamente no sistema.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: temPortal, error: erroSecao } = await userClient.rpc('empresa_tem_secao', {
        p_secao: 'portal',
      });
      if (erroSecao || temPortal !== true) {
        return new Response(
          JSON.stringify({ error: 'Sua empresa não tem acesso ao Portal de Consultas' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey);

    // Permite forçar um ano específico pelo corpo (backfill); senão usa a janela padrão.
    let anos = anosDaJanela();
    try {
      const body = await req.json();
      if (typeof body?.ano === 'string' && /^\d{4}$/.test(body.ano)) anos = [body.ano];
      if (Array.isArray(body?.anos) && body.anos.every((a: unknown) => /^\d{4}$/.test(String(a)))) {
        anos = body.anos.map(String);
      }
    } catch {
      // corpo vazio ou não-JSON — usa a janela padrão
    }

    // 1. O que já está na tabela (dedupe por pdf_link, antes de baixar qualquer coisa).
    const { data: jaTem } = await supabase.from('licencas_extremoz').select('pdf_link');
    const linksExistentes = new Set((jaTem ?? []).map((r) => r.pdf_link).filter(Boolean));

    // 2. Descobre APENAS o próximo lote de edições novas. Para de paginar ao encher o lote.
    const novas: Edicao[] = [];
    for (const ano of anos) {
      if (novas.length >= MAX_PDF_POR_EXECUCAO) break;
      await coletarNovasDoAno(ano, linksExistentes, novas, MAX_PDF_POR_EXECUCAO);
    }

    if (novas.length === 0) {
      return new Response(
        JSON.stringify({ success: true, novas: 0, processados: 0, inseridos: 0, restantes: 0, parcial: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const lote = novas.slice(0, MAX_PDF_POR_EXECUCAO);
    let processados = 0;
    let inseridos = 0;

    for (const edicao of lote) {
      if (processados > 0) await sleep(PAUSA_ENTRE_DOWNLOADS_MS);
      processados++;
      const storagePath = `${edicao.ano}/${edicao.mes}/${edicao.arquivo}`;

      try {
        const pdfResp = await fetch(edicao.url, {
          headers: { 'User-Agent': BROWSER_UA },
          signal: AbortSignal.timeout(45_000),
        });
        if (!pdfResp.ok) continue;
        let bytes: Uint8Array | null = new Uint8Array(await pdfResp.arrayBuffer());

        // Arquiva o PDF no balde privado. Erro de "já existe" não interrompe.
        const up = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(storagePath, bytes, { contentType: 'application/pdf', upsert: false });
        const storagePathGravado = up.error ? null : storagePath;

        // PDF grande demais: arquiva no Storage, mas não tenta ler (derrubaria o worker).
        // Placeholder idempotente para não voltar toda semana.
        if (bytes.byteLength > MAX_PDF_BYTES) {
          const mb = (bytes.byteLength / 1024 / 1024).toFixed(1);
          bytes = null;
          const marcador = `(PDF de ${mb} MB — grande demais para processar no servidor)`;
          await supabase.from('licencas_extremoz').upsert(
            {
              data_edicao: edicao.dataIso,
              pdf_nome: edicao.arquivo,
              pdf_link: edicao.url,
              pdf_storage_path: storagePathGravado,
              bloco_texto: marcador,
              bloco_texto_hash: await sha256Hex(`${marcador}#${edicao.url}`),
            },
            { onConflict: 'bloco_texto_hash', ignoreDuplicates: true },
          );
          continue;
        }

        let texto = '';
        try {
          texto = (await pdfParse(Buffer.from(bytes)))?.text ?? '';
        } catch {
          texto = '';
        }
        bytes = null; // libera o buffer antes de seguir para o próximo PDF

        const publicacoes = texto.length >= 200 ? extrairPublicacoesDeLicenca(texto) : [];

        if (publicacoes.length === 0) {
          // Placeholder por edição: marca que o PDF já foi lido e não achou LP/LI/LO.
          // Não aparece na tela (Portal.tsx filtra por tipo). Hash determinístico pela
          // URL para o registro ser idempotente entre execuções.
          const marcador = '(Nenhuma LP/LI/LO identificada nesta edição)';
          await supabase.from('licencas_extremoz').upsert(
            {
              data_edicao: edicao.dataIso,
              pdf_nome: edicao.arquivo,
              pdf_link: edicao.url,
              pdf_storage_path: storagePathGravado,
              bloco_texto: marcador,
              bloco_texto_hash: await sha256Hex(`${marcador}#${edicao.url}`),
            },
            { onConflict: 'bloco_texto_hash', ignoreDuplicates: true },
          );
          continue;
        }

        for (const pub of publicacoes) {
          const { error } = await supabase.from('licencas_extremoz').upsert(
            {
              data_edicao: edicao.dataIso,
              tipo_licenca: pub.tipo,
              prioridade: pub.prioridade, // 🔴 coluna "prioridade" = FASE DA OBRA (nome engana)
              cnpj: pub.cnpj,
              razao_social: pub.razaoSocial,
              nome_fantasia: pub.nomeFantasia,
              telefone: pub.telefone,
              email: pub.email,
              endereco_empresa: pub.enderecoEmpresa,
              quadro_societario: pub.quadroSocietario,
              obra_descricao: pub.obraDescricao,
              pdf_nome: edicao.arquivo,
              pdf_link: edicao.url,
              pdf_storage_path: storagePathGravado,
              bloco_texto: pub.texto,
              bloco_texto_hash: await sha256Hex(pub.texto),
            },
            { onConflict: 'bloco_texto_hash', ignoreDuplicates: true },
          );
          if (!error) inseridos++;
        }
      } catch {
        // Falha de um PDF não derruba os outros.
        continue;
      }
    }

    // A descoberta para ao encher o lote, então `restantes` só sinaliza "pode haver mais,
    // rode de novo" — não é a contagem exata do que falta.
    const parcial = novas.length >= MAX_PDF_POR_EXECUCAO;
    return new Response(
      JSON.stringify({
        success: true,
        novas: novas.length,
        processados,
        inseridos,
        restantes: parcial ? MAX_PDF_POR_EXECUCAO : 0,
        parcial,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
