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

    // Buscar as chaves personalizadas do usuário
    const { data: integration, error: integrationError } = await supabaseClient
      .from("user_integrations")
      .select("resend_api_key, resend_from_email")
      .eq("user_id", user.id)
      .maybeSingle();

    if (integrationError) {
      console.error("Erro ao buscar integração:", integrationError);
      throw new Error("Erro ao carregar configurações de e-mail.");
    }

    if (!integration?.resend_api_key || !integration?.resend_from_email) {
      return new Response(
        JSON.stringify({ error: "Configure sua chave do Resend nas definições" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { to, subject, html } = await req.json();

    const apiKey = integration.resend_api_key;
    const fromEmail = integration.resend_from_email;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: fromEmail,
        to,
        subject,
        html,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      return new Response(JSON.stringify(data), {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(data), {
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
