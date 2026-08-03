import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function buildInstanceName(empresaId: string, usuarioAuthId: string): string {
  const sanitize = (s: string) => s.replace(/[^a-z0-9]/gi, "").toLowerCase();
  const empresaPart = sanitize(empresaId).slice(0, 8);
  const usuarioPart = sanitize(usuarioAuthId).slice(0, 8);
  return `${empresaPart}_${usuarioPart}`;
}

async function deleteOrphanInstance(baseUrl: string, token: string): Promise<void> {
  try {
    const res = await fetch(`${baseUrl}/instance`, {
      method: "DELETE",
      headers: { token },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[whatsapp-provision] falha ao limpar instância órfã", { status: res.status, body: text });
    }
  } catch (e) {
    console.error("[whatsapp-provision] erro de rede ao limpar instância órfã", String(e));
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Sessão não identificada. Entre novamente no sistema." }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: "Sua sessão expirou. Atualize a página e entre de novo." }, 401);

    const { data: callerData, error: callerError } = await supabase
      .from("usuarios")
      .select("id, role, empresa_id")
      .eq("user_id", user.id)
      .single();

    if (callerError || !callerData) return json({ error: "Seu usuário não foi encontrado no sistema. Fale com o gestor da empresa." }, 404);

    // Lê o body (pode ser vazio para auto-provisionamento do próprio usuário)
    let body: Record<string, any> = {};
    try { body = await req.json(); } catch { /* body vazio */ }

    const { action, target_usuario_id } = body;

    // ── DELETE de instância (gestor/empresa/admin para funcionários) ───────────
    if (action === "delete" && target_usuario_id) {
      const managerRoles = ["admin", "empresa", "gestor"];
      if (!managerRoles.includes(callerData.role)) {
        return json({ error: "Você não tem permissão para esta ação." }, 403);
      }

      const { data: target } = await supabase
        .from("usuarios")
        .select("id, user_id, empresa_id")
        .eq("id", target_usuario_id)
        .single();

      if (!target) return json({ error: "Target user not found" }, 404);

      if (callerData.role !== "admin" && target.empresa_id !== callerData.empresa_id) {
        return json({ error: "Forbidden: target not in same empresa" }, 403);
      }

      // Encontra instâncias vinculadas ao usuário via junction table
      const { data: vinculos } = await supabase
        .from("wapi_instancia_usuarios")
        .select("instancia_id, configuracoes_wapi:instancia_id(api_key, instance_url)")
        .eq("usuario_auth_id", target.user_id);

      for (const v of vinculos ?? []) {
        const cfg = v.configuracoes_wapi as any;
        if (cfg?.api_key && cfg?.instance_url) {
          await deleteOrphanInstance(cfg.instance_url.replace(/\/$/, ""), cfg.api_key);
        }
        await supabase.from("configuracoes_wapi").delete().eq("id", v.instancia_id);
      }

      return json({ success: true });
    }

    // ── PROVISION ──────────────────────────────────────────────────────────────
    // Se vier target_usuario_id, provisiona para outro usuário (gestor/empresa/admin)
    let targetAuthId = user.id;
    let empresaId = callerData.empresa_id;

    if (target_usuario_id) {
      const managerRoles = ["admin", "empresa", "gestor"];
      if (!managerRoles.includes(callerData.role)) {
        return json({ error: "Você não tem permissão para esta ação." }, 403);
      }

      const { data: target } = await supabase
        .from("usuarios")
        .select("id, user_id, empresa_id")
        .eq("id", target_usuario_id)
        .single();

      if (!target) return json({ error: "Target user not found" }, 404);

      if (callerData.role !== "admin" && target.empresa_id !== callerData.empresa_id) {
        return json({ error: "Forbidden: target not in same empresa" }, 403);
      }

      targetAuthId = target.user_id;
      empresaId = target.empresa_id;
    }

    // Idempotência: se usuário já tem instância vinculada, devolve a existente
    const { data: existingLink } = await supabase
      .from("wapi_instancia_usuarios")
      .select("configuracoes_wapi:instancia_id(instance_name, provisionada)")
      .eq("usuario_auth_id", targetAuthId)
      .limit(1)
      .maybeSingle();

    const existingCfg = existingLink?.configuracoes_wapi as any;
    if (existingCfg?.provisionada) {
      return json({ success: true, instanceName: existingCfg.instance_name, alreadyProvisioned: true });
    }

    // Reutilizar instância já existente da empresa em vez de criar nova
    if (empresaId) {
      const { data: instanciasEmpresa } = await supabase
        .from("configuracoes_wapi")
        .select("id, instance_name")
        .eq("empresa_id", empresaId)
        .eq("provisionada", true)
        .order("created_at", { ascending: true })
        .limit(1);

      const instanciaExistente = instanciasEmpresa?.[0];
      if (instanciaExistente) {
        const { error: linkError } = await supabase
          .from("wapi_instancia_usuarios")
          .insert({ instancia_id: instanciaExistente.id, usuario_auth_id: targetAuthId });

        if (linkError && !linkError.message.includes("duplicate")) {
          console.error("[whatsapp-provision] erro ao vincular à instância existente", linkError);
          return json({ error: "Erro ao vincular à instância existente", detail: linkError.message }, 500);
        }

        return json({ success: true, instanceName: instanciaExistente.instance_name, reused: true });
      }
    }

    const UAZAPI_BASE_URL = (Deno.env.get("UAZAPI_BASE_URL") ?? "").replace(/\/$/, "");
    const UAZAPI_ADMIN_TOKEN = Deno.env.get("UAZAPI_ADMIN_TOKEN") ?? "";
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";

    if (!UAZAPI_BASE_URL || !UAZAPI_ADMIN_TOKEN || !SUPABASE_URL) {
      console.error("[whatsapp-provision] missing env vars", {
        hasBaseUrl: !!UAZAPI_BASE_URL,
        hasAdminToken: !!UAZAPI_ADMIN_TOKEN,
        hasSupabaseUrl: !!SUPABASE_URL,
      });
      return json({ error: "Configuração do servidor incompleta" }, 500);
    }

    const instanceName = buildInstanceName(empresaId, targetAuthId);

    // Criar instância na uazapi
    let initData: any = {};
    try {
      const initRes = await fetch(`${UAZAPI_BASE_URL}/instance/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json", admintoken: UAZAPI_ADMIN_TOKEN },
        body: JSON.stringify({ name: instanceName }),
      });
      const initText = await initRes.text();
      if (!initRes.ok) {
        console.error("[whatsapp-provision] erro em /instance/init", { status: initRes.status, body: initText, instanceName });
        return json({ error: "Erro ao criar instância na uazapi", status: initRes.status, detail: initText }, 500);
      }
      try { initData = JSON.parse(initText); } catch { /* ok */ }
    } catch (e) {
      console.error("[whatsapp-provision] erro de rede em /instance/init", e);
      return json({ error: "Erro de rede ao criar instância na uazapi", detail: String(e) }, 500);
    }

    const token: string | undefined =
      initData?.token ?? initData?.instance?.token ?? initData?.instance?.apikey ?? initData?.apikey;

    if (!token) {
      console.error("[whatsapp-provision] resposta de /instance/init sem token", initData);
      return json({ error: "uazapi não retornou token da instância", detail: initData }, 500);
    }

    // Configurar webhook
    const webhookUrl = `${SUPABASE_URL}/functions/v1/whatsapp-webhook?instance=${instanceName}`;
    try {
      const webhookRes = await fetch(`${UAZAPI_BASE_URL}/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token },
        body: JSON.stringify({ url: webhookUrl, enabled: true, events: "All" }),
      });
      const webhookText = await webhookRes.text().catch(() => "");
      if (!webhookRes.ok) {
        console.error("[whatsapp-provision] erro em /webhook", { status: webhookRes.status, body: webhookText });
        await deleteOrphanInstance(UAZAPI_BASE_URL, token);
        return json({ error: "Erro ao configurar webhook na uazapi", status: webhookRes.status, detail: webhookText }, 500);
      }
    } catch (e) {
      console.error("[whatsapp-provision] erro de rede em /webhook", e);
      await deleteOrphanInstance(UAZAPI_BASE_URL, token);
      return json({ error: "Erro de rede ao configurar webhook na uazapi", detail: String(e) }, 500);
    }

    // Salvar configuração
    const { data: newInst, error: insertError } = await supabase
      .from("configuracoes_wapi")
      .insert({
        empresa_id: empresaId,
        instance_name: instanceName,
        api_key: token,
        instance_url: UAZAPI_BASE_URL,
        provisionada: true,
        status: "disconnected",
      })
      .select("id")
      .single();

    if (insertError || !newInst) {
      console.error("[whatsapp-provision] erro ao salvar configuracoes_wapi", insertError);
      return json({ error: "Erro ao salvar configuração", detail: insertError?.message }, 500);
    }

    // Vincular via junction table
    await supabase
      .from("wapi_instancia_usuarios")
      .insert({ instancia_id: newInst.id, usuario_auth_id: targetAuthId })
      .then(({ error }) => {
        if (error) console.error("[whatsapp-provision] erro ao vincular usuário", error);
      });

    return json({ success: true, instanceName });

  } catch (err) {
    console.error("[whatsapp-provision] erro inesperado", err);
    return json({ error: "Erro inesperado. Tente de novo em instantes.", detail: String(err) }, 500);
  }
});
