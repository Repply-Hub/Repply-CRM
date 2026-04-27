import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

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
    const apiKey = Deno.env.get('RESEND_API_KEY');
    if (!apiKey) {
      throw new Error("A variável RESEND_API_KEY não foi encontrada no ambiente do Supabase.");
    }

    const { to, subject, html } = await req.json();

    // Validação básica dos campos obrigatórios
    if (!to || !subject || !html) {
      return new Response(
        JSON.stringify({ error: "Os campos 'to', 'subject' e 'html' são obrigatórios." }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
          status: 400 
        }
      );
    }

    // Chamada para o Resend com dados dinâmicos
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'onboarding@resend.dev',
        to: to,
        subject: subject,
        html: html
      })
    });

    const data = await res.json();
    
    return new Response(JSON.stringify({ success: res.ok, resend_data: data }), {
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