import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function buildInstanceName(empresaId: string, usuarioId: string): string {
  const sanitize = (s: string) => s.replace(/[^a-z0-9]/gi, "").toLowerCase();
  const empresaPart = sanitize(empresaId).slice(0, 8);
  const usuarioPart = sanitize(usuarioId).slice(0, 8);
  return `${empresaPart}_${usuarioPart}`;
}

// Apaga uma instância recém-criada na uazapi quando um passo seguinte do
// provisionamento falha, para não deixar instância órfã na conta uazapi.
async function deleteOrphanInstance(baseUrl: string, token: string, instanceName: string): Promise<void> {
  try {
    const res = await fetch(`${baseUrl}/instance`, {
      method: "DELETE",
      headers: { token },
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      console.error("[whatsapp-provision] falha ao limpar instância órfã", {
        instanceName, status: res.status, body: text,
      });
    } else {
      console.log("[whatsapp-provision] instância órfã removida", { instanceName });
    }
  } catch (e) {
    console.error("[whatsapp-provision] erro de rede ao limpar instância órfã", { instanceName, error: String(e) });
  }
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
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: userData, error: userError } = await supabase
      .from("usuarios")
      .select("id, empresa_id")
      .eq("user_id", user.id)
      .single();
    if (userError || !userData) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const usuarioId = user.id;
    const empresaId = userData.empresa_id;

    // Idempotência: se já existe registro para esse usuário, devolve o que já há
    const { data: existing } = await supabase
      .from("configuracoes_wapi")
      .select("instance_name, instance_url, api_key, status, provisionada")
      .eq("usuario_id", usuarioId)
      .maybeSingle();

    if (existing && existing.provisionada) {
      return new Response(
        JSON.stringify({ success: true, instanceName: existing.instance_name, alreadyProvisioned: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const UAZAPI_BASE_URL = (Deno.env.get("UAZAPI_BASE_URL") ?? "").replace(/\/$/, "");
    const UAZAPI_ADMIN_TOKEN = Deno.env.get("UAZAPI_ADMIN_TOKEN") ?? "";
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";

    if (!UAZAPI_BASE_URL || !UAZAPI_ADMIN_TOKEN || !SUPABASE_URL) {
      console.error("[whatsapp-provision] missing env vars", {
        hasBaseUrl: !!UAZAPI_BASE_URL, hasAdminToken: !!UAZAPI_ADMIN_TOKEN, hasSupabaseUrl: !!SUPABASE_URL,
      });
      return new Response(JSON.stringify({ error: "Configuração do servidor incompleta" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const instanceName = buildInstanceName(empresaId, usuarioId);

    // --- Step 5: criar instância na uazapi ---
    let initData: any = {};
    try {
      const initRes = await fetch(`${UAZAPI_BASE_URL}/instance/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json", admintoken: UAZAPI_ADMIN_TOKEN },
        body: JSON.stringify({ name: instanceName }),
      });
      const initText = await initRes.text();
      if (!initRes.ok) {
        console.error("[whatsapp-provision] erro em /instance/init", {
          status: initRes.status, body: initText, instanceName,
        });
        return new Response(
          JSON.stringify({ error: "Erro ao criar instância na uazapi", status: initRes.status, detail: initText }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      try { initData = JSON.parse(initText); } catch { /* ok */ }
    } catch (e) {
      console.error("[whatsapp-provision] erro de rede em /instance/init", e);
      return new Response(
        JSON.stringify({ error: "Erro de rede ao criar instância na uazapi", detail: String(e) }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token: string | undefined =
      initData?.token ?? initData?.instance?.token ?? initData?.instance?.apikey ?? initData?.apikey;

    if (!token) {
      console.error("[whatsapp-provision] resposta de /instance/init sem token", initData);
      return new Response(
        JSON.stringify({ error: "uazapi não retornou token da instância", detail: initData }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Step 6: configurar webhook ---
    const webhookUrl = `${SUPABASE_URL}/functions/v1/whatsapp-webhook?instance=${instanceName}`;
    try {
      const webhookRes = await fetch(`${UAZAPI_BASE_URL}/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token },
        body: JSON.stringify({ url: webhookUrl, enabled: true }),
      });
      const webhookText = await webhookRes.text().catch(() => "");
      if (!webhookRes.ok) {
        console.error("[whatsapp-provision] erro em /webhook", {
          status: webhookRes.status, body: webhookText, instanceName,
        });
        await deleteOrphanInstance(UAZAPI_BASE_URL, token, instanceName);
        return new Response(
          JSON.stringify({ error: "Erro ao configurar webhook na uazapi", status: webhookRes.status, detail: webhookText }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } catch (e) {
      console.error("[whatsapp-provision] erro de rede em /webhook", e);
      await deleteOrphanInstance(UAZAPI_BASE_URL, token, instanceName);
      return new Response(
        JSON.stringify({ error: "Erro de rede ao configurar webhook na uazapi", detail: String(e) }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Step 7: salvar configuração ---
    const { error: upsertError } = await supabase
      .from("configuracoes_wapi")
      .upsert(
        {
          usuario_id: usuarioId,
          empresa_id: empresaId,
          instance_name: instanceName,
          api_key: token,
          instance_url: UAZAPI_BASE_URL,
          provisionada: true,
          status: "disconnected",
        },
        { onConflict: "usuario_id" }
      );

    if (upsertError) {
      console.error("[whatsapp-provision] erro ao salvar configuracoes_wapi", upsertError);
      return new Response(
        JSON.stringify({ error: "Erro ao salvar configuração", detail: upsertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Step 8 ---
    return new Response(JSON.stringify({ success: true, instanceName }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[whatsapp-provision] erro inesperado", err);
    return new Response(JSON.stringify({ error: "Internal error", detail: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
