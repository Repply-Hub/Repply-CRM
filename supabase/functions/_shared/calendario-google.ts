// Adaptador do Google Calendar. Único ponto que conhece a API do Google. A Fase 2 (Microsoft)
// acrescenta _shared/calendario-microsoft.ts com a mesma forma de funções.

export interface PontoGoogle { dateTime?: string; date?: string; timeZone?: string }
export interface RecursoGoogle { summary: string; description?: string; start: PontoGoogle; end: PontoGoogle }
export interface GoogleEventoListado extends RecursoGoogle { id: string; etag: string; status: string; updated: string }

const CLIENT_ID = Deno.env.get('GOOGLE_CALENDAR_CLIENT_ID')!;
const CLIENT_SECRET = Deno.env.get('GOOGLE_CALENDAR_CLIENT_SECRET')!;
const REDIRECT_URI = Deno.env.get('GOOGLE_CALENDAR_REDIRECT_URI')!;
const ESCOPO = 'https://www.googleapis.com/auth/calendar.app.created';

export function urlDeConsentimento(state: string): string {
  const p = new URLSearchParams({
    client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: 'code',
    scope: ESCOPO, access_type: 'offline', prompt: 'consent', state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

async function tokenEndpoint(corpo: Record<string, string>) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(corpo),
  });
  if (!r.ok) throw new Error(`Google token ${r.status}: ${await r.text()}`);
  return r.json();
}

export async function trocarCodigoPorToken(code: string) {
  const j = await tokenEndpoint({ code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: REDIRECT_URI, grant_type: 'authorization_code' });
  return { refresh_token: j.refresh_token as string, access_token: j.access_token as string, expires_in: j.expires_in as number };
}

export async function renovarAccessToken(refreshToken: string) {
  const j = await tokenEndpoint({ refresh_token: refreshToken, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'refresh_token' });
  return { access_token: j.access_token as string, expires_in: j.expires_in as number };
}

async function api(accessToken: string, caminho: string, init: RequestInit = {}) {
  const r = await fetch(`https://www.googleapis.com/calendar/v3${caminho}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  if (r.status === 410) throw Object.assign(new Error('sync token expirado'), { syncExpirado: true });
  if (!r.ok) throw new Error(`Google API ${r.status}: ${await r.text()}`);
  return r;
}

export async function criarCalendarioRepply(accessToken: string): Promise<{ id: string }> {
  const r = await api(accessToken, '/calendars', { method: 'POST', body: JSON.stringify({ summary: 'Repply CRM' }) });
  const j = await r.json();
  return { id: j.id as string };
}

export async function criarEvento(accessToken: string, calId: string, recurso: RecursoGoogle) {
  const r = await api(accessToken, `/calendars/${encodeURIComponent(calId)}/events`, { method: 'POST', body: JSON.stringify(recurso) });
  const j = await r.json();
  return { id: j.id as string, etag: j.etag as string };
}

export async function atualizarEvento(accessToken: string, calId: string, eventId: string, recurso: RecursoGoogle) {
  const r = await api(accessToken, `/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(eventId)}`, { method: 'PUT', body: JSON.stringify(recurso) });
  const j = await r.json();
  return { id: j.id as string, etag: j.etag as string };
}

export async function apagarEvento(accessToken: string, calId: string, eventId: string) {
  const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(eventId)}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (r.status !== 410 && r.status !== 404 && !r.ok) throw new Error(`Google delete ${r.status}: ${await r.text()}`);
}

export async function listarMudancas(accessToken: string, calId: string, syncToken: string | null) {
  const itens: GoogleEventoListado[] = [];
  let pageToken: string | undefined;
  let proximoSyncToken: string | null = null;
  do {
    const p = new URLSearchParams({ showDeleted: 'true', singleEvents: 'true' });
    if (syncToken) p.set('syncToken', syncToken);
    if (pageToken) p.set('pageToken', pageToken);
    const r = await api(accessToken, `/calendars/${encodeURIComponent(calId)}/events?${p}`);
    const j = await r.json();
    for (const it of (j.items ?? [])) itens.push(it as GoogleEventoListado);
    pageToken = j.nextPageToken;
    if (j.nextSyncToken) proximoSyncToken = j.nextSyncToken;
  } while (pageToken);
  return { itens, proximoSyncToken };
}
