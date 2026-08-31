-- ============================================================================
-- Bloqueio MANUAL não é conversa de pagamento.
--
-- 🔴 DECISÃO DO LUCAS, 31/08/2026:
--   "quando há um bloqueio [da régua, no dia 30] deve continuar com a cobrança. O que não
--    existe cobrança é aquele que bloqueamos manualmente, pois provavelmente vai ser em um
--    cliente que demos como cortesia."
--
-- O QUE ESTAVA ERRADO. `meu_estado_de_cobranca()` deduzia o motivo só pelo estado da
-- assinatura, então um bloqueio feito pelo painel virava:
--
--   · "Seu pagamento está pendente" + botão "Regularizar", para quem TEM assinatura viva e
--     está pagando em dia — o Stripe continua cobrando e a tela acusa de calote. É o mesmo
--     erro que consertamos em 30/08, agora ao contrário: em vez de acusar quem nunca deveu,
--     acusa quem está pagando.
--   · "Sua assinatura ainda não está ativa" + "Ativar assinatura", para uma CORTESIA — que
--     nunca teve assinatura para ativar. E é esse o caso comum, pelo que o Lucas espera.
--
-- Nos dois, a tela manda a pessoa resolver sozinha um problema que ela não tem e não pode
-- resolver. Quem decidiu foi a equipe; quem resolve é a equipe.
--
-- 🔴 A RÉGUA CONTINUA COMO ESTAVA. Quem tem `inadimplente_desde` deve mesmo, a cobrança segue
-- tentando no Stripe, e a mensagem de pagamento é a certa. Por isso o bloqueio manual só vence
-- quando NÃO há inadimplência: se as duas coisas existirem, a dívida é o que a pessoa
-- consegue resolver, e é dela que a tela fala.
--
-- O painel de admin já fazia essa distinção desde 31/08 (`situacaoNoPainel`, com o crachá
-- "Bloqueada por vocês"). Faltava a tela do cliente aprender a mesma coisa.
-- ============================================================================

create or replace function public.meu_estado_de_cobranca()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'encerrada',  public.minha_empresa_foi_encerrada(),
    'bloqueado',  not public.empresa_plano_ativo(),
    'motivo', (
      select case
        -- Bloqueio feito pelo painel, sem dívida por trás: a tela não fala de pagamento.
        when exists (
               select 1 from public.empresa_bloqueios b
               where b.empresa_id = public.get_my_empresa_id()
             )
             and a.inadimplente_desde is null
          then 'bloqueio_manual'
        when a.plan_status = 'trialing' then 'teste_venceu'
        when a.stripe_subscription_id is not null then 'pagamento_parou'
        else 'nunca_ativou'
      end
      from public.empresa_assinaturas a
      where a.empresa_id = public.get_my_empresa_id()
    ),
    'venceu_em', (
      select a.current_period_end from public.empresa_assinaturas a
      where a.empresa_id = public.get_my_empresa_id() and a.plan_status = 'trialing'
    ),
    'dias_inadimplencia', public.dias_de_inadimplencia(public.get_my_empresa_id()),
    'degrau', public.degrau_da_regua(
                public.dias_de_inadimplencia(public.get_my_empresa_id()))
  );
$$;
