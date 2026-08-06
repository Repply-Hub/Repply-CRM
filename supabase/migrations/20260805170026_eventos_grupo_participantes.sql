-- Liga as linhas de um mesmo evento (uma por participante) através de grupo_id,
-- e registra quem organizou o evento (criado_por), para permitir editar
-- participantes depois da criação — hoje cada participante é uma linha
-- independente sem nenhum vínculo entre si.

alter table public.eventos
  add column if not exists grupo_id uuid,
  add column if not exists criado_por uuid references auth.users(id);

-- Backfill: eventos existentes viram seu próprio grupo de um participante só,
-- organizado por quem já é o dono da linha.
update public.eventos set grupo_id = id where grupo_id is null;
update public.eventos set criado_por = user_id where criado_por is null;

alter table public.eventos alter column grupo_id set default gen_random_uuid();
alter table public.eventos alter column grupo_id set not null;
alter table public.eventos alter column criado_por set not null;

-- Permite enxergar as linhas-irmãs (outros participantes) de um evento do
-- qual eu também participo, mesmo quando o evento é do tipo "pessoal".
create or replace function public.eventos_mesmo_grupo(p_grupo_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.eventos e
    where e.grupo_id = p_grupo_id and e.user_id = auth.uid()
  );
$$;

drop policy if exists "eventos: select" on public.eventos;
drop policy if exists eventos_select on public.eventos;

create policy eventos_select on public.eventos
for select to authenticated
using (
  user_id = auth.uid()
  or tipo_calendario = 'empresa'
  or public.eventos_mesmo_grupo(grupo_id)
);

-- Update/delete passam a permitir também quem organizou o evento (criado_por),
-- para que ele consiga alterar horário/participantes de todo o grupo, não só
-- da própria linha.
drop policy if exists "eventos: update" on public.eventos;
drop policy if exists eventos_update on public.eventos;

create policy eventos_update on public.eventos
for update to authenticated
using (user_id = auth.uid() or criado_por = auth.uid())
with check (user_id = auth.uid() or criado_por = auth.uid());

drop policy if exists "eventos: delete" on public.eventos;
drop policy if exists eventos_delete on public.eventos;

create policy eventos_delete on public.eventos
for delete to authenticated
using (user_id = auth.uid() or criado_por = auth.uid());
