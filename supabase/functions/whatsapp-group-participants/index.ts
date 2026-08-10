import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizeWhatsappPhone } from "../_shared/whatsapp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const { conversa_id } = body as { conversa_id?: string };
    if (!conversa_id) {
      return new Response(JSON.stringify({ error: "conversa_id obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: conversa } = await supabase
      .from("whatsapp_conversas")
      .select("id, telefone, empresa_id, is_group, participantes")
      .eq("id", conversa_id)
      .single();
    if (!conversa) {
      return new Response(JSON.stringify({ error: "Conversa não encontrada" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // A conversa acima foi lida com SERVICE_ROLE, que ignora RLS. Esta é a mais
    // grave das três funções sem checagem de empresa: ela devolve a LISTA DE
    // PARTICIPANTES de um grupo — nomes e telefones de terceiros. Sem a
    // comparação abaixo, qualquer usuário autenticado de QUALQUER empresa lia os
    // participantes do grupo de outra empresa só passando o id, que vem do corpo
    // da requisição.
    //
    // A checagem precisa vir ANTES dos retornos rápidos logo abaixo (grupo vazio
    // e participantes já em cache) — senão o cache entregaria a lista sem nunca
    // passar por aqui.
    //
    // 404 em vez de 403 para não confirmar que o id existe.
    const { data: quemChamou } = await supabase
      .from("usuarios")
      .select("empresa_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!quemChamou?.empresa_id || quemChamou.empresa_id !== conversa.empresa_id) {
      console.warn(
        `[whatsapp-group-participants] acesso negado: user=${user.id} tentou a conversa ${conversa_id} da empresa ${conversa.empresa_id}`,
      );
      return new Response(JSON.stringify({ error: "Conversa não encontrada" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!conversa.is_group) {
      return new Response(JSON.stringify({ participantes: [] }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (Array.isArray(conversa.participantes) && conversa.participantes.length > 0) {
      return new Response(JSON.stringify({ participantes: conversa.participantes }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: instLink } = await supabase
      .from("wapi_instancia_usuarios")
      .select("configuracoes_wapi:instancia_id(instance_url, api_key, status)")
      .eq("usuario_auth_id", user.id)
      .limit(1)
      .maybeSingle();
    const config = (instLink?.configuracoes_wapi ?? null) as {
      instance_url: string; api_key: string; status: string;
    } | null;
    if (!config || config.status !== "connected") {
      return new Response(JSON.stringify({ error: "Seu usuário não tem WhatsApp vinculado. Peça ao gestor para liberar em Configurações." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const baseUrl = config.instance_url.replace(/\/$/, "");
    const groupJid = `${conversa.telefone}@g.us`;

    let responseText = "";
    let wapiStatus = 0;
    try {
      const res = await fetch(`${baseUrl}/group/list`, {
        method: "GET",
        headers: { token: config.api_key },
      });
      wapiStatus = res.status;
      responseText = await res.text().catch(() => "");
    } catch (e) {
      return new Response(JSON.stringify({ error: "Erro de rede", detail: String(e) }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (wapiStatus < 200 || wapiStatus >= 300) {
      return new Response(JSON.stringify({ error: "Erro ao buscar grupos", detail: responseText }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let wapiResult: any = {};
    try { wapiResult = JSON.parse(responseText); } catch { /* ok */ }
    const grupos: any[] = wapiResult?.groups ?? [];
    const grupo = grupos.find((g) => g?.JID === groupJid);
    const rawParticipants: any[] = grupo?.Participants ?? [];

    // `DisplayName` do /group/list é "nome exibido no grupo (para usuários anônimos)" —
    // ou seja, só vem preenchido quando a WhatsApp NÃO consegue identificar o contato,
    // exatamente o oposto do que queremos. O nome salvo de verdade (o mesmo que aparece
    // no app do celular conectado à instância) só existe em GET /contacts
    // (contactScope=address_book -> contact_name), por isso buscamos essa lista à parte
    // e casamos por telefone normalizado para sobrescrever o DisplayName quando possível.
    let contatosPorTelefone = new Map<string, string>();
    try {
      const contatosRes = await fetch(`${baseUrl}/contacts?contactScope=address_book`, {
        method: "GET",
        headers: { token: config.api_key },
      });
      if (contatosRes.ok) {
        const contatos: any[] = await contatosRes.json().catch(() => []);
        for (const c of Array.isArray(contatos) ? contatos : []) {
          const tel = normalizeWhatsappPhone(String(c?.jid ?? "").replace(/@.*$/, ""));
          if (tel && c?.contact_name) contatosPorTelefone.set(tel, c.contact_name);
        }
      } else {
        console.error(`[whatsapp-group-participants] GET /contacts falhou: status=${contatosRes.status}`);
      }
    } catch (e) {
      // Sem agenda disponível, segue só com DisplayName/fallback de telefone — mas loga pra
      // não repetir a investigação manual por curl caso volte a acontecer.
      console.error(`[whatsapp-group-participants] erro ao buscar /contacts:`, e);
    }

    const participantes = rawParticipants.map((p) => {
      const telefone = normalizeWhatsappPhone(String(p?.PhoneNumber ?? p?.JID ?? "").replace(/@.*$/, ""));
      return {
        nome: (telefone && contatosPorTelefone.get(telefone)) || p?.DisplayName || null,
        telefone,
      };
    }).filter((p) => p.telefone);

    if (participantes.length > 0) {
      await supabase
        .from("whatsapp_conversas")
        .update({ participantes })
        .eq("id", conversa_id);
    }

    return new Response(JSON.stringify({ participantes }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Erro inesperado. Tente de novo em instantes.", detail: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
