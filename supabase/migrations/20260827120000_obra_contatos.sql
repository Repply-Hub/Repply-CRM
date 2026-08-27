-- Vínculo obra <-> contato vira LISTA (vários contatos por obra, e o mesmo
-- contato em várias obras).
--
-- POR QUE ISTO REVERTE UMA DECISÃO DE DOIS DIAS ATRÁS
--
-- `20260825180000_contato_vinculado_a_obra.sql` criou `contatos.obra_id` e
-- escreveu, com todas as letras: "vínculo opcional e com uma obra só — não é
-- lista". O uso derrubou a premissa: quem compra material não cuida de um
-- canteiro só. O comprador de uma construtora toca três, quatro obras ao mesmo
-- tempo, e o engenheiro de campo muda de obra ao longo do ano.
--
-- Com uma coluna só, isso produzia dois estragos silenciosos:
--   1. o mesmo comprador virava contato DUPLICADO, um por obra — e aí telefone
--      atualizado numa cópia não chega na outra;
--   2. vincular esse contato à obra B o REMOVIA da obra A, sem aviso nenhum na
--      tela, porque a coluna só guarda um valor.
--
-- Decisão do dono do produto em 27/08/2026: passa a ser lista dos dois lados.
--
-- A COLUNA ANTIGA NÃO CAI AQUI — É DE PROPÓSITO
--
-- `contatos.obra_id` continua existindo depois desta migration, com os dados
-- que já tinha. Publicar o banco e publicar o site não são o mesmo ato nem
-- acontecem no mesmo minuto: derrubar a coluna junto abriria uma janela em que
-- o site antigo (ainda no ar) lê uma coluna que já sumiu, e a ficha do contato
-- quebra para o cliente pagante. O DROP vai num arquivo próprio, depois do site
-- novo publicado — o mesmo caminho em dois passos que `obras.status` seguiu em
-- 24/08 (20260824120000_derruba_status_da_obra.sql, "passo 2 de 2").
--
-- Até lá a coluna fica órfã: nada no site novo lê nem escreve nela.

create table if not exists public.obra_contatos (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references public.obras(id) on delete cascade,
  contato_id uuid not null references public.contatos(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Vincular duas vezes o mesmo par é a mesma informação, não uma segunda. O
  -- frontend calcula o que falta inserir lendo o banco no mesmo instante da
  -- gravação, então na prática não tenta repetir; o UNIQUE é a rede para o caso
  -- de duas pessoas salvarem a mesma obra ao mesmo tempo — aí uma das gravações
  -- falha em vez de duplicar a linha.
  unique (obra_id, contato_id)
);

-- `on delete cascade` nos DOIS lados: apagar a obra ou o contato desfaz o
-- vínculo e não deixa linha apontando para registro que não existe mais. É
-- diferente do `on delete set null` da coluna antiga porque aqui a linha só
-- existe para representar a ligação — sem uma das pontas ela não significa nada.

create index if not exists idx_obra_contatos_obra on public.obra_contatos (obra_id);
create index if not exists idx_obra_contatos_contato on public.obra_contatos (contato_id);

-- ---------------------------------------------------------------------------
-- Segurança
-- ---------------------------------------------------------------------------
--
-- A cerca é ancorada na OBRA, repetindo a cláusula de `obras_select`
-- (20260804195019): obra -> cliente -> usuario_in_my_empresa. `obras` não tem
-- `empresa_id`; o inquilino é alcançado pelo dono do cliente.
--
-- 🔴 NÃO herdamos a regra de `contatos_select`, que hoje é
--    `(usuario_id = get_my_usuario_id()) OR usuario_in_my_empresa(usuario_id)
--     OR (usuario_id IS NULL)`.
-- Aquele terceiro ramo torna visível para QUALQUER empresa todo contato com
-- `usuario_id` nulo. Seja lá o que ele resolva em `contatos` (há contato antigo
-- de importação sem dono), não pode se espalhar: ancorar na obra fecha a porta,
-- porque obra sempre tem cliente e cliente sempre tem dono.

create or replace function public.pode_acessar_obra(_obra_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.obras o
    join public.clientes c on c.id = o.cliente_id
    where o.id = _obra_id
      and public.usuario_in_my_empresa(c.usuario_id)
  );
$$;

alter table public.obra_contatos enable row level security;

create policy obra_contatos_select on public.obra_contatos
  for select to authenticated
  using (public.pode_acessar_obra(obra_id));

create policy obra_contatos_insert on public.obra_contatos
  for insert to authenticated
  with check (public.pode_acessar_obra(obra_id));

create policy obra_contatos_delete on public.obra_contatos
  for delete to authenticated
  using (public.pode_acessar_obra(obra_id));

-- Sem policy de UPDATE de propósito: a linha é só o par (obra, contato). Mudar
-- o vínculo é apagar um e criar outro; um UPDATE aqui só serviria para mover a
-- linha para outra obra, o que é exatamente o que não queremos permitir.

-- Gate de assinatura, no mesmo molde de `20260803140402_gate_plano_escrita.sql`:
-- empresa com plano inativo lê o que já existe, mas não escreve. Sem esta política
-- restritiva, `obra_contatos` seria a única porta de escrita do módulo comercial
-- aberta para quem está inadimplente.
create policy obra_contatos_exige_plano_insert on public.obra_contatos
  as restrictive for insert to authenticated
  with check ((select public.empresa_plano_ativo()));

-- ---------------------------------------------------------------------------
-- Migração dos vínculos que já existem
-- ---------------------------------------------------------------------------
-- Roda como dono da migration, sem RLS no caminho, então copia os vínculos de
-- TODAS as empresas de uma vez. O `on conflict do nothing` deixa ESTE INSERT
-- poder rodar de novo sem erro (o resto do arquivo não é reaplicável: as
-- políticas usam `create policy`, que falha se já existirem).
--
-- 🔴 NUNCA re-rode este bloco depois de a tela nova estar no ar por um tempo: ele
-- ressuscitaria, a partir da coluna velha, vínculos que o usuário desfez na tela.

insert into public.obra_contatos (obra_id, contato_id)
select c.obra_id, c.id
from public.contatos c
where c.obra_id is not null
on conflict (obra_id, contato_id) do nothing;
