-- ============================================================================
-- VÁRIOS CONTATOS POR FABRICANTE
-- ============================================================================
-- Desenho: docs/superpowers/specs/2026-08-31-contatos-por-fabricante-design.md
-- Plano:   docs/superpowers/plans/2026-08-31-contatos-por-fabricante.md
--
-- Hoje a fábrica tem UM contato, em duas colunas soltas (`nome_contato`, `telefone`).
-- Pedido do dono do produto em 31/08/2026: "uma fábrica que um representante possui tem
-- diversos contatos que ele fala diariamente. Tem o gerente, tem o responsável pela
-- logística, existe a assistência técnica".
--
-- 🔴 A MEDIÇÃO QUE MANDOU NO DESENHO
--
-- Contado em 31/08/2026: as duas colunas estão VAZIAS nas 28 fábricas da MD
-- Representações. No sistema inteiro são 9 registros preenchidos — 1 da JHS e 8 da base
-- de demonstração criada em 30/08.
--
-- Duas consequências, e as duas estão neste arquivo:
--   1. Não há migração de dado a fazer (§5 aqui embaixo move 9 linhas, e acabou).
--   2. O campo de hoje morreu por ATRITO — um campo para um contato é inútil para quem
--      fala com quatro pessoas na mesma fábrica. Por isso a lista de funções nasce
--      SEMEADA (§4) e a função é OPCIONAL (`funcao_id` anulável): o substituto não pode
--      nascer pedindo mais trabalho que o antigo.
--
-- 🔴 POR QUE O ISOLAMENTO AQUI É O MAIS SIMPLES DO SISTEMA — E POR QUE NÃO COPIAR ISTO
--
-- `fabricantes` é a ÚNICA tabela do núcleo comercial que se prende à empresa por
-- `empresa_id`. `clientes` tem a coluna e ela está NULA nas 1.306 linhas; `pedidos` e
-- `obras` não têm coluna de empresa nenhuma, e o recorte real deles é
-- `usuario_id → usuarios.empresa_id`. Então o contato de fábrica herda o caminho mais
-- curto que existe aqui: uma junção com a fábrica dona.
--
-- NÃO copie este desenho para contato de cliente ou de obra — lá `empresa_id` mentiria.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. A lista de funções, por empresa
-- ---------------------------------------------------------------------------
create table if not exists public.fabricante_funcoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null,
  ordem integer not null default 0,
  -- Veio da semeadura. NÃO impede apagar: só marca a origem, como em kanban_colunas.
  is_sistema boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Duas funções com o mesmo nome na mesma empresa são a mesma informação, não uma segunda.
-- `lower(nome)` porque "Logística" e "logística" também são a mesma.
create unique index if not exists fabricante_funcoes_nome_uniq
  on public.fabricante_funcoes (empresa_id, lower(nome));

-- ---------------------------------------------------------------------------
-- 2. Os contatos
-- ---------------------------------------------------------------------------
create table if not exists public.fabricante_contatos (
  id uuid primary key default gen_random_uuid(),
  fabricante_id uuid not null references public.fabricantes(id) on delete cascade,
  -- ON DELETE SET NULL, e não CASCADE: apagar a função "Logística" não pode apagar o
  -- telefone do pessoal da logística. Eles ficam sem função, que é recuperável em dois
  -- cliques. Apagar o contato não seria.
  funcao_id uuid references public.fabricante_funcoes(id) on delete set null,
  nome text not null,
  telefone text,
  email text,
  observacao text,
  principal boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_fabricante_contatos_fabricante
  on public.fabricante_contatos (fabricante_id);

-- 🔴 O índice parcial é o que impede duas pessoas marcarem principais diferentes ao mesmo
-- tempo e o banco aceitar os dois. Sem ele, o cartão mostraria um dos dois sem critério —
-- e ninguém saberia que houve conflito, porque nada na tela indicaria.
create unique index if not exists fabricante_contatos_um_principal
  on public.fabricante_contatos (fabricante_id) where principal;

-- ---------------------------------------------------------------------------
-- 3. Segurança
-- ---------------------------------------------------------------------------
-- Mesmo alcance que JÁ vale para editar a fábrica desde 19/08/2026
-- (20260819125643_fabricantes_escrita_para_todo_membro_da_empresa.sql): qualquer membro
-- da empresa. Não se inventa permissão nova para um cadastro auxiliar.
--
-- Este passo vem ANTES do §6 de propósito: o gerador do cerco só enxerga tabela com RLS
-- ligada. Tabela sem RLS é invisível para ele — e fica sem isolamento nenhum entre
-- empresas, o que o CLAUDE.md §6.2 já proíbe.
alter table public.fabricante_funcoes  enable row level security;
alter table public.fabricante_contatos enable row level security;

drop policy if exists "fabricante_funcoes_select" on public.fabricante_funcoes;
create policy "fabricante_funcoes_select" on public.fabricante_funcoes
  for select to authenticated
  using (public.is_admin() or empresa_id = public.get_my_empresa_id());

drop policy if exists "fabricante_funcoes_insert" on public.fabricante_funcoes;
create policy "fabricante_funcoes_insert" on public.fabricante_funcoes
  for insert to authenticated
  with check (public.is_admin() or empresa_id = public.get_my_empresa_id());

drop policy if exists "fabricante_funcoes_update" on public.fabricante_funcoes;
create policy "fabricante_funcoes_update" on public.fabricante_funcoes
  for update to authenticated
  using (public.is_admin() or empresa_id = public.get_my_empresa_id())
  with check (public.is_admin() or empresa_id = public.get_my_empresa_id());

drop policy if exists "fabricante_funcoes_delete" on public.fabricante_funcoes;
create policy "fabricante_funcoes_delete" on public.fabricante_funcoes
  for delete to authenticated
  using (public.is_admin() or empresa_id = public.get_my_empresa_id());

-- As de contato se apoiam na fábrica dona.
--
-- 🔴 O WITH CHECK é escrito à mão nas duas pontas do UPDATE de propósito. Sem ele, o
-- Postgres reaproveita o USING — que olha a linha de ORIGEM. Um UPDATE poderia então
-- MOVER um contato para a fábrica de outra empresa, e a checagem aprovaria, porque a
-- linha de origem era legítima.
drop policy if exists "fabricante_contatos_select" on public.fabricante_contatos;
create policy "fabricante_contatos_select" on public.fabricante_contatos
  for select to authenticated
  using (exists (
    select 1 from public.fabricantes f
    where f.id = fabricante_contatos.fabricante_id
      and (public.is_admin() or f.empresa_id = public.get_my_empresa_id())));

drop policy if exists "fabricante_contatos_insert" on public.fabricante_contatos;
create policy "fabricante_contatos_insert" on public.fabricante_contatos
  for insert to authenticated
  with check (exists (
    select 1 from public.fabricantes f
    where f.id = fabricante_contatos.fabricante_id
      and (public.is_admin() or f.empresa_id = public.get_my_empresa_id())));

drop policy if exists "fabricante_contatos_update" on public.fabricante_contatos;
create policy "fabricante_contatos_update" on public.fabricante_contatos
  for update to authenticated
  using (exists (
    select 1 from public.fabricantes f
    where f.id = fabricante_contatos.fabricante_id
      and (public.is_admin() or f.empresa_id = public.get_my_empresa_id())))
  with check (exists (
    select 1 from public.fabricantes f
    where f.id = fabricante_contatos.fabricante_id
      and (public.is_admin() or f.empresa_id = public.get_my_empresa_id())));

drop policy if exists "fabricante_contatos_delete" on public.fabricante_contatos;
create policy "fabricante_contatos_delete" on public.fabricante_contatos
  for delete to authenticated
  using (exists (
    select 1 from public.fabricantes f
    where f.id = fabricante_contatos.fabricante_id
      and (public.is_admin() or f.empresa_id = public.get_my_empresa_id())));

-- ---------------------------------------------------------------------------
-- 4. A semeadura da lista de funções
-- ---------------------------------------------------------------------------
-- Empresa nova nasce com uma lista de partida, EDITÁVEL.
--
-- Isso NÃO contradiz o princípio de não transformar prática da MD em regra do sistema
-- (SPEC.md §4). O que aquele princípio proíbe é lista CRAVADA NO CÓDIGO, que o assinante
-- não consegue mudar. Aqui ele renomeia, apaga e acrescenta à vontade.
--
-- A lista existe por causa da medição do cabeçalho: lista vazia obrigaria a sair da tela
-- para configurar antes de cadastrar o primeiro contato — exatamente o atrito que matou
-- o campo antigo.
create or replace function public.criar_fabricante_funcoes_padrao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.fabricante_funcoes (empresa_id, nome, ordem, is_sistema) values
    (new.id, 'Gerente comercial',   0, true),
    (new.id, 'Logística',           1, true),
    (new.id, 'Assistência técnica', 2, true),
    (new.id, 'Financeiro',          3, true),
    (new.id, 'Representante',       4, true)
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists trg_criar_fabricante_funcoes_padrao on public.empresas;
create trigger trg_criar_fabricante_funcoes_padrao
after insert on public.empresas
for each row execute function public.criar_fabricante_funcoes_padrao();

-- O gatilho só vale para empresa NOVA. As 10 que já existem recebem a mesma lista aqui.
insert into public.fabricante_funcoes (empresa_id, nome, ordem, is_sistema)
select e.id, v.nome, v.ordem, true
from public.empresas e
cross join (values
  ('Gerente comercial', 0), ('Logística', 1), ('Assistência técnica', 2),
  ('Financeiro', 3), ('Representante', 4)
) as v(nome, ordem)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 5. Os 9 contatos que já existem viram o principal da sua fábrica
-- ---------------------------------------------------------------------------
-- Sem função: não há como adivinhar qual delas, e chutar seria pior que deixar em branco.
--
-- O `coalesce(..., 'Contato')` cobre a linha que tem telefone e não tem nome — `nome` é
-- NOT NULL, e perder o telefone por falta de um rótulo seria o pior dos dois males.
insert into public.fabricante_contatos (fabricante_id, nome, telefone, principal)
select f.id,
       coalesce(nullif(trim(f.nome_contato), ''), 'Contato'),
       nullif(trim(f.telefone), ''),
       true
from public.fabricantes f
where coalesce(trim(f.nome_contato), '') <> ''
   or coalesce(trim(f.telefone), '') <> ''
on conflict do nothing;

-- 🔴 `fabricantes.nome_contato` e `fabricantes.telefone` NÃO CAEM AQUI.
--
-- Publicar o banco e publicar o site não são o mesmo ato nem acontecem no mesmo minuto.
-- Derrubar as colunas junto abre uma janela em que o site ANTIGO — ainda no ar — lê uma
-- coluna que já sumiu, e a tela de Fábricas quebra para cliente pagante.
--
-- O DROP vai em arquivo próprio, DEPOIS do site novo publicado. É o caminho de dois
-- passos que `obras.status` (20260824120000, "passo 2 de 2") e `contatos.obra_id` já
-- seguiram. Até lá as colunas ficam órfãs: o site novo não lê nem escreve nelas.

-- ---------------------------------------------------------------------------
-- 6. O cerco do bloqueio por falta de pagamento
-- ---------------------------------------------------------------------------
-- Desde 30/08/2026 isso é um GERADOR, não cópia manual: ele varre as tabelas e cria as
-- políticas de INSERT/UPDATE/DELETE que faltam.
--
-- Copiar à mão foi o que produziu o defeito de `obra_contatos`, que saiu PELA METADE (só
-- o INSERT, sem o UPDATE) e passou quatro semanas sem ninguém notar, porque nada além de
-- olhar o SQL apontava a falta.
select public.aplicar_gate_de_plano();

comment on table public.fabricante_contatos is
  'Contatos da fábrica (gerente, logística, assistência técnica...). Pertencem a UMA '
  'fábrica: diferente de obra_contatos, que é N:N porque o comprador da construtora cuida '
  'de vários canteiros ao mesmo tempo. O gerente da Portobello trabalha na Portobello.';

comment on table public.fabricante_funcoes is
  'A lista de funções de contato, por empresa. Nasce semeada e é editável — ponto de '
  'partida, não regra. Ver SPEC.md §4 sobre não impor prática da MD ao assinante.';
