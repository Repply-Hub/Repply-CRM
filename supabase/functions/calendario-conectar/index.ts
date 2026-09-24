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
 * Três entradas nesta função:
 * - POST { acao: 'iniciar' }: devolve a URL de consentimento do Google, com um `state` assinado
 *   (HMAC) que carrega o `user_id` — é o que o /retorno confere para evitar CSRF.
 * - GET /retorno?code&state: o Google chama aqui depois do consentimento do vendedor. Troca o
 *   código pelos tokens, cria o calendário "Repply CRM" e grava `calendario_contas` com os tokens
 *   CIFRADOS (nunca em texto claro).
 * - POST { acao: 'desconectar' }: apaga os tokens gravados e marca a conta como desconectada.
 *
 * Toda chamada à API do Google passa pelo adaptador da Tarefa 6 (`_shared/calendario-google.ts`);
 * esta função só cuida de autenticação, cifra, `state` assinado e da gravação em
 * `calendario_contas`. Não é testável localmente — a validação real é na implantação.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
// base64 de 32 bytes — a MESMA chave que a Tarefa 8 usa para decifrar.
const KEY_RAW = Deno.env.get("CALENDARIO_TOKEN_KEY")!;

async function chave(): Promise<CryptoKey> {
  const bytes = Uint8Array.from(atob(KEY_RAW), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

// Formato: IV de 12 bytes + ciphertext, tudo em base64. Mantido assim para a Tarefa 8 decifrar.
async function cifrar(texto: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      await chave(),
      new TextEncoder().encode(texto),
    ),
  );
  const junto = new Uint8Array(iv.length + ct.length);
  junto.set(iv);
  junto.set(ct, iv.length);
  return btoa(String.fromCharCode(...junto));
}

// `state` = user_id assinado, para o retorno saber de quem é e evitar CSRF.
async function assinarState(userId: string): Promise<string> {
  const chaveHmac = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(KEY_RAW),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const assinatura = new Uint8Array(
    await crypto.subtle.sign("HMAC", chaveHmac, new TextEncoder().encode(userId)),
  );
  return `${userId}.${btoa(String.fromCharCode(...assinatura))}`;
}

async function lerState(state: string): Promise<string | null> {
  const [userId, assB64] = state.split(".");
  if (!userId || !assB64) return null;
  const esperado = await assinarState(userId);
  return esperado === state ? userId : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Respostas para o app (POST do navegador) levam CORS; o retorno do Google abaixo é navegação
  // de página inteira, não fetch — mesmo padrão de email-callback/index.ts.
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const url = new URL(req.url);

  // Retorno do Google (GET com ?code&state): troca o código, cria o calendário, grava a conexão.
  if (req.method === "GET" && url.pathname.endsWith("/retorno")) {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state") ?? "";
    const userId = await lerState(state);
    if (!code || !userId) return new Response("Falha na conexão.", { status: 400 });

    const tok = await trocarCodigoPorToken(code);
    const cal = await criarCalendarioRepply(tok.access_token);
    // empresa_id do usuário (para isolamento multi-empresa):
    const { data: u } = await admin
      .from("usuarios")
      .select("empresa_id")
      .eq("user_id", userId)
      .maybeSingle();

    await admin.from("calendario_contas").upsert(
      {
        user_id: userId,
        empresa_id: u?.empresa_id,
        provedor: "google",
        calendario_externo_id: cal.id,
        refresh_token: await cifrar(tok.refresh_token),
        access_token: await cifrar(tok.access_token),
        token_expira_em: new Date(Date.now() + tok.expires_in * 1000).toISOString(),
        status: "conectada",
        ultimo_erro: null,
        sync_token: null,
      },
      { onConflict: "user_id,provedor" },
    );

    // Redireciona de volta para a AGENDA DO APP (não o domínio da função). O app é uma implantação
    // única em crm.repplyhub.com.br (CLAUDE.md §16); derivar do url.origin daria o domínio do
    // Supabase, que não é o app. Dá para sobrescrever por CALENDARIO_APP_URL se um dia precisar.
    const appUrl = Deno.env.get("CALENDARIO_APP_URL") ?? "https://crm.repplyhub.com.br";
    return new Response(null, {
      status: 302,
      headers: { Location: `${appUrl}/calendario` },
    });
  }

  // Chamadas do app (POST { acao, provedor }) — autenticadas pelo JWT do usuário.
  const authHeader = req.headers.get("Authorization") ?? "";
  const anon = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await anon.auth.getUser();
  if (!user) return json({ error: "Não autenticado." }, 401);

  const { acao } = await req.json();

  if (acao === "iniciar") {
    return json({ url: urlDeConsentimento(await assinarState(user.id)) });
  }
  if (acao === "desconectar") {
    // Marca desconectada e apaga as etiquetas; a remoção do calendário "Repply CRM" fica opcional.
    await admin
      .from("calendario_contas")
      .update({ status: "desconectada", refresh_token: null, access_token: null })
      .eq("user_id", user.id)
      .eq("provedor", "google");
    return json({ ok: true });
  }
  return json({ error: "Ação desconhecida." }, 400);
});
