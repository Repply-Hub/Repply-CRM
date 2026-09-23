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
