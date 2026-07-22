import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function buildInstanceName(empresaId: string): string {
  const sanitize = (s: string) => s.replace(/[^a-z0-9]/gi, "").toLowerCase();
  const empresaPart = sanitize(empresaId).slice(0, 8);
  const random = Math.random().toString(36).slice(2, 8);
  return `${empresaPart}_${random}`;
}

async function deleteOrphan(baseUrl: string, token: string): Promise<void> {
  await fetch(`${baseUrl}/instance`, {
    method: "DELETE",
    headers: { token },
  }).catch(() => {});
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
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const { data: caller } = await supabase
      .from("usuarios")
      .select("id, role, empresa_id")
      .eq("user_id", user.id)
      .single();

    if (!caller) return json({ error: "Caller not found" }, 404);

    const allowedRoles = ["admin", "empresa", "gestor"];
    if (!allowedRoles.includes(caller.role)) return json({ error: "Forbidden" }, 403);

    let body: Record<string, any> = {};
    try { body = await req.json(); } catch { /* body vazio */ }

    const { action, instance_id, target_usuario_id } = body;

    // target_usuario_ids: lista opcional para vincular a MÚLTIPLOS usuários na criação
    // (ex: "vincular a todos os usuários da empresa"). target_usuario_id (singular)
    // continua suportado por compatibilidade e é tratado como lista de 1 item.
    const target_usuario_ids: string[] = Array.isArray(body.target_usuario_ids)
      ? body.target_usuario_ids
      : (target_usuario_id ? [target_usuario_id] : []);

    // ── CREATE: cria instância na uazapi, vincula opcionalmente a um ou mais usuários ──
    if (action === "create") {
      const UAZAPI_BASE_URL = (Deno.env.get("UAZAPI_BASE_URL") ?? "").replace(/\/$/, "");
      const UAZAPI_ADMIN_TOKEN = Deno.env.get("UAZAPI_ADMIN_TOKEN") ?? "";
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";

      if (!UAZAPI_BASE_URL || !UAZAPI_ADMIN_TOKEN || !SUPABASE_URL) {
        return json({ error: "Configuração do servidor incompleta" }, 500);
      }

      let targetAuthIds: string[] = [];
      let empresaId = caller.empresa_id;

      if (target_usuario_ids.length > 0) {
        const { data: targets } = await supabase
          .from("usuarios")
          .select("id, user_id, empresa_id")
          .in("id", target_usuario_ids);

        if (!targets || targets.length !== target_usuario_ids.length) {
          return json({ error: "Usuário alvo não encontrado" }, 404);
        }

        if (caller.role !== "admin" && targets.some(t => t.empresa_id !== caller.empresa_id)) {
          return json({ error: "Forbidden: usuário fora da sua empresa" }, 403);
        }

        targetAuthIds = targets.map(t => t.user_id);
        empresaId = targets[0].empresa_id;
      }

      const instanceName = buildInstanceName(empresaId);

      const initRes = await fetch(`${UAZAPI_BASE_URL}/instance/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json", admintoken: UAZAPI_ADMIN_TOKEN },
        body: JSON.stringify({ name: instanceName }),
      });

      const initText = await initRes.text();
      if (!initRes.ok) {
        return json({ error: "Erro ao criar instância na uazapi", detail: initText }, 500);
      }

      let initData: Record<string, any> = {};
      try { initData = JSON.parse(initText); } catch { /* ok */ }

      const token: string | undefined =
        initData?.token ?? initData?.instance?.token ?? initData?.instance?.apikey ?? initData?.apikey;

      if (!token) {
        return json({ error: "uazapi não retornou token da instância", detail: initData }, 500);
      }

      const webhookUrl = `${SUPABASE_URL}/functions/v1/whatsapp-webhook?instance=${instanceName}`;
      const webhookRes = await fetch(`${UAZAPI_BASE_URL}/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token },
        body: JSON.stringify({ url: webhookUrl, enabled: true, events: "All" }),
      });

      if (!webhookRes.ok) {
        await deleteOrphan(UAZAPI_BASE_URL, token);
        return json({ error: "Erro ao configurar webhook na uazapi" }, 500);
      }

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
        await deleteOrphan(UAZAPI_BASE_URL, token);
        return json({ error: "Erro ao salvar configuração", detail: insertError?.message }, 500);
      }

      // Vincular usuário(s) via junction table (se fornecido)
      if (targetAuthIds.length > 0) {
        const { error: linkError } = await supabase
          .from("wapi_instancia_usuarios")
          .insert(targetAuthIds.map(authId => ({ instancia_id: newInst.id, usuario_auth_id: authId })));

        if (linkError) {
          console.error("[whatsapp-admin-provision] erro ao vincular usuário(s) na criação", linkError);
        }
      }

      return json({ success: true, instanceName });
    }

    // ── LINK: vincula um usuário adicional a uma instância existente ───────────
    if (action === "link") {
      if (!instance_id || target_usuario_ids.length === 0) {
        return json({ error: "instance_id e target_usuario_id(s) são obrigatórios" }, 400);
      }

      const { data: instancia } = await supabase
        .from("configuracoes_wapi")
        .select("id, empresa_id")
        .eq("id", instance_id)
        .single();

      if (!instancia) return json({ error: "Instância não encontrada" }, 404);

      if (caller.role !== "admin" && instancia.empresa_id !== caller.empresa_id) {
        return json({ error: "Forbidden: instância fora da sua empresa" }, 403);
      }

      const { data: targets } = await supabase
        .from("usuarios")
        .select("id, user_id, empresa_id")
        .in("id", target_usuario_ids);

      if (!targets || targets.length !== target_usuario_ids.length) {
        return json({ error: "Usuário alvo não encontrado" }, 404);
      }

      if (caller.role !== "admin" && targets.some(t => t.empresa_id !== caller.empresa_id)) {
        return json({ error: "Forbidden: usuário fora da sua empresa" }, 403);
      }

      // Idempotente: ignora se já estiver vinculado
      const { error: linkError } = await supabase
        .from("wapi_instancia_usuarios")
        .upsert(
          targets.map(t => ({ instancia_id: instance_id, usuario_auth_id: t.user_id })),
          { onConflict: "instancia_id,usuario_auth_id", ignoreDuplicates: true }
        );

      if (linkError) {
        return json({ error: "Erro ao vincular usuário", detail: linkError.message }, 500);
      }

      return json({ success: true });
    }

    // ── UNLINK: remove vínculo de um usuário específico com a instância ────────
    if (action === "unlink") {
      if (!instance_id || !target_usuario_id) {
        return json({ error: "instance_id e target_usuario_id são obrigatórios" }, 400);
      }

      const { data: instancia } = await supabase
        .from("configuracoes_wapi")
        .select("id, empresa_id")
        .eq("id", instance_id)
        .single();

      if (!instancia) return json({ error: "Instância não encontrada" }, 404);

      if (caller.role !== "admin" && instancia.empresa_id !== caller.empresa_id) {
        return json({ error: "Forbidden: instância fora da sua empresa" }, 403);
      }

      const { data: target } = await supabase
        .from("usuarios")
        .select("user_id")
        .eq("id", target_usuario_id)
        .single();

      if (!target) return json({ error: "Usuário não encontrado" }, 404);

      await supabase
        .from("wapi_instancia_usuarios")
        .delete()
        .eq("instancia_id", instance_id)
        .eq("usuario_auth_id", target.user_id);

      return json({ success: true });
    }

    // ── DELETE: remove instância da uazapi e do banco (cascade limpa junction) ─
    if (action === "delete") {
      if (!instance_id) return json({ error: "instance_id é obrigatório" }, 400);

      const { data: instancia } = await supabase
        .from("configuracoes_wapi")
        .select("id, empresa_id, api_key, instance_url")
        .eq("id", instance_id)
        .single();

      if (!instancia) return json({ error: "Instância não encontrada" }, 404);

      if (caller.role !== "admin" && instancia.empresa_id !== caller.empresa_id) {
        return json({ error: "Forbidden: instância fora da sua empresa" }, 403);
      }

      if (instancia.api_key && instancia.instance_url) {
        await deleteOrphan(instancia.instance_url.replace(/\/$/, ""), instancia.api_key);
      }

      await supabase.from("configuracoes_wapi").delete().eq("id", instance_id);

      return json({ success: true });
    }

    return json({ error: "Ação inválida. Use: create, link, unlink, delete" }, 400);

  } catch (err) {
    console.error("[whatsapp-admin-provision] erro inesperado", err);
    return json({ error: "Internal error", detail: String(err) }, 500);
  }
});
