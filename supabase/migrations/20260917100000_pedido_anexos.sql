-- Vários anexos por negócio (desenho de 12/09/2026).
--
-- Até aqui o anexo era UMA coluna, `pedidos.pdf_url`. Ela NÃO é apagada: depois da cópia
-- abaixo ninguém escreve nem lê essa coluna, e ela fica como rota de volta.
create table if not exists public.pedido_anexos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  url text not null,
  nome text not null,
  tipo text,
  tamanho_bytes bigint,
  criado_por uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists pedido_anexos_pedido_id_idx on public.pedido_anexos (pedido_id);

alter table public.pedido_anexos enable row level security;

-- 🔴 AS REGRAS SEGUEM AS DO NEGÓCIO, por existência — e não por cópia das condições de
-- `pedidos`. Quem enxerga o negócio enxerga os anexos; quem pode MUDAR o negócio pode
-- acrescentar e tirar anexo. Copiar as condições criaria duas verdades, e a segunda envelhece
-- calada no dia em que a regra do negócio mudar.
create policy pedido_anexos_select on public.pedido_anexos
  for select using (
    exists (select 1 from public.pedidos p where p.id = pedido_id)
  );

create policy pedido_anexos_insert on public.pedido_anexos
  for insert with check (
    exists (
      select 1 from public.pedidos p
      where p.id = pedido_id
        and (
          p.usuario_id = public.get_my_usuario_id()
          or (public.is_gestor() and public.usuario_in_my_empresa(p.usuario_id))
          or (public.has_permission(public.get_my_usuario_id(), 'pedidos', 'editar') and public.usuario_in_my_empresa(p.usuario_id))
        )
    )
  );

create policy pedido_anexos_delete on public.pedido_anexos
  for delete using (
    exists (
      select 1 from public.pedidos p
      where p.id = pedido_id
        and (
          p.usuario_id = public.get_my_usuario_id()
          or (public.is_gestor() and public.usuario_in_my_empresa(p.usuario_id))
          or (public.has_permission(public.get_my_usuario_id(), 'pedidos', 'editar') and public.usuario_in_my_empresa(p.usuario_id))
        )
    )
  );

-- A cópia dos anexos que já existem. O SELECT de `pedidos` já corta pela empresa de quem roda,
-- mas esta migration roda como dono do banco: ela copia TODOS, que é o que se quer.
--
-- O nome sai do fim do endereço, com os %20 desfeitos; sem nome utilizável, fica 'anexo.pdf' —
-- melhor um rótulo honesto que uma linha sem nome na tela.
insert into public.pedido_anexos (pedido_id, url, nome, tipo, created_at)
select
  p.id,
  p.pdf_url,
  coalesce(
    nullif(replace(split_part(split_part(p.pdf_url, '?', 1), '/', -1), '%20', ' '), ''),
    'anexo.pdf'
  ),
  'application/pdf',
  p.created_at
from public.pedidos p
where p.pdf_url is not null
  and trim(p.pdf_url) <> ''
  and not exists (select 1 from public.pedido_anexos a where a.pedido_id = p.id);

comment on table public.pedido_anexos is 'Anexos de um negócio (PDF e imagem). Substitui pedidos.pdf_url, que fica como histórico.';
