import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Mesma normalização usada no whatsapp-webhook/whatsapp-send: garante que o número BR
// sempre inclua o 9º dígito, no formato que a uazapi espera (apenas dígitos, com DDI).
function normalizeWhatsappPhone(raw: string): string {
  let digits = (raw ?? "").replace(/\D/g, "");
  // só remove o "55" se for código de país (DDD 55 do RS também começa com "55")
  if (digits.length > 11 && digits.startsWith("55")) digits = digits.slice(2);
  if (digits.length === 10) {
    digits = `${digits.slice(0, 2)}9${digits.slice(2)}`;
  }
  return `55${digits}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Sessão não identificada. Entre novamente no sistema." }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const [{ data: { user }, error: authError }, body] = await Promise.all([
      userClient.auth.getUser(),
      req.json(),
    ]);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Sua sessão expirou. Atualize a página e entre de novo." }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { nome, participantes } = body as { nome?: string; participantes?: string[] };

    if (!nome?.trim()) {
      return new Response(JSON.stringify({ error: "nome do grupo obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!Array.isArray(participantes) || participantes.length === 0) {
      return new Response(JSON.stringify({ error: "informe ao menos 1 participante" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: userData } = await supabase
      .from("usuarios").select("id, empresa_id").eq("user_id", user.id).single();
    if (!userData) {
      return new Response(JSON.stringify({ error: "Seu usuário não foi encontrado no sistema. Fale com o gestor da empresa." }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: instLink } = await supabase
      .from("wapi_instancia_usuarios")
      .select("configuracoes_wapi:instancia_id(instance_url, api_key, instance_name, api_instance_name, status)")
      .eq("usuario_auth_id", user.id)
      .limit(1)
      .maybeSingle();
    const config = (instLink?.configuracoes_wapi ?? null) as {
      instance_url: string; api_key: string; instance_name: string;
      api_instance_name: string | null; status: string;
    } | null;
    if (!config) {
      return new Response(JSON.stringify({ error: "Seu usuário não tem WhatsApp vinculado. Peça ao gestor para liberar em Configurações." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (config.status !== "connected") {
      return new Response(JSON.stringify({ error: "O WhatsApp está desconectado. Reconecte em Configurações e tente de novo." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const baseUrl = config.instance_url.replace(/\/$/, "");
    const numeros = participantes.map(normalizeWhatsappPhone);

    let wapiStatus = 0;
    let responseText = "";
    let fetchError = "";
    try {
      const res = await fetch(`${baseUrl}/group/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: config.api_key },
        body: JSON.stringify({ name: nome.trim(), participants: numeros }),
      });
      wapiStatus = res.status;
      responseText = await res.text().catch(() => "");
    } catch (e) { fetchError = String(e); }

    if (fetchError) {
      return new Response(JSON.stringify({ error: "Erro de rede ao contactar WhatsApp", detail: fetchError }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (wapiStatus < 200 || wapiStatus >= 300) {
      let wapiError = "";
      try { wapiError = JSON.parse(responseText)?.error ?? ""; } catch { /* ok */ }
      return new Response(JSON.stringify({ error: wapiError || `Erro ao criar grupo (status ${wapiStatus})`, detail: responseText }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let wapiResult: any = {};
    try { wapiResult = JSON.parse(responseText); } catch { /* ok */ }
    const jid: string =
      wapiResult?.JID ?? wapiResult?.jid ?? wapiResult?.group?.JID ?? wapiResult?.group?.jid ?? "";
    const telefone = jid.replace("@g.us", "");
    if (!telefone) {
      return new Response(JSON.stringify({ error: "Grupo criado, mas resposta da uazapi não trouxe o JID", detail: responseText }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawParticipants: any[] = wapiResult?.group?.Participants ?? [];
    const participantes = rawParticipants.map((p) => ({
      nome: p?.DisplayName || null,
      telefone: String(p?.PhoneNumber ?? p?.JID ?? "").replace(/@.*$/, ""),
    })).filter((p) => p.telefone);

    const { data: conversa, error: convError } = await supabase
      .from("whatsapp_conversas")
      .upsert(
        { empresa_id: userData.empresa_id, telefone, nome_contato: nome.trim(), arquivada: false, is_group: true, participantes },
        { onConflict: "empresa_id,telefone" }
      )
      .select("*")
      .single();
    if (convError) {
      return new Response(JSON.stringify({ error: "Grupo criado, mas falhou ao salvar a conversa", detail: convError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Quem criou o grupo vira responsável — sem isso a conversa (agora restrita a
    // admins e responsáveis) some da própria lista de quem acabou de criá-la.
    await supabase
      .from("whatsapp_conversa_responsaveis")
      .upsert(
        { conversa_id: conversa.id, usuario_id: userData.id },
        { onConflict: "conversa_id,usuario_id", ignoreDuplicates: true }
      );

    return new Response(JSON.stringify({ ok: true, conversa }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Erro inesperado. Tente de novo em instantes.", detail: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
