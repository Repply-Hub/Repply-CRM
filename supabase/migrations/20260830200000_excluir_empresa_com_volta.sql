-- Excluir uma empresa — com 60 dias para voltar atrás. Etapa 5 do desenho aprovado.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 🔴 ESTA MIGRATION NÃO APAGA NADA. NEM UMA LINHA.
-- ═══════════════════════════════════════════════════════════════════════════════════════
--
-- Ela marca. A empresa some de tudo, ninguém dela entra mais, a assinatura do Stripe é
-- cancelada — e cada linha de dado continua exatamente onde estava. A apagada definitiva é a
-- etapa 6, acontece 60 dias depois, e mesmo lá é a equipe que confirma.
--
-- 🔴 POR QUE A ORDEM IMPORTA TANTO AQUI. `usuarios.empresa_id` é `ON DELETE SET NULL`, e
-- `clientes.empresa_id` está NULO nas 1.306 linhas — o vínculo real é `usuario_id ->
-- usuarios.empresa_id`. Ou seja: apagar a linha de `empresas` ROMPE O ÚNICO FIO que liga os
-- 11.910 negócios a ela. Os dados ficariam no banco para sempre, sem ninguém conseguir dizer
-- de quem eram — nem para apagar depois, nem para devolver se foi engano.
--
-- Marcar em vez de apagar não é cautela: é a única forma de a exclusão poder ser desfeita.

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 1. O registro da exclusão — e o estado para o qual restaurar
-- ═══════════════════════════════════════════════════════════════════════════════════════

create table if not exists public.empresa_exclusoes (
  empresa_id      uuid primary key references public.empresas(id) on delete cascade,
  excluida_em     timestamptz not null default now(),
  -- `usuarios(id)`, não `user_id` (CLAUDE.md §4.5). Quem clicou.
  excluida_por    uuid references public.usuarios(id) on delete set null,
  motivo          text,

  -- 🔴 O ESTADO ANTERIOR, GUARDADO INTEIRO. Restaurar devolve a empresa ao que ela ERA, e
  -- não a um estado fixo.
  --
  -- O botão vai ser usado em empresas de três origens, e só uma delas chegou aqui por falta
  -- de pagamento. Se restaurar sempre voltasse para "suspensa", restaurar uma CORTESIA a
  -- colocaria numa parede falando de um problema de pagamento que nunca existiu — e o
  -- cliente ligaria perguntando qual fatura deixou de pagar.
  --
  -- Uma regra, três casos certos: quem veio da régua volta suspensa; quem era cortesia volta
  -- funcionando, e ninguém percebe que houve um clique errado.
  estado_anterior jsonb not null,

  -- Preenchido pela etapa 6, quando a apagada definitiva de fato acontecer.
  purgada_em      timestamptz
);

comment on table public.empresa_exclusoes is
  'Empresas marcadas para exclusao. NENHUM dado e apagado aqui — a linha guarda o estado anterior para restaurar. A apagada definitiva e outra etapa.';

create index if not exists idx_empresa_exclusoes_pendentes
  on public.empresa_exclusoes (excluida_em)
  where purgada_em is null;

alter table public.empresa_exclusoes enable row level security;

-- Só o admin global vê e mexe. A empresa excluída não precisa (nem deve) ler a contabilidade
-- do próprio encerramento.
drop policy if exists empresa_exclusoes_admin on public.empresa_exclusoes;
create policy empresa_exclusoes_admin on public.empresa_exclusoes
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 2. 🔴 O GATE: empresa excluída não escreve nada
-- ═══════════════════════════════════════════════════════════════════════════════════════
--
-- ⚠️ Esta função guarda 135 políticas em 45 tabelas. A cláusula nova é um `not exists` sobre
-- uma tabela de chave primária única — índice direto, e continua sem receber coluna como
-- argumento, então o Postgres segue resolvendo tudo como One-Time Filter (uma vez por
-- comando, não por linha). A armadilha do CLAUDE.md §7.9 continua fora daqui.

create or replace function public.empresa_plano_ativo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select case
        -- 🔴 EXCLUÍDA É O PRIMEIRO TESTE, e vem antes de tudo: nem cortesia, nem trial, nem
        -- plano em dia liberam quem foi encerrado.
        when exists (
          select 1 from public.empresa_exclusoes x
          where x.empresa_id = a.empresa_id and x.purgada_em is null
        ) then false
        when a.plan_status = 'trialing'
          then coalesce(a.current_period_end > now(), true)
        when a.inadimplente_desde is not null
             and now() >= a.inadimplente_desde + interval '15 days'
          then false
        else a.plan_status not in ('inactive', 'canceled', 'unpaid')
      end
      from public.empresa_assinaturas a
      where a.empresa_id = public.get_my_empresa_id()
    ),
    true
  ) or public.is_admin();
$$;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 3. Excluir — e o que a tela precisa saber
-- ═══════════════════════════════════════════════════════════════════════════════════════

create or replace function public.empresa_esta_excluida(p_empresa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.empresa_exclusoes
    where empresa_id = p_empresa_id and purgada_em is null
  );
$$;

grant execute on function public.empresa_esta_excluida(uuid) to authenticated, service_role;

/**
 * Marca a empresa como excluída, guardando o estado anterior.
 *
 * NÃO cancela o Stripe — quem faz isso é a função de servidor `empresa-excluir`, que chama
 * esta depois de cancelar. A ordem importa: cancelar primeiro e marcar depois deixa, no pior
 * caso, uma assinatura cancelada numa empresa ainda ativa (chato, reversível). O inverso
 * deixaria uma empresa encerrada ainda sendo cobrada — que é dinheiro do cliente.
 */
create or replace function public.excluir_empresa(p_empresa_id uuid, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado jsonb;
begin
  if not public.is_admin() then
    raise exception 'Apenas o administrador global pode excluir uma empresa.'
      using errcode = '42501';
  end if;

  if not exists (select 1 from public.empresas where id = p_empresa_id) then
    raise exception 'Empresa nao encontrada.' using errcode = '42704';
  end if;

  if public.empresa_esta_excluida(p_empresa_id) then
    return jsonb_build_object('ja_estava', true);
  end if;

  -- O retrato do que a empresa era, para o restaurar devolver exatamente isto.
  select jsonb_build_object(
           'plan_status',        a.plan_status,
           'origem',             a.origem,
           'current_period_end', a.current_period_end,
           'inadimplente_desde', a.inadimplente_desde,
           'plano_slug',         a.plano_slug
         )
    into v_estado
  from public.empresa_assinaturas a
  where a.empresa_id = p_empresa_id;

  insert into public.empresa_exclusoes (empresa_id, excluida_por, motivo, estado_anterior)
  values (p_empresa_id, public.get_my_usuario_id(), p_motivo, coalesce(v_estado, '{}'::jsonb));

  return jsonb_build_object('excluida_em', now(), 'estado_guardado', coalesce(v_estado, '{}'::jsonb));
end;
$$;

revoke all on function public.excluir_empresa(uuid, text) from public, anon;
grant execute on function public.excluir_empresa(uuid, text) to authenticated, service_role;

/**
 * Desfaz a exclusão, devolvendo a empresa ao estado exato de antes.
 *
 * 🔴 A ASSINATURA DO STRIPE NÃO VOLTA. Ela foi cancelada de verdade no dia do clique, e
 * cancelamento não se desfaz — quem restaurar uma empresa que pagava precisa refazer a
 * assinatura. A função devolve `assinatura_precisa_ser_refeita` para a tela poder dizer isso
 * em vez de deixar a pessoa descobrir sozinha no fim do mês.
 */
create or replace function public.restaurar_empresa(p_empresa_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado jsonb;
  v_tinha_assinatura boolean;
begin
  if not public.is_admin() then
    raise exception 'Apenas o administrador global pode restaurar uma empresa.'
      using errcode = '42501';
  end if;

  select estado_anterior into v_estado
  from public.empresa_exclusoes
  where empresa_id = p_empresa_id and purgada_em is null;

  if v_estado is null then
    raise exception 'Esta empresa nao esta excluida.' using errcode = '42704';
  end if;

  -- Devolve o retrato. `nullif(...,'null')` porque `->>` de um JSON nulo devolve a STRING
  -- "null", que viraria data invalida em vez de campo vazio.
  update public.empresa_assinaturas a
     set plan_status        = coalesce(v_estado->>'plan_status', a.plan_status),
         origem             = coalesce(v_estado->>'origem', a.origem),
         current_period_end = nullif(v_estado->>'current_period_end', 'null')::timestamptz,
         inadimplente_desde = nullif(v_estado->>'inadimplente_desde', 'null')::timestamptz,
         plano_slug         = nullif(v_estado->>'plano_slug', 'null')
   where a.empresa_id = p_empresa_id;

  select (a.stripe_subscription_id is not null) into v_tinha_assinatura
  from public.empresa_assinaturas a where a.empresa_id = p_empresa_id;

  delete from public.empresa_exclusoes where empresa_id = p_empresa_id;

  return jsonb_build_object(
    'restaurada_em', now(),
    'estado_devolvido', v_estado,
    'assinatura_precisa_ser_refeita', coalesce(v_tinha_assinatura, false)
  );
end;
$$;

revoke all on function public.restaurar_empresa(uuid) from public, anon;
grant execute on function public.restaurar_empresa(uuid) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 4. O que o painel de admin precisa ver
-- ═══════════════════════════════════════════════════════════════════════════════════════
--
-- Junta as DUAS pontas que hoje estão soltas: as empresas excluídas esperando o prazo, e as
-- que a régua de cobrança levou até o dia 90. As duas terminam no mesmo lugar — uma decisão
-- da equipe — e por isso aparecem na mesma lista.

create or replace function public.empresas_para_decidir()
returns table (
  empresa_id       uuid,
  nome             text,
  situacao         text,
  dias             integer,
  dias_restantes   integer,
  desde            timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  -- Excluídas, esperando os 60 dias.
  select
    x.empresa_id,
    e.nome,
    case when now() >= x.excluida_em + interval '60 days'
         then 'excluida_prazo_esgotado' else 'excluida_aguardando' end,
    greatest(0, (extract(epoch from (now() - x.excluida_em)) / 86400)::integer),
    greatest(0, 60 - (extract(epoch from (now() - x.excluida_em)) / 86400)::integer),
    x.excluida_em
  from public.empresa_exclusoes x
  join public.empresas e on e.id = x.empresa_id
  where x.purgada_em is null

  union all

  -- Inadimplentes que chegaram ao dia 90 da régua.
  select
    r.empresa_id,
    r.nome,
    'inadimplente_prazo_esgotado',
    r.dias,
    0,
    r.desde
  from public.empresas_na_regua() r
  where r.degrau = 'prazo_esgotado'
    and not public.empresa_esta_excluida(r.empresa_id);
$$;

revoke all on function public.empresas_para_decidir() from public, anon;
grant execute on function public.empresas_para_decidir() to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 5. Fora do bloqueio
-- ═══════════════════════════════════════════════════════════════════════════════════════

create or replace function public.tabelas_fora_do_gate()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array[
    'usuarios','empresas','empresa_assinaturas',
    'notificacoes_leituras','chat_mensagens_leituras','whatsapp_conversa_visualizacoes',
    'notificacoes','sidebar_preferences',
    'app_erros','automation_logs','audit_permissoes','historico_alteracoes','debug_logs',
    'secao_presets','secao_preset_itens',
    'licencas_natal','licencas_idema','licencas_extremoz',
    'gmail_tokens','user_domains','user_integrations',
    'perfis_customizados',
    'assinatura_cancelamentos','assinatura_avisos',
    -- Só o admin escreve aqui, e o admin é isento do bloqueio por construção.
    'empresa_exclusoes'
  ]::text[];
$$;
