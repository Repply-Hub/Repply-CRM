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
 * Pasta no Nylas. No Google, "pasta" e "marcador" são a mesma coisa: os
 * marcadores que a pessoa criou no Gmail (001 - ELIZABETH, 004 - DECA…) chegam
 * aqui como pastas comuns, com id no formato `Label_<números>`.
 */
export interface PastaNylas {
  id: string;
  name?: string;
  /** `\inbox`, `\sent`, `\trash`, `\spam`, `\drafts`… presente nas de sistema. */
  attributes?: string[];
  total_count?: number;
  unread_count?: number;
}

/**
 * Lista TODAS as pastas do grant, seguindo a paginação. Devolve [] em falha —
 * nunca lança.
 *
 * A paginação não é detalhe: `/folders` devolve 50 por página por padrão, e uma
 * caixa de atendimento organizada passa disso com facilidade. Sem seguir o
 * cursor, os marcadores além do quinquagésimo simplesmente não existiriam para
 * o CRM — não apareceriam na barra lateral nem na tela de compartilhamento, e
 * `gravarPastas` ainda APAGARIA os que já estivessem gravados, por considerá-los
 * excluídos no provedor.
 */
export async function buscarPastas(grantId: string): Promise<PastaNylas[]> {
  const todas: PastaNylas[] = [];
  let cursor: string | null = null;

  try {
    // Teto de páginas como rede de segurança: um cursor que se repetisse por
    // bug do provedor daria laço infinito dentro da Edge Function.
    for (let pagina = 0; pagina < 20; pagina++) {
      /**
       * A PRIMEIRA página vai SEM parâmetro nenhum, de propósito.
       *
       * Essa é a única forma comprovada de chamar este endpoint neste projeto:
       * é como o email-callback original resolvia INBOX e SENT, e as duas
       * caixas conectadas têm `pasta_inbox_id`/`pasta_sent_id` preenchidos por
       * ela. Mandar `limit`/`page_token` numa conta Google, onde os rótulos vêm
       * todos de uma vez, é aposta não verificada — e se o provedor recusasse,
       * `buscarPastas` devolveria vazio e o espelho de marcadores simplesmente
       * não aconteceria, em silêncio.
       *
       * A paginação continua existindo, mas só é usada quando o PRÓPRIO
       * provedor oferece um `next_cursor`. Assim ela ajuda quem pagina (o
       * Microsoft) sem arriscar quem não pagina.
       */
      const caminho = cursor
        ? `/v3/grants/${grantId}/folders?page_token=${encodeURIComponent(cursor)}`
        : `/v3/grants/${grantId}/folders`;

      const resp = await chamarNylas<PastaNylas[]>(caminho, {
        method: "GET",
        timeoutMs: 20_000,
      });

      if (!resp.ok) {
        console.warn("[nylas] /folders recusado:", resp.status, resp.texto.slice(0, 200));
        // O que já veio vale mais do que nada — quem chama decide o que fazer
        // com uma lista parcial.
        return todas;
      }

      todas.push(...(resp.body.data ?? []));
      cursor = resp.body.next_cursor ?? null;
      if (!cursor) break;

      if (pagina === 19) {
        console.warn(`[nylas] /folders passou de 20 páginas no grant ${grantId}; truncado`);
      }
    }
    return todas;
  } catch (e) {
    console.warn("[nylas] falha de rede em /folders:", e);
    return todas;
  }
}

/** Atributos com que o Nylas marca pasta de sistema, em qualquer provedor. */
const ATRIBUTOS_DE_SISTEMA = [
  "\\inbox",
  "\\sent",
  "\\drafts",
  "\\trash",
  "\\spam",
  "\\junk",
  "\\archive",
  "\\all",
  "\\important",
  "\\starred",
  "\\flagged",
];

/**
 * Ids que o próprio Gmail usa para os rótulos DELE e que chegam sem atributo
 * nenhum. Sem esta lista, `CATEGORY_PERSONAL` e `UNREAD` passariam por marcador
 * criado pela pessoa e virariam pasta na barra lateral — os dados reais desta
 * caixa têm 35 mensagens em CATEGORY_PERSONAL e 3 em UNREAD.
 *
 * Não atrapalha outro provedor: id de pasta do Microsoft é opaco e não casa.
 */
const IDS_DE_SISTEMA_DO_GOOGLE = new RegExp(
  "^(" +
    // Pastas e estados basicos.
    "INBOX|SENT|DRAFT|DRAFTS|SPAM|TRASH|STARRED|UNREAD|IMPORTANT|CHAT" +
    // Abas da caixa de entrada: CATEGORY_PERSONAL, CATEGORY_PROMOTIONS…
    "|CATEGORY_[A-Z]+" +
    // As "superestrelas" do Gmail. Sao doze ids fixos, cada um uma marcacao
    // visual que a pessoa aplica clicando na estrela — nao sao pastas dela, e
    // apareceriam na barra lateral com nomes como "YELLOW_STAR".
    "|(YELLOW|RED|ORANGE|GREEN|BLUE|PURPLE)_(STAR|BANG)" +
    "|ORANGE_GUILLEMET|GREEN_CHECK|BLUE_INFO|PURPLE_QUESTION" +
  ")$",
);

/**
 * Pastas que o provedor expõe pelo NOME, sem atributo e com id de rótulo comum.
 *
 * O Gmail publica as pastas do IMAP como se fossem rótulos do usuário —
 * `[Gmail]`, `[Imap]/Rascunhos`, `Notes` — com ids `Label_4`, `Label_27`,
 * `Label_185`. Não têm atributo nenhum e o id é um `Label_` legítimo, então nem
 * a lista de atributos nem a de ids do Google os pega: só o nome denuncia.
 *
 * Foram exatamente as três que apareceram na primeira caixa espelhada, no meio
 * dos 25 marcadores reais. Aqui isso também evita gastar uma varredura de
 * mensagens em cada uma delas.
 */
const NOMES_DE_SISTEMA = /^(\[.*\]|Notes)(\/|$)/i;

/**
 * Pasta criada pelo provedor, e não pela pessoa.
 *
 * O que NÃO cai aqui é marcador do usuário — o "001 - ELIZABETH" que ela
 * organizou no Gmail. Só esses viram filtro na barra lateral e unidade de
 * compartilhamento; oferecer "Não lidas" como se fosse pasta dela seria ruído.
 */
export function ehPastaDeSistema(p: PastaNylas): boolean {
  const attrs = (p.attributes ?? []).map((a) => a.toLowerCase());
  if (attrs.some((a) => ATRIBUTOS_DE_SISTEMA.includes(a))) return true;
  if (IDS_DE_SISTEMA_DO_GOOGLE.test((p.id ?? "").trim())) return true;
  return NOMES_DE_SISTEMA.test((p.name ?? "").trim());
}

/**
 * Acha as pastas de sistema que o sync usa como filtro.
 *
 * O filtro `in` da API exige o ID, não o nome. Prefere o atributo ao nome
 * porque o nome muda com o idioma da conta ("Enviados" numa conta em pt-BR).
 */
export function pastasDeSistema(pastas: PastaNylas[]): {
  inbox: string | null;
  sent: string | null;
} {
  let inbox: string | null = null;
  let sent: string | null = null;
  for (const p of pastas) {
    const nome = (p.name ?? "").toLowerCase();
    const attrs = (p.attributes ?? []).map((a) => a.toLowerCase());
    if (!inbox && (attrs.includes("\\inbox") || nome === "inbox")) inbox = p.id;
    if (!sent && (attrs.includes("\\sent") || nome === "sent" || nome === "sent mail")) {
      sent = p.id;
    }
  }
  return { inbox, sent };
}

/**
 * Espelha a lista de pastas do provedor em `email_pastas`.
 *
 * Apaga o que sumiu lá: marcador excluído no Gmail tem de sumir da barra
 * lateral, senão a pessoa clica num filtro que nunca mais terá mensagem.
 *
 * Nunca lança: pasta é conveniência de navegação, e falhar aqui não pode
 * derrubar uma conexão que no mais deu certo.
 */
export async function gravarPastas(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  contaId: string,
  empresaId: string,
  pastas: PastaNylas[],
): Promise<number> {
  if (!pastas.length) return 0;
  try {
    const linhas = pastas
      .filter((p) => p.id)
      .map((p) => ({
        conta_id: contaId,
        empresa_id: empresaId,
        pasta_id: p.id,
        // Sem nome não dá para exibir; o id cru é melhor que uma linha em branco.
        nome: (p.name ?? "").trim() || p.id,
        atributos: (p.attributes ?? []).map((a) => a.toLowerCase()),
        total_mensagens: p.total_count ?? null,
        nao_lidas: p.unread_count ?? null,
        atualizado_em: new Date().toISOString(),
      }));

    const { error } = await supabase
      .from("email_pastas")
      .upsert(linhas, { onConflict: "conta_id,pasta_id" });
    if (error) {
      console.error("[nylas] falha ao gravar pastas:", error);
      return 0;
    }

    const idsVivos = linhas.map((l) => l.pasta_id);
    await supabase
      .from("email_pastas")
      .delete()
      .eq("conta_id", contaId)
      .not("pasta_id", "in", `(${idsVivos.map((i) => `"${i}"`).join(",")})`);

    return linhas.length;
  } catch (e) {
    console.error("[nylas] exceção ao gravar pastas:", e);
    return 0;
  }
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

/**
 * Baixa o BINÁRIO de um anexo (`/attachments/{id}/download`), que não devolve
 * JSON como o resto da API — daí não reusar `chamarNylas`, que sempre tenta
 * `JSON.parse` no corpo da resposta.
 */
export async function baixarAnexoNylas(
  caminho: string,
  timeoutMs = 30_000,
): Promise<{ ok: boolean; status: number; bytes: Uint8Array | null; contentType: string | null }> {
  try {
    const res = await fetch(`${nylasBase()}${caminho}`, {
      headers: { Authorization: `Bearer ${nylasApiKey()}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { ok: false, status: res.status, bytes: null, contentType: null };
    const bytes = new Uint8Array(await res.arrayBuffer());
    return { ok: true, status: res.status, bytes, contentType: res.headers.get("content-type") };
  } catch (e) {
    console.warn("[nylas] falha ao baixar anexo:", e);
    return { ok: false, status: 0, bytes: null, contentType: null };
  }
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
    /** Referenciado por `<img src="cid:...">` no corpo, só presente em anexos inline. */
    content_id?: string;
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
