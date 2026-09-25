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

    const { conversa_id } = body;
    if (!conversa_id) {
      return new Response(JSON.stringify({ error: "conversa_id obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: conversa } = await supabase
      .from("whatsapp_conversas")
      .select("id, telefone, empresa_id, foto_perfil_url, foto_perfil_expires_at")
      .eq("id", conversa_id)
      .single();
    if (!conversa) {
      return new Response(JSON.stringify({ error: "Conversa não encontrada" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // A conversa acima foi lida com SERVICE_ROLE, que ignora RLS. Sem esta
    // checagem, qualquer usuário autenticado — de QUALQUER empresa — buscava a
    // foto de perfil de um contato de outra empresa passando o id, e o telefone
    // vinha junto. O `conversa_id` vem do corpo: é entrada do cliente.
    //
    // 404 em vez de 403 para não confirmar que o id existe.
    const { data: quemChamou } = await supabase
      .from("usuarios")
      .select("empresa_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!quemChamou?.empresa_id || quemChamou.empresa_id !== conversa.empresa_id) {
      console.warn(
        `[whatsapp-contact-photo] acesso negado: user=${user.id} tentou a conversa ${conversa_id} da empresa ${conversa.empresa_id}`,
      );
      return new Response(JSON.stringify({ error: "Conversa não encontrada" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // foto_perfil_expires_at nulo cobre tanto fotos salvas antes desta coluna
    // existir quanto respostas da uazapi sem o parâmetro `oe` — em ambos os casos
    // não sabemos se ainda é válida, então força uma revalidação em vez de
    // assumir que sim (foi assim que fotos já vencidas ficaram presas por dias).
    const aindaValida = !!conversa.foto_perfil_expires_at
      && new Date(conversa.foto_perfil_expires_at).getTime() > Date.now();
    if (conversa.foto_perfil_url && aindaValida) {
      return new Response(JSON.stringify({
        foto_perfil_url: conversa.foto_perfil_url,
        foto_perfil_expires_at: conversa.foto_perfil_expires_at,
      }), {
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
    const digits = conversa.telefone.replace(/\D/g, "");

    // MESMO cuidado do whatsapp-send: o JID de grupo é literal, nunca passa por
    // `replace(/\D/g,"")`. Os JIDs legados têm hífen (`5511988345626-1425926780`)
    // e limpá-lo produz um destino inexistente — a uazapi devolve 200 com um
    // chat vazio, a foto nunca é gravada, a URL segue "vencida" e a tela repede
    // a mesma foto impossível em toda carga, para sempre.
    const isGroup = conversa.telefone.includes("@g.us") ||
      conversa.telefone.includes("-") ||
      digits.length > 14;
    const number = isGroup
      ? (conversa.telefone.endsWith("@g.us") ? conversa.telefone : `${conversa.telefone}@g.us`)
      : (digits.startsWith("55") ? digits : `55${digits}`);

    let responseText = "";
    let wapiStatus = 0;
    try {
      /**
       * 🔴 POR QUE `/chat/avatar` COM `force`, E NÃO MAIS `/chat/details`.
       *
       * Relatado em 24/09/2026: alguém trocou a foto do WhatsApp meses atrás e o CRM continua
       * mostrando a antiga. Não era o nosso cache — era o DA OPERADORA.
       *
       * A documentação dela diz, sobre este endpoint: "`force=true` solicita uma atualização
       * antecipada, respeitando um intervalo mínimo de 20 segundos por imagem e instância; não
       * use essa opção em polling contínuo."
       *
       * Ou seja: sem `force`, ela devolve a cópia que tem guardada. O nosso endereço vencia a
       * cada ~6 dias, a gente perguntava de novo — e recebia a MESMA foto velha, para sempre.
       * Trocar de foto não invalida nada do lado de lá.
       *
       * `/chat/details` não aceita `force` (só `number` e `preview`), e a própria documentação
       * recomenda: "Para obter somente a imagem, prefira POST /chat/avatar". É tudo o que esta
       * função usa — ela só extrai a imagem da resposta.
       *
       * 🔴 E NÃO É POLLING: só chegamos aqui quando a foto guardada venceu, o que a trava de
       * expiração abaixo garante ser no máximo uma vez a cada poucos dias por conversa. Muito
       * acima do piso de 20 segundos que a operadora pede.
       */
      const res = await fetch(`${baseUrl}/chat/avatar`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: config.api_key },
        body: JSON.stringify({ number, force: true }),
      });
      wapiStatus = res.status;
      responseText = await res.text().catch(() => "");
    } catch (e) {
      return new Response(JSON.stringify({ error: "Erro de rede", detail: String(e) }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let wapiResult: unknown = null;
    try { wapiResult = JSON.parse(responseText); } catch { /* ok */ }

    // Havia aqui um insert em `webhook_debug` a CADA chamada, cujo propósito
    // declarado era "validar o nome exato do campo de imagem" — uma investigação
    // que já terminou; `findImageUrl` acima é o resultado dela.
    //
    // Removido porque essa gravação escalava junto com a rajada de fotos: uma
    // linha por conversa por carga da inbox, numa tabela que já passa de 61 mil
    // linhas. O erro continua visível: 502 com o corpo cru no `detail`, mais o
    // log da própria function.

    if (wapiStatus < 200 || wapiStatus >= 300) {
      return new Response(JSON.stringify({ error: "Erro ao buscar foto", detail: responseText }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    /**
     * 🔴 `/chat/avatar` responde `{ "url": "..." }`, e string VAZIA é resposta válida ("este
     * contato não tem foto"). A chave `url` NÃO casa com o padrão de `findImageUrl`
     * (`image|photo|foto|avatar|picture|imgurl`) — trocar o endpoint sem tratar isso teria
     * apagado a foto de todo mundo em silêncio, que é o pior desfecho possível para um conserto
     * de foto.
     *
     * O `findImageUrl` fica como rede de segurança, para o dia em que a operadora mudar o
     * formato sem avisar.
     */
    const urlDireta = (wapiResult as { url?: unknown } | null)?.url;
    const fotoUrl = (typeof urlDireta === "string" && urlDireta.trim())
      ? urlDireta.trim()
      : findImageUrl(wapiResult);

    /**
     * "Este contato não tem foto" também é uma resposta, e precisa ser lembrada.
     *
     * Antes, quando o provedor respondia 200 sem imagem — contato com foto
     * restrita por privacidade, ou grupo — nada era gravado. `foto_perfil_url`
     * seguia nulo, `foto_perfil_expires_at` seguia nulo, e a tela considerava a
     * foto "vencida": a MESMA busca impossível era refeita a cada carga da
     * inbox, para sempre.
     *
     * Medido nesta empresa: 65 conversas sem foto e 21 grupos = 86 chamadas
     * condenadas por carga, por usuário, indefinidamente — contra apenas 3
     * fotos genuinamente vencidas.
     *
     * Uma semana é o suficiente: quem põe foto de perfil não tem pressa para
     * aparecer no CRM, e o custo de perguntar de novo é alto.
     */
    const SEM_FOTO_REPERGUNTAR_EM_DIAS = 7;

    /**
     * 🔴 PISO OBRIGATÓRIO DEPOIS QUE O `force` ENTROU.
     *
     * Vencimento nulo significa "revalide na próxima". Isso era seguro enquanto a pergunta era
     * barata; com `force=true` passaria a ser uma atualização forçada A CADA CARGA DA INBOX,
     * por conversa — exatamente o "polling contínuo" que a operadora pede para não fazer, e um
     * jeito rápido de sermos limitados.
     *
     * Então: quando a URL não traz vencimento próprio, a gente estipula um. Perder alguns dias
     * de atualidade numa foto é barato; martelar a operadora no número de WhatsApp de um
     * cliente pagante não é.
     */
    const PISO_ENTRE_ATUALIZACOES_DIAS = 3;
    const emDias = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

    const expiresAt = fotoUrl
      ? (extractExpiresAt(fotoUrl) ?? emDias(PISO_ENTRE_ATUALIZACOES_DIAS))
      : emDias(SEM_FOTO_REPERGUNTAR_EM_DIAS);

    await supabase
      .from("whatsapp_conversas")
      .update({
        // Só sobrescreve a URL quando encontrou uma; do contrário mantém a que
        // já estava lá e apenas adia a próxima pergunta.
        ...(fotoUrl ? { foto_perfil_url: fotoUrl } : {}),
        foto_perfil_expires_at: expiresAt,
      })
      .eq("id", conversa_id);

    return new Response(JSON.stringify({ foto_perfil_url: fotoUrl, foto_perfil_expires_at: expiresAt }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Erro inesperado. Tente de novo em instantes.", detail: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
