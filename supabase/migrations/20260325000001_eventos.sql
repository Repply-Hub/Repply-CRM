-- Tabela de eventos do calendário próprio
create table eventos (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  titulo          text not null,
  descricao       text,
  inicio          timestamptz not null,
  fim             timestamptz not null,
  dia_inteiro     boolean not null default false,
  tipo_calendario text not null check (tipo_calendario in ('pessoal', 'empresa')),
  cor             text not null default '#3b82f6',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table eventos enable row level security;

-- Pessoal: só o dono vê; empresa: todos os autenticados veem
create policy "eventos: select"
  on eventos for select
  using (auth.uid() = user_id or tipo_calendario = 'empresa');

create policy "eventos: insert"
  on eventos for insert
  with check (auth.uid() = user_id);

create policy "eventos: update"
  on eventos for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "eventos: delete"
  on eventos for delete
  using (auth.uid() = user_id);

create trigger eventos_updated_at
  before update on eventos
  for each row execute function update_updated_at_column();
