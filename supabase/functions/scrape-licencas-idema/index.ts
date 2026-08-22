import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const IDEMA_URL =
  'https://siga.idema.rn.gov.br/servicos/licencas_requeridas/ajax_licencas_requeridas.php?acao=listar_licencas_emitidas';
const IDEMA_REFERER = 'https://siga.idema.rn.gov.br/servicos/licencas_emitidas/';
const IDEMA_BASE = 'https://siga.idema.rn.gov.br';

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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Esta função grava em `licencas_idema` com service_role, que IGNORA a RLS por
    // definição. Ou seja, a política criada em 20260822221102_portal_exige_secao.sql não
    // alcança este caminho: sem a checagem abaixo, qualquer pessoa logada de qualquer
    // empresa dispararia uma importação nas licenças da MD.
    //
    // A checagem usa o cliente do USUÁRIO, criado com o Authorization que veio na
    // requisição. Com o de serviço, `auth.uid()` é nulo e `empresa_tem_secao` não teria
    // como saber de quem se trata — responderia o padrão e liberaria todo mundo.
    const authHeader = req.headers.get('Authorization');
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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    let dataInicial = '2026-01-01';
    let dataFinal = formatDate(new Date());
    try {
      const body = await req.json();
      if (body?.data_inicial && /^\d{4}-\d{2}-\d{2}$/.test(body.data_inicial)) dataInicial = body.data_inicial;
      if (body?.data_final && /^\d{4}-\d{2}-\d{2}$/.test(body.data_final)) dataFinal = body.data_final;
    } catch { /* body vazio ou não-JSON — usa fallback */ }

    const allCards: LicencaCard[] = [];
    const porTipo: Record<string, number> = {};
    const debugInfo: Record<string, unknown>[] = [];

    // Fetch sequencial — um tipo por vez para não sobrecarregar o IDEMA
    for (const tipo of TIPOS_PROCESSO) {
      porTipo[tipo.label] = 0;

      const formData = new URLSearchParams({
        data_inicial: dataInicial,
        data_final: dataFinal,
        tipo_processo: tipo.codigo,
        divisao_atividade_id: '6',
        sub_atividade_id: '',
      });

      const tipoDebug: Record<string, unknown> = { tipo: tipo.label };

      try {
        const idemaResp = await fetch(IDEMA_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Referer: IDEMA_REFERER,
            'User-Agent': 'Mozilla/5.0 (compatible; CRM-MDR/1.0)',
          },
          body: formData.toString(),
          signal: AbortSignal.timeout(30000),
        });

        tipoDebug.status = idemaResp.status;
        tipoDebug.ok = idemaResp.ok;
        tipoDebug.content_type = idemaResp.headers.get('content-type');

        if (!idemaResp.ok) {
          tipoDebug.error = `HTTP ${idemaResp.status}`;
          debugInfo.push(tipoDebug);
          continue;
        }

        // IDEMA serve ISO-8859-1; .text() assumiria UTF-8 e corromperia acentos
        const buffer = await idemaResp.arrayBuffer();
        const html = new TextDecoder('iso-8859-1').decode(buffer);
        tipoDebug.html_length = html.length;
        tipoDebug.html_preview = html.substring(0, 500).replace(/\s+/g, ' ');

        const cards = parseCards(html);
        tipoDebug.cards_found = cards.length;
        porTipo[tipo.label] = cards.length;
        allCards.push(...cards);
      } catch (e) {
        tipoDebug.fetch_error = e instanceof Error ? e.message : String(e);
      }

      debugInfo.push(tipoDebug);
    }

    // Upsert único com todos os registros acumulados
    let inseridos = 0;
    if (allCards.length > 0) {
      const { error: upsertError, count } = await supabase
        .from('licencas_idema')
        .upsert(allCards, { onConflict: 'numero_processo', ignoreDuplicates: false, count: 'exact' });

      if (upsertError) throw upsertError;
      inseridos = count ?? 0;
    }

    const { data: licencas, error: selectError } = await supabase
      .from('licencas_idema')
      .select('id, numero_processo, tipo_licenca, interessado, cnpj, fato_gerador, data_formacao, url_licenca, fonte, created_at')
      .not('numero_processo', 'is', null)
      .order('data_formacao', { ascending: false });

    if (selectError) throw selectError;

    return new Response(
      JSON.stringify({ inseridos, total_scraped: allCards.length, por_tipo: porTipo, licencas: licencas ?? [], debug: debugInfo }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: message, inseridos: 0, total_scraped: 0, por_tipo: {}, licencas: [] }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
