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

    const { resend_domain_id } = await req.json();

    if (!resend_domain_id) {
      throw new Error("ID do domínio é obrigatório.");
    }

    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) {
      throw new Error("RESEND_API_KEY não configurada.");
    }

    // 1. Consultar status no Resend
    const resendResponse = await fetch(`https://api.resend.com/domains/${resend_domain_id}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      throw new Error(resendData.message || "Erro ao consultar status no Resend.");
    }

    const { status } = resendData;

    // 2. Atualizar na tabela user_domains
    const { error: dbError } = await supabaseClient
      .from("user_domains")
      .update({ status })
      .eq("resend_domain_id", resend_domain_id)
      .eq("user_id", user.id);

    if (dbError) {
      console.error("Erro ao atualizar banco de dados:", dbError);
    }

    return new Response(JSON.stringify({ status }), {
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