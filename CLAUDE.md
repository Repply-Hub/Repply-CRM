# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A CRM/ERP for a construction-materials sales rep business ("MD Representações"): sales pipeline (Kanban),
client/contact management, obras (construction site) tracking with maps, manufacturer catalog, and
email/WhatsApp communication — built with React + TypeScript + Vite, Tailwind + shadcn-ui, TanStack Query,
and Supabase (Postgres + Auth + Edge Functions) as the backend. Originally scaffolded via Lovable.

## Commands

```sh
npm run dev          # Vite dev server on port 8080
npm run build         # production build
npm run build:dev     # dev-mode build (unminified, for debugging build issues)
npm run lint          # eslint .
npm run test          # vitest run (single pass)
npm run test:watch    # vitest watch mode
```

Run a single test file: `npx vitest run src/components/import-pedidos/importPedidosUtils.test.ts`
Tests live next to the code they cover (`*.test.ts`) or in `src/test/`; environment is jsdom, globals are
enabled (no need to import `describe`/`it`/`expect`), setup file is `src/test/setup.ts`.

TypeScript is configured loosely (`strictNullChecks: false`, `noImplicitAny: false`, unused vars/params not
flagged) — don't assume strict-mode guarantees when reading or writing code.

Path alias: `@/*` → `./src/*` (configured in tsconfig and vite.config.ts).

## Database / Supabase

This project's Supabase backend is managed as code in `supabase/`:

- `supabase/migrations/*.sql` — schema, RLS policies, and SQL functions. Add new migrations rather than
  editing old ones; this repo has no local Supabase stack wired up in this environment, so migrations are
  applied by whoever owns the linked project (`supabase db push`), not verified locally.
- `supabase/functions/*` — Deno Edge Functions for things that can't run client-side (external API secrets,
  scraping, scheduled jobs). Each is its own directory with an `index.ts`.
- `src/integrations/supabase/client.ts` and `src/integrations/supabase/types.ts` are marked
  "automatically generated" (normally via `supabase gen types`) — when adding a new RPC or changing a table
  shape, update `types.ts` by hand to match if you can't regenerate it (no live DB access in this sandbox).

**RLS is the real authorization boundary.** Table policies key off helper SQL functions like `is_gestor()`,
`is_admin()`, `get_my_usuario_id()`, `usuario_in_my_empresa()` — assume every query from the client is
filtered server-side by these, and don't try to replicate authorization logic purely in the frontend.

Prefer aggregate queries (`count: 'exact', head: true`, or a `SECURITY INVOKER` SQL RPC for sums/aggregates)
over pulling full result sets to the client to compute counts/totals — PostgREST/supabase-js don't do
client-side aggregation well, and tables here (e.g. `pedidos`) can hold thousands of rows.

## Data model essentials

- **Multi-tenancy is per-company, not per-deploy-only**: `empresas` (companies) each have many `usuarios`
  (their staff). A user's `profile` (from `use-auth.tsx`) is a row in `usuarios` joined with `empresas`,
  and carries `role` (`admin` vs. company users) and `empresa_id`. `role === 'admin'` is a separate global
  super-admin tier with its own routes/dashboard (see `AdminRoute`, `AdminDashboard`) and no access to the
  sales pipeline.
- **Legacy table overlap**: there is an older `vendedores` table that predates `usuarios`/`empresas` and is
  still referenced in a few places (e.g. `historico_contatos.vendedor_id` joins to `vendedores`, while
  `pedidos.usuario_id` joins to `usuarios`). `docs/auth-structure.md` describes the old `vendedores`-only
  model and is out of date — trust the actual migrations/RLS policies and code over that doc.
  `is_gestor()`/`get_my_vendedor_id()` are legacy helpers still used by some RLS policies.
- **Core sales entities**: `pedidos` (a "negócio"/deal) belongs to a `cliente`, a `fabricante`
  (manufacturer), optionally an `obra` (construction site), and a `vendedor` (via `usuario_id`). It has a
  `status` representing its Kanban stage. Kanban stages themselves are configurable per company via
  `kanban_colunas` / `useKanbanColunas`, not a fixed enum.
- Full deployment/integration inventory (Supabase, Google Maps, Gmail OAuth, uazapi/WhatsApp, Resend, etc.,
  and what to swap when redeploying for a new client) is documented in `INTEGRATION_AUDIT.md`.

## Frontend architecture

- **Routing/auth** (`src/App.tsx`): all authenticated routes are wrapped in `ProtectedRoute`, which reads
  `useAuth()` (`src/hooks/use-auth.tsx`) and handles several non-obvious states beyond plain
  logged-in/logged-out: profile still loading, soft-deleted user (`profile.deleted_at`), orphaned session
  (session exists but profile row was deleted — triggers auto sign-out), and user with no `empresa_id` yet.
  Don't assume `session` alone means the app is usable — check `profileLoaded`/`profileAttempted` too.
- **Data fetching**: one hook per domain in `src/hooks/` (`use-pedidos.ts`, `use-clientes.ts`, `use-obras.ts`,
  etc.), each wrapping `@tanstack/react-query`. Mutations invalidate related query keys on `onSettled`
  (including cross-cutting dashboard views like `vw_faturamento_mensal`) — when adding a mutation that
  changes `pedidos`, check `use-pedidos.ts` for the full invalidation list rather than only invalidating the
  one key you touched.
- **Negócios/pipeline page** (`src/pages/Negocios.tsx`) is the most complex screen: it renders either a
  Kanban board or a flat list from the same `usePedidos`/`usePedidosStats` data, applies company/stage
  filters server-side, and does bulk operations (status drag-and-drop, bulk delete) — read this file before
  changing pipeline behavior, since board and list share a lot of derived state (filters, selection).
- **Import pipeline** (CSV/XLSX for Clientes and Negócios) is a three-step wizard (upload → column mapping →
  preview/confirm) with fuzzy header-matching; fully documented in `IMPORT_STRUCTURE.md` — read that before
  touching `src/lib/import/`, `ImportPedidosDialog.tsx`, or the `import-data` edge function.
- **UI components**: `src/components/ui/` is shadcn-ui (generated, treat as a base layer — extend via props/
  className rather than editing generated primitives where possible). Feature components are organized by
  domain under `src/components/` (`layout/` for app shell/sidebar, `shared/` for generic multi-domain
  components, `pedidos/kanban/` for the pipeline board, plus `clientes/`, `obras/`, `catalogo/`, `chat/`,
  `tarefas/`, `whatsapp/`, `email/`, `import/`, `configuracoes/`, etc.).

## Idioma

a parttr de agora SEMPRE responda em português do Brasil, mesmo que o código, comentários ou nomes de variáveis estejam em inglês.
