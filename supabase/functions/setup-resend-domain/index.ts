import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          persistSession: false,
        },
      }
    );

    const authHeader = req.headers.get("Authorization")!;
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(authHeader.replace("Bearer ", ""));

    if (userError || !user) {
      throw new Error("Usuário não autenticado");
    }

    const { domain_name } = await req.json();

    if (!domain_name) {
      throw new Error("O nome do domínio é obrigatório.");
    }

    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) {
      throw new Error("RESEND_API_KEY não configurada.");
    }

    // 1. Criar o domínio no Resend
    const resendResponse = await fetch("https://api.resend.com/domains", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        name: domain_name,
      }),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error("Erro no Resend:", resendData);
      throw new Error(resendData.message || "Erro ao criar domínio no Resend.");
    }

    const { id: resend_domain_id, records } = resendData;

    // 2. Salvar na tabela user_domains
    const { error: dbError } = await supabaseClient
      .from("user_domains")
      .insert({
        user_id: user.id,
        domain_name,
        resend_domain_id,
        dns_records: records,
        status: 'pending'
      });

    if (dbError) {
      console.error("Erro no banco de dados:", dbError);
      throw new Error("Erro ao salvar o domínio no banco de dados.");
    }

    return new Response(JSON.stringify({ resend_domain_id, dns_records: records }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});