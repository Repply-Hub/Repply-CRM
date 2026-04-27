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
    console.log("Iniciando send-email...");
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          persistSession: false,
        },
      }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("Authorization header ausente");
      throw new Error("Cabeçalho de autorização não encontrado");
    }

    console.log("Buscando usuário...");
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(authHeader.replace("Bearer ", ""));

    if (userError || !user) {
      throw new Error("Usuário não autenticado");
    }

    console.log("Usuário autenticado:", user.id);

    // 1. Buscar se o usuário possui um domínio verificado (Mantido para lógica futura, mas ignorado temporariamente)
    console.log("Buscando domínios verificados...");
    const { data: domains, error: domainError } = await supabaseClient
      .from("user_domains")
      .select("domain_name")
      .eq("user_id", user.id)
      .eq("status", "verified")
      .limit(1);

    if (domainError) {
      console.error("Erro ao buscar domínios:", domainError);
    }

    console.log("Parsing body...");
    const payload = await req.json();
    const { subject, html } = payload;
    
    // TEMPORÁRIO: O destinatário DEVE ser o e-mail da conta Resend para testes com onboarding@resend.dev
    // Como não sabemos qual é o e-mail da conta Resend do usuário, vamos usar o e-mail do usuário logado
    // assumindo que ele usou o mesmo e-mail para ambos, ou permitir que o frontend envie, 
    // mas o Resend só aceita o e-mail da conta no modo sandbox.
    const to = user.email; 
    console.log("Destinatário (fixo para teste):", to);

    // 2. Definir o remetente (from) - FIXO TEMPORARIAMENTE PARA TESTE
    const fromEmail = "onboarding@resend.dev";
    console.log("Enviando via Resend com de:", fromEmail);

    // 3. Chamada para a API do Resend
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to], // Resend espera um array ou string
        subject: subject,
        html: html,
      }),
    });

    const responseText = await res.text();
    console.log("Resposta da Resend:", responseText);

    if (!res.ok) {
      throw new Error(`Resend Error: ${responseText}`);
    }

    return new Response(responseText, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Erro na função send-email:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});