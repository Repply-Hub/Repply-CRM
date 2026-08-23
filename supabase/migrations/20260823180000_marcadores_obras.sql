-- Marcador de obra — a parte que ACRESCENTA
--
-- Substitui o "Status Inicial" da obra, que nunca funcionou: `status_obras` está vazia nas 8
-- empresas porque `seed_default_status_obras` não é chamada por ninguém — nem por gatilho,
-- nem pelo app. As outras seis tabelas de configuração do sistema têm gatilho de semeadura
-- em `empresas`; aquela é a única exceção do padrão, escrita e esquecida.
--
-- 🔴 ESTA MIGRATION SÓ ACRESCENTA. O DROP vem depois, em arquivo próprio.
--
-- A ordem não é preciosismo. O site publicado hoje ainda manda `status` no cadastro de obra
-- (`Obras.tsx` e `ClienteDetalhe.tsx`). Derrubar a coluna antes de publicar o site novo faria
-- o cadastro de obra passar a dar erro em produção, na janela entre a mudança do banco e a
-- publicação. Acrescentar primeiro, publicar, derrubar por último — nessa ordem, nenhuma
-- janela existe.

-- ---------------------------------------------------------------- a lista

create table public.marcadores_obras (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id),
  slug        text not null,
  nome        text not null,
  cor         text not null default 'muted-foreground',
  ordem       integer not null default 0,
  is_sistema  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (empresa_id, slug)
);

create index idx_marcadores_obras_empresa on public.marcadores_obras (empresa_id, ordem);

-- ---------------------------------------------------------------- RLS
--
-- `is_admin()` ENTRA aqui, e a decisão foi conferida antes de copiar. A migration de
-- 04/08/2026 (`admin_geral_sem_acesso_ao_conteudo_dos_clientes`) tirou o admin geral das
-- tabelas de CONTEÚDO — `obras` hoje não tem `is_admin()` em política nenhuma. Mas as
-- tabelas de CONFIGURAÇÃO mantiveram: `marcadores` e `kanban_colunas` têm as quatro
-- políticas com `is_admin() OR ...`, conferido no banco em 23/08/2026.
--
-- A linha que separa as duas: o admin geral pode ver e mexer em COMO o sistema é
-- configurado — quais etiquetas existem, quais colunas o funil tem —, e não pode ver o que
-- o cliente do cliente comprou. Uma lista de nomes e cores de marcador está do lado da
-- configuração. Copiar sem checar seria o erro que o plano registrou como risco.

alter table public.marcadores_obras enable row level security;

create policy marcadores_obras_select on public.marcadores_obras for select to authenticated
  using (is_admin() or empresa_id = get_my_empresa_id());

create policy marcadores_obras_insert on public.marcadores_obras for insert to authenticated
  with check (is_admin() or (is_gestor() and empresa_id = get_my_empresa_id()));

create policy marcadores_obras_update on public.marcadores_obras for update to authenticated
  using (is_admin() or (is_gestor() and empresa_id = get_my_empresa_id()));

create policy marcadores_obras_delete on public.marcadores_obras for delete to authenticated
  using (is_admin() or (is_gestor() and empresa_id = get_my_empresa_id()));

create trigger update_marcadores_obras_updated_at
before update on public.marcadores_obras
for each row execute function public.update_updated_at_column();

-- ---------------------------------------------------------------- o vínculo

-- Nulável e `on delete set null`, igual a `pedidos.marcador_id`: excluir um marcador deixa a
-- obra SEM marcador, não apaga a obra. É o oposto do status do funil, que exige realocação
-- obrigatória — e a diferença é deliberada, está comentada em `use-marcadores.ts:109`.
alter table public.obras
  add column marcador_id uuid references public.marcadores_obras(id) on delete set null;

create index idx_obras_marcador_id on public.obras (marcador_id);

-- ---------------------------------------------------------------- SEM semeadura, de propósito
--
-- Decisão do dono do produto em 23/08/2026: **a lista nasce vazia**, e cada empresa cria as
-- suas. É o oposto do que as outras seis tabelas de configuração fazem, e por isso está
-- escrito aqui — para o próximo não achar que o gatilho de semeadura foi ESQUECIDO, que foi
-- exatamente o que aconteceu com `seed_default_status_obras`.
--
-- A contrapartida obrigatória mora na tela: o campo nasce OPCIONAL e com estado vazio
-- explícito ("Nenhum marcador cadastrado — criar o primeiro"). Lista vazia + campo
-- obrigatório + <Select> sem tratamento de vazio é a receita exata que deixou o Status
-- Inicial intransponível. "Vazio porque foi decidido" e "vazio porque quebrou" têm que ser
-- distinguíveis por quem olha.
