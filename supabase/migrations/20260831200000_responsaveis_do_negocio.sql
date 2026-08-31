-- ============================================================================
-- Vários responsáveis por negócio — a estrutura. Nada muda na tela ainda.
--
-- Decisões do dono do produto (23/08/2026, reconfirmadas em 31/08):
--   1. Vários responsáveis, pelo menos um. Ao criar já vem quem cadastra.
--   2. 🔴 O DINHEIRO VAI PARA UM SÓ — o principal. Os demais participam, não somam valor.
--   3. Edita quem tem a permissão "editar negócios", mais os gestores.
--   4. Reatribuir é permitido, inclusive para si. O histórico cobre o risco.
--
-- 🔴 A DECISÃO 2 É O QUE SUSTENTA TUDO. Com o valor num principal só, `pedidos.usuario_id`
-- continua significando exatamente o que significa hoje — e as OITO consultas de dinheiro do
-- sistema não mudam uma linha: Faturamento Total, Rendimento por Responsável, Faturamento
-- Mensal, Ticket Médio, Taxa de Conversão, Conversão por Vendedor, Plano de Vendas e o total
-- da tela de Negócios. Se o valor fosse rateado, as oito mudariam juntas, e "Rendimento por
-- Responsável" deixaria de fechar com o Faturamento Total — o número que a MD usa para
-- conferir comissão.
--
-- 🔴 A ARMADILHA QUE ESTA TABELA CRIA, e que nenhuma tela denuncia: um negócio de R$ 100 mil
-- com três responsáveis vira R$ 300 mil em qualquer consulta que junte `pedidos` com esta
-- tabela e some `valor_total`. É o resultado natural de um JOIN um-para-muitos, e o número
-- fica plausível.
--
--     REGRA: consulta de DINHEIRO junta `pedidos` com `usuarios` por `usuario_id`, e ponto.
--     `pedido_responsaveis` só entra em consulta que responde "QUEM participou".
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1. A tabela
-- ────────────────────────────────────────────────────────────────────────────
--
-- 🔴 `pedidos.usuario_id` NÃO É SÓ "o responsável" — É A CHAVE DE EMPRESA. `pedidos` não tem
-- `empresa_id`; o inquilino é descoberto sempre por `pedidos.usuario_id → usuarios.empresa_id`,
-- em 5 visões, 5 funções de banco, 2 políticas, a chave estrangeira que sustenta o embed do
-- PostgREST, o índice, e ~14 pontos só em `use-pedidos.ts`.
--
-- Por isso a coluna NÃO sai. Ela passa a ser ESPELHO do principal, mantido pelo banco: uma
-- verdade só (esta tabela), e zero mudança em tudo que já existe.

create table if not exists public.pedido_responsaveis (
  pedido_id  uuid not null references public.pedidos(id) on delete cascade,
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  -- Quem leva o valor. Exatamente um por negócio — garantido pelo índice abaixo.
  principal  boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) on delete set null,
  primary key (pedido_id, usuario_id)
);

comment on table public.pedido_responsaveis is
  'Todos os responsaveis de um negocio. `principal` marca quem leva o valor — e e espelhado '
  'em pedidos.usuario_id pelos gatilhos deste arquivo. NUNCA some valor_total por esta '
  'tabela: um negocio com 3 responsaveis viraria o triplo.';

-- No máximo UM principal por negócio. Índice parcial — o mesmo idioma que
-- `metas_vendas_equipe_uniq` já usa neste banco.
-- ⚠️ Quem escrever `ON CONFLICT` contra ele precisa REPETIR o `WHERE principal`, senão o
--    conflito não casa.
create unique index if not exists pedido_responsaveis_um_principal
  on public.pedido_responsaveis (pedido_id) where principal;

-- A busca "de quem é este negócio" e "em que negócios fulano está".
create index if not exists idx_pedido_responsaveis_usuario
  on public.pedido_responsaveis (usuario_id);

alter table public.pedido_responsaveis enable row level security;


-- ────────────────────────────────────────────────────────────────────────────
-- 2. As políticas — e o que elas deliberadamente NÃO fazem
-- ────────────────────────────────────────────────────────────────────────────
--
-- 🔴 NENHUMA POLÍTICA DE `pedidos` MENCIONA ESTA TABELA, e nenhuma política daqui menciona
-- `pedidos`. Medido com EXPLAIN sobre os 11.911 negócios da MD:
--
--     hoje (usuario_id ∈ empresa) ............ Index Only Scan ...  3,7 ms ·    74 buffers
--     somando has_permission(...) ............ Index Only Scan ...  4,0 ms ·    56 buffers
--     somando EXISTS(ligacao.pedido_id=p.id) . Seq Scan .........  29,0 ms · 1.149 buffers
--
-- É a armadilha do CLAUDE.md §7.9 em roupa nova: um `OR` que cita `pedidos.id` faz o Postgres
-- largar o índice e varrer a tabela — e a política de `pedidos` chama `usuario_in_my_empresa`
-- UMA VEZ POR LINHA VARRIDA. Foi essa multiplicação que já transformou 4 ms em 31 segundos.
--
-- E o ramo do participante nem é necessário: participante e principal estão sempre na MESMA
-- empresa, e a política de SELECT de `pedidos` já libera todos os negócios da empresa. Quem
-- participa já enxerga o negócio hoje, antes de qualquer mudança.

drop policy if exists pedido_responsaveis_select on public.pedido_responsaveis;
create policy pedido_responsaveis_select on public.pedido_responsaveis
  for select to authenticated
  using (public.usuario_in_my_empresa(usuario_id));

-- Mexer na lista segue a MESMA régua de editar o negócio (decisão 3). A checagem se duplica
-- de propósito: quem pode editar o negócio pode mexer nos responsáveis dele, e quem não pode,
-- não pode pelos dois caminhos.
drop policy if exists pedido_responsaveis_escrita on public.pedido_responsaveis;
create policy pedido_responsaveis_escrita on public.pedido_responsaveis
  for all to authenticated
  using (
    public.usuario_in_my_empresa(usuario_id)
    and (public.is_gestor()
         or public.has_permission(public.get_my_usuario_id(), 'pedidos', 'editar'))
  )
  with check (
    public.usuario_in_my_empresa(usuario_id)
    and (public.is_gestor()
         or public.has_permission(public.get_my_usuario_id(), 'pedidos', 'editar'))
  );


-- ────────────────────────────────────────────────────────────────────────────
-- 3. A carga inicial — ANTES dos gatilhos, de proposito
-- ────────────────────────────────────────────────────────────────────────────
--
-- Uma linha por negócio, principal, copiada de `pedidos.usuario_id`. Não toca em `pedidos` e
-- é refazível a qualquer momento com a mesma consulta — não é caminho sem volta.
--
-- 🔴 ELA VEM ANTES DOS GATILHOS DE PROPÓSITO. Com os gatilhos já criados, cada uma das 12 mil
-- linhas dispararia o espelho — 12 mil consultas e 12 mil UPDATEs que não mudariam nada. Sem
-- os gatilhos, é um INSERT só.
--
-- `on conflict do nothing` para a migration poder rodar duas vezes sem estrago.

insert into public.pedido_responsaveis (pedido_id, usuario_id, principal, created_by)
select p.id, p.usuario_id, true, p.usuario_id
from public.pedidos p
where p.usuario_id is not null
on conflict (pedido_id, usuario_id) do nothing;


-- ────────────────────────────────────────────────────────────────────────────
-- 4. O espelho, de mão dupla
-- ────────────────────────────────────────────────────────────────────────────
--
-- 🔴 DOIS GATILHOS QUE ESCREVEM UM NO OUTRO ENTRAM EM LAÇO INFINITO, a não ser que cada um
-- DESISTA quando o valor já é o certo. A forma é pôr o valor no `WHERE`: zero linhas
-- alteradas não dispara o gatilho de volta.
--
-- É isto que faz esta migration ser INVISÍVEL: `use-bulk-import.ts`, `use-novo-pedido.ts`,
-- `use-edit-pedido.ts` e a ação em massa continuam gravando `usuario_id` como sempre, sem uma
-- linha de mudança, e já alimentam a tabela nova.

create or replace function public.fn_espelha_principal_em_pedidos()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_pedido uuid := coalesce(new.pedido_id, old.pedido_id);
  v_principal uuid;
begin
  select r.usuario_id into v_principal
  from public.pedido_responsaveis r
  where r.pedido_id = v_pedido and r.principal;

  -- Sem principal na ligação não se toca em `pedidos`: a coluna é NOT NULL, e apagá-la
  -- derrubaria a chave de empresa do negócio.
  if v_principal is not null then
    update public.pedidos
       set usuario_id = v_principal
     where id = v_pedido
       and usuario_id is distinct from v_principal;   -- 0 linhas = não volta para cá
  end if;

  return null;
end;
$$;

drop trigger if exists trg_espelha_principal on public.pedido_responsaveis;
create trigger trg_espelha_principal
  after insert or update or delete on public.pedido_responsaveis
  for each row execute function public.fn_espelha_principal_em_pedidos();


create or replace function public.fn_semeia_responsavel_do_pedido()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Quem escreveu `usuario_id` direto (formulário, importação, ação em massa) manda: a linha
  -- principal da ligação passa a ser essa pessoa.
  --
  -- O `on conflict` tem DOIS caminhos porque há dois conflitos possíveis: a pessoa já estar
  -- no negócio como participante (chave primária), ou já existir outro principal (o índice
  -- parcial). O segundo é resolvido rebaixando o antigo ANTES de promover o novo.
  update public.pedido_responsaveis
     set principal = false
   where pedido_id = new.id and principal and usuario_id is distinct from new.usuario_id;

  insert into public.pedido_responsaveis (pedido_id, usuario_id, principal, created_by)
  values (new.id, new.usuario_id, true, public.get_my_usuario_id())
  on conflict (pedido_id, usuario_id) do update
    set principal = true
  where public.pedido_responsaveis.principal is distinct from true;  -- 0 linhas = não volta

  return null;
end;
$$;

drop trigger if exists trg_semeia_responsavel on public.pedidos;
create trigger trg_semeia_responsavel
  after insert or update of usuario_id on public.pedidos
  for each row execute function public.fn_semeia_responsavel_do_pedido();


-- ────────────────────────────────────────────────────────────────────────────
-- 5. Não dá para remover o principal — só trocar quem é
-- ────────────────────────────────────────────────────────────────────────────
--
-- `pedidos.usuario_id` é NOT NULL e é a chave de empresa. Remover a linha principal deixaria
-- o negócio sem para onde espelhar, e o espelho (acima) desiste em silêncio — o negócio
-- ficaria com um responsável que não está mais na lista. Melhor recusar e explicar.
--
-- Na tela isso vira: para tirar quem é o principal, primeiro passe a estrela para outro.

create or replace function public.fn_impede_remover_principal()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  -- O CASCADE do negócio apagado passa direto: aí não sobra negócio para proteger.
  if old.principal and exists (select 1 from public.pedidos where id = old.pedido_id) then
    raise exception
      'Este é o responsável principal do negócio. Passe a estrela para outra pessoa antes de removê-lo.'
      using errcode = '23514';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_impede_remover_principal on public.pedido_responsaveis;
create trigger trg_impede_remover_principal
  before delete on public.pedido_responsaveis
  for each row execute function public.fn_impede_remover_principal();


-- ────────────────────────────────────────────────────────────────────────────
-- 6. O histórico de atividades do negócio
-- ────────────────────────────────────────────────────────────────────────────
--
-- 🔴 PEDIDO DO LUCAS EM 31/08/2026: "com a adição de registrar isso no histórico de
-- atividades do negócio". Entra no MESMO formato que o gatilho de `pedidos` já usa desde
-- 19/08 (`tipo='campo'`, rótulo em português, valores em texto) — então a tela que já mostra
-- "Valor total: 1000 → 2000" mostra estes sem nenhuma mudança de código.
--
-- 🔴 SÓ PARTICIPANTE, NUNCA O PRINCIPAL, e isso evita registro DUPLO. Trocar a estrela já
-- move `pedidos.usuario_id` pelo espelho, e `fn_log_pedido_historico_status` já registra
-- isso como "Vendedor: Érika → Gabriel". Registrar aqui também daria duas linhas para uma
-- ação só.
--
-- E a carga inicial não polui nada: ela insere 12 mil linhas TODAS principais, e este gatilho
-- ignora principal.

create or replace function public.fn_log_responsavel_do_pedido()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_nome text;
  v_linha public.pedido_responsaveis;
begin
  v_linha := coalesce(new, old);
  if v_linha.principal then return null; end if;

  select nome into v_nome from public.usuarios where id = v_linha.usuario_id;

  insert into public.pedidos_historico_status
    (pedido_id, tipo, campo, valor_anterior_txt, valor_novo_txt, usuario_id)
  values (
    v_linha.pedido_id, 'campo',
    case when tg_op = 'INSERT' then 'Responsável adicionado' else 'Responsável removido' end,
    case when tg_op = 'DELETE' then coalesce(v_nome, '—') end,
    case when tg_op = 'INSERT' then coalesce(v_nome, '—') end,
    coalesce(public.get_my_usuario_id(), v_linha.created_by)
  );

  return null;
end;
$$;

drop trigger if exists trg_log_responsavel on public.pedido_responsaveis;
create trigger trg_log_responsavel
  after insert or delete on public.pedido_responsaveis
  for each row execute function public.fn_log_responsavel_do_pedido();




-- ────────────────────────────────────────────────────────────────────────────
-- 7. Trocar a estrela, sem passar por um estado inválido
-- ────────────────────────────────────────────────────────────────────────────
--
-- 🔴 A ORDEM É OBRIGATÓRIA, e é por isso que isto não pode ficar na tela. O índice parcial
-- proíbe DOIS principais no mesmo negócio: promover o novo antes de rebaixar o antigo é
-- recusado pelo banco. Rebaixar primeiro funciona — e entre os dois passos o negócio fica um
-- instante sem principal, o que o índice permite e o espelho ignora (ele desiste quando não
-- acha principal).
--
-- Deixar essa ordem por conta de quem chama é confiar que nenhuma tela, nenhuma importação e
-- nenhum script futuro vai inverter dois comandos. Aqui é uma chamada só, atômica.
--
-- Não é SECURITY DEFINER: as políticas de `pedido_responsaveis` (§2) valem, e quem não pode
-- editar o negócio recebe a recusa do banco, como deve.

create or replace function public.definir_responsavel_principal(
  p_pedido_id uuid,
  p_usuario_id uuid
)
returns void
language plpgsql
set search_path to 'public'
as $$
begin
  if not exists (
    select 1 from public.pedido_responsaveis
    where pedido_id = p_pedido_id and usuario_id = p_usuario_id
  ) then
    raise exception 'Esta pessoa não é responsável por este negócio.' using errcode = '23503';
  end if;

  -- Primeiro rebaixa, depois promove. Inverter é recusado pelo indice parcial.
  update public.pedido_responsaveis
     set principal = false
   where pedido_id = p_pedido_id and principal and usuario_id <> p_usuario_id;

  update public.pedido_responsaveis
     set principal = true
   where pedido_id = p_pedido_id and usuario_id = p_usuario_id and not principal;
end;
$$;

comment on function public.definir_responsavel_principal(uuid, uuid) is
  'Troca quem leva o valor do negocio. Rebaixa o principal atual antes de promover o novo — '
  'a ordem inversa e recusada pelo indice parcial pedido_responsaveis_um_principal.';

grant execute on function public.definir_responsavel_principal(uuid, uuid) to authenticated;


-- ────────────────────────────────────────────────────────────────────────────
-- 8. Uma palavra só para a mesma coisa
-- ────────────────────────────────────────────────────────────────────────────
--
-- O gatilho de `pedidos` já registrava a troca de responsável, com o rótulo "Vendedor" — o
-- nome que o campo tinha quando aquele gatilho foi escrito. Agora que a estrela e a lista
-- falam de "Responsável", a mesma ação apareceria com dois nomes na mesma tela:
--
--     Responsável adicionado: — → Alex
--     Vendedor: Lucas Ferreira → Alex          ← a troca da estrela
--
-- Só o rótulo das linhas NOVAS muda. As antigas continuam dizendo "Vendedor", que é como o
-- campo se chamava quando elas foram gravadas — reescrever histórico para ficar bonito seria
-- apagar o que de fato aconteceu.
--
-- ⚠️ Este `create or replace` copia a função inteira de `fn_log_pedido_historico_status` e
-- troca UMA string. Se outra sessão a tiver alterado entre a leitura e esta migration, a
-- alteração dela se perde — foi conferida em 31/08/2026 contra `pg_get_functiondef`.

do $$
declare v_corpo text;
begin
  select pg_get_functiondef(p.oid) into v_corpo
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_log_pedido_historico_status';

  if v_corpo is null then
    raise notice 'fn_log_pedido_historico_status nao existe; nada a renomear';
    return;
  end if;

  if position('''Vendedor''' in v_corpo) = 0 then
    raise notice 'o rotulo "Vendedor" ja nao esta la; nada a fazer';
    return;
  end if;

  execute replace(v_corpo, '''Vendedor''', '''Responsável principal''');
end $$;
