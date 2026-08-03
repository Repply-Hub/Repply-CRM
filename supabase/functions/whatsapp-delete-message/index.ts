import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Mesma extração usada em whatsapp-send/whatsapp-send-reaction: o wamid salvo às
// vezes vem como "<telefone>:<messageid>" — a uazapi espera só o messageid puro.
function rawMessageId(wamid: string): string {
  const idx = wamid.lastIndexOf(":");
  return idx !== -1 ? wamid.slice(idx + 1) : wamid;
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

    const { mensagemId } = body as { mensagemId?: string };
    if (!mensagemId) {
      return new Response(JSON.stringify({ error: "mensagemId é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: userData } = await supabase
      .from("usuarios")
      .select("id, empresa_id")
      .eq("user_id", user.id).single();
    if (!userData) {
      return new Response(JSON.stringify({ error: "Seu usuário não foi encontrado no sistema. Fale com o gestor da empresa." }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // A RLS de whatsapp_mensagens já restringiria isso pro client normal, mas essa
    // function usa a service role — filtra por empresa manualmente para não permitir
    // apagar mensagem de empresa alheia.
    const { data: mensagem } = await supabase
      .from("whatsapp_mensagens")
      .select("id, wamid, apagada_para_todos")
      .eq("id", mensagemId)
      .eq("empresa_id", userData.empresa_id)
      .maybeSingle();
    if (!mensagem) {
      return new Response(JSON.stringify({ error: "Mensagem não encontrada" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (mensagem.apagada_para_todos) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // A uazapi só expõe um único mecanismo de exclusão (POST /message/delete) e ele
    // sempre revoga a mensagem no WhatsApp real para todos os participantes — não
    // existe "apagar só para mim" na API deles. Notas internas nunca foram enviadas
    // ao WhatsApp (sem wamid), então nesse caso só o hide no CRM se aplica.
    if (mensagem.wamid) {
      const { data: instLink } = await supabase
        .from("wapi_instancia_usuarios")
        .select("configuracoes_wapi:instancia_id(id, instance_url, api_key, instance_name, status)")
        .eq("usuario_auth_id", user.id)
        .limit(1)
        .maybeSingle();
      const config = (instLink?.configuracoes_wapi ?? null) as {
        id: string; instance_url: string; api_key: string; instance_name: string; status: string;
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

      // POST /message/delete da uazapi: { id } no body, header token com o token da
      // instância — apaga a mensagem para todos os participantes da conversa.
      const wapiUrl = `${baseUrl}/message/delete`;
      let wapiStatus = 0;
      let responseText = "";
      let fetchError = "";
      try {
        const res = await fetch(wapiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", token: config.api_key },
          body: JSON.stringify({ id: rawMessageId(mensagem.wamid) }),
        });
        wapiStatus = res.status;
        responseText = await res.text().catch(() => "");
      } catch (e) { fetchError = String(e); }

      await supabase.from("webhook_debug").insert({
        payload: {
          _debug: true, _delete_message: true, url: wapiUrl, status: wapiStatus,
          response: responseText, fetch_error: fetchError || null,
          request_body: { id: rawMessageId(mensagem.wamid) },
        },
      });

      if (fetchError) {
        return new Response(JSON.stringify({ error: "Erro de rede ao contactar WhatsApp", detail: fetchError }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (wapiStatus < 200 || wapiStatus >= 300) {
        let wapiError = "";
        try { wapiError = JSON.parse(responseText)?.error ?? ""; } catch { /* ok */ }
        return new Response(JSON.stringify({ error: wapiError || `Erro ao apagar mensagem (status ${wapiStatus})`, detail: responseText }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    await supabase.from("whatsapp_mensagens").update({ apagada_para_todos: true }).eq("id", mensagemId);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Erro inesperado. Tente de novo em instantes.", detail: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
