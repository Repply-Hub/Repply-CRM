import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Buffer } from 'node:buffer';
import pdfParse from 'npm:pdf-parse@1.1.1/lib/pdf-parse.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const IDEMA_URL =
  'https://siga.idema.rn.gov.br/servicos/licencas_requeridas/ajax_licencas_requeridas.php?acao=listar_licencas_emitidas';
const IDEMA_REFERER = 'https://siga.idema.rn.gov.br/servicos/licencas_emitidas/';
const IDEMA_BASE = 'https://siga.idema.rn.gov.br';

// User-Agent de navegador padrão. O portal não tem WAF perceptível hoje, mas um UA
// não-navegador ('CRM-MDR/1.0') é o primeiro a ser bloqueado no dia em que aparecer um.
// Testado em 27/08/2026: este UA responde igual ao anterior, sem 403.
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Máximo de PDFs seguidos por execução. Com divisao_atividade_id=6 o volume real é
// ~6 licenças por tipo em 3 meses (~18 no total), então isto quase nunca corta — é só
// uma trava para um backfill grande não estourar o tempo da função.
const MAX_PDF_POR_EXECUCAO = 30;

const TIPOS_PROCESSO = [
  { codigo: '0001', label: 'Licença Prévia' },
  { codigo: '0002', label: 'Licença de Instalação' },
  { codigo: '0003', label: 'Licença de Operação' },
];

function formatDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function parseBrDate(raw: string): string | null {
  const m = raw.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, '').trim();
}

interface LicencaCard {
  numero_processo: string;
  tipo_licenca: string;
  interessado: string;
  cnpj: string;
  fato_gerador: string;
  data_formacao: string | null;
  url_licenca: string;
  fonte: string;
}

function parseCards(html: string): LicencaCard[] {
  const cards: LicencaCard[] = [];

  // Split pelo início de cada card — evita o problema de </div></div> interno
  // cortar o body prematuramente com regex não-guloso.
  const chunks = html.split(/<div[^>]*class="[^"]*card[^"]*mb-2[^"]*"[^>]*>/);

  for (let i = 1; i < chunks.length; i++) {
    const body = chunks[i];

    const processoMatch = body.match(/<p[^>]*class="[^"]*text-idema[^"]*"[^>]*>([\s\S]*?)<\/p>/);
    const numero_processo = processoMatch ? stripTags(processoMatch[1]) : '';
    if (!numero_processo) continue;

    // badge-secondary pode aparecer em qualquer ordem dentro de class=""
    const tipoMatch = body.match(/<span[^>]*class="[^"]*badge-secondary[^"]*"[^>]*>([\s\S]*?)<\/span>/);
    const tipo_licenca = tipoMatch ? stripTags(tipoMatch[1]) : '';

    // A estrutura real do HTML intercala labels nas <small>:
    //   smalls[0] = "Interessado" (label)  smalls[1] = nome empresa
    //   smalls[2] = "CNPJ XXXXXXXX"        smalls[3] = "Fato gerador" (label)
    //   smalls[4] = texto fato gerador     smalls[5] = "Data formação" (label)
    //   smalls[6] = "DD/MM/YYYY"           smalls[7] = wraps link "Ver licença"
    const smallRegex = /<small[^>]*>([\s\S]*?)<\/small>/g;
    const smalls: string[] = [];
    let sm: RegExpExecArray | null;
    while ((sm = smallRegex.exec(body)) !== null) {
      smalls.push(stripTags(sm[1]));
    }

    const interessado = smalls[1] ?? '';
    const cnpjRaw = smalls[2] ?? '';
    const cnpj = cnpjRaw.replace(/^CNPJ\s*/i, '').trim();
    const fato_gerador = smalls[4] ?? '';
    const dataRaw = smalls[6] ?? '';
    const data_formacao = parseBrDate(dataRaw);

    // "Ver licen" cobre tanto UTF-8 ("Ver licença") quanto Latin-1 mal decodificado
    const linkMatch = body.match(/<a[^>]*href="([^"]*)"[^>]*>\s*Ver\s+licen/i);
    let url_licenca = '';
    if (linkMatch) {
      const href = linkMatch[1];
      if (href.startsWith('http')) {
        url_licenca = href;
      } else {
        const gidMatch = href.match(/\?(.+)$/);
        url_licenca = gidMatch
          ? `${IDEMA_BASE}/validar/?${gidMatch[1]}`
          : `${IDEMA_BASE}/${href.replace(/^\.\.\/\.\.\//, '')}`;
      }
    }

    cards.push({ numero_processo, tipo_licenca, interessado, cnpj, fato_gerador, data_formacao, url_licenca, fonte: 'IDEMA' });
  }

  return cards;
}

// ── Enriquecimento pelo PDF final da licença ────────────────────────────────────
//
// Só roda para registros NOVOS (INSERT nesta execução), nunca para UPDATE de linha
// já existente — quem já tem os campos ricos não paga um fetch de PDF de novo.

interface CamposDoPdf {
  endereco_empreendimento: string | null;
  coordenadas_utm: string | null;
  cpf_cnpj_formatado: string | null;
}

function extrairCamposDoPdf(texto: string): CamposDoPdf {
  const colapsar = (s: string) => s.replace(/\s+/g, ' ').trim();

  // CPF/CNPJ — vem já formatado logo abaixo do rótulo "CPF/CNPJ" no PDF.
  let cpfCnpj: string | null = null;
  const mDoc =
    texto.match(/CPF\s*\/\s*CNPJ\s*:?\s*\n+\s*(\d[\d.\/-]{9,18}\d)/i) ??
    texto.match(/CPF\s*\/\s*CNPJ\s*:?\s*(\d{2,3}[\d.\/-]{8,17}\d)/i);
  if (mDoc) cpfCnpj = mDoc[1].replace(/[.\s]+$/, '').trim();

  // "Endereço do Empreendimento" — o rótulo quebra em duas linhas no PDF, e é
  // diferente de "Endereço do Empreendedor" (que vem antes). O \s+ entre "do" e
  // "Empreendimento" cobre a quebra de linha; o "Empreendimento" explícito impede
  // casar com "Empreendedor".
  let endereco: string | null = null;
  const mEnd = texto.match(/Endere[çc]o\s+do\s+Empreendimento\s*:?\s*\n+\s*([^\n]{5,200})/i);
  if (mEnd) endereco = colapsar(mEnd[1]);

  // Coordenadas UTM — exige o PAR "... mE; ... mN" (só assim é uma coordenada de
  // referência de verdade; uma menção solta a "UTM ... mN" numa condicionante não
  // conta). Quando existe, tenta prefixar com o "(Zona NNx), Datum ...:" que vem
  // logo antes no mesmo trecho. Empreendimento urbano costuma não ter — aí fica null.
  let utm: string | null = null;
  const mPar = texto.match(/\d[\d.]*,\d+\s*mE\s*;?\s*\d[\d.]*,\d+\s*mN/i);
  if (mPar) {
    const antes = texto.slice(Math.max(0, (mPar.index ?? 0) - 140), mPar.index ?? 0);
    const mCtx = antes.match(/\(?\s*Zona[\s\S]{0,120}?:\s*$/i);
    utm = colapsar(`${mCtx ? mCtx[0] : ''}${mPar[0]}`).replace(/^[),\s]+/, '');
  }

  return { endereco_empreendimento: endereco, coordenadas_utm: utm, cpf_cnpj_formatado: cpfCnpj };
}

// A chamada do cron chega com `Authorization: Bearer <service_role JWT>`, montado
// por public.chamar_edge_function a partir do Vault. Comparar string a string com
// SUPABASE_SERVICE_ROLE_KEY é frágil: o valor guardado no Vault e o injetado na
// função podem divergir (chave reemitida, migração para o formato sb_secret_...).
// O que importa é o PAPEL. Com verify_jwt=true (padrão), o gateway do Supabase já
// validou a assinatura antes de chegar aqui — então ler o claim `role` do payload
// é suficiente para confiar.
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

async function enriquecerComPdf(
  supabase: ReturnType<typeof createClient>,
  novos: LicencaCard[],
): Promise<void> {
  const lote = novos.slice(0, MAX_PDF_POR_EXECUCAO);
  if (novos.length > lote.length) {
    console.warn(
      `[scrape-licencas-idema] ${novos.length} licenças novas; enriquecendo ${lote.length} nesta execução, ` +
        `o resto fica com pdf_processado=false para a próxima.`,
    );
  }

  for (const card of lote) {
    const np = card.numero_processo;
    try {
      if (!card.url_licenca) {
        console.error(`[scrape-licencas-idema] PDF ${np}: motivo=sem_url_licenca_no_card`);
        continue;
      }

      const resp = await fetch(card.url_licenca, {
        headers: { 'User-Agent': BROWSER_UA, Referer: IDEMA_REFERER },
        redirect: 'follow',
        signal: AbortSignal.timeout(20000),
      });
      if (!resp.ok) {
        console.error(`[scrape-licencas-idema] PDF ${np}: motivo=http_${resp.status} url=${card.url_licenca}`);
        continue;
      }

      const contentType = resp.headers.get('content-type') ?? '';
      const buf = await resp.arrayBuffer();
      if (!contentType.includes('pdf') && buf.byteLength < 1000) {
        console.error(
          `[scrape-licencas-idema] PDF ${np}: motivo=resposta_nao_e_pdf content_type=${contentType} bytes=${buf.byteLength}`,
        );
        continue;
      }

      let texto = '';
      try {
        const parsed = await pdfParse(Buffer.from(buf));
        texto = parsed?.text ?? '';
      } catch (e) {
        console.error(
          `[scrape-licencas-idema] PDF ${np}: motivo=falha_extracao_texto detalhe=${e instanceof Error ? e.message : String(e)}`,
        );
        continue;
      }
      if (!texto || texto.length < 50) {
        console.error(`[scrape-licencas-idema] PDF ${np}: motivo=texto_vazio_ou_curto chars=${texto.length}`);
        continue;
      }

      const campos = extrairCamposDoPdf(texto);
      const { error: updErr } = await supabase
        .from('licencas_idema')
        .update({ ...campos, pdf_processado: true })
        .eq('numero_processo', np);
      if (updErr) {
        console.error(`[scrape-licencas-idema] PDF ${np}: motivo=erro_update detalhe=${updErr.message}`);
        continue;
      }
    } catch (e) {
      // Falha de um PDF nunca derruba os outros nem o fluxo principal — o registro
      // da listagem já foi salvo pelo upsert. Erro é sempre logado com o processo.
      console.error(
        `[scrape-licencas-idema] PDF ${np}: motivo=erro_inesperado detalhe=${e instanceof Error ? e.message : String(e)}`,
      );
    }
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

    // Dois caminhos de entrada:
    //
    //  • Portal.tsx  -> Authorization com o JWT do usuário logado. Exige a seção
    //    'portal' (mesma regra da RLS de escrita de licencas_idema).
    //
    //  • pg_cron     -> Authorization: Bearer <service_role JWT>, montado por
    //    public.chamar_edge_function() a partir do Vault. É uma chamada
    //    servidor-a-servidor confiável: dispensa a checagem de seção, que depende
    //    de auth.uid() e daria sempre falso com a chave de serviço.
    //
    // Reconhece pelo claim `role` do JWT (robusto a reemissão/rotação da chave);
    // a comparação direta com a env fica como reserva para o formato sb_secret_.
    const isServiceCall =
      papelDoToken(bearer) === 'service_role' ||
      (serviceKey.length > 0 && bearer.length > 0 && bearer === serviceKey);

    if (!isServiceCall) {
      // Esta função grava em `licencas_idema` com service_role, que IGNORA a RLS. A
      // política de 20260822221102_portal_exige_secao.sql não alcança este caminho:
      // sem a checagem abaixo, qualquer pessoa logada de qualquer empresa dispararia
      // uma importação nas licenças da MD.
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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      serviceKey,
    );

    // Janela de datas.
    //  • Chamada manual (Portal): ano corrente inteiro — quem clica quer o quadro
    //    completo, e o upsert por numero_processo absorve a repetição.
    //  • Chamada do cron: só o período recente (mês atual + anterior), igual ao
    //    dom_natal_scraper.py — evita reprocessar o ano todo a cada execução.
    //  • Em ambos os casos, data_inicial/data_final no corpo (se vierem em ISO)
    //    ganham. O cron passa as duas explicitamente.
    let dataInicial = '2026-01-01';
    let dataFinal = formatDate(new Date());
    if (isServiceCall) {
      const hoje = new Date();
      dataInicial = formatDate(new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 1, 1)));
    }
    try {
      const body = await req.json();
      if (body?.data_inicial && /^\d{4}-\d{2}-\d{2}$/.test(body.data_inicial)) dataInicial = body.data_inicial;
      if (body?.data_final && /^\d{4}-\d{2}-\d{2}$/.test(body.data_final)) dataFinal = body.data_final;
    } catch { /* corpo vazio ou não-JSON — usa o padrão acima */ }

    const allCards: LicencaCard[] = [];
    const porTipo: Record<string, number> = {};

    // Fetch sequencial — um tipo por vez para não sobrecarregar o IDEMA
    for (const tipo of TIPOS_PROCESSO) {
      porTipo[tipo.label] = 0;

      // Filtros do formulário. Testado contra o portal em 27/08/2026 (mesmo range,
      // tipo_processo=0003):
      //   • FORMATO DE DATA: `data_inicial`/`data_final` em ISO (YYYY-MM-DD) e em BR
      //     (DD/MM/YYYY) devolvem resposta byte a byte idêntica. ISO está correto —
      //     mantido. (O portal-scraper legado usa DD/MM/YYYY; é indiferente.)
      //   • divisao_atividade_id: enviar "6" puro e "6   " (com o padding de espaços
      //     que aparece no <option> do site) devolve resultado idêntico — o padding é
      //     decorativo. Omitir o campo devolve 95 cards em vez de 6, ou seja, o filtro
      //     por divisão está de fato sendo aplicado com "6" puro.
      const formData = new URLSearchParams({
        data_inicial: dataInicial,
        data_final: dataFinal,
        tipo_processo: tipo.codigo,
        divisao_atividade_id: '6',
        sub_atividade_id: '',
      });

      try {
        const idemaResp = await fetch(IDEMA_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Referer: IDEMA_REFERER,
            'User-Agent': BROWSER_UA,
          },
          body: formData.toString(),
          signal: AbortSignal.timeout(30000),
        });

        if (!idemaResp.ok) {
          console.error(`[scrape-licencas-idema] ${tipo.label}: HTTP ${idemaResp.status}`);
          continue;
        }

        // IDEMA serve ISO-8859-1; .text() assumiria UTF-8 e corromperia acentos
        const buffer = await idemaResp.arrayBuffer();
        const html = new TextDecoder('iso-8859-1').decode(buffer);

        const cards = parseCards(html);
        porTipo[tipo.label] = cards.length;
        allCards.push(...cards);
      } catch (e) {
        console.error(
          `[scrape-licencas-idema] ${tipo.label}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    // Quais numero_processo já existem? Serve para o follow-up de PDF rodar só nos
    // registros novos (nunca em UPDATE de linha existente).
    const numeros = [...new Set(allCards.map((c) => c.numero_processo).filter(Boolean))];
    const existentes = new Set<string>();
    if (numeros.length > 0) {
      const { data: jaTem, error: selJaTem } = await supabase
        .from('licencas_idema')
        .select('numero_processo')
        .in('numero_processo', numeros);
      if (selJaTem) throw selJaTem;
      for (const r of jaTem ?? []) if (r.numero_processo) existentes.add(r.numero_processo as string);
    }

    // Upsert único com todos os registros acumulados. Dedup por numero_processo —
    // INALTERADO.
    let inseridos = 0;
    if (allCards.length > 0) {
      const { error: upsertError, count } = await supabase
        .from('licencas_idema')
        .upsert(allCards, { onConflict: 'numero_processo', ignoreDuplicates: false, count: 'exact' });

      if (upsertError) throw upsertError;
      inseridos = count ?? 0;
    }

    const novos = allCards.filter((c) => c.numero_processo && !existentes.has(c.numero_processo));

    // Segue "Ver licença" -> PDF final -> grava endereço / UTM / CPF-CNPJ formatado,
    // só nos novos. Não pode bloquear o retorno nem quebrar o fluxo: quando o
    // runtime de borda oferece waitUntil, roda depois da resposta; senão, aguarda
    // (ambiente local). Cada PDF tem try/catch próprio e loga o erro com o processo.
    if (novos.length > 0) {
      const edgeRuntime = (globalThis as unknown as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } })
        .EdgeRuntime;
      if (typeof edgeRuntime?.waitUntil === 'function') {
        edgeRuntime.waitUntil(enriquecerComPdf(supabase, novos));
      } else {
        await enriquecerComPdf(supabase, novos);
      }
    }

    const { data: licencas, error: selectError } = await supabase
      .from('licencas_idema')
      .select('id, numero_processo, tipo_licenca, interessado, cnpj, fato_gerador, data_formacao, url_licenca, fonte, created_at')
      .not('numero_processo', 'is', null)
      .order('data_formacao', { ascending: false });

    if (selectError) throw selectError;

    return new Response(
      JSON.stringify({
        inseridos,
        total_scraped: allCards.length,
        pdf_novos: novos.length,
        por_tipo: porTipo,
        licencas: licencas ?? [],
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[scrape-licencas-idema] erro fatal: ${message}`);
    return new Response(
      JSON.stringify({ error: message, inseridos: 0, total_scraped: 0, por_tipo: {}, licencas: [] }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
