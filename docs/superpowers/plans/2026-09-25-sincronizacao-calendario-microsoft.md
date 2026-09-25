# Sincronização de Calendário — Fase 2 (Microsoft 365) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Acrescentar a Microsoft 365 (Outlook) como segundo provedor da sincronização de calendário, mão dupla, reaproveitando todo o motor da Fase 1 (Google), sem mudar o comportamento do Google.

**Architecture:** O motor deixa de conhecer "Google" e passa a falar com uma **interface neutra de adaptador** (`AdaptadorCalendario`) e um tipo neutro de mudança (`MudancaExterna`). O adaptador do Google é migrado para essa interface (mesmo comportamento, coberto por testes de mapeamento); um adaptador novo da Microsoft (Graph) implementa a mesma interface. O motor escolhe o adaptador por `conta.provedor`; conexão, fila, gatilhos e crons já existentes passam a servir os dois provedores. Mapeamento evento↔externo continua no **miolo puro** (`calendario-nucleo.ts`), fonte única, sem `date-fns` e sem `Deno`.

**Tech Stack:** React 18 + Vite + TanStack Query + Vitest (frontend/libs); Supabase Postgres + RLS + Edge Functions (Deno) + pg_cron; Microsoft Graph v1.0 + OAuth 2.0 (Microsoft Entra, multi-tenant + contas pessoais).

**Spec:** `docs/superpowers/specs/2026-09-25-sincronizacao-calendario-microsoft-design.md`
**Herda:** `docs/superpowers/specs/2026-09-23-sincronizacao-calendario-externo-design.md` e o plano `docs/superpowers/plans/2026-09-23-sincronizacao-calendario-google.md` (Fase 1, no ar).

## Global Constraints

- **Sempre PT-BR** em interface, comentário, mensagem de erro e commit.
- **Nunca commite credencial.** `client_secret`/`client_id`/`redirect_uri` da Microsoft são **segredos do servidor** (Supabase secrets), nunca no repositório (público, CLAUDE.md §6.9). Nada de e-mail/id de testador no código — o portão é presença de linha no banco.
- **Tabela/coluna nova nasce por migration** com RLS e política no mesmo arquivo. **Nunca editar migration existente** — só acrescentar. Função de banco pode ser trocada com `create or replace` numa migration nova.
- **`.update()`/`.delete()` com `{ count: 'exact' }`; tratar `count === 0` como recusa** via `deveTratarComoRecusa` (nunca `!count`).
- **Verificação antes de "feito":** `npx tsc --noEmit -p tsconfig.app.json` (a base do robô de conferência **não pode subir** — rode e anote a base ANTES de começar; última observada ≈ 35), `npm run build` (compila), `npm run test` (suíte inteira passa, o número de testes **não cai**). As funções de borda (adaptadores, motor, conectar) **não são testáveis localmente** por Vitest; verifique com `deno check <arquivo>` quando o Deno estiver disponível e, senão, pela checagem de tipos do bundler no `deploy` + o teste ponta a ponta.
- **Erro do Supabase não é `Error`:** usar `mensagemDeErro` (`src/lib/mensagem-de-erro.ts`) / `mensagemDeErroDaFunction` (`src/lib/erro-edge-function.ts`).
- **Fuso e dia-inteiro:** matemática de data à mão no miolo (âncora ao MEIO-DIA LOCAL, sem 'Z', CLAUDE.md §7.12). **Dia-inteiro usa data-fim EXCLUSIVA** (dia seguinte) no Google **e** na Microsoft; converter nos dois sentidos.
- **Trava de recurso (§4.2 da spec):** o Repply só cria e mexe no calendário dedicado "Repply CRM"; nunca lista nem toca em outro calendário do usuário. O adaptador da Microsoft opera SEMPRE sobre o `calendario_externo_id` guardado na conexão, e recusa alvo vazio.
- **Só sincronizam** os `eventos` (pessoais e da empresa) que têm etiqueta (`evento_sync_externo`). Prazos/contatos NÃO. O que volta é só o que o Repply criou.
- **Escopo amplo, aceito com trava:** a Microsoft não tem equivalente estreito ao `calendar.app.created`; usa-se `Calendars.ReadWrite offline_access`. A defesa é a trava de calendário no código + cifra dos tokens + consentimento visível + política de privacidade.
- **Commit só com o "pode" do Lucas** e após a verificação (o repo publica no push). Publicar só os próprios commits (worktree a partir de `origin/main` + rebase/cherry-pick). Migration e deploy de função em produção **só com o "pode"**.

---

## Pré-requisito externo (AÇÃO DO LUCAS — no painel da Microsoft/Entra; destrava o teste ponta a ponta)

Guiado passo a passo, como foi o Google Cloud. Pode correr em paralelo às Tarefas 1–7.

1. **Microsoft Entra (portal.azure.com → "Registros de aplicativo" → "Novo registro"):** nome do app (ex.: "Repply CRM"); tipos de conta suportados = **"Contas em qualquer diretório organizacional e contas pessoais da Microsoft"** (multi-tenant + pessoais).
2. **Redirect URI (plataforma "Web"):** `https://hukeirrmsoiowvvrhivx.supabase.co/functions/v1/calendario-conectar/retorno` — **o MESMO** da conexão do Google (a `calendario-conectar` atende os dois provedores; o `state` diz qual é).
3. **Permissões de API → Microsoft Graph → Permissões delegadas:** `Calendars.ReadWrite`, `offline_access`, `openid`, `email`. (Não exige "consentimento do administrador" para contas pessoais; em alguns tenants corporativos o admin de TI do cliente pode precisar consentir — fora do nosso controle.)
4. **Certificados e segredos → Novo segredo do cliente:** anotar o **Valor** (aparece uma vez só) = `client_secret`. Anotar o **ID do aplicativo (cliente)** = `client_id`.
5. **Salvar os segredos no Supabase** (`supabase secrets set`, nunca no repo):
   - `MICROSOFT_CALENDAR_CLIENT_ID`
   - `MICROSOFT_CALENDAR_CLIENT_SECRET`
   - `MICROSOFT_CALENDAR_REDIRECT_URI` = `https://hukeirrmsoiowvvrhivx.supabase.co/functions/v1/calendario-conectar/retorno`
   - (Reaproveita `CALENDARIO_TOKEN_KEY` da Fase 1 — mesma cifra de tokens.)
6. (Opcional) **Verificação do publicador** no Entra — mais leve que a do Google; reduz avisos de consentimento. Não bloqueia.

> Sem isto, as Tarefas 1–7 são construídas e verificadas normalmente; a conexão real ponta a ponta com a Microsoft só funciona depois dos segredos + adaptador implantados.

---

## Estrutura de arquivos (o que cada um passa a fazer)

- `supabase/functions/_shared/calendario-nucleo.ts` — **puro, fonte única.** Ganha: tipo neutro `MudancaExterna`, interface `AdaptadorCalendario`, tipos `PontoMicrosoft`/`RecursoMicrosoft`, e os mapeadores `paraMicrosoft`/`deMicrosoft`. Mantém `paraGoogle`/`paraRepply` e as regras (`quemVence`, `excedeDisjuntor`, `deveTratarComoRecusa`, `somaDias`).
- `src/lib/calendario/mapeamento-microsoft.ts` (novo) + `mapeamento-microsoft.test.ts` (novo) — reexporta do miolo e testa o mapeamento da Microsoft no Node.
- `supabase/functions/_shared/calendario-google.ts` — **refatorado** para implementar `AdaptadorCalendario` (mesmo comportamento; recebe `EventoParaSincronizar` e mapeia por dentro; `listarMudancas` devolve `MudancaExterna[]`).
- `supabase/functions/_shared/calendario-microsoft.ts` (novo) — adaptador do Graph, mesma interface.
- `supabase/functions/calendario-sincronizar/index.ts` — **refatorado** para o motor agnóstico: `adaptadorDe(provedor)`, `contasConectadasDe(user_id)` (todas as conexões), `contaPorId(calendario_conta_id)` (para o 'apagar'), `tokenValido` regravando refresh token rotacionado, erro por `conta.id`.
- `supabase/functions/calendario-conectar/index.ts` — **refatorado** para provedor via `state = provedor.user_id.nonce` e `adaptadorDe(provedor)`; `iniciar`/`desconectar` leem `provedor` do corpo.
- `supabase/migrations/2026XXXXXXXXXX_calendario_enfileira_multiprovedor.sql` (novo) — `create or replace` do gatilho de enfileirar, que passa a valer para qualquer provedor conectado.
- `src/hooks/use-calendario-conexao.ts` — **refatorado** para dois provedores (`conexaoDe`, `iniciarConexao`, `desconectar` por provedor).
- `src/components/calendar/ConexaoCalendarioExterno.tsx` — **refatorado**: botão "Conectar meu Microsoft" com trava própria `SINCRONIZACAO_MICROSOFT_ATIVA` (dormente até validar).
- `src/pages/PoliticaDePrivacidade.tsx` — trecho sobre a Microsoft.

---

## Task 1: Miolo puro — tipos neutros + mapeamento da Microsoft

**Files:**
- Modify: `supabase/functions/_shared/calendario-nucleo.ts`
- Create: `src/lib/calendario/mapeamento-microsoft.ts`
- Test: `src/lib/calendario/mapeamento-microsoft.test.ts`

**Interfaces:**
- Consumes: `EventoParaSincronizar`, `somaDias` (privado, já existe), `dataISO` (privado, já existe) do miolo.
- Produces (para as Tarefas 2–4):
  - `interface PontoMicrosoft { dateTime: string; timeZone: string }`
  - `interface RecursoMicrosoft { subject: string; body?: { contentType: 'text'; content: string }; start: PontoMicrosoft; end: PontoMicrosoft; isAllDay: boolean }`
  - `interface MudancaExterna { id: string; removido: boolean; atualizadoEm: string; etag: string | null; evento: EventoParaSincronizar | null }`
  - `interface AdaptadorCalendario { urlDeConsentimento(state: string): string; trocarCodigoPorToken(code: string): Promise<{ refresh_token: string; access_token: string; expires_in: number }>; renovarAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number; refresh_token?: string }>; criarCalendarioRepply(accessToken: string): Promise<{ id: string }>; criarEvento(accessToken: string, calId: string, evento: EventoParaSincronizar, fuso: string): Promise<{ id: string; etag: string | null }>; atualizarEvento(accessToken: string, calId: string, eventId: string, evento: EventoParaSincronizar, fuso: string): Promise<{ id: string; etag: string | null }>; apagarEvento(accessToken: string, calId: string, eventId: string): Promise<void>; listarMudancas(accessToken: string, calId: string, syncToken: string | null): Promise<{ itens: MudancaExterna[]; proximoSyncToken: string | null }> }`
  - `paraMicrosoft(e: EventoParaSincronizar): RecursoMicrosoft`
  - `deMicrosoft(m: RecursoMicrosoft): EventoParaSincronizar`

- [ ] **Step 1: Escrever o teste que falha** (`src/lib/calendario/mapeamento-microsoft.test.ts`)

```ts
import { describe, it, expect } from 'vitest';
import { paraMicrosoft, deMicrosoft } from './mapeamento-microsoft';

describe('mapeamento evento Repply ↔ Microsoft (Graph)', () => {
  it('evento com hora vira dateTime UTC (sem Z, timeZone UTC), e volta ao mesmo instante', () => {
    const e = {
      titulo: 'Visita obra', descricao: 'levar catálogo',
      inicio: '2026-10-05T13:00:00.000Z', fim: '2026-10-05T14:00:00.000Z', diaInteiro: false,
    };
    const m = paraMicrosoft(e);
    expect(m.subject).toBe('Visita obra');
    expect(m.isAllDay).toBe(false);
    expect(m.start.timeZone).toBe('UTC');
    expect(m.start.dateTime).toBe('2026-10-05T13:00:00.000'); // sem 'Z'; o timeZone diz que é UTC
    expect(m.end.dateTime).toBe('2026-10-05T14:00:00.000');
    expect(m.body).toEqual({ contentType: 'text', content: 'levar catálogo' });

    const volta = deMicrosoft(m);
    expect(volta.diaInteiro).toBe(false);
    expect(new Date(volta.inicio).getTime()).toBe(new Date(e.inicio).getTime());
    expect(new Date(volta.fim).getTime()).toBe(new Date(e.fim).getTime());
  });

  it('dia inteiro: Microsoft usa data-fim EXCLUSIVA (dia seguinte), à meia-noite', () => {
    const e = {
      titulo: 'Feriado', descricao: null,
      inicio: '2026-10-05T00:00:00.000Z', fim: '2026-10-05T23:59:59.000Z', diaInteiro: true,
    };
    const m = paraMicrosoft(e);
    expect(m.isAllDay).toBe(true);
    expect(m.start.dateTime).toBe('2026-10-05T00:00:00.000');
    expect(m.end.dateTime).toBe('2026-10-06T00:00:00.000'); // exclusiva: dia seguinte
    expect(m.body).toBeUndefined(); // descrição nula não vira body
  });

  it('dia inteiro volta da Microsoft: subtrai 1 dia do fim exclusivo', () => {
    const m = {
      subject: 'Feriado', isAllDay: true,
      start: { dateTime: '2026-10-05T00:00:00.0000000', timeZone: 'UTC' },
      end: { dateTime: '2026-10-06T00:00:00.0000000', timeZone: 'UTC' },
    };
    const volta = deMicrosoft(m);
    expect(volta.diaInteiro).toBe(true);
    expect(volta.inicio).toBe('2026-10-05T00:00:00.000Z');
    expect(volta.fim).toBe('2026-10-05T23:59:59.000Z'); // último dia real
  });

  it('volta do Graph normaliza o instante mesmo com dateTime sem Z (Prefer UTC)', () => {
    const m = {
      subject: 'Reunião', isAllDay: false,
      start: { dateTime: '2026-10-05T13:00:00.0000000', timeZone: 'UTC' },
      end: { dateTime: '2026-10-05T14:00:00.0000000', timeZone: 'UTC' },
    };
    const volta = deMicrosoft(m);
    expect(volta.inicio).toBe('2026-10-05T13:00:00.000Z'); // canônico
    expect(volta.fim).toBe('2026-10-05T14:00:00.000Z');
    expect(volta.descricao).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npx vitest run src/lib/calendario/mapeamento-microsoft.test.ts`
Expected: FAIL — não resolve `./mapeamento-microsoft` (arquivo não existe).

- [ ] **Step 3: Acrescentar os tipos e os mapeadores ao miolo** (`supabase/functions/_shared/calendario-nucleo.ts`)

Logo depois da interface `RecursoGoogle` (por volta da linha 31), acrescentar os tipos da Microsoft:

```ts
export interface PontoMicrosoft {
  dateTime: string;
  timeZone: string;
}

export interface RecursoMicrosoft {
  subject: string;
  body?: { contentType: 'text'; content: string };
  start: PontoMicrosoft;
  end: PontoMicrosoft;
  isAllDay: boolean;
}
```

Logo depois de `paraRepply` (por volta da linha 84), acrescentar os dois helpers e os mapeadores da Microsoft:

```ts
// ---- Mapeamento evento Repply ↔ recurso do Microsoft (Graph) --------------------------------
// O Graph usa `subject`/`body`/`isAllDay` e um par { dateTime, timeZone }. Mandamos o horário em
// UTC (dateTime SEM 'Z', com timeZone='UTC'): o instante é preservado e o Outlook exibe no fuso do
// usuário. Dia-inteiro usa data-fim EXCLUSIVA (dia seguinte), como o Google — reusa `somaDias`.

/** Tira o 'Z' final de um ISO (o Graph quer o dateTime "solto" + o campo timeZone à parte). */
function semZ(iso: string): string {
  return iso.replace(/Z$/, '');
}

/** Normaliza um dateTime do Graph (Prefer UTC → pode vir sem 'Z') para um ISO UTC canônico. */
function instanteUTC(dateTime: string): string {
  return new Date(dateTime.endsWith('Z') ? dateTime : dateTime + 'Z').toISOString();
}

export function paraMicrosoft(e: EventoParaSincronizar): RecursoMicrosoft {
  const r: RecursoMicrosoft = {
    subject: e.titulo,
    start: { dateTime: '', timeZone: 'UTC' },
    end: { dateTime: '', timeZone: 'UTC' },
    isAllDay: e.diaInteiro,
  };
  if (e.descricao) r.body = { contentType: 'text', content: e.descricao };

  if (e.diaInteiro) {
    // Meia-noite; fim exclusivo (dia seguinte).
    r.start.dateTime = dataISO(e.inicio) + 'T00:00:00.000';
    r.end.dateTime = somaDias(dataISO(e.fim), 1) + 'T00:00:00.000';
  } else {
    r.start.dateTime = semZ(e.inicio);
    r.end.dateTime = semZ(e.fim);
  }
  return r;
}

export function deMicrosoft(m: RecursoMicrosoft): EventoParaSincronizar {
  const titulo = m.subject ?? '(sem título)';
  const descricao = m.body?.content ? m.body.content : null;

  if (m.isAllDay) {
    const inicio = dataISO(m.start.dateTime) + 'T00:00:00.000Z';
    const ultimoDia = somaDias(dataISO(m.end.dateTime), -1); // desfaz o fim exclusivo
    return { titulo, descricao, inicio, fim: ultimoDia + 'T23:59:59.000Z', diaInteiro: true };
  }

  return {
    titulo, descricao,
    inicio: instanteUTC(m.start.dateTime), fim: instanteUTC(m.end.dateTime), diaInteiro: false,
  };
}
```

No fim do arquivo (depois de `deveTratarComoRecusa`), acrescentar o tipo neutro de mudança e a interface do adaptador (só tipos — o miolo continua puro):

```ts
// ---- Contrato neutro de provedor (o motor não sabe de qual provedor se trata) ----------------

/** Uma mudança vinda do provedor externo, já traduzida para o Repply. `evento` é null se removido. */
export interface MudancaExterna {
  id: string;
  removido: boolean;
  atualizadoEm: string;
  etag: string | null;
  evento: EventoParaSincronizar | null;
}

/** A forma única que todo adaptador (Google, Microsoft, ...) implementa. */
export interface AdaptadorCalendario {
  urlDeConsentimento(state: string): string;
  trocarCodigoPorToken(code: string): Promise<{ refresh_token: string; access_token: string; expires_in: number }>;
  renovarAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number; refresh_token?: string }>;
  criarCalendarioRepply(accessToken: string): Promise<{ id: string }>;
  criarEvento(accessToken: string, calId: string, evento: EventoParaSincronizar, fuso: string): Promise<{ id: string; etag: string | null }>;
  atualizarEvento(accessToken: string, calId: string, eventId: string, evento: EventoParaSincronizar, fuso: string): Promise<{ id: string; etag: string | null }>;
  apagarEvento(accessToken: string, calId: string, eventId: string): Promise<void>;
  listarMudancas(accessToken: string, calId: string, syncToken: string | null): Promise<{ itens: MudancaExterna[]; proximoSyncToken: string | null }>;
}
```

- [ ] **Step 4: Criar a porta de entrada dos testes** (`src/lib/calendario/mapeamento-microsoft.ts`)

```ts
// Porta de entrada do app/testes para o MIOLO ÚNICO (Microsoft). Ver o comentário em `mapeamento.ts`.
export { paraMicrosoft, deMicrosoft } from '../../../supabase/functions/_shared/calendario-nucleo';
export type {
  PontoMicrosoft,
  RecursoMicrosoft,
} from '../../../supabase/functions/_shared/calendario-nucleo';
```

- [ ] **Step 5: Rodar o teste e ver passar**

Run: `npx vitest run src/lib/calendario/mapeamento-microsoft.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 6: Verificação geral**

Run: `npx tsc --noEmit -p tsconfig.app.json` → a base **não sobe** (o miolo é o que o tsc do app enxerga via reexport).
Run: `npm run test` → suíte inteira passa; o total de testes **subiu** (entraram os 4 novos), não caiu.
Run: `npm run build` → compila.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/calendario-nucleo.ts src/lib/calendario/mapeamento-microsoft.ts src/lib/calendario/mapeamento-microsoft.test.ts
git commit -m "feat(calendario): mapeamento Microsoft + contrato neutro de adaptador (miolo puro)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Migrar o adaptador do Google e o motor para a interface neutra (sem mudar o comportamento)

Refatoração de casca, com rede de teste no miolo (Task 1). Google continua fazendo exatamente o mesmo; muda só a FORMA das funções, para o motor virar agnóstico. Funções de borda **não** rodam no Vitest — verificar por `deno check` (quando disponível) + revisão + o e2e do Google que já existe (a Fase 1 tem que continuar funcionando).

**Files:**
- Modify: `supabase/functions/_shared/calendario-google.ts`
- Modify: `supabase/functions/calendario-sincronizar/index.ts`

**Interfaces:**
- Consumes: `AdaptadorCalendario`, `MudancaExterna`, `EventoParaSincronizar`, `paraGoogle`, `paraRepply`, `quemVence`, `excedeDisjuntor`, `deveTratarComoRecusa` (miolo).
- Produces (para a Task 4): no motor, `function adaptadorDe(provedor: string): AdaptadorCalendario` (por ora só `'google'`; `'microsoft'` entra na Task 4). No adaptador Google, todas as funções da interface `AdaptadorCalendario`.

- [ ] **Step 1: Reescrever o adaptador do Google para a interface neutra** (`supabase/functions/_shared/calendario-google.ts`)

Conteúdo completo do arquivo:

```ts
// Adaptador do Google Calendar. Único ponto que conhece a API do Google. Implementa a interface
// neutra `AdaptadorCalendario` do miolo, para o motor não saber de qual provedor se trata.
// A Fase 2 (Microsoft) tem um irmão: _shared/calendario-microsoft.ts, com a mesma forma.

import {
  paraGoogle,
  paraRepply,
  type EventoParaSincronizar,
  type MudancaExterna,
  type RecursoGoogle,
} from './calendario-nucleo.ts';

interface GoogleEventoListado extends RecursoGoogle { id: string; etag: string; status: string; updated: string }

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
  // O Google NÃO rotaciona o refresh token; devolvemos só o access (refresh_token fica indefinido).
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

export async function criarEvento(accessToken: string, calId: string, evento: EventoParaSincronizar, fuso: string) {
  const recurso = paraGoogle(evento, fuso);
  const r = await api(accessToken, `/calendars/${encodeURIComponent(calId)}/events`, { method: 'POST', body: JSON.stringify(recurso) });
  const j = await r.json();
  return { id: j.id as string, etag: (j.etag as string) ?? null };
}

export async function atualizarEvento(accessToken: string, calId: string, eventId: string, evento: EventoParaSincronizar, fuso: string) {
  const recurso = paraGoogle(evento, fuso);
  const r = await api(accessToken, `/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(eventId)}`, { method: 'PUT', body: JSON.stringify(recurso) });
  const j = await r.json();
  return { id: j.id as string, etag: (j.etag as string) ?? null };
}

export async function apagarEvento(accessToken: string, calId: string, eventId: string) {
  const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(eventId)}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (r.status !== 410 && r.status !== 404 && !r.ok) throw new Error(`Google delete ${r.status}: ${await r.text()}`);
}

export async function listarMudancas(accessToken: string, calId: string, syncToken: string | null): Promise<{ itens: MudancaExterna[]; proximoSyncToken: string | null }> {
  const itens: MudancaExterna[] = [];
  let pageToken: string | undefined;
  let proximoSyncToken: string | null = null;
  do {
    const p = new URLSearchParams({ showDeleted: 'true', singleEvents: 'true' });
    if (syncToken) p.set('syncToken', syncToken);
    if (pageToken) p.set('pageToken', pageToken);
    const r = await api(accessToken, `/calendars/${encodeURIComponent(calId)}/events?${p}`);
    const j = await r.json();
    for (const it of (j.items ?? []) as GoogleEventoListado[]) {
      const removido = it.status === 'cancelled';
      itens.push({
        id: it.id,
        removido,
        atualizadoEm: it.updated,
        etag: it.etag ?? null,
        evento: removido ? null : paraRepply(it),
      });
    }
    pageToken = j.nextPageToken;
    if (j.nextSyncToken) proximoSyncToken = j.nextSyncToken;
  } while (pageToken);
  return { itens, proximoSyncToken };
}
```

- [ ] **Step 2: Reescrever o motor para o contrato neutro e multi-conexão** (`supabase/functions/calendario-sincronizar/index.ts`)

Conteúdo completo do arquivo:

```ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as google from "../_shared/calendario-google.ts";
import {
  quemVence,
  excedeDisjuntor,
  deveTratarComoRecusa,
  type AdaptadorCalendario,
  type EventoParaSincronizar,
} from "../_shared/calendario-nucleo.ts";

/**
 * O motor da sincronização de calendário — AGNÓSTICO de provedor. Dois modos, ambos chamados só
 * pelo banco (gatilho e cron), com `service_role`:
 *  - modo 'empurrar': processa `calendario_fila` (Repply → provedor), na hora.
 *  - modo 'puxar': para cada conexão conectada (qualquer provedor), traz o que mudou (provedor → Repply).
 *
 * 🔴 Só toca em evento com "etiqueta" (`evento_sync_externo`) — nunca nos outros eventos do vendedor.
 * A etiqueta só existe para eventos cujo DONO é o dono da conexão, então a volta só altera o que o
 * vendedor já poderia editar. O adaptador é escolhido por `conta.provedor`. Não é testável localmente.
 */

// O adaptador do Google satisfaz a interface neutra; o da Microsoft entra na Task 4.
const google_ = google as unknown as AdaptadorCalendario;
function adaptadorDe(provedor: string): AdaptadorCalendario {
  if (provedor === "google") return google_;
  throw new Error(`Provedor sem adaptador: ${provedor}`);
}

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const KEY_RAW = Deno.env.get("CALENDARIO_TOKEN_KEY")!;
const FUSO = "America/Sao_Paulo";

// ---- Cifra/decifra (mesmo formato da calendario-conectar: IV 12 bytes + ciphertext, base64) ----
async function chave(): Promise<CryptoKey> {
  const bytes = Uint8Array.from(atob(KEY_RAW), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}
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
async function decifrar(b64: string): Promise<string> {
  const junto = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const iv = junto.slice(0, 12);
  const ct = junto.slice(12);
  const claro = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await chave(), ct);
  return new TextDecoder().decode(claro);
}

interface ContaCalendario {
  id: string;
  user_id: string;
  provedor: string;
  calendario_externo_id: string;
  refresh_token: string;
  access_token: string;
  token_expira_em: string | null;
  sync_token: string | null;
}

const COLUNAS_CONTA =
  "id, user_id, provedor, calendario_externo_id, refresh_token, access_token, token_expira_em, sync_token";

/** access_token válido; renova (e regrava cifrado) perto de expirar. Guarda refresh token rotacionado. */
async function tokenValido(conta: ContaCalendario): Promise<string> {
  const margem = 60_000; // 1 min de folga
  if (conta.token_expira_em && new Date(conta.token_expira_em).getTime() > Date.now() + margem) {
    return await decifrar(conta.access_token);
  }
  const refresh = await decifrar(conta.refresh_token);
  const nov = await adaptadorDe(conta.provedor).renovarAccessToken(refresh);
  const patch: Record<string, string> = {
    access_token: await cifrar(nov.access_token),
    token_expira_em: new Date(Date.now() + nov.expires_in * 1000).toISOString(),
  };
  // A Microsoft ROTACIONA o refresh token; se veio um novo, regrava cifrado (senão o próximo renova quebra).
  if (nov.refresh_token) patch.refresh_token = await cifrar(nov.refresh_token);
  await admin.from("calendario_contas").update(patch).eq("id", conta.id);
  return nov.access_token;
}

/** Todas as conexões CONECTADAS de um usuário (qualquer provedor) — o 'salvar' empurra para todas. */
async function contasConectadasDe(userId: string): Promise<ContaCalendario[]> {
  const { data } = await admin
    .from("calendario_contas")
    .select(COLUNAS_CONTA)
    .eq("user_id", userId)
    .eq("status", "conectada");
  return (data as ContaCalendario[]) ?? [];
}

/** Uma conexão por id (o 'apagar' da fila carrega calendario_conta_id da conexão certa). */
async function contaPorId(id: string): Promise<ContaCalendario | null> {
  const { data } = await admin
    .from("calendario_contas")
    .select(COLUNAS_CONTA)
    .eq("id", id)
    .eq("status", "conectada")
    .maybeSingle();
  return (data as ContaCalendario) ?? null;
}

async function marcarProcessado(id: string) {
  await admin.from("calendario_fila").update({ processado_em: new Date().toISOString() }).eq("id", id);
}

async function marcarContaComErro(contaId: string, erro: unknown) {
  await admin
    .from("calendario_contas")
    .update({ status: "erro", ultimo_erro: String(erro).slice(0, 500) })
    .eq("id", contaId);
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/**
 * O evento do Repply já está igual ao que veio do provedor? Compara por instante (não por texto).
 * 🔴 Trava ANTI-ECO: sem ela, aplicar a volta gravaria no evento, o gatilho enfileiraria um empurrar,
 * que mudaria o provedor de novo — laço infinito. Se nada mudou de fato, a volta não reescreve.
 */
function mesmoConteudo(
  ev: { titulo: string; descricao: string | null; inicio: string; fim: string; dia_inteiro: boolean },
  v: EventoParaSincronizar,
): boolean {
  return (
    ev.titulo === v.titulo &&
    (ev.descricao ?? null) === (v.descricao ?? null) &&
    ev.dia_inteiro === v.diaInteiro &&
    new Date(ev.inicio).getTime() === new Date(v.inicio).getTime() &&
    new Date(ev.fim).getTime() === new Date(v.fim).getTime()
  );
}

// ---- Saída (Repply → provedor): processa a fila ----------------------------------------------
async function empurrar(): Promise<Response> {
  const { data: fila } = await admin
    .from("calendario_fila")
    .select("*")
    .is("processado_em", null)
    .order("criado_em", { ascending: true })
    .limit(200);

  for (const item of fila ?? []) {
    try {
      if (item.operacao === "apagar") {
        // 'apagar' carrega a conexão certa (calendario_conta_id) e o id externo (a etiqueta some por
        // cascata). Apaga naquela conexão específica, com o adaptador dela.
        if (item.calendario_conta_id && item.evento_externo_id) {
          const conta = await contaPorId(item.calendario_conta_id);
          if (conta) {
            const token = await tokenValido(conta);
            await adaptadorDe(conta.provedor).apagarEvento(token, conta.calendario_externo_id, item.evento_externo_id);
          }
        }
        await marcarProcessado(item.id);
        continue;
      }

      // 'salvar': empurra para TODAS as conexões conectadas do dono (Google e/ou Microsoft).
      const { data: evento } = await admin
        .from("eventos")
        .select("titulo, descricao, inicio, fim, dia_inteiro, updated_at")
        .eq("id", item.evento_id)
        .maybeSingle();
      if (!evento) { await marcarProcessado(item.id); continue; } // evento sumiu antes de subir

      const eventoNeutro: EventoParaSincronizar = {
        titulo: evento.titulo, descricao: evento.descricao,
        inicio: evento.inicio, fim: evento.fim, diaInteiro: evento.dia_inteiro,
      };

      for (const conta of await contasConectadasDe(item.user_id)) {
        try {
          const token = await tokenValido(conta);
          const ad = adaptadorDe(conta.provedor);
          const { data: etiqueta } = await admin
            .from("evento_sync_externo")
            .select("id, evento_externo_id")
            .eq("evento_id", item.evento_id)
            .eq("calendario_conta_id", conta.id)
            .maybeSingle();

          const res = etiqueta
            ? await ad.atualizarEvento(token, conta.calendario_externo_id, etiqueta.evento_externo_id, eventoNeutro, FUSO)
            : await ad.criarEvento(token, conta.calendario_externo_id, eventoNeutro, FUSO);

          await admin.from("evento_sync_externo").upsert(
            {
              evento_id: item.evento_id,
              calendario_conta_id: conta.id,
              evento_externo_id: res.id,
              etag_externo: res.etag,
              atualizado_repply_em: evento.updated_at,
              ultima_sync_em: new Date().toISOString(),
            },
            { onConflict: "evento_id,calendario_conta_id" },
          );
        } catch (e) {
          // Erro numa conexão não derruba as outras: marca a conexão e segue.
          await marcarContaComErro(conta.id, e);
        }
      }
      await marcarProcessado(item.id);
    } catch (e) {
      // Erro fora do laço por-conexão (ex.: leitura do evento): não trava a fila inteira.
      console.error("[calendario] empurrar item", item.id, e);
      await marcarProcessado(item.id);
    }
  }
  return json({ ok: true });
}

// ---- Volta (provedor → Repply): traz as mudanças por sync token ------------------------------
async function puxar(): Promise<Response> {
  const { data: contas } = await admin
    .from("calendario_contas")
    .select(COLUNAS_CONTA)
    .eq("status", "conectada");

  for (const conta of (contas as ContaCalendario[]) ?? []) {
    const ad = adaptadorDe(conta.provedor);
    let token: string;
    let mudancas: Awaited<ReturnType<AdaptadorCalendario["listarMudancas"]>>;
    try {
      token = await tokenValido(conta);
      mudancas = await ad.listarMudancas(token, conta.calendario_externo_id, conta.sync_token);
    } catch (e) {
      // Sync token expirado (Google 410 / Microsoft syncStateNotFound): zera p/ refazer do zero.
      if ((e as { syncExpirado?: boolean }).syncExpirado) {
        await admin.from("calendario_contas").update({ sync_token: null }).eq("id", conta.id);
        continue;
      }
      await marcarContaComErro(conta.id, e);
      continue;
    }

    // DISJUNTOR: exclusão em massa suspeita → para esta passada sem apagar nada (CLAUDE.md §4.6).
    const exclusoes = mudancas.itens.filter((i) => i.removido);
    if (excedeDisjuntor(exclusoes.length)) {
      await admin
        .from("calendario_contas")
        .update({ status: "erro", ultimo_erro: "Sincronização parada: exclusão em massa suspeita no calendário externo." })
        .eq("id", conta.id);
      continue;
    }

    for (const it of mudancas.itens) {
      // Só o que tem etiqueta — o resto da agenda do vendedor é intocável.
      const { data: etiqueta } = await admin
        .from("evento_sync_externo")
        .select("id, evento_id, etag_externo")
        .eq("calendario_conta_id", conta.id)
        .eq("evento_externo_id", it.id)
        .maybeSingle();
      if (!etiqueta) continue;

      if (it.removido) {
        // Apaga a ETIQUETA ANTES do evento: o gatilho BEFORE DELETE não acha etiqueta e não
        // reenfileira um 'apagar' de volta ao provedor (já foi apagado LÁ — seria eco).
        await admin.from("evento_sync_externo").delete().eq("id", etiqueta.id);
        const { error: erroDel } = await admin.from("eventos").delete().eq("id", etiqueta.evento_id);
        if (erroDel) await marcarContaComErro(conta.id, erroDel); // não engole erro (CLAUDE.md §4.6)
        continue;
      }

      const { data: eventoRepply } = await admin
        .from("eventos")
        .select("titulo, descricao, inicio, fim, dia_inteiro, updated_at")
        .eq("id", etiqueta.evento_id)
        .maybeSingle();
      if (!eventoRepply) continue;

      // Conflito: vence o mais recente (empate → Repply).
      if (quemVence(eventoRepply.updated_at, it.atualizadoEm) === "repply") continue;

      const v = it.evento;
      if (!v) continue; // não-removido sem evento mapeado: nada a aplicar
      if (mesmoConteudo(eventoRepply, v)) {
        // Eco do nosso próprio empurrar: não reescreve; só registra a versão vista.
        await admin
          .from("evento_sync_externo")
          .update({ etag_externo: it.etag, atualizado_repply_em: it.atualizadoEm, ultima_sync_em: new Date().toISOString() })
          .eq("id", etiqueta.id);
        continue;
      }

      const { count } = await admin
        .from("eventos")
        .update({ titulo: v.titulo, descricao: v.descricao, inicio: v.inicio, fim: v.fim, dia_inteiro: v.diaInteiro }, { count: "exact" })
        .eq("id", etiqueta.evento_id);
      if (!deveTratarComoRecusa(count)) {
        await admin
          .from("evento_sync_externo")
          .update({ etag_externo: it.etag, atualizado_repply_em: it.atualizadoEm, ultima_sync_em: new Date().toISOString() })
          .eq("id", etiqueta.id);
      }
    }

    await admin
      .from("calendario_contas")
      .update({ sync_token: mudancas.proximoSyncToken, ultima_sync_em: new Date().toISOString() })
      .eq("id", conta.id);
  }
  return json({ ok: true });
}

serve(async (req) => {
  const { modo } = await req.json().catch(() => ({ modo: "puxar" }));
  return modo === "empurrar" ? await empurrar() : await puxar();
});
```

- [ ] **Step 3: Checagem de tipos das funções de borda (quando o Deno existir)**

Run: `deno check supabase/functions/_shared/calendario-google.ts supabase/functions/calendario-sincronizar/index.ts`
Expected: sem erros. Se o Deno não estiver instalado, PULAR — o bundler do `supabase functions deploy` (na fase de implantação) faz a checagem de tipos; a revisão deste passo cobre o intervalo.

- [ ] **Step 4: Verificação do app (garante que o miolo continua íntegro)**

Run: `npx tsc --noEmit -p tsconfig.app.json` → base não sobe.
Run: `npm run test` → suíte passa (contagem não cai).
Run: `npm run build` → compila.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/calendario-google.ts supabase/functions/calendario-sincronizar/index.ts
git commit -m "refactor(calendario): motor agnostico de provedor via interface neutra (Google inalterado)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Adaptador da Microsoft (Graph), implementando a mesma interface

Funções de borda, não testável no Vitest. Verificar por `deno check` (quando disponível) + revisão + o e2e da Task de go-live.

**Files:**
- Create: `supabase/functions/_shared/calendario-microsoft.ts`

**Interfaces:**
- Consumes: `paraMicrosoft`, `deMicrosoft`, `MudancaExterna`, `EventoParaSincronizar`, `RecursoMicrosoft` (miolo).
- Produces (para a Task 4): as mesmas funções da interface `AdaptadorCalendario` que o Google exporta (`urlDeConsentimento`, `trocarCodigoPorToken`, `renovarAccessToken`, `criarCalendarioRepply`, `criarEvento`, `atualizarEvento`, `apagarEvento`, `listarMudancas`).

- [ ] **Step 1: Escrever o adaptador** (`supabase/functions/_shared/calendario-microsoft.ts`)

```ts
// Adaptador do Microsoft 365 (Outlook) via Microsoft Graph. Único ponto que conhece a API da
// Microsoft. Implementa a interface neutra `AdaptadorCalendario` (mesma forma do Google).
//
// 🔴 TRAVA DE CALENDÁRIO (spec §4.2): o escopo Calendars.ReadWrite é amplo, mas este adaptador só
// toca no calendário dedicado cujo id vem na conexão — SEMPRE via /me/calendars/{calId}/...; nunca
// /me/events, nunca lista os outros calendários. `garanteCalendarioDedicado` recusa alvo vazio.

import {
  paraMicrosoft,
  deMicrosoft,
  type EventoParaSincronizar,
  type MudancaExterna,
  type RecursoMicrosoft,
} from './calendario-nucleo.ts';

const CLIENT_ID = Deno.env.get('MICROSOFT_CALENDAR_CLIENT_ID')!;
const CLIENT_SECRET = Deno.env.get('MICROSOFT_CALENDAR_CLIENT_SECRET')!;
const REDIRECT_URI = Deno.env.get('MICROSOFT_CALENDAR_REDIRECT_URI')!;
// Multi-tenant + contas pessoais → /common/. offline_access garante refresh token.
const ESCOPO = 'Calendars.ReadWrite offline_access openid email';
const AUTORIZAR = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const TOKEN = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const GRAPH = 'https://graph.microsoft.com/v1.0';

/** 🔴 A trava: recusa operar sem um id de calendário dedicado (evita cair no calendário padrão). */
function garanteCalendarioDedicado(calId: string): void {
  if (!calId) throw new Error('Operação recusada: calendário dedicado ausente na conexão.');
}

export function urlDeConsentimento(state: string): string {
  const p = new URLSearchParams({
    client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: 'code',
    scope: ESCOPO, response_mode: 'query', state,
  });
  return `${AUTORIZAR}?${p}`;
}

async function tokenEndpoint(corpo: Record<string, string>) {
  const r = await fetch(TOKEN, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(corpo),
  });
  if (!r.ok) throw new Error(`Microsoft token ${r.status}: ${await r.text()}`);
  return r.json();
}

export async function trocarCodigoPorToken(code: string) {
  const j = await tokenEndpoint({
    code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI, grant_type: 'authorization_code', scope: ESCOPO,
  });
  return { refresh_token: j.refresh_token as string, access_token: j.access_token as string, expires_in: j.expires_in as number };
}

export async function renovarAccessToken(refreshToken: string) {
  const j = await tokenEndpoint({
    refresh_token: refreshToken, client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
    grant_type: 'refresh_token', scope: ESCOPO,
  });
  // A Microsoft PODE rotacionar o refresh token; devolvemos o novo quando vier (o motor regrava).
  return {
    access_token: j.access_token as string,
    expires_in: j.expires_in as number,
    refresh_token: (j.refresh_token as string) ?? undefined,
  };
}

async function api(accessToken: string, url: string, init: RequestInit = {}) {
  const r = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      // Faz o Graph devolver os horários em UTC (o mapeamento assume UTC).
      Prefer: 'outlook.timezone="UTC"',
      ...(init.headers ?? {}),
    },
  });
  // Delta token inválido: o Graph responde 410 Gone com code 'syncStateNotFound'. Trata como o 410
  // do Google (zera o sync_token e refaz do zero na próxima passada).
  if (r.status === 410) throw Object.assign(new Error('delta token expirado'), { syncExpirado: true });
  if (!r.ok) throw new Error(`Microsoft Graph ${r.status}: ${await r.text()}`);
  return r;
}

export async function criarCalendarioRepply(accessToken: string): Promise<{ id: string }> {
  const r = await api(accessToken, `${GRAPH}/me/calendars`, { method: 'POST', body: JSON.stringify({ name: 'Repply CRM' }) });
  const j = await r.json();
  return { id: j.id as string };
}

export async function criarEvento(accessToken: string, calId: string, evento: EventoParaSincronizar, _fuso: string) {
  garanteCalendarioDedicado(calId);
  const recurso = paraMicrosoft(evento);
  const r = await api(accessToken, `${GRAPH}/me/calendars/${encodeURIComponent(calId)}/events`, { method: 'POST', body: JSON.stringify(recurso) });
  const j = await r.json();
  return { id: j.id as string, etag: (j['@odata.etag'] as string) ?? (j.changeKey as string) ?? null };
}

export async function atualizarEvento(accessToken: string, calId: string, eventId: string, evento: EventoParaSincronizar, _fuso: string) {
  garanteCalendarioDedicado(calId);
  const recurso = paraMicrosoft(evento);
  // PATCH no evento (o id do evento é único na caixa; o calId documenta o alvo dedicado).
  const r = await api(accessToken, `${GRAPH}/me/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(eventId)}`, { method: 'PATCH', body: JSON.stringify(recurso) });
  const j = await r.json();
  return { id: j.id as string, etag: (j['@odata.etag'] as string) ?? (j.changeKey as string) ?? null };
}

export async function apagarEvento(accessToken: string, calId: string, eventId: string) {
  garanteCalendarioDedicado(calId);
  const r = await fetch(`${GRAPH}/me/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(eventId)}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (r.status !== 404 && r.status !== 410 && !r.ok) throw new Error(`Microsoft delete ${r.status}: ${await r.text()}`);
}

interface GraphEvento {
  id: string;
  '@removed'?: { reason: string };
  lastModifiedDateTime?: string;
  '@odata.etag'?: string;
  changeKey?: string;
  subject?: string;
  body?: { contentType: string; content: string };
  start?: { dateTime: string; timeZone: string };
  end?: { dateTime: string; timeZone: string };
  isAllDay?: boolean;
}

export async function listarMudancas(accessToken: string, calId: string, syncToken: string | null): Promise<{ itens: MudancaExterna[]; proximoSyncToken: string | null }> {
  garanteCalendarioDedicado(calId);
  const itens: MudancaExterna[] = [];
  // Primeira passada: /events/delta. Depois: reusa o deltaLink completo guardado em sync_token.
  let url = syncToken ?? `${GRAPH}/me/calendars/${encodeURIComponent(calId)}/events/delta`;
  let proximoSyncToken: string | null = null;

  while (true) {
    const r = await api(accessToken, url);
    const j = await r.json();
    for (const it of (j.value ?? []) as GraphEvento[]) {
      if (it['@removed']) {
        itens.push({ id: it.id, removido: true, atualizadoEm: it.lastModifiedDateTime ?? new Date().toISOString(), etag: null, evento: null });
        continue;
      }
      const recurso: RecursoMicrosoft = {
        subject: it.subject ?? '(sem título)',
        body: it.body ? { contentType: 'text', content: it.body.content } : undefined,
        start: it.start ?? { dateTime: '', timeZone: 'UTC' },
        end: it.end ?? { dateTime: '', timeZone: 'UTC' },
        isAllDay: !!it.isAllDay,
      };
      itens.push({
        id: it.id,
        removido: false,
        atualizadoEm: it.lastModifiedDateTime ?? new Date().toISOString(),
        etag: it['@odata.etag'] ?? it.changeKey ?? null,
        evento: deMicrosoft(recurso),
      });
    }
    if (j['@odata.nextLink']) { url = j['@odata.nextLink'] as string; continue; }
    proximoSyncToken = (j['@odata.deltaLink'] as string) ?? null; // guardamos o deltaLink inteiro
    break;
  }
  return { itens, proximoSyncToken };
}
```

- [ ] **Step 2: Checagem de tipos (quando o Deno existir)**

Run: `deno check supabase/functions/_shared/calendario-microsoft.ts`
Expected: sem erros. Se o Deno não estiver instalado, PULAR (o deploy cobre) e conferir na revisão.

- [ ] **Step 3: Verificação do app (o novo arquivo não é importado pelo app; só garante que nada quebrou)**

Run: `npx tsc --noEmit -p tsconfig.app.json` → base não sobe.
Run: `npm run build` → compila.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/calendario-microsoft.ts
git commit -m "feat(calendario): adaptador Microsoft (Graph) com trava de calendario dedicado

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Ligar a Microsoft no motor e na conexão (OAuth por provedor)

**Files:**
- Modify: `supabase/functions/calendario-sincronizar/index.ts` (só o `adaptadorDe`)
- Modify: `supabase/functions/calendario-conectar/index.ts`

**Interfaces:**
- Consumes: adaptadores `../_shared/calendario-google.ts` e `../_shared/calendario-microsoft.ts` (ambos `AdaptadorCalendario`).
- Produces: `state` de OAuth no formato `provedor.user_id.nonce` (3 partes); `iniciar`/`desconectar` passam a exigir `provedor` no corpo.

- [ ] **Step 1: `adaptadorDe` do motor passa a conhecer a Microsoft** (`supabase/functions/calendario-sincronizar/index.ts`)

Trocar o import e o `adaptadorDe` (topo do arquivo):

```ts
import * as google from "../_shared/calendario-google.ts";
import * as microsoft from "../_shared/calendario-microsoft.ts";
// ...
const adaptadores: Record<string, AdaptadorCalendario> = {
  google: google as unknown as AdaptadorCalendario,
  microsoft: microsoft as unknown as AdaptadorCalendario,
};
function adaptadorDe(provedor: string): AdaptadorCalendario {
  const ad = adaptadores[provedor];
  if (!ad) throw new Error(`Provedor sem adaptador: ${provedor}`);
  return ad;
}
```

(Remove o `const google_ = ...` da Task 2.)

- [ ] **Step 2: Reescrever a conexão para ser parametrizada por provedor** (`supabase/functions/calendario-conectar/index.ts`)

Conteúdo completo do arquivo:

```ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as google from "../_shared/calendario-google.ts";
import * as microsoft from "../_shared/calendario-microsoft.ts";
import type { AdaptadorCalendario } from "../_shared/calendario-nucleo.ts";

/**
 * Conectar / retorno / desconectar um calendário externo (OAuth) — Google (Fase 1) e Microsoft (Fase 2).
 * O `state` carrega o PROVEDOR: `provedor.user_id.nonce`. O nonce é de USO ÚNICO (guardado na linha do
 * vendedor, validade curta) e fecha a janela de CSRF de vinculação de conta.
 *
 * - POST { acao: 'iniciar', provedor }: gera o nonce e devolve a URL de consentimento do provedor.
 * - GET /retorno?code&state: o provedor chama aqui. Confere o nonce, troca o código, cria o
 *   calendário "Repply CRM", grava os tokens CIFRADOS e consome o nonce.
 * - POST { acao: 'desconectar', provedor }: apaga tokens e as etiquetas daquela conexão. Não testável localmente.
 */

const PROVEDORES: Record<string, AdaptadorCalendario> = {
  google: google as unknown as AdaptadorCalendario,
  microsoft: microsoft as unknown as AdaptadorCalendario,
};
function adaptadorDe(provedor: string): AdaptadorCalendario | null {
  return PROVEDORES[provedor] ?? null;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const KEY_RAW = Deno.env.get("CALENDARIO_TOKEN_KEY")!;
const NONCE_VALIDADE_MS = 10 * 60 * 1000; // 10 min entre "iniciar" e o retorno do provedor
const APP_URL = Deno.env.get("CALENDARIO_APP_URL") ?? "https://crm.repplyhub.com.br";

async function chave(): Promise<CryptoKey> {
  const bytes = Uint8Array.from(atob(KEY_RAW), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}
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
  const voltarParaAgenda = (erro?: string) =>
    new Response(null, { status: 302, headers: { Location: `${APP_URL}/calendario${erro ? `?calendario_erro=${erro}` : ""}` } });

  const url = new URL(req.url);

  // ---- Retorno do provedor (GET ?code&state) ------------------------------------------------
  if (req.method === "GET" && url.pathname.endsWith("/retorno")) {
    const code = url.searchParams.get("code");
    const [provedor, userId, nonce] = (url.searchParams.get("state") ?? "").split(".");
    const ad = adaptadorDe(provedor);
    if (!code || !provedor || !userId || !nonce || !ad) return voltarParaAgenda("conexao");

    // Confere o nonce guardado (uso único, com validade) — barra o CSRF de vinculação.
    const { data: pend } = await admin
      .from("calendario_contas")
      .select("id, oauth_nonce, oauth_nonce_expira")
      .eq("user_id", userId)
      .eq("provedor", provedor)
      .maybeSingle();
    if (
      !pend || !pend.oauth_nonce || pend.oauth_nonce !== nonce ||
      !pend.oauth_nonce_expira || new Date(pend.oauth_nonce_expira).getTime() < Date.now()
    ) {
      return voltarParaAgenda("conexao");
    }

    const { data: u } = await admin.from("usuarios").select("empresa_id").eq("user_id", userId).maybeSingle();
    if (!u?.empresa_id) return voltarParaAgenda("empresa"); // não cria conexão sem empresa (isolamento)

    const tok = await ad.trocarCodigoPorToken(code);
    const cal = await ad.criarCalendarioRepply(tok.access_token);

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

  // ---- Chamadas do app (POST { acao, provedor }) — autenticadas pelo JWT do vendedor ----------
  const authHeader = req.headers.get("Authorization") ?? "";
  const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await anon.auth.getUser();
  if (!user) return json({ error: "Não autenticado." }, 401);

  const { acao, provedor } = await req.json();
  const ad = adaptadorDe(provedor);
  if (!ad) return json({ error: "Provedor inválido." }, 400);

  if (acao === "iniciar") {
    const nonce = novoNonce();
    const expira = new Date(Date.now() + NONCE_VALIDADE_MS).toISOString();
    const { data: existente } = await admin
      .from("calendario_contas")
      .select("id")
      .eq("user_id", user.id)
      .eq("provedor", provedor)
      .maybeSingle();

    if (existente) {
      // Só grava o nonce; NÃO mexe em status/tokens (pode ser reconexão de quem já está ligado).
      await admin.from("calendario_contas")
        .update({ oauth_nonce: nonce, oauth_nonce_expira: expira })
        .eq("id", existente.id);
    } else {
      const { data: u } = await admin.from("usuarios").select("empresa_id").eq("user_id", user.id).maybeSingle();
      if (!u?.empresa_id) return json({ error: "Sua empresa não foi identificada." }, 400);
      await admin.from("calendario_contas").insert({
        user_id: user.id, empresa_id: u.empresa_id, provedor,
        status: "desconectada", oauth_nonce: nonce, oauth_nonce_expira: expira,
      });
    }
    return json({ url: ad.urlDeConsentimento(`${provedor}.${user.id}.${nonce}`) });
  }

  if (acao === "desconectar") {
    const { data: conta } = await admin
      .from("calendario_contas")
      .select("id")
      .eq("user_id", user.id)
      .eq("provedor", provedor)
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
```

- [ ] **Step 3: Checagem de tipos (quando o Deno existir)**

Run: `deno check supabase/functions/calendario-sincronizar/index.ts supabase/functions/calendario-conectar/index.ts`
Expected: sem erros. Senão, PULAR (o deploy cobre) + revisão.

- [ ] **Step 4: Verificação do app**

Run: `npx tsc --noEmit -p tsconfig.app.json` → base não sobe.
Run: `npm run build` → compila.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/calendario-sincronizar/index.ts supabase/functions/calendario-conectar/index.ts
git commit -m "feat(calendario): OAuth e motor despacham por provedor (state provedor.user_id.nonce)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Migration — gatilho de enfileirar passa a valer para qualquer provedor

O gatilho `calendario_enfileira` (migration 20260924120000) só enfileira quando o dono tem conexão
`provedor='google'`. Sem esta troca, um evento novo/editado de quem só tem Microsoft **nunca** seria
empurrado. `create or replace` numa migration NOVA (não se edita migration publicada). O ramo DELETE
já é agnóstico (enfileira uma linha por etiqueta, qualquer conexão) — só o ramo INSERT/UPDATE muda.

**Files:**
- Create: `supabase/migrations/<AAAAMMDDHHMMSS>_calendario_enfileira_multiprovedor.sql`

> ⚠️ O prefixo de versão pode COLIDIR com outra sessão ([[versao-de-migration-pode-colidir]]). Antes de nomear, confira o maior prefixo em `supabase/migrations/` no local e no `origin/main` e escolha um posterior.

- [ ] **Step 1: Escrever a migration**

```sql
-- O gatilho de enfileirar da sincronizacao de calendario passa a valer para QUALQUER provedor
-- conectado (Google e Microsoft), nao so o Google. Complementa 20260924120000 (nao editar a antiga).
-- Idempotente: create or replace da funcao; o gatilho continua o mesmo.

create or replace function public.calendario_enfileira()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    -- O evento vai sumir e a etiqueta some junto (cascata). Captura o id externo AGORA e enfileira
    -- um 'apagar' por conexao (qualquer provedor — o select nao filtra provedor).
    insert into public.calendario_fila (operacao, user_id, calendario_conta_id, evento_externo_id)
    select 'apagar', old.user_id, es.calendario_conta_id, es.evento_externo_id
      from public.evento_sync_externo es
     where es.evento_id = old.id;
    return old;
  end if;

  -- No UPDATE, so enfileira se um campo SINCRONIZADO mudou de fato.
  if tg_op = 'UPDATE'
     and new.titulo is not distinct from old.titulo
     and new.descricao is not distinct from old.descricao
     and new.inicio is not distinct from old.inicio
     and new.fim is not distinct from old.fim
     and new.dia_inteiro is not distinct from old.dia_inteiro then
    return new;
  end if;

  -- INSERT/UPDATE: enfileira se o DONO do evento tem ALGUM calendario conectado (Google ou Microsoft).
  if exists (
    select 1 from public.calendario_contas c
     where c.user_id = new.user_id
       and c.provedor in ('google','microsoft')
       and c.status = 'conectada'
  ) then
    insert into public.calendario_fila (operacao, user_id, evento_id)
    values ('salvar', new.user_id, new.id);
  end if;
  return new;
end;
$$;
revoke all on function public.calendario_enfileira() from public, anon, authenticated;
```

- [ ] **Step 2: Conferir que não editou migration antiga e que o prefixo é novo**

Run: `git -C <repo> log --oneline -1 -- supabase/migrations/20260924120000_calendario_fila_e_cron.sql` (deve continuar intacta)
Run: verificar que o novo arquivo tem prefixo maior que todos em `supabase/migrations/` (local e origin/main).

- [ ] **Step 3: Verificação do app (a migration não afeta o build; só garante que nada mais mudou)**

Run: `npm run build` → compila.

- [ ] **Step 4: Commit** (aplicação em produção só com o "pode" — ver go-live)

```bash
git add supabase/migrations/<AAAAMMDDHHMMSS>_calendario_enfileira_multiprovedor.sql
git commit -m "feat(calendario): gatilho de enfileirar vale para qualquer provedor conectado

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Tela e hook — dois provedores, com trava própria da Microsoft

**Files:**
- Modify: `src/hooks/use-calendario-conexao.ts`
- Modify: `src/components/calendar/ConexaoCalendarioExterno.tsx`

**Interfaces:**
- Consumes: `supabase.functions.invoke('calendario-conectar', { body: { acao, provedor } })` (Task 4).
- Produces: hook expõe `conexaoDe(provedor)`, `iniciarConexao(provedor)`, `desconectar(provedor)`, `desconectando`.

- [ ] **Step 1: Reescrever o hook para dois provedores** (`src/hooks/use-calendario-conexao.ts`)

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { mensagemDeErroDaFunction } from '@/lib/erro-edge-function';

export type ProvedorCalendario = 'google' | 'microsoft';

export interface ConexaoCalendario {
  id: string;
  provedor: string;
  contaEmail: string | null;
  status: string;
  ultimoErro: string | null;
}

/**
 * Lê TODAS as conexões de calendário do vendedor (Google e Microsoft) em `calendario_contas` e
 * expõe conectar/desconectar por provedor via a função de borda `calendario-conectar`.
 *
 * A consulta pede só as colunas sem token: a RLS libera a linha, mas os tokens ficam protegidos por
 * GRANT de coluna (migration 20260923140100) — pedir demais aqui daria erro de permissão.
 */
export function useConexaoCalendario() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const userId = profile?.user_id;

  const consulta = useQuery({
    queryKey: ['calendario_conexoes', userId],
    enabled: !!userId,
    queryFn: async (): Promise<ConexaoCalendario[]> => {
      const { data, error } = await supabase
        .from('calendario_contas')
        .select('id, provedor, conta_email, status, ultimo_erro')
        .eq('user_id', userId!);
      if (error) throw error;
      return (data ?? []).map((d) => ({
        id: d.id,
        provedor: d.provedor,
        contaEmail: d.conta_email,
        status: d.status,
        ultimoErro: d.ultimo_erro,
      }));
    },
  });

  const conexoes = consulta.data ?? [];
  const conexaoDe = (provedor: ProvedorCalendario): ConexaoCalendario | null =>
    conexoes.find((c) => c.provedor === provedor) ?? null;

  async function iniciarConexao(provedor: ProvedorCalendario) {
    const { data, error } = await supabase.functions.invoke('calendario-conectar', {
      body: { acao: 'iniciar', provedor },
    });
    if (error) {
      toast.error(await mensagemDeErroDaFunction(error, 'Não foi possível iniciar a conexão.'));
      return;
    }
    if (data?.url) window.location.assign(data.url as string);
  }

  const desconectarMut = useMutation({
    mutationFn: async (provedor: ProvedorCalendario) => {
      const { error } = await supabase.functions.invoke('calendario-conectar', {
        body: { acao: 'desconectar', provedor },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendario_conexoes', userId] });
      toast.success('Calendário desconectado.');
    },
    onError: async (e) => toast.error(await mensagemDeErroDaFunction(e, 'Não foi possível desconectar.')),
  });

  return {
    conexoes,
    conexaoDe,
    carregando: consulta.isLoading,
    iniciarConexao,
    desconectar: (provedor: ProvedorCalendario) => desconectarMut.mutate(provedor),
    desconectando: desconectarMut.isPending,
  };
}
```

- [ ] **Step 2: Reescrever a tela com os dois provedores e a trava da Microsoft** (`src/components/calendar/ConexaoCalendarioExterno.tsx`)

```tsx
import { CalendarClock, Link2, Unlink, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  useConexaoCalendario,
  type ProvedorCalendario,
  type ConexaoCalendario,
} from '@/hooks/use-calendario-conexao';

/**
 * 🔴 TRAVA DE RECURSO. O Google (Fase 1) está ABERTO A TODOS desde 24/09 (escopo não-sensível).
 * A Microsoft (Fase 2) começa DORMENTE: enquanto `SINCRONIZACAO_MICROSOFT_ATIVA` for false, o botão
 * da Microsoft só aparece para quem já tem uma linha 'microsoft' em `calendario_contas` (testador com
 * linha PRÉ-CRIADA no banco). 🔴 O e-mail/id do testador fica SÓ no banco (repo público, CLAUDE.md
 * §6.9). Depois de validar ponta a ponta, virar `true` abre para todos.
 */
export const SINCRONIZACAO_MICROSOFT_ATIVA = false;

/** Bloco de conectar/desconectar de UM provedor. */
function LinhaProvedor({
  nome, conexao, onConectar, onDesconectar, desconectando,
}: {
  nome: string;
  conexao: ConexaoCalendario | null;
  onConectar: () => void;
  onDesconectar: () => void;
  desconectando: boolean;
}) {
  if (!conexao || conexao.status === 'desconectada') {
    return (
      <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={onConectar}>
        <Link2 className="h-4 w-4" /> Conectar meu {nome}
      </Button>
    );
  }
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">
        {nome} conectado{conexao.contaEmail ? ` como ${conexao.contaEmail}` : ''}.
      </p>
      {conexao.status === 'erro' && (
        <p className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertTriangle className="h-3.5 w-3.5" /> A conexão caiu — reconecte para voltar a sincronizar.
        </p>
      )}
      <Button
        size="sm" variant="ghost" className="w-full gap-1.5 text-muted-foreground"
        disabled={desconectando} onClick={onDesconectar}
      >
        <Unlink className="h-4 w-4" /> Desconectar {nome}
      </Button>
    </div>
  );
}

/** Bloco de conectar/desconectar o calendário externo, na barra lateral da agenda. */
export function ConexaoCalendarioExterno() {
  const { conexaoDe, carregando, iniciarConexao, desconectar, desconectando } = useConexaoCalendario();
  if (carregando) return null;

  const google = conexaoDe('google');
  const microsoft = conexaoDe('microsoft');
  // Microsoft: aberta a todos OU testador com linha pré-criada.
  const mostrarMicrosoft = SINCRONIZACAO_MICROSOFT_ATIVA || !!microsoft;

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <CalendarClock className="h-4 w-4 text-primary" /> Calendário do celular
      </div>
      <p className="text-xs text-muted-foreground">
        Ligue seu calendário para ver seus compromissos do Repply no celular — e mudanças voltam para cá.
      </p>
      <LinhaProvedor
        nome="Google" conexao={google}
        onConectar={() => iniciarConexao('google')}
        onDesconectar={() => desconectar('google')}
        desconectando={desconectando}
      />
      {mostrarMicrosoft && (
        <LinhaProvedor
          nome="Microsoft" conexao={microsoft}
          onConectar={() => iniciarConexao('microsoft')}
          onDesconectar={() => desconectar('microsoft')}
          desconectando={desconectando}
        />
      )}
    </div>
  );
}
```

> Nota: a tela deixou de esconder o cartão inteiro quando não há conexão (o Google está aberto a todos, então o cartão sempre aparece na agenda). Se algum teste ou tela dependia do `SINCRONIZACAO_CALENDARIO_ATIVA` exportado por este arquivo, procure por referências (`grep -rn SINCRONIZACAO_CALENDARIO_ATIVA src/`) antes de removê-lo; se houver, mantenha-o exportado (ainda `true`) para não quebrar import.

- [ ] **Step 3: Conferir referências ao símbolo antigo**

Run: `grep -rn "SINCRONIZACAO_CALENDARIO_ATIVA\|iniciarGoogle\|calendario_conexao\b" src/`
Expected: nenhuma referência órfã fora dos arquivos desta Task. Se houver (ex.: um teste), ajustar junto nesta Task.

- [ ] **Step 4: Verificação + prévia visual**

Run: `npx tsc --noEmit -p tsconfig.app.json` → base não sobe.
Run: `npm run test` → passa (contagem não cai).
Run: `npm run build` → compila.
Prévia: abrir `/calendario`, confirmar que aparece "Conectar meu Google" e que **não** aparece "Conectar meu Microsoft" (flag false, sem linha). (Preview lê o launch.json da pasta-mãe — [[preview-le-launch-json-da-pasta-mae]].)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-calendario-conexao.ts src/components/calendar/ConexaoCalendarioExterno.tsx
git commit -m "feat(calendario): tela com Google + Microsoft (Microsoft dormente ate validar)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Política de privacidade — trecho da Microsoft

**Files:**
- Modify: `src/pages/PoliticaDePrivacidade.tsx`

- [ ] **Step 1: Localizar a seção do Google na política**

Run: `grep -n "Google\|calendário\|Uso Limitado\|calendar.app.created" src/pages/PoliticaDePrivacidade.tsx`
Expected: encontra a seção que descreve a sincronização com o Google (texto de Uso Limitado / calendário dedicado).

- [ ] **Step 2: Acrescentar o parágrafo da Microsoft logo após o do Google**

Inserir, no mesmo estilo/JSX dos parágrafos vizinhos (ajustar as tags ao que o arquivo usa — `<p>`, `<section>`, etc.):

```tsx
<p>
  <strong>Microsoft 365 (Outlook).</strong> Para sincronizar sua agenda com o Outlook, a Microsoft
  concede ao Repply uma permissão de leitura e escrita de calendários (Calendars.ReadWrite), pois
  não há uma permissão mais estreita equivalente. Mesmo assim, o Repply <strong>só</strong> cria e
  altera um calendário dedicado chamado &quot;Repply CRM&quot;; não lê nem modifica os seus demais
  calendários. Vale o mesmo compromisso de uso limitado e segurança descrito acima: os tokens ficam
  criptografados no servidor e são usados apenas para manter seus compromissos do Repply em dia.
</p>
```

- [ ] **Step 3: Verificação + prévia visual**

Run: `npx tsc --noEmit -p tsconfig.app.json` → base não sobe.
Run: `npm run build` → compila.
Prévia: abrir `/politica-de-privacidade` e conferir o parágrafo novo (rolagem funciona — a página usa `usePaginaRolavel`).

- [ ] **Step 4: Commit**

```bash
git add src/pages/PoliticaDePrivacidade.tsx
git commit -m "docs(calendario): politica de privacidade cobre a Microsoft (calendario dedicado)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Go-live (depois das Tarefas 1–7, com o "pode" do Lucas — padrão dormente → testador → todos da Fase 1)

1. **Segredos** no Supabase (Pré-requisito externo, itens 1–5). Sem eles a Microsoft não conecta.
2. **Aplicar a migration** da Task 5 (ensaio antes: um `execute_sql` só, com sonda + `RAISE` que desfaz — [[ensaio-de-migration-em-producao]]; depois aplicar de verdade).
3. **Implantar as 3 funções** de borda: `calendario-sincronizar`, `calendario-conectar`, e os `_shared` vão junto. (O deploy faz a checagem de tipos do Deno — é aqui que os `deno check` pulados são cobertos.) Com a tela ainda dormente (`SINCRONIZACAO_MICROSOFT_ATIVA=false`), nada muda para o público: o motor só age em linha 'microsoft', que ainda não existe.
4. **Criar a linha de testador**: um `insert` em `calendario_contas` com `provedor='microsoft'`, `status='desconectada'`, `user_id` = o `auth.users.id` do testador (🔴 NÃO o `usuarios.id` — [[CLAUDE §4.5]]; casar por e-mail em `auth.users`) e `empresa_id` do testador. Isso faz o botão "Conectar meu Microsoft" aparecer só para ele.
5. **Validar ponta a ponta** com uma conta Microsoft (pessoal e, se der, uma corporativa): conectar → o app cria o calendário "Repply CRM" no Outlook; criar evento no Repply → aparece no Outlook; mudar/apagar no Outlook → volta em até 5 min; conferir que os OUTROS calendários não são tocados; e que o disjuntor barra exclusão em massa. Filtrar a empresa de demonstração ("Repply") ao ler números ([[empresa-repply-e-de-demonstracao]]).
6. **Abrir a todos**: virar `SINCRONIZACAO_MICROSOFT_ATIVA=true` (uma linha, um deploy) e publicar. Emergência = voltar para `false`.

---

## Autorreview do plano (feito)

- **Cobertura da spec:** §3 (reaproveitar tabelas/motor/fila — Tasks 2, 4, 5), §4.1 (adaptador Microsoft — Task 3), §4.2 (trava de calendário — `garanteCalendarioDedicado`, Task 3), §4.3 (mapeamento no miolo puro — Task 1), §4.4 (motor e login por provedor — Tasks 2 e 4), §4.5 (tela — Task 6), §4.6 (política — Task 7), §5 (segurança/segredos — Pré-requisito + Task 3), §6 (pré-requisito Entra — Pré-requisito), §8 (como verificar — passos de verificação + go-live), §9 (riscos: escopo amplo→trava; delta token→410; formato Graph→mapeamento+testes). ✔️
- **Sem placeholders:** todo passo de código traz o código real; nenhum "TODO/implementar depois". ✔️
- **Consistência de tipos:** `AdaptadorCalendario`/`MudancaExterna`/`EventoParaSincronizar` definidos na Task 1 e usados igual nas Tasks 2–4; `criarEvento/atualizarEvento(token, calId, evento, fuso)`, `listarMudancas(...)→{itens,proximoSyncToken}`, `renovarAccessToken→{access_token,expires_in,refresh_token?}` batem entre miolo, adaptadores e motor; `contasConectadasDe`/`contaPorId`/`adaptadorDe` consistentes no motor. ✔️
