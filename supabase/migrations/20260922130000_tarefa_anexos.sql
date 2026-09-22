-- Anexos de uma tarefa. Espelha pedido_anexos (20260917100000_pedido_anexos.sql): uma linha por
-- arquivo, regras POR EXISTENCIA sobre a tarefa (quem enxerga a tarefa enxerga os anexos; quem
-- pode EDITAR a tarefa - dono ou gestor - acrescenta e tira anexo). Tarefa nunca teve anexo:
-- nasce vazia, sem copia retroativa.
create table if not exists public.tarefa_anexos (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references public.tarefas(id) on delete cascade,
  url text not null,
  nome text not null,
  tipo text,
  tamanho_bytes bigint,
  criado_por uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists tarefa_anexos_tarefa_id_idx on public.tarefa_anexos (tarefa_id);

alter table public.tarefa_anexos enable row level security;

create policy tarefa_anexos_select on public.tarefa_anexos
  for select using (
    exists (select 1 from public.tarefas t where t.id = tarefa_id)
  );

create policy tarefa_anexos_insert on public.tarefa_anexos
  for insert with check (
    exists (
      select 1 from public.tarefas t
      where t.id = tarefa_id
        and (
          t.usuario_id = public.get_my_usuario_id()
          or (public.is_gestor() and public.usuario_in_my_empresa(t.usuario_id))
        )
    )
  );

create policy tarefa_anexos_delete on public.tarefa_anexos
  for delete using (
    exists (
      select 1 from public.tarefas t
      where t.id = tarefa_id
        and (
          t.usuario_id = public.get_my_usuario_id()
          or (public.is_gestor() and public.usuario_in_my_empresa(t.usuario_id))
        )
    )
  );

comment on table public.tarefa_anexos is 'Anexos de uma tarefa (PDF, imagem e arquivos de escritorio).';

insert into storage.buckets (id, name, public)
values ('tarefa-anexos', 'tarefa-anexos', true)
on conflict (id) do nothing;

create policy tarefa_anexos_obj_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'tarefa-anexos'
    and (storage.foldername(name))[1] = (get_my_empresa_id())::text
  );

create policy tarefa_anexos_obj_select on storage.objects
  for select to authenticated using (
    bucket_id = 'tarefa-anexos'
    and (
      (storage.foldername(name))[1] = (get_my_empresa_id())::text
      or owner_id = (auth.uid())::text
      or is_admin()
    )
  );

create policy tarefa_anexos_obj_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'tarefa-anexos'
    and (
      owner_id = (auth.uid())::text
      or (is_gestor() and (storage.foldername(name))[1] = (get_my_empresa_id())::text)
      or is_admin()
    )
  );
