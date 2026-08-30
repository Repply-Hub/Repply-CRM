-- A régua de cobrança: de "o cartão falhou" até "a equipe decide excluir", em 90 dias.
-- Etapa 4 do desenho aprovado em 29/08/2026.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 🔴 A DECISÃO QUE MANDA NESTE ARQUIVO: A RÉGUA É DERIVADA, NÃO GUARDADA
-- ═══════════════════════════════════════════════════════════════════════════════════════
--
-- O caminho óbvio seria a rotina diária escrever `plan_status = 'unpaid'` no dia 15. Ele NÃO
-- funciona, e o motivo é fácil de não enxergar:
--
--   Quando o cartão falha, o Stripe manda `past_due`. O nosso webhook considera esse status
--   LIBERADO (`stripe-webhook/index.ts:15`) e grava `plan_status = 'active'`, guardando o
--   valor cru do Stripe em `subscription_status`. Isso está CERTO — é a tolerância: nos
--   primeiros dias tudo continua funcionando enquanto o Stripe retenta.
--
--   Mas o Stripe retenta VÁRIAS VEZES, e cada retentativa dispara o webhook de novo. Se a
--   rotina tivesse escrito 'unpaid' no dia 15, a retentativa do dia 16 escreveria 'active'
--   por cima. A empresa voltaria a escrever sozinha, e ninguém entenderia por quê.
--
-- Por isso guardamos UM dado só — `inadimplente_desde` — e todo o resto é conta feita na
-- hora, a partir dele. Não há estado para o webhook atropelar, nem dois lugares para
-- divergir.
--
-- Os degraus, todos derivados de `inadimplente_desde`:
--
--     dias  1–14   tolerância        tudo funciona · faixa amarela · e-mail nos dias 1 e 10
--     dia   15     somente leitura   vê e exporta · não escreve · e-mails 15 e 23
--     dia   30     suspensão         tela cobrindo o app · e-mails 30, 45, 60 e 83
--     dia   90     fim do prazo      aparece no painel para a EQUIPE decidir
--
-- 🔴 O dia 90 NÃO apaga nada sozinho. Decisão do Lucas: o sistema avisa, a equipe confirma.

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 1. O único dado guardado
-- ═══════════════════════════════════════════════════════════════════════════════════════

alter table public.empresa_assinaturas
  add column if not exists inadimplente_desde timestamptz;

comment on column public.empresa_assinaturas.inadimplente_desde is
  'Quando o pagamento comecou a falhar. NULO = em dia. Todos os degraus da regua sao contados a partir daqui, nunca guardados.';

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 2. Em que degrau a empresa está — a conta, num lugar só
-- ═══════════════════════════════════════════════════════════════════════════════════════
--
-- Devolve o número de dias desde que o pagamento falhou, ou NULL para quem está em dia.
-- Quem precisa do degrau em texto usa `public.degrau_da_regua`.

create or replace function public.dias_de_inadimplencia(p_empresa_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when a.inadimplente_desde is null then null
    else greatest(0, (extract(epoch from (now() - a.inadimplente_desde)) / 86400)::integer)
  end
  from public.empresa_assinaturas a
  where a.empresa_id = p_empresa_id;
$$;

create or replace function public.degrau_da_regua(p_dias integer)
returns text
language sql
immutable
as $$
  select case
    when p_dias is null then 'em_dia'
    when p_dias < 15    then 'tolerancia'
    when p_dias < 30    then 'somente_leitura'
    when p_dias < 90    then 'suspensa'
    else 'prazo_esgotado'
  end;
$$;

comment on function public.degrau_da_regua(integer) is
  'Traduz dias de inadimplencia no degrau da regua. Imutavel de proposito: e so uma tabela de faixas.';

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 3. 🔴 O GATE PASSA A ENXERGAR A RÉGUA
-- ═══════════════════════════════════════════════════════════════════════════════════════
--
-- ⚠️ ESTA FUNÇÃO GUARDA 135 POLÍTICAS, em 45 tabelas. Errar aqui tranca ou destranca a base
-- inteira de uma vez. Duas propriedades foram preservadas com cuidado:
--
--   1. O `OR public.is_admin()` no fim continua — admin global nunca cai no bloqueio.
--   2. Nenhuma coluna entra como argumento, então o Postgres continua resolvendo isto como
--      One-Time Filter: 1,7 ms UMA VEZ POR COMANDO, não por linha. Passar `empresa_id` como
--      parâmetro aqui seria a armadilha do CLAUDE.md §7.9, que já transformou 4 ms em 16
--      segundos noutra função deste projeto.
--
-- O que muda: além do `plan_status`, agora também bloqueia quem passou de 15 dias de
-- inadimplência. É o degrau "somente leitura" — e ele existe justamente porque o
-- `plan_status` fica 'active' durante o past_due, então sem esta cláusula a régua nunca
-- morderia.

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
        -- Teste liberado pelo painel: vale até a data marcada. Data ausente continua
        -- liberando — o webhook do Stripe já gravou trial sem `current_period_end`, e
        -- trancar por campo vazio custa mais que liberar.
        when a.plan_status = 'trialing'
          then coalesce(a.current_period_end > now(), true)
        -- 🔴 A RÉGUA. 15 dias é onde a tolerância acaba.
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
-- 4. Os avisos já enviados — o que impede a rotina de virar spam
-- ═══════════════════════════════════════════════════════════════════════════════════════
--
-- 🔴 SEM ISTO, UM CRON DIÁRIO MANDA O MESMO E-MAIL 90 VEZES. É o erro clássico desse tipo de
-- rotina, e ele só aparece depois que o cliente já recebeu 30 mensagens iguais.
--
-- A chave única (empresa, dia_da_regua) é a garantia: rodar a rotina duas vezes no mesmo dia,
-- ou reprocessar um dia antigo, não reenvia nada.

create table if not exists public.assinatura_avisos (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.empresas(id) on delete cascade,
  -- O dia da régua em que o aviso saiu (1, 10, 15, 23, 30, 45, 60, 83).
  dia_da_regua  integer not null,
  degrau        text not null,
  -- Quantos gestores receberam. Zero = ninguém tinha e-mail utilizável, e isso precisa
  -- aparecer no painel em vez de sumir.
  destinatarios integer not null default 0,
  enviado_em    timestamptz not null default now(),
  unique (empresa_id, dia_da_regua)
);

comment on table public.assinatura_avisos is
  'Um aviso de cobranca por empresa e por dia da regua. A chave unica e o que impede a rotina diaria de reenviar.';

create index if not exists idx_assinatura_avisos_empresa
  on public.assinatura_avisos (empresa_id, enviado_em desc);

alter table public.assinatura_avisos enable row level security;

-- Só o admin lê. A empresa recebe o e-mail e vê a faixa; não precisa da nossa contabilidade
-- de quantas vezes já foi avisada.
drop policy if exists assinatura_avisos_select on public.assinatura_avisos;
create policy assinatura_avisos_select on public.assinatura_avisos
for select to authenticated
using (public.is_admin());

-- Quem escreve é a rotina, com chave de serviço — que ignora RLS por definição. Nenhuma
-- política de escrita para `authenticated`, de propósito.

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 5. Fora do bloqueio
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- Sem isto a rotina diária trancaria as duas tabelas amanhã de manhã. `assinatura_avisos` só
-- é escrita pela chave de serviço, e `assinatura_cancelamentos` já entrou ontem.

create or replace function public.tabelas_fora_do_gate()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array[
    'usuarios',
    'empresas',
    'empresa_assinaturas',
    'notificacoes_leituras',
    'chat_mensagens_leituras',
    'whatsapp_conversa_visualizacoes',
    'notificacoes',
    'sidebar_preferences',
    'app_erros',
    'automation_logs',
    'audit_permissoes',
    'historico_alteracoes',
    'debug_logs',
    'secao_presets',
    'secao_preset_itens',
    'licencas_natal',
    'licencas_idema',
    'licencas_extremoz',
    'gmail_tokens',
    'user_domains',
    'user_integrations',
    'perfis_customizados',
    'assinatura_cancelamentos',
    'assinatura_avisos'
  ]::text[];
$$;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 6. Quem a régua alcança — e quem ela NUNCA alcança
-- ═══════════════════════════════════════════════════════════════════════════════════════
--
-- 🔴 SÓ QUEM PAGA PELO STRIPE. Decisão do Lucas em 29/08/2026: cortesia e as empresas
-- antigas ("legacy") ficam FORA, no controle manual da equipe. Hoje isso significa que a
-- régua vale para 1 empresa das 10 — e nenhum cliente atual corre risco de ser bloqueado
-- por engano.
--
-- `stripe_subscription_id` é o sinal de assinatura de verdade. NÃO `stripe_customer_id`:
-- este nasce quando a pessoa ABRE o checkout, antes de qualquer cobrança, e usá-lo aqui
-- colocaria na régua de inadimplência quem nunca pagou um centavo.

create or replace function public.empresas_na_regua()
returns table (
  empresa_id   uuid,
  nome         text,
  dias         integer,
  degrau       text,
  desde        timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.id,
    e.nome,
    greatest(0, (extract(epoch from (now() - a.inadimplente_desde)) / 86400)::integer),
    public.degrau_da_regua(
      greatest(0, (extract(epoch from (now() - a.inadimplente_desde)) / 86400)::integer)),
    a.inadimplente_desde
  from public.empresas e
  join public.empresa_assinaturas a on a.empresa_id = e.id
  where a.inadimplente_desde is not null
    and a.origem = 'stripe'
    and a.stripe_subscription_id is not null
  order by a.inadimplente_desde;
$$;

revoke all on function public.empresas_na_regua() from public, anon;
grant execute on function public.empresas_na_regua() to service_role, authenticated;
-- `authenticated` porque o painel de admin lê esta lista; a própria função não vaza nada
-- entre empresas (devolve só nome e datas) e o painel já exige is_admin() na tela.

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 7. A rotina diária: marca e desmarca quem está inadimplente
-- ═══════════════════════════════════════════════════════════════════════════════════════
--
-- Roda antes do envio dos e-mails. Faz duas coisas, e nada além disso:
--   - começa a contar para quem o Stripe marcou como `past_due` e ainda não estava contando;
--   - PARA de contar para quem voltou a ficar em dia.
--
-- 🔴 O SEGUNDO É TÃO IMPORTANTE QUANTO O PRIMEIRO. Sem ele, uma empresa que regularizou
-- continuaria com o relógio andando e seria bloqueada dias depois de ter pago — o pior tipo
-- de erro de cobrança que existe.

create or replace function public.atualizar_inadimplencia()
returns table (empresa_id uuid, acao text)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Começou a falhar: marca a data de hoje.
  return query
  update public.empresa_assinaturas a
     set inadimplente_desde = now()
   where a.subscription_status = 'past_due'
     and a.inadimplente_desde is null
     and a.origem = 'stripe'
     and a.stripe_subscription_id is not null
  returning a.empresa_id, 'comecou'::text;

  -- Voltou a ficar em dia: zera o relógio E apaga os avisos, para que uma recaída futura
  -- comece do começo em vez de continuar de onde parou.
  return query
  with regularizadas as (
    update public.empresa_assinaturas a
       set inadimplente_desde = null
     where a.inadimplente_desde is not null
       and coalesce(a.subscription_status, '') <> 'past_due'
       and a.plan_status not in ('inactive', 'canceled', 'unpaid')
    returning a.empresa_id
  ), limpeza as (
    delete from public.assinatura_avisos v
     where v.empresa_id in (select empresa_id from regularizadas)
    returning v.empresa_id
  )
  select r.empresa_id, 'regularizou'::text from regularizadas r;
end;
$$;

revoke all on function public.atualizar_inadimplencia() from public, anon, authenticated;
grant execute on function public.atualizar_inadimplencia() to service_role;
