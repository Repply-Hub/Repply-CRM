/**
 * Camada comum das funções de e-mail (Nylas v3).
 *
 * REST puro com `fetch`, sem o SDK Node: a documentação do Nylas não menciona
 * Deno em lugar nenhum (busca por "deno" no índice inteiro da doc: zero
 * ocorrências) e o pacote importa `node:fs`/`node:path`. Toda a API é JSON com
 * `Authorization: Bearer`, então o SDK não economizaria nada que compense
 * depender de compatibilidade não testada.
 */

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-nylas-signature",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Base da API. Fica em secret porque a região (`api.us` / `api.eu`) é escolhida
 * na criação da aplicação Nylas e NÃO pode ser trocada depois — chumbar a errada
 * no código só apareceria na primeira chamada real.
 */
export function nylasBase(): string {
  return (Deno.env.get("NYLAS_API_BASE") ?? "https://api.us.nylas.com").replace(/\/$/, "");
}

export function nylasApiKey(): string {
  const k = Deno.env.get("NYLAS_API_KEY");
  if (!k) throw new Error("NYLAS_API_KEY ausente");
  return k;
}

export function nylasClientId(): string {
  const k = Deno.env.get("NYLAS_CLIENT_ID");
  if (!k) throw new Error("NYLAS_CLIENT_ID ausente");
  return k;
}

/**
 * URI de retorno do OAuth.
 *
 * Derivada de SUPABASE_URL em vez de chumbada, mas precisa estar cadastrada
 * IGUAL no painel do Nylas (Hosted Authentication → Callback URIs) e ser
 * byte-a-byte a mesma string usada depois na troca do código — o provedor
 * compara literalmente.
 */
export function callbackUri(): string {
  const base = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  return `${base}/functions/v1/email-callback`;
}

/** Domínio público do app, para onde o callback devolve o navegador. */
export function appUrl(): string {
  const u = Deno.env.get("APP_URL");
  // Sem fallback de propósito: mandar o usuário para um domínio chutado no meio
  // de um fluxo de autenticação é pior do que falhar visivelmente.
  if (!u) throw new Error("APP_URL ausente");
  return u.replace(/\/$/, "");
}

export interface RespostaNylas<T> {
  request_id?: string;
  data?: T;
  next_cursor?: string | null;
  error?: unknown;
}

/**
 * Chamada autenticada à API do Nylas.
 *
 * `timeoutMs` é explícito porque o `fetch` do Deno não tem timeout padrão: uma
 * chamada pendurada seguraria a function até o limite da plataforma. O envio usa
 * 150s por recomendação da própria doc (Exchange self-hosted chega a 2 min); as
 * leituras usam bem menos.
 */
export async function chamarNylas<T>(
  caminho: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<{ ok: boolean; status: number; body: RespostaNylas<T>; texto: string }> {
  const { timeoutMs = 30_000, ...resto } = init;

  const res = await fetch(`${nylasBase()}${caminho}`, {
    ...resto,
    headers: {
      Authorization: `Bearer ${nylasApiKey()}`,
      "Content-Type": "application/json",
      ...(resto.headers ?? {}),
    },
    signal: AbortSignal.timeout(timeoutMs),
  });

  const texto = await res.text();
  let body: RespostaNylas<T> = {};
  try {
    body = texto ? JSON.parse(texto) : {};
  } catch {
    // Resposta não-JSON (erro de gateway, HTML de proxy). O texto cru vai junto
    // para quem chamou conseguir diagnosticar.
  }

  return { ok: res.ok, status: res.status, body, texto };
}

/** Extrai uma mensagem legível de um erro do Nylas, sem vazar o payload inteiro. */
export function erroDoNylas(body: RespostaNylas<unknown>, texto: string): string {
  const e = body?.error as { message?: string; type?: string } | string | undefined;
  if (typeof e === "string" && e.trim()) return e;
  if (e && typeof e === "object" && typeof e.message === "string") return e.message;
  return texto.slice(0, 300) || "erro desconhecido";
}

/** Endereço no formato que o Nylas usa em from/to/cc/bcc. */
export interface EnderecoNylas {
  name?: string;
  email: string;
}

export interface MensagemNylas {
  id: string;
  grant_id?: string;
  thread_id?: string;
  subject?: string;
  snippet?: string;
  body?: string;
  from?: EnderecoNylas[];
  to?: EnderecoNylas[];
  cc?: EnderecoNylas[];
  bcc?: EnderecoNylas[];
  reply_to?: EnderecoNylas[];
  date?: number;
  unread?: boolean;
  starred?: boolean;
  folders?: string[];
  attachments?: Array<{
    id?: string;
    filename?: string;
    content_type?: string;
    size?: number;
    is_inline?: boolean;
  }>;
}

/**
 * Converte a mensagem do Nylas nas colunas de `email_mensagens`.
 *
 * `direcao` sai da comparação entre o remetente e o e-mail da conta, NUNCA da
 * origem da escrita: a mensagem que nós enviamos volta pelo webhook
 * `message.created`, e classificar por origem produziria duas classificações
 * diferentes para a mesma mensagem.
 */
export function mensagemParaLinha(
  msg: MensagemNylas,
  contaId: string,
  empresaId: string,
  emailDaConta: string,
): Record<string, unknown> {
  const remetente = msg.from?.[0];
  const daPropriaConta =
    !!remetente?.email &&
    remetente.email.trim().toLowerCase() === emailDaConta.trim().toLowerCase();

  const anexos = (msg.attachments ?? []).filter((a) => !a.is_inline);

  return {
    empresa_id: empresaId,
    conta_id: contaId,
    nylas_message_id: msg.id,
    nylas_thread_id: msg.thread_id ?? null,
    direcao: daPropriaConta ? "enviado" : "recebido",
    remetente_nome: remetente?.name ?? null,
    remetente_email: remetente?.email ?? null,
    destinatarios: msg.to ?? [],
    cc: msg.cc ?? [],
    bcc: msg.bcc ?? [],
    reply_to: msg.reply_to ?? [],
    assunto: msg.subject ?? null,
    snippet: msg.snippet ?? null,
    tem_anexo: anexos.length > 0,
    anexos: anexos.map((a) => ({
      id: a.id,
      filename: a.filename,
      content_type: a.content_type,
      size: a.size,
    })),
    pastas: msg.folders ?? [],
    lido: msg.unread === undefined ? true : !msg.unread,
    favorito: msg.starred ?? false,
    // `date` do Nylas é epoch em SEGUNDOS.
    data_mensagem: new Date((msg.date ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
    // `excluido` fica FORA de propósito: o PostgREST só atualiza as colunas
    // presentes no payload, e incluí-la ressuscitaria o que o usuário apagou a
    // cada sync. É exatamente o defeito que gmail-sync-inbox tem com `lido`.
  };
}
