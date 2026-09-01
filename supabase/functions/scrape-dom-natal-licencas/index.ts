import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Buffer } from 'node:buffer';
import pdfParse from 'npm:pdf-parse@1.1.1/lib/pdf-parse.js';
import { extrairPublicacoesDeLicenca } from './licencas.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BASE_URL = 'https://www.natal.rn.gov.br';
const STORAGE_BUCKET = 'dom-natal';

// User-Agent de navegador. Mesmo cuidado do scrape-licencas-idema: um UA não-navegador é
// o primeiro a ser bloqueado no dia em que o portal ganhar um WAF.
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Teto de PDFs baixados por execução. Um mês tem ~25-31 edições. 30 dá conta do regime
// permanente (só as edições novas do mês anterior). No primeiro backfill, quando os dois
// meses da janela estão vazios (~55 edições), o retorno traz `restantes` > 0 e o job precisa
// ser re-disparado à mão 1-2 vezes:
//   select public.chamar_edge_function('scrape-dom-natal-licencas', '{}'::jsonb, 300000, true);
const MAX_PDF_POR_EXECUCAO = 30;

// Pausa entre downloads de PDF. O host de storage da Prefeitura estrangula rajadas — baixar
// 25+ PDFs seguidos sem intervalo devolve erro de conexão em quase todos (medido em
// 01/09/2026). O scraper Python antigo usava 1,5 s; 1 s aqui é suficiente.
const PAUSA_ENTRE_DOWNLOADS_MS = 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const RE_ANCHOR = /<a\s+href=['"]([^'"]+\.pdf)['"][^>]*>\s*([^<]*)<\/a>/i;
const RE_DATA = /(\d{2})\/(\d{2})\/(\d{4})/;
const RE_NUMERO = /Num\.?\s*(\d+)/i;
const RE_TIPO_EDICAO = /-\s*(Extra|Especial)\s*-/i;
const RE_CNPJ = /\d{2}[.\s]?\d{3}[.\s]?\d{3}[/\s]?\d{4}[-\s]?\d{2}/;
const RE_EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

interface Edicao {
  url: string;
  dataIso: string | null;   // AAAA-MM-DD
  numero: string | null;
  tipoEdicao: 'Padrão' | 'Extra' | 'Especial';
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

/** Meses a varrer: mês corrente e o anterior, no fuso de Brasília. */
function janelaDeMeses(): { mes: string; ano: string }[] {
  const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const meses: { mes: string; ano: string }[] = [];
  for (let atras = 1; atras >= 0; atras--) {
    const d = new Date(agora.getFullYear(), agora.getMonth() - atras, 1);
    meses.push({
      mes: String(d.getMonth() + 1).padStart(2, '0'),
      ano: String(d.getFullYear()),
    });
  }
  return meses;
}

/** Lista as edições de um mês pela API JSON. O endpoint ignora query string e sempre
 *  devolve o mês inteiro. */
async function listarEdicoes(mes: string, ano: string): Promise<Edicao[]> {
  const resp = await fetch(`${BASE_URL}/api/dom/data/${mes}/${ano}`, {
    headers: {
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: `${BASE_URL}/dom`,
      'User-Agent': BROWSER_UA,
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!resp.ok) return [];

  const json = (await resp.json()) as { data?: string[][] };
  const edicoes: Edicao[] = [];
  for (const linha of json?.data ?? []) {
    const cell = linha[0] ?? '';
    const m = RE_ANCHOR.exec(cell);
    if (!m) continue;
    const url = m[1];
    if (edicoes.some((e) => e.url === url)) continue;
    const dm = RE_DATA.exec(m[2]);
    edicoes.push({
      url,
      dataIso: dm ? `${dm[3]}-${dm[2]}-${dm[1]}` : null,
      numero: RE_NUMERO.exec(m[2])?.[1] ?? null,
      tipoEdicao: (RE_TIPO_EDICAO.exec(m[2])?.[1] as 'Extra' | 'Especial') ?? 'Padrão',
    });
  }
  return edicoes;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const authHeader = req.headers.get('Authorization') ?? '';
    const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();

    // Dois caminhos, igual scrape-licencas-idema:
    //  • pg_cron  -> Bearer <service_role JWT> montado por chamar_edge_function. Confiável.
    //  • Portal   -> Bearer <JWT do usuário>. Exige a seção 'portal'.
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

    // 1. Descobre as edições do mês corrente + anterior
    const todas: Edicao[] = [];
    for (const { mes, ano } of janelaDeMeses()) {
      for (const e of await listarEdicoes(mes, ano)) {
        if (!todas.some((x) => x.url === e.url)) todas.push(e);
      }
    }

    if (todas.length === 0) {
      return new Response(
        JSON.stringify({ success: true, edicoes: 0, processados: 0, inseridos: 0, restantes: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 2. Pula edições que já têm qualquer linha na tabela (dedupe por pdf_link)
    const { data: jaTem } = await supabase.from('licencas_natal').select('pdf_link');
    const linksExistentes = new Set((jaTem ?? []).map((r) => r.pdf_link).filter(Boolean));
    const novas = todas.filter((e) => !linksExistentes.has(e.url));

    const lote = novas.slice(0, MAX_PDF_POR_EXECUCAO);
    let processados = 0;
    let inseridos = 0;

    for (const edicao of lote) {
      if (processados > 0) await sleep(PAUSA_ENTRE_DOWNLOADS_MS);
      processados++;
      const arquivo = edicao.url.split('/').pop() ?? `${edicao.numero ?? 'sem-numero'}.pdf`;
      const mesDaData = edicao.dataIso ? edicao.dataIso.slice(0, 7).replace('-', '/') : 'sem-data';
      const storagePath = `${mesDaData}/${arquivo}`;

      try {
        const pdfResp = await fetch(edicao.url, {
          headers: { 'User-Agent': BROWSER_UA },
          signal: AbortSignal.timeout(45_000),
        });
        if (!pdfResp.ok) continue;
        const bytes = new Uint8Array(await pdfResp.arrayBuffer());

        // Arquiva o PDF no balde privado. Erro de "já existe" não interrompe.
        const up = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(storagePath, bytes, { contentType: 'application/pdf', upsert: false });
        const storagePathGravado = up.error ? null : storagePath;

        let texto = '';
        try {
          texto = (await pdfParse(Buffer.from(bytes)))?.text ?? '';
        } catch {
          texto = '';
        }

        const publicacoes = texto.length >= 200 ? extrairPublicacoesDeLicenca(texto) : [];

        if (publicacoes.length === 0) {
          // Placeholder por edição: marca que o PDF já foi lido e não achou LP/LI/LO.
          // Não aparece na tela (Portal.tsx filtra por tipo). Hash determinístico pela
          // URL para o registro ser idempotente entre execuções.
          const marcador = '(Nenhuma LP/LI/LO identificada nesta edição)';
          await supabase.from('licencas_natal').upsert(
            {
              data_edicao: edicao.dataIso,
              numero_dom: edicao.numero,
              pdf_nome: arquivo,
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
          const cnpj = RE_CNPJ.exec(pub.texto)?.[0]?.replace(/\s/g, '') ?? '';
          const email = RE_EMAIL.exec(pub.texto)?.[0] ?? '';
          const { error } = await supabase
            .from('licencas_natal')
            .upsert(
              {
                data_edicao: edicao.dataIso,
                numero_dom: edicao.numero,
                tipo_licenca: pub.tipo,
                cnpj,
                email,
                obra_descricao: '',
                pdf_nome: arquivo,
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
        // Falha de um PDF não derruba os outros. Sem log de debug no código final.
        continue;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        edicoes: todas.length,
        novas: novas.length,
        processados,
        inseridos,
        restantes: Math.max(0, novas.length - lote.length),
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
