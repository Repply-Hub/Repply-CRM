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
    // 1. Buscar se o usuário possui um domínio verificado
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
    const { to, subject, html } = await req.json();
    console.log("Destinatário:", to);

    // 2. Definir o remetente (from)
    // Se tiver domínio verificado: contato@dominio.com
    // Caso contrário: avisos@meucrm.com.br
    let fromEmail = "avisos@meucrm.com.br";
    if (domains && domains.length > 0) {
      fromEmail = `contato@${domains[0].domain_name}`;
    }

    // 3. Usar a chave RESEND_API_KEY global dos Secrets
    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) {
      throw new Error("RESEND_API_KEY não configurada nos Secrets do Supabase");
    }

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