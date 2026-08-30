-- Por que a empresa cancelou — coletado no instante do cancelamento, que é o único em que
-- essa resposta existe. Pedido do Lucas em 29/08/2026.
--
-- Depois que a pessoa cancela, ela não volta para responder pesquisa nenhuma. "Por que os
-- clientes saem" é a informação mais cara de conseguir depois e a mais barata de conseguir
-- agora.

create table if not exists public.assinatura_cancelamentos (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  -- 🔴 `usuarios(id)`, NÃO `usuarios(user_id)`. São identificadores diferentes da mesma
  -- pessoa (CLAUDE.md §4.5), e quem escreve manda `profile.id`.
  -- `on delete set null` porque o motivo continua valendo depois de a pessoa sair da
  -- empresa: o dado que interessa é da EMPRESA, não de quem clicou.
  usuario_id  uuid references public.usuarios(id) on delete set null,
  -- Nulo quando a pessoa não quis escolher — a tela não obriga, de propósito: motivo
  -- obrigatório vira pedágio, e quem quer sair responde qualquer coisa para passar.
  motivo      text,
  detalhe     text,
  criado_em   timestamptz not null default now()
);

comment on table public.assinatura_cancelamentos is
  'Por que cada empresa cancelou. Coletado na tela, no instante do cancelamento. Nunca impede o cancelamento.';

create index if not exists idx_assinatura_cancelamentos_empresa
  on public.assinatura_cancelamentos (empresa_id, criado_em desc);

alter table public.assinatura_cancelamentos enable row level security;

-- ── Quem escreve: só quem responde pela empresa, e só na própria ───────────────────────
-- Mesmo critério da função que abre o portal do Stripe (`stripe-portal`): dono ou gestor.
-- Vendedor comum não cancela, então também não registra motivo.
drop policy if exists assinatura_cancelamentos_insert on public.assinatura_cancelamentos;
create policy assinatura_cancelamentos_insert on public.assinatura_cancelamentos
for insert to authenticated
with check (
  empresa_id = public.get_my_empresa_id()
  and public.is_gestor()
);

-- ── Quem lê: só o admin global ────────────────────────────────────────────────────────
-- 🔴 A EMPRESA NÃO LÊ O PRÓPRIO MOTIVO, e isso é decisão, não descuido. O dado existe para
-- a Repply entender por que perde cliente; devolvê-lo para a tela do cliente convidaria a
-- transformar o campo numa caixa de reclamação com resposta esperada — e não há ninguém do
-- outro lado para responder.
drop policy if exists assinatura_cancelamentos_select on public.assinatura_cancelamentos;
create policy assinatura_cancelamentos_select on public.assinatura_cancelamentos
for select to authenticated
using (public.is_admin());

-- ── Ninguém edita nem apaga ───────────────────────────────────────────────────────────
-- Sem política de UPDATE e DELETE, a RLS recusa as duas por padrão. É registro histórico:
-- mudar depois só serviria para maquiar o motivo de uma saída.

-- ── 🔴 FORA DO BLOQUEIO POR FALTA DE PAGAMENTO ────────────────────────────────────────
-- Sem esta linha, a rotina diária `gate-de-plano-conferencia-diaria` trancaria esta tabela
-- amanhã de manhã — e aí uma empresa inadimplente que quisesse cancelar não conseguiria
-- registrar o motivo. Justamente a que mais interessa entender.
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
    -- Acrescentada em 30/08/2026: quem está inadimplente e quer sair precisa conseguir
    -- dizer por quê.
    'assinatura_cancelamentos'
  ]::text[];
$$;
