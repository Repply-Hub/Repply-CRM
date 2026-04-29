import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    console.log("Webhook recebido do Resend:", JSON.stringify(body, null, 2));

    // O Resend envia eventos do tipo 'email.received' para inbound
    if (body.type === 'email.received') {
      const emailData = body.data;

      const { error } = await supabase
        .from('emails_recebidos')
        .insert({
          resend_id: emailData.email_id,
          remetente: emailData.from,
          destinatarios: emailData.to,
          assunto: emailData.subject,
          corpo_html: emailData.html || body.content?.html, // Dependendo da versão/configuração do webhook
          criado_em: emailData.created_at
        });

      if (error) {
        console.error("Erro ao salvar e-mail recebido:", error);
        throw error;
      }

      console.log(`E-mail ${emailData.email_id} salvo com sucesso.`);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (error) {
    console.error("Erro no webhook inbound:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});
