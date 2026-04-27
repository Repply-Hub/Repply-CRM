import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Tratamento de CORS para o frontend (Preflight)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    if (!resendApiKey) {
      throw new Error("A variável RESEND_API_KEY não foi encontrada.");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Obter o usuário autenticado da requisição
    const authHeader = req.headers.get('Authorization')!;
    const { data: { user }, error: userError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));

    if (userError || !user) {
      throw new Error("Usuário não autenticado.");
    }

    const { to, subject, html } = await req.json();

    // Validação básica
    if (!to || !subject || !html) {
      return new Response(
        JSON.stringify({ error: "Os campos 'to', 'subject' e 'html' são obrigatórios." }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Consultar domínio verificado do usuário
    const { data: domainData } = await supabase
      .from('user_domains')
      .select('domain_name')
      .eq('user_id', user.id)
      .eq('status', 'verified')
      .maybeSingle();

    // Definir o remetente dinâmico
    const fromEmail = domainData 
      ? `contato@${domainData.domain_name}` 
      : 'onboarding@resend.dev';

    // Chamada para o Resend
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromEmail,
        to: to,
        subject: subject,
        html: html
      })
    });

    const data = await res.json();
    
    return new Response(JSON.stringify({ success: res.ok, resend_data: data, from_used: fromEmail }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: res.ok ? 200 : 400
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});