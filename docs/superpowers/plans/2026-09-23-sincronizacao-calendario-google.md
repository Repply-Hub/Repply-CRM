# Sincronização de Calendário — Fase 1 (motor + Google) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sincronizar de mão dupla os eventos da agenda do Repply com o Google Calendar de cada vendedor, num calendário dedicado "Repply CRM", sem Nylas.

**Architecture:** Um "miolo" puro e testável (mapeamento evento↔Google, resolução de conflito, disjuntor de exclusão) + duas tabelas novas + um adaptador do Google + duas funções de borda (conectar por OAuth; sincronizar saída/volta) + gatilho e cron no banco + a tela de conectar/desconectar dentro do `/calendario`. O motor é agnóstico de provedor para a Fase 2 (Microsoft) só escrever outro adaptador.

**Tech Stack:** React 18 + Vite + TanStack Query + Vitest (frontend/libs); Supabase Postgres + RLS + Edge Functions (Deno) + pg_cron; Google Calendar API v3 + OAuth 2.0.

**Spec:** `docs/superpowers/specs/2026-09-23-sincronizacao-calendario-externo-design.md`

## Global Constraints

- **Sempre PT-BR** em interface, comentário, mensagem de erro e commit.
- **Nunca commite credencial.** Client secret do Google e afins são **segredos do servidor** (Supabase secrets), nunca no repositório (público).
- **Tabela nova nasce por migration** com RLS habilitada e política no mesmo arquivo. Nunca criar tabela pelo painel. Nunca editar migration existente — só acrescentar.
- **`.update()`/`.delete()` com `{ count: 'exact' }`; tratar `count === 0` como recusa** via `recusaSemErro` (nunca `!count`).
- **Verificação antes de "feito":** `npx tsc --noEmit -p tsconfig.app.json` (base **36**, não pode subir), `npm run build` (compila), `npm run test` (suíte inteira passa, número de testes não cai).
- **Erro do Supabase não é `Error`:** usar `mensagemDeErro` (`src/lib/mensagem-de-erro.ts`) / `mensagemDeErroDaFunction` (`src/lib/erro-edge-function.ts`).
- **Fuso:** usar `src/lib/data-local.ts`; nunca `parseFloat`/`type=number` (irrelevante aqui) — mas **evento de dia-inteiro do Google usa data-fim EXCLUSIVA** (dia seguinte); converter nos dois sentidos.
- **Trava:** eventos vão para um calendário dedicado "Repply CRM"; o Repply só toca em evento que tem etiqueta (`evento_sync_externo`); nunca lê os outros eventos pessoais do vendedor.
- **Só sincronizam** os `eventos` (pessoais e da empresa). Prazos/contatos NÃO. O que volta é só o que o Repply criou.
- **Commit só com o "pode" do Lucas** e após a verificação (o repo publica no push). Publicar só os próprios commits (worktree a partir de `origin/main` + rebase/cherry-pick).

---

## Pré-requisito 0 (AÇÃO DO LUCAS — fora do código, destrava as Tarefas 7–9 em produção)

Estas etapas são no painel do Google/Supabase, não no código. Podem correr em paralelo às Tarefas 1–6.

1. **Google Cloud:** criar um projeto, ativar a **Google Calendar API**, criar credencial **OAuth 2.0 (Web application)**. Anotar `client_id` e `client_secret`. Adicionar o **redirect URI** da função de conexão (definido na Tarefa 7): `https://<PROJETO>.functions.supabase.co/calendario-conectar/retorno`.
2. **Tela de consentimento OAuth:** preencher (nome do app, logo, política de privacidade, domínio verificado) e adicionar o escopo `https://www.googleapis.com/auth/calendar.app.created` (permite ao Repply criar e gerenciar **um calendário próprio**, sem acesso ao resto da agenda — escopo mais estreito e mais fácil de aprovar). Adicionar contas de **teste** para validar antes da aprovação.
3. **Verificação do app pelo Google** (§11 da spec): enviar para revisão. Leva de dias a semanas. Até aprovar, só as contas de teste conectam.
4. **Segredos no Supabase** (`supabase secrets set`, nunca no repo): `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_REDIRECT_URI`, `CALENDARIO_TOKEN_KEY` (chave de criptografia dos tokens, 32 bytes base64).

> Sem isto, as Tarefas 1–6 são construídas e testadas normalmente; as Tarefas 7–9 são escritas e implantadas, mas a conexão real ponta a ponta só funciona com o app aprovado (ou conta de teste).

---

## Mapa de arquivos

**Criar:**
- `supabase/migrations/<ts>_calendario_contas_e_sync.sql` — 2 tabelas + RLS (Tarefa 1).
- `supabase/migrations/<ts>_calendario_fila_e_cron.sql` — fila de saída, gatilho e cron (Tarefa 9).
- `src/lib/calendario/mapeamento.ts` (+ `.test.ts`) — evento Repply ↔ recurso do Google (Tarefa 3).
- `src/lib/calendario/conflito.ts` (+ `.test.ts`) — quem vence, disjuntor, recusa (Tarefa 4).
- `src/hooks/use-calendario-conexao.ts` (+ `.test.tsx`) — status/conectar/desconectar (Tarefa 5).
- `src/components/calendar/ConexaoCalendarioExterno.tsx` — botões e status na agenda (Tarefa 5).
- `supabase/functions/_shared/calendario-google.ts` — adaptador do Google (Tarefa 6).
- `supabase/functions/calendario-conectar/index.ts` — OAuth: iniciar, retorno, desconectar (Tarefa 7).
- `supabase/functions/calendario-sincronizar/index.ts` — saída (fila) e volta (sync token) (Tarefa 8).

**Modificar:**
- `src/integrations/supabase/types.ts` — tipos das 2 tabelas novas (Tarefa 2).
- `src/pages/Calendario.tsx` — encaixar `<ConexaoCalendarioExterno/>` na barra lateral (Tarefa 5).

---

## Tarefa 1: Estrutura do banco — tabelas de conexão e de etiqueta

**Files:**
- Create: `supabase/migrations/<timestamp>_calendario_contas_e_sync.sql`

**Interfaces:**
- Produces: tabelas `calendario_contas` e `evento_sync_externo` (colunas conforme a spec §5); funções auxiliares nenhuma.

> Migration não tem TDD (não há banco local). O critério é: SQL escrito conforme a spec, RLS no mesmo arquivo, e **aplicação em produção só com o Lucas** (com sonda antes/depois, CLAUDE.md §9). Confirme o prefixo de versão no local e no `origin` antes de publicar (colisão de versão é conhecida).

- [ ] **Step 1: Escrever a migration**

```sql
-- Conexão de calendário externo por vendedor (Fase 1: Google). Espelha o cuidado do e-mail:
-- token fica no servidor, RLS tranca leitura de token ao service_role.
create table if not exists public.calendario_contas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  empresa_id uuid not null,
  provedor text not null check (provedor in ('google','microsoft')),
  conta_email text,
  calendario_externo_id text,
  refresh_token text,           -- criptografado na camada de aplicação (Tarefa 7)
  access_token text,            -- criptografado
  token_expira_em timestamptz,
  sync_token text,
  status text not null default 'conectada' check (status in ('conectada','erro','desconectada')),
  ultimo_erro text,
  ultima_sync_em timestamptz,
  criado_em timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provedor)
);

create index if not exists calendario_contas_empresa_idx on public.calendario_contas (empresa_id);

alter table public.calendario_contas enable row level security;

-- O vendedor enxerga a PRÓPRIA conexão (para a tela mostrar status). As colunas de token
-- ficam protegidas por GRANT de coluna abaixo — a RLS libera a linha, o GRANT esconde o token.
create policy calendario_contas_select on public.calendario_contas
  for select using (user_id = auth.uid());

-- Conectar/atualizar/desconectar a própria conta. A gravação de token real é feita pela
-- função de borda com service_role (que ignora RLS); esta policy cobre o caso do cliente.
create policy calendario_contas_insert on public.calendario_contas
  for insert with check (user_id = auth.uid());
create policy calendario_contas_update on public.calendario_contas
  for update using (user_id = auth.uid());
create policy calendario_contas_delete on public.calendario_contas
  for delete using (user_id = auth.uid());

-- Esconder as colunas de token do papel authenticated: revoga tudo e concede só o que a tela usa.
revoke all on public.calendario_contas from authenticated;
grant select (id, user_id, empresa_id, provedor, conta_email, calendario_externo_id,
              status, ultimo_erro, ultima_sync_em, criado_em, updated_at)
  on public.calendario_contas to authenticated;
grant insert (user_id, empresa_id, provedor) on public.calendario_contas to authenticated;
grant update (status) on public.calendario_contas to authenticated;
grant delete on public.calendario_contas to authenticated;

comment on table public.calendario_contas is 'Conexão de calendário externo por vendedor (Fase 1: Google). Token só o service_role lê.';

-- A "etiqueta" que liga um evento do Repply ao seu espelho no calendário externo.
create table if not exists public.evento_sync_externo (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos(id) on delete cascade,
  calendario_conta_id uuid not null references public.calendario_contas(id) on delete cascade,
  evento_externo_id text not null,
  etag_externo text,
  atualizado_repply_em timestamptz,
  ultima_sync_em timestamptz,
  criado_em timestamptz not null default now(),
  unique (calendario_conta_id, evento_externo_id),
  unique (evento_id, calendario_conta_id)
);

create index if not exists evento_sync_externo_evento_idx on public.evento_sync_externo (evento_id);

alter table public.evento_sync_externo enable row level security;

-- Existência sobre a conexão do próprio usuário (para a tela poder mostrar "sincronizado").
create policy evento_sync_externo_select on public.evento_sync_externo
  for select using (
    exists (select 1 from public.calendario_contas c
            where c.id = calendario_conta_id and c.user_id = auth.uid())
  );

comment on table public.evento_sync_externo is 'Liga um evento do Repply ao seu espelho externo. O Repply só toca em evento com etiqueta.';
```

- [ ] **Step 2: Conferir prefixo de versão e revisar**

Run: `ls supabase/migrations | tail -3` e conferir `git log --oneline -5 origin/main -- supabase/migrations` para não colidir de versão. Ajustar o timestamp do nome se necessário.
Expected: nome de arquivo com versão maior que a última do `origin`.

- [ ] **Step 3: NÃO aplicar sozinho — marcar para o Lucas**

A aplicação em produção é do §9/§11. Deixar anotado no relatório: "migration pronta, aguarda aplicação com o Lucas".

- [ ] **Step 4: Commit (com o "pode" do Lucas)**

```bash
git add supabase/migrations/<timestamp>_calendario_contas_e_sync.sql
git commit -m "feat(calendario): estrutura do banco para sincronização externa (contas + etiqueta)"
```

---

## Tarefa 2: Tipos do Supabase para as duas tabelas

**Files:**
- Modify: `src/integrations/supabase/types.ts`

**Interfaces:**
- Produces: tipos `calendario_contas` e `evento_sync_externo` em `Database['public']['Tables']`, para o frontend compilar.

> Não há banco local; o arquivo é atualizado à mão para bater com a migration (CLAUDE.md §6.8). Sem TDD; o critério é `tsc` não subir de 36.

- [ ] **Step 1: Acrescentar os blocos de tipo**

Localize `Tables: {` em `src/integrations/supabase/types.ts` e acrescente (em ordem alfabética, perto de outras tabelas) as entradas `calendario_contas` e `evento_sync_externo` com `Row`/`Insert`/`Update` refletindo as colunas da Tarefa 1 (todas as colunas em `Row`; `Insert` com opcionais os que têm default; `Update` tudo opcional). Tipos: `string` para uuid/text/timestamptz, `boolean`, etc. Exemplo do formato de uma entrada:

```ts
      calendario_contas: {
        Row: {
          id: string
          user_id: string
          empresa_id: string
          provedor: string
          conta_email: string | null
          calendario_externo_id: string | null
          refresh_token: string | null
          access_token: string | null
          token_expira_em: string | null
          sync_token: string | null
          status: string
          ultimo_erro: string | null
          ultima_sync_em: string | null
          criado_em: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          empresa_id: string
          provedor: string
          conta_email?: string | null
          calendario_externo_id?: string | null
          refresh_token?: string | null
          access_token?: string | null
          token_expira_em?: string | null
          sync_token?: string | null
          status?: string
          ultimo_erro?: string | null
          ultima_sync_em?: string | null
          criado_em?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          empresa_id?: string
          provedor?: string
          conta_email?: string | null
          calendario_externo_id?: string | null
          refresh_token?: string | null
          access_token?: string | null
          token_expira_em?: string | null
          sync_token?: string | null
          status?: string
          ultimo_erro?: string | null
          ultima_sync_em?: string | null
          criado_em?: string
          updated_at?: string
        }
        Relationships: []
      }
```

E `evento_sync_externo` no mesmo formato (colunas da Tarefa 1).

- [ ] **Step 2: Verificar tipo**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "error TS"`
Expected: `36` (não subiu).

- [ ] **Step 3: Commit**

```bash
git add src/integrations/supabase/types.ts
git commit -m "feat(calendario): tipos das tabelas de sincronização de calendário"
```

---

## Tarefa 3: Miolo puro — mapeamento evento Repply ↔ recurso do Google

**Files:**
- Create: `src/lib/calendario/mapeamento.ts`
- Test: `src/lib/calendario/mapeamento.test.ts`

**Interfaces:**
- Produces:
  - `type EventoParaSincronizar = { titulo: string; descricao: string | null; inicio: string; fim: string; diaInteiro: boolean }` (inicio/fim = ISO `timestamptz`).
  - `type RecursoGoogle = { summary: string; description?: string; start: PontoGoogle; end: PontoGoogle }` onde `type PontoGoogle = { dateTime?: string; date?: string; timeZone?: string }`.
  - `paraGoogle(e: EventoParaSincronizar, fusoHorario: string): RecursoGoogle`
  - `paraRepply(g: RecursoGoogle): { titulo: string; descricao: string | null; inicio: string; fim: string; diaInteiro: boolean }`
- Consumes: `date-fns` (já no projeto) para somar/subtrair 1 dia em datas de dia-inteiro.

- [ ] **Step 1: Escrever os testes que falham**

```ts
import { describe, it, expect } from 'vitest';
import { paraGoogle, paraRepply } from './mapeamento';

describe('mapeamento evento Repply ↔ Google', () => {
  it('evento com hora vira dateTime com fuso, e volta igual', () => {
    const e = {
      titulo: 'Visita obra', descricao: 'levar catálogo',
      inicio: '2026-10-05T13:00:00.000Z', fim: '2026-10-05T14:00:00.000Z', diaInteiro: false,
    };
    const g = paraGoogle(e, 'America/Sao_Paulo');
    expect(g.summary).toBe('Visita obra');
    expect(g.start.dateTime).toBe('2026-10-05T13:00:00.000Z');
    expect(g.start.timeZone).toBe('America/Sao_Paulo');
    expect(g.end.dateTime).toBe('2026-10-05T14:00:00.000Z');
    expect(g.start.date).toBeUndefined();

    const volta = paraRepply(g);
    expect(volta.diaInteiro).toBe(false);
    expect(volta.inicio).toBe('2026-10-05T13:00:00.000Z');
    expect(volta.fim).toBe('2026-10-05T14:00:00.000Z');
  });

  it('dia inteiro: Google usa data-fim EXCLUSIVA (dia seguinte)', () => {
    // No Repply o dia inteiro do dia 5 grava fim em 2026-10-05T23:59:59.
    const e = {
      titulo: 'Feriado', descricao: null,
      inicio: '2026-10-05T00:00:00.000Z', fim: '2026-10-05T23:59:59.000Z', diaInteiro: true,
    };
    const g = paraGoogle(e, 'America/Sao_Paulo');
    expect(g.start.date).toBe('2026-10-05');
    expect(g.end.date).toBe('2026-10-06'); // exclusiva: dia seguinte
    expect(g.start.dateTime).toBeUndefined();
    expect(g.start.timeZone).toBeUndefined();
  });

  it('dia inteiro volta do Google: subtrai 1 dia do fim exclusivo', () => {
    const g = { summary: 'Feriado', start: { date: '2026-10-05' }, end: { date: '2026-10-06' } };
    const volta = paraRepply(g);
    expect(volta.diaInteiro).toBe(true);
    expect(volta.inicio).toBe('2026-10-05T00:00:00.000Z');
    expect(volta.fim).toBe('2026-10-05T23:59:59.000Z'); // último dia real
  });

  it('descrição vazia não vira "undefined" no Google', () => {
    const g = paraGoogle({ titulo: 'X', descricao: null, inicio: '2026-10-05T13:00:00.000Z', fim: '2026-10-05T14:00:00.000Z', diaInteiro: false }, 'America/Sao_Paulo');
    expect(g.description).toBeUndefined();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/calendario/mapeamento.test.ts`
Expected: FALHA ("paraGoogle is not a function" / arquivo não existe).

- [ ] **Step 3: Implementar**

```ts
import { addDays, subDays, format } from 'date-fns';

/** Um evento do Repply reduzido ao que a sincronização precisa. inicio/fim são ISO timestamptz. */
export interface EventoParaSincronizar {
  titulo: string;
  descricao: string | null;
  inicio: string;
  fim: string;
  diaInteiro: boolean;
}

export interface PontoGoogle {
  dateTime?: string;
  date?: string;
  timeZone?: string;
}

export interface RecursoGoogle {
  summary: string;
  description?: string;
  start: PontoGoogle;
  end: PontoGoogle;
}

/** Data (AAAA-MM-DD) do instante, no fuso UTC do próprio timestamptz do dia-inteiro do Repply. */
function dataISO(instante: string): string {
  return instante.slice(0, 10);
}

export function paraGoogle(e: EventoParaSincronizar, fusoHorario: string): RecursoGoogle {
  const base: RecursoGoogle = { summary: e.titulo, start: {}, end: {} };
  if (e.descricao) base.description = e.descricao;

  if (e.diaInteiro) {
    // Google usa data-fim EXCLUSIVA: o dia seguinte ao último dia do evento.
    const inicio = dataISO(e.inicio);
    const fimExclusivo = format(addDays(new Date(dataISO(e.fim) + 'T12:00:00Z'), 1), 'yyyy-MM-dd');
    base.start = { date: inicio };
    base.end = { date: fimExclusivo };
  } else {
    base.start = { dateTime: e.inicio, timeZone: fusoHorario };
    base.end = { dateTime: e.fim, timeZone: fusoHorario };
  }
  return base;
}

export function paraRepply(g: RecursoGoogle): {
  titulo: string; descricao: string | null; inicio: string; fim: string; diaInteiro: boolean;
} {
  const titulo = g.summary ?? '(sem título)';
  const descricao = g.description ?? null;

  if (g.start.date && g.end.date) {
    const inicio = g.start.date + 'T00:00:00.000Z';
    // Desfaz a data-fim exclusiva: último dia real = fim exclusivo - 1 dia, às 23:59:59.
    const ultimoDia = format(subDays(new Date(g.end.date + 'T12:00:00Z'), 1), 'yyyy-MM-dd');
    return { titulo, descricao, inicio, fim: ultimoDia + 'T23:59:59.000Z', diaInteiro: true };
  }

  return {
    titulo, descricao,
    inicio: g.start.dateTime!, fim: g.end.dateTime!, diaInteiro: false,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/calendario/mapeamento.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/calendario/mapeamento.ts src/lib/calendario/mapeamento.test.ts
git commit -m "feat(calendario): mapeamento evento Repply ↔ Google (com dia-inteiro exclusivo)"
```

---

## Tarefa 4: Miolo puro — conflito, disjuntor e recusa

**Files:**
- Create: `src/lib/calendario/conflito.ts`
- Test: `src/lib/calendario/conflito.test.ts`

**Interfaces:**
- Produces:
  - `quemVence(repplyAtualizadoEm: string, googleAtualizadoEm: string): 'repply' | 'google'` (mais recente vence; empate → 'repply').
  - `LIMITE_EXCLUSAO_EM_LOTE = 20`
  - `excedeDisjuntor(qtdParaApagar: number): boolean` (true = ABORTAR a passada).
  - `deveTratarComoRecusa(count: number | null): boolean` (true só quando `count === 0`).

- [ ] **Step 1: Escrever os testes que falham**

```ts
import { describe, it, expect } from 'vitest';
import { quemVence, excedeDisjuntor, deveTratarComoRecusa, LIMITE_EXCLUSAO_EM_LOTE } from './conflito';

describe('conflito e proteções da sincronização', () => {
  it('vence a alteração mais recente', () => {
    expect(quemVence('2026-10-05T10:00:00Z', '2026-10-05T11:00:00Z')).toBe('google');
    expect(quemVence('2026-10-05T12:00:00Z', '2026-10-05T11:00:00Z')).toBe('repply');
  });

  it('empate favorece o Repply (fonte oficial)', () => {
    expect(quemVence('2026-10-05T10:00:00Z', '2026-10-05T10:00:00Z')).toBe('repply');
  });

  it('disjuntor: aborta quando passaria do limite', () => {
    expect(excedeDisjuntor(LIMITE_EXCLUSAO_EM_LOTE)).toBe(false);
    expect(excedeDisjuntor(LIMITE_EXCLUSAO_EM_LOTE + 1)).toBe(true);
    expect(excedeDisjuntor(0)).toBe(false);
  });

  it('zero linhas é recusa; null NÃO é (nunca !count)', () => {
    expect(deveTratarComoRecusa(0)).toBe(true);
    expect(deveTratarComoRecusa(1)).toBe(false);
    expect(deveTratarComoRecusa(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/calendario/conflito.test.ts`
Expected: FALHA (arquivo não existe).

- [ ] **Step 3: Implementar**

```ts
/** Resolução de conflito e proteções da sincronização — puras, para testar sem banco/rede. */

/** Mais recente vence; empate favorece o Repply (a fonte oficial do evento). */
export function quemVence(repplyAtualizadoEm: string, googleAtualizadoEm: string): 'repply' | 'google' {
  const r = new Date(repplyAtualizadoEm).getTime();
  const g = new Date(googleAtualizadoEm).getTime();
  return g > r ? 'google' : 'repply';
}

/** Disjuntor: acima disto, uma passada de sincronização PARA em vez de apagar em massa. */
export const LIMITE_EXCLUSAO_EM_LOTE = 20;

export function excedeDisjuntor(qtdParaApagar: number): boolean {
  return qtdParaApagar > LIMITE_EXCLUSAO_EM_LOTE;
}

/** ZERO LINHAS NÃO É SUCESSO (CLAUDE.md §4.6): count===0 é recusa; null nunca é. */
export function deveTratarComoRecusa(count: number | null): boolean {
  return count === 0;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/calendario/conflito.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/calendario/conflito.ts src/lib/calendario/conflito.test.ts
git commit -m "feat(calendario): conflito (mais recente vence), disjuntor e regra do zero-linhas"
```

---

## Tarefa 5: Tela — conectar/desconectar o Google na agenda

**Files:**
- Create: `src/hooks/use-calendario-conexao.ts`
- Test: `src/hooks/use-calendario-conexao.test.tsx`
- Create: `src/components/calendar/ConexaoCalendarioExterno.tsx`
- Modify: `src/pages/Calendario.tsx` (encaixar o componente na barra lateral)

**Interfaces:**
- Consumes: `supabase` (`@/integrations/supabase/client`), `useAuth`, `mensagemDeErroDaFunction`.
- Produces:
  - `useConexaoCalendario()` → `{ conexao: ConexaoCalendario | null; carregando: boolean; iniciarGoogle: () => Promise<void>; desconectar: () => void; desconectando: boolean }`.
  - `type ConexaoCalendario = { id: string; provedor: string; contaEmail: string | null; status: string; ultimoErro: string | null }`.

- [ ] **Step 1: Escrever o teste do hook que falha**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const invoke = vi.fn();
const from = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
    from: (...a: unknown[]) => from(...a),
  },
}));
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ profile: { user_id: 'u1', empresa_id: 'e1' } }) }));

import { useConexaoCalendario } from './use-calendario-conexao';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => { invoke.mockReset(); from.mockReset(); });

describe('useConexaoCalendario', () => {
  it('lê a conexão atual do vendedor (só colunas sem token)', async () => {
    const single = vi.fn().mockResolvedValue({
      data: { id: 'c1', provedor: 'google', conta_email: 'v@ex.com', status: 'conectada', ultimo_erro: null },
      error: null,
    });
    from.mockReturnValue({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: single }) }) }) });

    const { result } = renderHook(() => useConexaoCalendario(), { wrapper });
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.conexao?.contaEmail).toBe('v@ex.com');
    expect(result.current.conexao?.provedor).toBe('google');
  });

  it('iniciarGoogle chama a função de borda e redireciona para a URL de consentimento', async () => {
    from.mockReturnValue({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) }) });
    invoke.mockResolvedValue({ data: { url: 'https://accounts.google.com/o/oauth2/v2/auth?x=1' }, error: null });
    const assign = vi.fn();
    Object.defineProperty(window, 'location', { value: { assign, href: '' }, writable: true });

    const { result } = renderHook(() => useConexaoCalendario(), { wrapper });
    await waitFor(() => expect(result.current.carregando).toBe(false));
    await result.current.iniciarGoogle();
    expect(invoke).toHaveBeenCalledWith('calendario-conectar', expect.objectContaining({ body: { acao: 'iniciar', provedor: 'google' } }));
    expect(assign).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth?x=1');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/hooks/use-calendario-conexao.test.tsx`
Expected: FALHA (hook não existe).

- [ ] **Step 3: Implementar o hook**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { mensagemDeErro } from '@/lib/mensagem-de-erro';
import { mensagemDeErroDaFunction } from '@/lib/erro-edge-function';

export interface ConexaoCalendario {
  id: string;
  provedor: string;
  contaEmail: string | null;
  status: string;
  ultimoErro: string | null;
}

export function useConexaoCalendario() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const userId = profile?.user_id;

  const consulta = useQuery({
    queryKey: ['calendario_conexao', userId],
    enabled: !!userId,
    queryFn: async (): Promise<ConexaoCalendario | null> => {
      const { data, error } = await supabase
        .from('calendario_contas')
        .select('id, provedor, conta_email, status, ultimo_erro')
        .eq('user_id', userId!)
        .eq('provedor', 'google')
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id, provedor: data.provedor, contaEmail: data.conta_email,
        status: data.status, ultimoErro: data.ultimo_erro,
      };
    },
  });

  async function iniciarGoogle() {
    const { data, error } = await supabase.functions.invoke('calendario-conectar', {
      body: { acao: 'iniciar', provedor: 'google' },
    });
    if (error) { toast.error(await mensagemDeErroDaFunction(error, 'Não foi possível iniciar a conexão.')); return; }
    if (data?.url) window.location.assign(data.url as string);
  }

  const desconectarMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke('calendario-conectar', { body: { acao: 'desconectar', provedor: 'google' } });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['calendario_conexao', userId] }); toast.success('Calendário desconectado.'); },
    onError: (e) => toast.error(mensagemDeErro(e, 'Não foi possível desconectar.')),
  });

  return {
    conexao: consulta.data ?? null,
    carregando: consulta.isLoading,
    iniciarGoogle,
    desconectar: () => desconectarMut.mutate(),
    desconectando: desconectarMut.isPending,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/hooks/use-calendario-conexao.test.tsx`
Expected: PASS (2 testes).

- [ ] **Step 5: Escrever o componente da tela**

```tsx
import { CalendarClock, Link2, Unlink, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConexaoCalendario } from '@/hooks/use-calendario-conexao';

/** Bloco de conectar/desconectar o calendário externo, na barra lateral da agenda. */
export function ConexaoCalendarioExterno() {
  const { conexao, carregando, iniciarGoogle, desconectar, desconectando } = useConexaoCalendario();
  if (carregando) return null;

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <CalendarClock className="h-4 w-4 text-primary" /> Calendário do celular
      </div>
      {!conexao || conexao.status === 'desconectada' ? (
        <>
          <p className="text-xs text-muted-foreground">
            Ligue seu Google para ver seus compromissos do Repply no celular — e mudanças voltam para cá.
          </p>
          <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={() => iniciarGoogle()}>
            <Link2 className="h-4 w-4" /> Conectar meu Google
          </Button>
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Conectado{conexao.contaEmail ? ` como ${conexao.contaEmail}` : ''}.
          </p>
          {conexao.status === 'erro' && (
            <p className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" /> A conexão caiu — reconecte para voltar a sincronizar.
            </p>
          )}
          <Button size="sm" variant="ghost" className="w-full gap-1.5 text-muted-foreground" disabled={desconectando} onClick={() => desconectar()}>
            <Unlink className="h-4 w-4" /> Desconectar
          </Button>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Encaixar na página**

Em `src/pages/Calendario.tsx`, importar `ConexaoCalendarioExterno` e inseri-lo na barra lateral (perto dos alternadores "Meu calendário"/"Calendário da empresa", por volta de `Calendario.tsx:418-496`). Uma linha de import + `<ConexaoCalendarioExterno />` no JSX da sidebar.

- [ ] **Step 7: Verificar tipo/build/suíte**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "error TS"` → `36`.
Run: `npm run build` → compila.
Run: `npx vitest run src/hooks/use-calendario-conexao.test.tsx` → PASS.

- [ ] **Step 8: Commit**

```bash
git add src/hooks/use-calendario-conexao.ts src/hooks/use-calendario-conexao.test.tsx src/components/calendar/ConexaoCalendarioExterno.tsx src/pages/Calendario.tsx
git commit -m "feat(calendario): tela de conectar/desconectar o Google na agenda"
```

---

## Tarefa 6: Adaptador do Google (funções de borda compartilhadas)

**Files:**
- Create: `supabase/functions/_shared/calendario-google.ts`

**Interfaces:**
- Produces (para as Tarefas 7 e 8):
  - `trocarCodigoPorToken(code: string): Promise<{ refresh_token: string; access_token: string; expires_in: number }>`
  - `renovarAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }>`
  - `criarCalendarioRepply(accessToken: string): Promise<{ id: string }>`
  - `criarEvento(accessToken: string, calId: string, recurso: RecursoGoogle): Promise<{ id: string; etag: string }>`
  - `atualizarEvento(accessToken: string, calId: string, eventId: string, recurso: RecursoGoogle): Promise<{ id: string; etag: string }>`
  - `apagarEvento(accessToken: string, calId: string, eventId: string): Promise<void>`
  - `listarMudancas(accessToken: string, calId: string, syncToken: string | null): Promise<{ itens: GoogleEventoListado[]; proximoSyncToken: string | null }>`
  - `urlDeConsentimento(state: string): string`
  - tipos `RecursoGoogle`/`PontoGoogle` **reexportados** do miolo (mesma forma da Tarefa 3) e `type GoogleEventoListado = RecursoGoogle & { id: string; etag: string; status: string; updated: string }`.

> Edge function (Deno) não tem suíte local no projeto; a verificação real é por implantação + conta de teste. Sem passo de teste automatizado aqui — o critério é: código concreto, escopo estreito, erros tratados por `mensagemDeErroDaFunction` no chamador. Este arquivo é só o adaptador (sem estado, sem banco).

- [ ] **Step 1: Escrever o adaptador**

```ts
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
```

- [ ] **Step 2: Conferir que compila em Deno (sem quebrar o build do site)**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "error TS"` (as edge functions ficam fora do `tsconfig.app.json`, então o número segue `36`).
Expected: `36` (o arquivo Deno não entra na checagem do site; a verificação real é na implantação).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/calendario-google.ts
git commit -m "feat(calendario): adaptador do Google Calendar (OAuth, eventos, sync token)"
```

---

## Tarefa 7: Função de borda — conectar / retorno / desconectar (OAuth)

**Files:**
- Create: `supabase/functions/calendario-conectar/index.ts`

**Interfaces:**
- Consumes: `_shared/calendario-google.ts` (Tarefa 6); `_shared/cors.ts` (padrão do projeto, se houver); segredos do Pré-requisito 0.
- Produces: endpoints por `acao` no corpo — `iniciar` (retorna `{ url }`), `desconectar` — e a rota GET `/retorno` que o Google chama com `?code&state`. Grava/limpa `calendario_contas` com `service_role`. Cifra os tokens com `CALENDARIO_TOKEN_KEY` (AES-GCM via WebCrypto).

> Verificação real: implantação + conta de teste (Pré-requisito 0). Sem teste local. Critério: escopo estreito, tokens cifrados, `state` assinado para evitar CSRF, isolamento por `user_id`.

- [ ] **Step 1: Escrever a função**

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { urlDeConsentimento, trocarCodigoPorToken, criarCalendarioRepply } from '../_shared/calendario-google.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const KEY_RAW = Deno.env.get('CALENDARIO_TOKEN_KEY')!; // base64 de 32 bytes

async function chave(): Promise<CryptoKey> {
  const bytes = Uint8Array.from(atob(KEY_RAW), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function cifrar(texto: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await chave(), new TextEncoder().encode(texto)));
  const junto = new Uint8Array(iv.length + ct.length); junto.set(iv); junto.set(ct, iv.length);
  return btoa(String.fromCharCode(...junto));
}

// `state` = user_id assinado, para o retorno saber de quem é e evitar CSRF.
async function assinarState(userId: string): Promise<string> {
  const chaveHmac = await crypto.subtle.importKey('raw', new TextEncoder().encode(KEY_RAW), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const assinatura = new Uint8Array(await crypto.subtle.sign('HMAC', chaveHmac, new TextEncoder().encode(userId)));
  return `${userId}.${btoa(String.fromCharCode(...assinatura))}`;
}
async function lerState(state: string): Promise<string | null> {
  const [userId, assB64] = state.split('.');
  if (!userId || !assB64) return null;
  const esperado = await assinarState(userId);
  return esperado === state ? userId : null;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Retorno do Google (GET com ?code&state): troca o código, cria o calendário, grava a conexão.
  if (req.method === 'GET' && url.pathname.endsWith('/retorno')) {
    const code = url.searchParams.get('code'); const state = url.searchParams.get('state') ?? '';
    const userId = await lerState(state);
    if (!code || !userId) return new Response('Falha na conexão.', { status: 400 });

    const tok = await trocarCodigoPorToken(code);
    const cal = await criarCalendarioRepply(tok.access_token);
    // empresa_id do usuário (para isolamento multi-empresa):
    const { data: u } = await admin.from('usuarios').select('empresa_id').eq('user_id', userId).maybeSingle();

    await admin.from('calendario_contas').upsert({
      user_id: userId, empresa_id: u?.empresa_id, provedor: 'google',
      calendario_externo_id: cal.id,
      refresh_token: await cifrar(tok.refresh_token),
      access_token: await cifrar(tok.access_token),
      token_expira_em: new Date(Date.now() + tok.expires_in * 1000).toISOString(),
      status: 'conectada', ultimo_erro: null, sync_token: null,
    }, { onConflict: 'user_id,provedor' });

    // Redireciona de volta para a agenda.
    return new Response(null, { status: 302, headers: { Location: `${url.origin.replace('.functions.', '.')}/calendario` } });
  }

  // Chamadas do app (POST { acao, provedor }) — autenticadas pelo JWT do usuário.
  const authHeader = req.headers.get('Authorization') ?? '';
  const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await anon.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: 'Não autenticado.' }), { status: 401 });

  const { acao } = await req.json();

  if (acao === 'iniciar') {
    return new Response(JSON.stringify({ url: urlDeConsentimento(await assinarState(user.id)) }), { headers: { 'Content-Type': 'application/json' } });
  }
  if (acao === 'desconectar') {
    // Marca desconectada e apaga as etiquetas; a remoção do calendário "Repply CRM" fica opcional.
    await admin.from('calendario_contas').update({ status: 'desconectada', refresh_token: null, access_token: null }).eq('user_id', user.id).eq('provedor', 'google');
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify({ error: 'Ação desconhecida.' }), { status: 400 });
});
```

- [ ] **Step 2: Registrar CORS/preflight conforme o padrão do projeto**

Conferir como as outras funções (`email-conectar`) tratam CORS/OPTIONS e replicar o cabeçalho. (Ler `supabase/functions/email-conectar/index.ts` para o padrão exato.)

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/calendario-conectar/index.ts
git commit -m "feat(calendario): função de conectar/desconectar Google (OAuth, token cifrado)"
```

---

## Tarefa 8: Função de borda — sincronizar (saída e volta)

**Files:**
- Create: `supabase/functions/calendario-sincronizar/index.ts`

**Interfaces:**
- Consumes: `_shared/calendario-google.ts`; `src/lib`-equivalentes do miolo — **copiar** `paraGoogle`/`paraRepply` e `quemVence`/`excedeDisjuntor`/`deveTratarComoRecusa` para `_shared/` (Deno não importa de `src/`), ou mover o miolo para `_shared/` e reexportar em `src/lib` (ver nota).
- Produces: dois modos por corpo — `{ modo: 'empurrar' }` (processa a fila da Tarefa 9) e `{ modo: 'puxar' }` (varre conexões e traz mudanças por sync token). Aplica conflito, disjuntor e a regra do zero-linhas.

> **Nota de DRY:** o miolo puro (Tarefa 3/4) precisa rodar nos dois mundos (Vitest no `src/` e Deno na função). Solução: manter a fonte em `supabase/functions/_shared/calendario-nucleo.ts` e reexportar em `src/lib/calendario/*` (import relativo), OU duplicar com um teste que fixe a igualdade. O implementador escolhe e registra; o importante é **uma fonte de verdade**.

- [ ] **Step 1: Escrever a função (esqueleto concreto)**

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { renovarAccessToken, criarEvento, atualizarEvento, apagarEvento, listarMudancas } from '../_shared/calendario-google.ts';
import { paraGoogle, paraRepply } from '../_shared/calendario-nucleo.ts';
import { quemVence, excedeDisjuntor, deveTratarComoRecusa } from '../_shared/calendario-nucleo.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const FUSO = 'America/Sao_Paulo';

// (decifrar: inverso do cifrar da Tarefa 7 — mesma CALENDARIO_TOKEN_KEY.)
async function tokenValido(conta: any): Promise<string> {
  // Se expira_em já passou, renova com o refresh_token (decifrado) e grava o novo access_token.
  // ... (usa renovarAccessToken; grava token_expira_em) ...
  return '<access_token válido>';
}

Deno.serve(async (req) => {
  const { modo } = await req.json().catch(() => ({ modo: 'puxar' }));

  if (modo === 'empurrar') {
    // Lê a fila (calendario_fila da Tarefa 9): para cada item, cria/atualiza/apaga no Google
    // e grava a etiqueta (evento_sync_externo). Marca o item da fila como processado.
    const { data: fila } = await admin.from('calendario_fila').select('*').is('processado_em', null).limit(200);
    for (const item of (fila ?? [])) {
      const conta = await contaDe(item.user_id);
      if (!conta) { await marcarProcessado(item.id); continue; }
      const token = await tokenValido(conta);
      if (item.operacao === 'apagar') {
        const etiqueta = await etiquetaDe(item.evento_id, conta.id);
        if (etiqueta) { await apagarEvento(token, conta.calendario_externo_id, etiqueta.evento_externo_id); await admin.from('evento_sync_externo').delete().eq('id', etiqueta.id); }
      } else {
        const evento = await eventoDe(item.evento_id);
        if (!evento) { await marcarProcessado(item.id); continue; }
        const recurso = paraGoogle({ titulo: evento.titulo, descricao: evento.descricao, inicio: evento.inicio, fim: evento.fim, diaInteiro: evento.dia_inteiro }, FUSO);
        const etiqueta = await etiquetaDe(item.evento_id, conta.id);
        const res = etiqueta
          ? await atualizarEvento(token, conta.calendario_externo_id, etiqueta.evento_externo_id, recurso)
          : await criarEvento(token, conta.calendario_externo_id, recurso);
        await admin.from('evento_sync_externo').upsert({
          evento_id: item.evento_id, calendario_conta_id: conta.id,
          evento_externo_id: res.id, etag_externo: res.etag,
          atualizado_repply_em: evento.updated_at, ultima_sync_em: new Date().toISOString(),
        }, { onConflict: 'evento_id,calendario_conta_id' });
      }
      await marcarProcessado(item.id);
    }
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  }

  // modo 'puxar': para cada conexão, traz as mudanças do Google desde o sync_token.
  const { data: contas } = await admin.from('calendario_contas').select('*').eq('status', 'conectada');
  for (const conta of (contas ?? [])) {
    const token = await tokenValido(conta);
    let mudancas;
    try { mudancas = await listarMudancas(token, conta.calendario_externo_id, conta.sync_token); }
    catch (e) {
      if ((e as any).syncExpirado) { await admin.from('calendario_contas').update({ sync_token: null }).eq('id', conta.id); continue; }
      await admin.from('calendario_contas').update({ status: 'erro', ultimo_erro: String(e) }).eq('id', conta.id); continue;
    }
    // DISJUNTOR: quantas dessas mudanças são exclusões de eventos que temos etiqueta?
    const exclusoes = mudancas.itens.filter((i) => i.status === 'cancelled');
    if (excedeDisjuntor(exclusoes.length)) {
      await admin.from('calendario_contas').update({ status: 'erro', ultimo_erro: 'Sincronização parada: exclusão em massa suspeita.' }).eq('id', conta.id);
      continue; // não apaga nada nesta passada
    }
    for (const it of mudancas.itens) {
      const { data: etiqueta } = await admin.from('evento_sync_externo').select('*').eq('calendario_conta_id', conta.id).eq('evento_externo_id', it.id).maybeSingle();
      if (!etiqueta) continue; // SÓ tocamos no que tem etiqueta; ignora o resto da agenda dele
      if (it.status === 'cancelled') {
        const r = await admin.from('eventos').delete({ count: 'exact' }).eq('id', etiqueta.evento_id);
        if (deveTratarComoRecusa(r.count)) { /* RLS barrou (ex.: evento da empresa que ele não organiza): mantém oficial */ }
        else await admin.from('evento_sync_externo').delete().eq('id', etiqueta.id);
        continue;
      }
      // Conflito: vence o mais recente.
      const { data: eventoRepply } = await admin.from('eventos').select('updated_at').eq('id', etiqueta.evento_id).maybeSingle();
      if (eventoRepply && quemVence(eventoRepply.updated_at, it.updated) === 'repply') continue; // Repply é mais novo: ignora
      const v = paraRepply(it);
      const r = await admin.from('eventos').update({ titulo: v.titulo, descricao: v.descricao, inicio: v.inicio, fim: v.fim, dia_inteiro: v.diaInteiro }, { count: 'exact' }).eq('id', etiqueta.evento_id);
      if (deveTratarComoRecusa(r.count)) { /* recusa: mantém oficial, re-empurra na próxima saída */ }
      else await admin.from('evento_sync_externo').update({ etag_externo: it.etag, atualizado_repply_em: it.updated, ultima_sync_em: new Date().toISOString() }).eq('id', etiqueta.id);
    }
    await admin.from('calendario_contas').update({ sync_token: mudancas.proximoSyncToken, ultima_sync_em: new Date().toISOString() }).eq('id', conta.id);
  }
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
});

// Helpers de banco (contaDe, etiquetaDe, eventoDe, marcarProcessado) — consultas simples ao admin client.
```

- [ ] **Step 2: Extrair o miolo para `_shared/calendario-nucleo.ts` e reexportar em `src/lib/calendario`**

Mover `paraGoogle/paraRepply` (Tarefa 3) e `quemVence/excedeDisjuntor/deveTratarComoRecusa` (Tarefa 4) para `supabase/functions/_shared/calendario-nucleo.ts`; em `src/lib/calendario/mapeamento.ts` e `.../conflito.ts` reexportar desse arquivo (import relativo `../../../supabase/functions/_shared/calendario-nucleo`) OU manter os testes apontando para a fonte única. Rodar os testes das Tarefas 3/4 de novo para garantir que continuam passando.

Run: `npx vitest run src/lib/calendario`
Expected: PASS (mesmos testes).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/calendario-sincronizar/index.ts supabase/functions/_shared/calendario-nucleo.ts src/lib/calendario/mapeamento.ts src/lib/calendario/conflito.ts
git commit -m "feat(calendario): função de sincronização (saída pela fila e volta por sync token)"
```

---

## Tarefa 9: Banco — fila de saída, gatilho e cron

**Files:**
- Create: `supabase/migrations/<timestamp>_calendario_fila_e_cron.sql`

**Interfaces:**
- Consumes: `calendario_contas` (Tarefa 1); função `chamar_edge_function(nome, corpo)` (já usada pela agenda em `20260911130000`).
- Produces: tabela `calendario_fila`; gatilho em `eventos` que enfileira create/update/delete quando o dono tem conexão conectada; cron de 5 min chamando `calendario-sincronizar` no modo `puxar`.

> Migration; aplicação com o Lucas. Confere o padrão de `chamar_edge_function` e do cron em `20260723210100_cron_eventos_lembrete.sql` e `20260911130000_agenda_avisos_e_lembretes.sql`.

- [ ] **Step 1: Escrever a migration**

```sql
-- Fila de saída: cada mudança em `eventos` que precisa ir para o calendário externo.
create table if not exists public.calendario_fila (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid,                       -- pode ser null quando operacao='apagar' guarda só o externo
  user_id uuid not null,
  operacao text not null check (operacao in ('salvar','apagar')),
  criado_em timestamptz not null default now(),
  processado_em timestamptz
);
create index if not exists calendario_fila_pendente_idx on public.calendario_fila (processado_em) where processado_em is null;
alter table public.calendario_fila enable row level security;
-- Só o service_role mexe na fila (a função de borda). Nenhuma policy para authenticated/anon.

-- Enfileira quando um evento sincronizável muda, e o dono tem conexão conectada.
create or replace function public.calendario_enfileira() returns trigger language plpgsql security definer as $$
declare v_tem_conexao boolean;
begin
  if tg_op = 'DELETE' then
    select exists(select 1 from public.calendario_contas c where c.user_id = old.user_id and c.status = 'conectada') into v_tem_conexao;
    if v_tem_conexao then insert into public.calendario_fila (evento_id, user_id, operacao) values (old.id, old.user_id, 'apagar'); end if;
    return old;
  end if;
  select exists(select 1 from public.calendario_contas c where c.user_id = new.user_id and c.status = 'conectada') into v_tem_conexao;
  if v_tem_conexao then insert into public.calendario_fila (evento_id, user_id, operacao) values (new.id, new.user_id, 'salvar'); end if;
  return new;
end $$;

drop trigger if exists calendario_enfileira_trg on public.eventos;
create trigger calendario_enfileira_trg after insert or update or delete on public.eventos
  for each row execute function public.calendario_enfileira();

-- Empurra a fila na hora (dispara a função quando algo é enfileirado).
create or replace function public.calendario_chama_empurrar() returns trigger language plpgsql security definer as $$
begin perform public.chamar_edge_function('calendario-sincronizar', jsonb_build_object('modo','empurrar')); return new; end $$;
drop trigger if exists calendario_chama_empurrar_trg on public.calendario_fila;
create trigger calendario_chama_empurrar_trg after insert on public.calendario_fila
  for each statement execute function public.calendario_chama_empurrar();

-- Volta: a cada 5 min, puxa as mudanças do Google.
select cron.schedule('calendario-sincronizar-puxar', '*/5 * * * *', $$
  select public.chamar_edge_function('calendario-sincronizar', jsonb_build_object('modo','puxar'));
$$);
```

- [ ] **Step 2: Conferir o padrão real de `chamar_edge_function` e do cron**

Ler `supabase/migrations/20260911130000_agenda_avisos_e_lembretes.sql` e `20260723210100_cron_eventos_lembrete.sql` e ajustar a assinatura de `chamar_edge_function` e o formato do `cron.schedule` ao que o projeto usa de fato.

- [ ] **Step 3: Commit (com o "pode" do Lucas)**

```bash
git add supabase/migrations/<timestamp>_calendario_fila_e_cron.sql
git commit -m "feat(calendario): fila de saída, gatilho em eventos e cron de sincronização"
```

---

## Verificação final da Fase 1 (antes de dizer "feito")

- [ ] `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "error TS"` → `36`.
- [ ] `npm run build` → compila.
- [ ] `npm run test` → suíte inteira passa; número de testes **subiu** (miolo + hook).
- [ ] `npm run lint` → o número de problemas **não subiu** do herdado.
- [ ] Migrations aplicadas em produção **com o Lucas** (as duas), com sonda antes/depois.
- [ ] Funções de borda implantadas no Supabase (as duas) — e registrado qual versão corresponde ao commit (o `git push` NÃO implanta função; são gestos separados — CLAUDE.md §16).
- [ ] Segredos setados (Pré-requisito 0).
- [ ] Testado como **vendedor comum**: não lê a conexão/token de outro; gravar de volta um evento da empresa que ele não organiza é barrado **sem** falso sucesso.
- [ ] Ponta a ponta com **conta de teste** do Google (antes da aprovação geral): conectar → criar evento no Repply → ver no Google → mudar no Google → voltar para o Repply; e o disjuntor não deixa apagar em massa.

---

## Self-review (feito na escrita)

- **Cobertura da spec:** conexão (T5,T7), 2 tabelas + RLS + token trancado (T1,T2), mapeamento/dia-inteiro/fuso (T3), conflito+disjuntor+zero-linhas (T4,T8), saída na hora (T9 gatilho + T8 empurrar), volta periódica (T9 cron + T8 puxar), calendário dedicado (T7 `criarCalendarioRepply`), empresa respeita RLS (T8 `deveTratarComoRecusa`), segurança de token (T7 cifra + T1 GRANT), pré-requisito Google (Pré-req 0). Prazos/contatos e Microsoft/iCloud ficam fora — como a spec manda.
- **Sem placeholder de código:** o miolo puro (T3/T4) e o hook (T5) têm código e teste completos. As edge functions (T6–T8) têm implementação concreta; os helpers de banco triviais (`contaDe`, `eventoDe`, `marcarProcessado`) e o `decifrar` são consultas/inverso diretos, anotados no ponto de uso.
- **Consistência de tipos:** `RecursoGoogle`/`PontoGoogle` iguais na T3 e T6; `paraGoogle/paraRepply/quemVence/excedeDisjuntor/deveTratarComoRecusa` com uma fonte única (T8 step 2); nomes das colunas iguais entre T1, T2 e o uso em T5/T7/T8.
- **Ponto de atenção anotado:** DRY do miolo entre `src/` (Vitest) e Deno (T8 step 2) — uma fonte de verdade.
