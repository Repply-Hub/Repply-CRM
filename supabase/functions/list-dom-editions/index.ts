const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BASE_URL = 'https://www.natal.rn.gov.br';

interface EdicaoDom {
  url: string;
  data: string | null;
  numeroEdicao: string | null;
  tipo: 'Padrão' | 'Extra' | 'Especial';
}

async function listarEdicoesMes(mes: number, ano: number): Promise<EdicaoDom[]> {
  const mesPad = String(mes).padStart(2, '0');
  const url = `${BASE_URL}/api/dom/data/${mesPad}/${ano}?_=${Date.now()}`;

  const resp = await fetch(url, {
    headers: {
      'Accept': 'application/json, text/javascript, */*; q=0.01',
    },
  });

  if (!resp.ok) throw new Error(`DOM API retornou ${resp.status}`);
  const payload: { data: string[][] } = await resp.json();

  const reAnchor = /<a\s+href=['"]([^'"]+\.pdf)['"][^>]*>\s*([^<]*)<\/a>/i;
  const reData = /(\d{2})\/(\d{2})\/(\d{4})/;
  const reNumero = /Num\.?\s*(\d+)/;
  const reTipo = /-\s*(Extra|Especial)\s*-/i;

  return (payload.data ?? []).map(([html]) => {
    const m = reAnchor.exec(html);
    if (!m) return null;
    const [, pdfUrl, textoRaw] = m;
    const texto = textoRaw.trim();
    const dm = reData.exec(texto);
    return {
      url: pdfUrl,
      data: dm ? `${dm[3]}-${dm[2]}-${dm[1]}` : null,
      numeroEdicao: reNumero.exec(texto)?.[1] ?? null,
      tipo: (reTipo.exec(texto)?.[1] as 'Extra' | 'Especial') ?? 'Padrão',
    };
  }).filter(Boolean) as EdicaoDom[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { mes, ano } = await req.json();

    if (!mes || !ano) {
      return new Response(
        JSON.stringify({ error: 'mes e ano são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const edicoes = await listarEdicoesMes(Number(mes), Number(ano));

    return new Response(
      JSON.stringify({ success: true, edicoes }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
