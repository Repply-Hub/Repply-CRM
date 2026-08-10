import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// URLs do CDN da Meta (pps.whatsapp.net) trazem a expiração no parâmetro `oe`,
// timestamp unix em hex. Sem esse parâmetro (formato inesperado), assume-se sem
// expiração conhecida — melhor manter a foto do que descartá-la.
function extractExpiresAt(url: string): string | null {
  try {
    const oe = new URL(url).searchParams.get("oe");
    if (!oe || !/^[0-9a-fA-F]+$/.test(oe)) return null;
    return new Date(parseInt(oe, 16) * 1000).toISOString();
  } catch {
    return null;
  }
}

// Procura recursivamente uma URL de imagem em chaves como image/photo/foto/avatar/picture
function findImageUrl(obj: unknown, depth = 0): string | null {
  if (!obj || depth > 4) return null;
  if (typeof obj !== "object") return null;
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof value === "string" && /^https?:\/\//.test(value) && /image|photo|foto|avatar|picture|imgurl/i.test(key)) {
      return value;
    }
  }
  for (const value of Object.values(obj as Record<string, unknown>)) {
    if (value && typeof value === "object") {
      const found = findImageUrl(value, depth + 1);
      if (found) return found;
    }
  }
  return null;
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

    const { telefone } = body as { telefone?: string };
    const digits = (telefone ?? "").replace(/\D/g, "");
    if (!digits) {
      return new Response(JSON.stringify({ error: "telefone obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: userData } = await supabase
      .from("usuarios").select("empresa_id").eq("user_id", user.id).single();
    if (!userData) {
      return new Response(JSON.stringify({ error: "Seu usuário não foi encontrado no sistema. Fale com o gestor da empresa." }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const empresaId = userData.empresa_id;

    const { data: cached } = await supabase
      .from("whatsapp_contatos_fotos")
      .select("foto_perfil_url, foto_perfil_expires_at")
      .eq("empresa_id", empresaId)
      .eq("telefone", digits)
      .maybeSingle();
    // `foto_perfil_expires_at` nulo cobre tanto fotos salvas antes desta coluna existir
    // quanto respostas sem o parâmetro `oe` — em ambos os casos não sabemos se ainda é
    // válida, então força revalidação em vez de confiar num link já vencido pra sempre
    // (era isso que prendia a mesma foto morta no cache por semanas).
    const aindaValida = !!cached?.foto_perfil_expires_at
      && new Date(cached.foto_perfil_expires_at).getTime() > Date.now();
    if (cached?.foto_perfil_url && aindaValida) {
      return new Response(JSON.stringify({ foto_perfil_url: cached.foto_perfil_url }), {
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
    const number = digits.startsWith("55") ? digits : `55${digits}`;

    let responseText = "";
    let wapiStatus = 0;
    try {
      const res = await fetch(`${baseUrl}/chat/details`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: config.api_key },
        body: JSON.stringify({ number }),
      });
      wapiStatus = res.status;
      responseText = await res.text().catch(() => "");
    } catch (e) {
      return new Response(JSON.stringify({ error: "Erro de rede", detail: String(e) }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (wapiStatus < 200 || wapiStatus >= 300) {
      return new Response(JSON.stringify({ error: "Erro ao buscar foto", detail: responseText }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let wapiResult: unknown = null;
    try { wapiResult = JSON.parse(responseText); } catch { /* ok */ }
    const fotoUrl = findImageUrl(wapiResult);

    // "Este contato não tem foto" também é uma resposta e precisa ser lembrada com prazo
    // (mesmo raciocínio do whatsapp-contact-photo) — do contrário volta a reperguntar pra
    // sempre a cada abertura do painel de participantes.
    const SEM_FOTO_REPERGUNTAR_EM_DIAS = 7;
    const expiresAt = fotoUrl
      ? extractExpiresAt(fotoUrl)
      : new Date(Date.now() + SEM_FOTO_REPERGUNTAR_EM_DIAS * 86_400_000).toISOString();

    await supabase
      .from("whatsapp_contatos_fotos")
      .upsert(
        {
          empresa_id: empresaId,
          telefone: digits,
          // Só sobrescreve a URL quando encontrou uma; do contrário mantém a que já
          // estava lá (ainda que vencida, é melhor que apagar) e apenas adia a próxima
          // pergunta.
          ...(fotoUrl ? { foto_perfil_url: fotoUrl } : {}),
          foto_perfil_expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "empresa_id,telefone" },
      );

    return new Response(JSON.stringify({ foto_perfil_url: fotoUrl ?? cached?.foto_perfil_url ?? null }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Erro inesperado. Tente de novo em instantes.", detail: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
