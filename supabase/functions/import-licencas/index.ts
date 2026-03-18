import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LicencaRow {
  data_edicao: string;
  tipo_licenca: string;
  prioridade: string;
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  telefone: string;
  email: string;
  endereco_empresa: string;
  quadro_societario: string;
  obra_descricao: string;
  pdf_nome: string;
  pdf_link: string;
  bloco_texto: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { rows, clear_existing } = await req.json() as { rows: LicencaRow[]; clear_existing?: boolean };

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Nenhum dado fornecido. Envie { rows: [...] }' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Optionally clear existing data
    if (clear_existing) {
      await supabase.from('licencas_extremoz').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    }

    // Insert in batches of 50
    const batchSize = 50;
    let inserted = 0;
    let errors = 0;

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize).map(row => ({
        data_edicao: row.data_edicao || null,
        tipo_licenca: row.tipo_licenca || null,
        prioridade: row.prioridade || null,
        cnpj: row.cnpj || null,
        razao_social: row.razao_social || null,
        nome_fantasia: row.nome_fantasia || null,
        telefone: row.telefone || null,
        email: row.email || null,
        endereco_empresa: row.endereco_empresa || null,
        quadro_societario: row.quadro_societario || null,
        obra_descricao: row.obra_descricao || null,
        pdf_nome: row.pdf_nome || null,
        pdf_link: row.pdf_link || null,
        bloco_texto: row.bloco_texto || null,
      }));

      const { error } = await supabase.from('licencas_extremoz').insert(batch);
      if (error) {
        console.error('Insert error:', error);
        errors += batch.length;
      } else {
        inserted += batch.length;
      }
    }

    return new Response(
      JSON.stringify({ success: true, inserted, errors, total: rows.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Import error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
