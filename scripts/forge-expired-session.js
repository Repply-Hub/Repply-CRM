/**
 * Utilitário de teste manual — NÃO faz parte do build de produção.
 *
 * Forja um access_token expirado na sessão Supabase armazenada no localStorage,
 * mantendo o refresh_token original intacto. Usado para reproduzir o cenário
 * "JWT expired -> fetchProfile detecta -> refreshSession() -> retry" sem
 * precisar esperar a expiração real nem mexer em configuração do projeto Supabase.
 *
 * Como usar:
 *   1. Faça login normal na aplicação (dev server).
 *   2. Abra o console do browser e cole o conteúdo deste arquivo (ou rode via
 *      page.evaluate em um script Playwright).
 *   3. Recarregue a página (F5) e observe os logs [AUTH].
 */
(function forgeExpiredSession() {
  const STORAGE_PREFIX = "sb-";
  const STORAGE_SUFFIX = "-auth-token";

  const key = Object.keys(localStorage).find(
    (k) => k.startsWith(STORAGE_PREFIX) && k.endsWith(STORAGE_SUFFIX)
  );
  if (!key) {
    console.error("[forge] Nenhuma sessão Supabase encontrada no localStorage. Faça login primeiro.");
    return;
  }

  const raw = localStorage.getItem(key);
  const session = JSON.parse(raw);
  const accessToken = session.access_token;
  if (!accessToken) {
    console.error("[forge] Sessão encontrada mas sem access_token:", session);
    return;
  }

  const [headerB64, payloadB64, signatureB64] = accessToken.split(".");
  if (!headerB64 || !payloadB64 || !signatureB64) {
    console.error("[forge] access_token não parece um JWT válido (esperado 3 partes):", accessToken);
    return;
  }

  const base64UrlDecode = (str) =>
    decodeURIComponent(
      atob(str.replace(/-/g, "+").replace(/_/g, "/"))
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join("")
    );

  const base64UrlEncode = (str) =>
    btoa(unescape(encodeURIComponent(str)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

  const payload = JSON.parse(base64UrlDecode(payloadB64));
  const oldExp = payload.exp;
  payload.exp = Math.floor(Date.now() / 1000) - 3600; // 1h no passado

  const forgedPayloadB64 = base64UrlEncode(JSON.stringify(payload));
  // Header e signature mantidos como estão — a assinatura fica inválida, mas
  // o objetivo é simular exp expirado client-side, que é o que o client do
  // Supabase/PostgREST rejeita antes mesmo de validar a assinatura no servidor.
  const forgedAccessToken = `${headerB64}.${forgedPayloadB64}.${signatureB64}`;

  session.access_token = forgedAccessToken;
  session.expires_at = payload.exp;
  // refresh_token NÃO é tocado — precisa continuar válido para refreshSession() funcionar.

  localStorage.setItem(key, JSON.stringify(session));

  console.log("[forge] access_token reescrito com exp expirado.");
  console.log("[forge] exp original:", oldExp, "-> exp forjado:", payload.exp);
  console.log("[forge] refresh_token mantido intacto. Recarregue a página (F5) para reproduzir o cenário.");
})();
