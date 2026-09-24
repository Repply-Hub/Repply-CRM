import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  urlDeConsentimento,
  trocarCodigoPorToken,
  criarCalendarioRepply,
} from "../_shared/calendario-google.ts";

/**
 * Conectar / retorno / desconectar o Google Calendar (OAuth) — Fase 1 da sincronização de agenda.
 *
 * - POST { acao: 'iniciar' }: gera um `nonce` aleatório de USO ÚNICO (guardado na linha do vendedor
 *   em calendario_contas, com validade curta) e devolve a URL de consentimento do Google com o
 *   `state = user_id.nonce`. O /retorno só aceita se o nonce bater e não tiver expirado — é o que
 *   fecha a janela de CSRF de vinculação de conta (um `state` fixo seria reutilizável).
 * - GET /retorno?code&state: o Google chama aqui. Confere o nonce, troca o código, cria o
 *   calendário "Repply CRM", grava os tokens CIFRADOS e consome o nonce.
 * - POST { acao: 'desconectar' }: apaga tokens e as etiquetas daquela conexão.
 *
 * Toda chamada à API do Google passa pelo adaptador da Tarefa 6. Não é testável localmente.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
// base64 de 32 bytes — a MESMA chave que a calendario-sincronizar usa para decifrar.
const KEY_RAW = Deno.env.get("CALENDARIO_TOKEN_KEY")!;
const NONCE_VALIDADE_MS = 10 * 60 * 1000; // 10 min entre "iniciar" e o retorno do Google
// App é implantação única (CLAUDE.md §16); derivar do url.origin daria o domínio do Supabase.
const APP_URL = Deno.env.get("CALENDARIO_APP_URL") ?? "https://crm.repplyhub.com.br";

async function chave(): Promise<CryptoKey> {
  const bytes = Uint8Array.from(atob(KEY_RAW), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

// Formato: IV de 12 bytes + ciphertext, tudo em base64. A calendario-sincronizar decifra assim.
async function cifrar(texto: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await chave(), new TextEncoder().encode(texto)),
  );
  const junto = new Uint8Array(iv.length + ct.length);
  junto.set(iv);
  junto.set(ct, iv.length);
  return btoa(String.fromCharCode(...junto));
}

function novoNonce(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  // O /retorno é navegação de página inteira; erro volta para a agenda com um aviso, não texto cru.
  const voltarParaAgenda = (erro?: string) =>
    new Response(null, { status: 302, headers: { Location: `${APP_URL}/calendario${erro ? `?calendario_erro=${erro}` : ""}` } });

  const url = new URL(req.url);

  // ---- Retorno do Google (GET ?code&state) --------------------------------------------------
  if (req.method === "GET" && url.pathname.endsWith("/retorno")) {
    const code = url.searchParams.get("code");
    const [userId, nonce] = (url.searchParams.get("state") ?? "").split(".");
    if (!code || !userId || !nonce) return voltarParaAgenda("conexao");

    // Confere o nonce guardado (uso único, com validade) — é o que barra o CSRF de vinculação.
    const { data: pend } = await admin
      .from("calendario_contas")
      .select("id, oauth_nonce, oauth_nonce_expira")
      .eq("user_id", userId)
      .eq("provedor", "google")
      .maybeSingle();
    if (
      !pend || !pend.oauth_nonce || pend.oauth_nonce !== nonce ||
      !pend.oauth_nonce_expira || new Date(pend.oauth_nonce_expira).getTime() < Date.now()
    ) {
      return voltarParaAgenda("conexao");
    }

    const { data: u } = await admin.from("usuarios").select("empresa_id").eq("user_id", userId).maybeSingle();
    if (!u?.empresa_id) return voltarParaAgenda("empresa"); // não cria conexão sem empresa (isolamento)

    const tok = await trocarCodigoPorToken(code);
    const cal = await criarCalendarioRepply(tok.access_token);

    // (Re)conexão cria um calendário NOVO; as etiquetas antigas apontariam para o calendário
    // abandonado e dariam 404 no próximo empurrar. Limpa antes de gravar o vínculo novo.
    await admin.from("evento_sync_externo").delete().eq("calendario_conta_id", pend.id);

    await admin
      .from("calendario_contas")
      .update({
        empresa_id: u.empresa_id,
        calendario_externo_id: cal.id,
        refresh_token: await cifrar(tok.refresh_token),
        access_token: await cifrar(tok.access_token),
        token_expira_em: new Date(Date.now() + tok.expires_in * 1000).toISOString(),
        status: "conectada",
        ultimo_erro: null,
        sync_token: null,
        oauth_nonce: null, // consome o nonce (uso único)
        oauth_nonce_expira: null,
      })
      .eq("id", pend.id);

    return voltarParaAgenda();
  }

  // ---- Chamadas do app (POST { acao }) — autenticadas pelo JWT do vendedor --------------------
  const authHeader = req.headers.get("Authorization") ?? "";
  const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await anon.auth.getUser();
  if (!user) return json({ error: "Não autenticado." }, 401);

  const { acao } = await req.json();

  if (acao === "iniciar") {
    const nonce = novoNonce();
    const expira = new Date(Date.now() + NONCE_VALIDADE_MS).toISOString();
    const { data: existente } = await admin
      .from("calendario_contas")
      .select("id")
      .eq("user_id", user.id)
      .eq("provedor", "google")
      .maybeSingle();

    if (existente) {
      // Só grava o nonce; NÃO mexe em status/tokens (pode ser uma reconexão de quem já está ligado).
      await admin.from("calendario_contas")
        .update({ oauth_nonce: nonce, oauth_nonce_expira: expira })
        .eq("id", existente.id);
    } else {
      // Linha nova: empresa_id é NOT NULL, então já nasce com a empresa e status 'desconectada'.
      const { data: u } = await admin.from("usuarios").select("empresa_id").eq("user_id", user.id).maybeSingle();
      if (!u?.empresa_id) return json({ error: "Sua empresa não foi identificada." }, 400);
      await admin.from("calendario_contas").insert({
        user_id: user.id, empresa_id: u.empresa_id, provedor: "google",
        status: "desconectada", oauth_nonce: nonce, oauth_nonce_expira: expira,
      });
    }
    return json({ url: urlDeConsentimento(`${user.id}.${nonce}`) });
  }

  if (acao === "desconectar") {
    const { data: conta } = await admin
      .from("calendario_contas")
      .select("id")
      .eq("user_id", user.id)
      .eq("provedor", "google")
      .maybeSingle();
    if (conta) {
      await admin.from("evento_sync_externo").delete().eq("calendario_conta_id", conta.id);
      await admin.from("calendario_contas")
        .update({ status: "desconectada", refresh_token: null, access_token: null, sync_token: null, oauth_nonce: null, oauth_nonce_expira: null })
        .eq("id", conta.id);
    }
    return json({ ok: true });
  }

  return json({ error: "Ação desconhecida." }, 400);
});
