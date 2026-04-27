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
    console.log("Iniciando send-email (MODO SANDBOX FIXO)...");
    
    // Configurações fixas para teste em modo Sandbox
    const fromEmail = "onboarding@resend.dev";
    const toEmail = "viniciusgodoy.pj@gmail.com";
    
    const payload = await req.json();
    const { subject, html } = payload;

    console.log(`Enviando de: ${fromEmail} para: ${toEmail}`);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        subject: subject || "Teste CRM - Modo Sandbox",
        html: html || "<p>Teste de envio em modo sandbox</p>",
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