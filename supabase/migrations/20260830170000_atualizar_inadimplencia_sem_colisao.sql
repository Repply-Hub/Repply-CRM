-- 🔴 `column reference "empresa_id" is ambiguous`. O parâmetro de SAÍDA da função chamava-se
-- `empresa_id`, igual à coluna da tabela — e dentro do CTE o Postgres não sabe a qual dos dois
-- o nome se refere.
--
-- 🔴 O PIOR TIPO DE ERRO DE PL/pgSQL: a função COMPILA e só quebra ao ser CHAMADA. Ela passou
-- pela aplicação da migration sem um aviso e apareceu na primeira execução da rotina, em
-- produção, em 30/08/2026.
--
-- Renomear a saída é mais seguro que a diretiva `#variable_conflict`: a diretiva resolve o
-- conflito escondendo-o, e o próximo a mexer aqui recria o problema sem perceber.
--
-- DROP antes do CREATE porque mudar os parâmetros de saída muda o tipo de retorno, e o
-- Postgres recusa o `create or replace` nesse caso.
drop function if exists public.atualizar_inadimplencia();

create function public.atualizar_inadimplencia()
returns table (id_da_empresa uuid, acao text)
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

  -- 🔴 VOLTOU A FICAR EM DIA: zera o relógio E apaga os avisos.
  -- Isto é tão importante quanto marcar. Sem ele, uma empresa que regularizou continuaria com
  -- o relógio andando e seria bloqueada dias depois de ter pago — o pior tipo de erro de
  -- cobrança que existe. E apagar os avisos faz uma recaída futura começar do começo, em vez
  -- de continuar de onde parou e pular direto para um degrau severo.
  return query
  with regularizadas as (
    update public.empresa_assinaturas a
       set inadimplente_desde = null
     where a.inadimplente_desde is not null
       and coalesce(a.subscription_status, '') <> 'past_due'
       and a.plan_status not in ('inactive', 'canceled', 'unpaid')
    returning a.empresa_id as reg_empresa_id
  ), limpeza as (
    delete from public.assinatura_avisos v
     where v.empresa_id in (select reg_empresa_id from regularizadas)
    returning v.empresa_id
  )
  select r.reg_empresa_id, 'regularizou'::text from regularizadas r;
end;
$$;

revoke all on function public.atualizar_inadimplencia() from public, anon, authenticated;
grant execute on function public.atualizar_inadimplencia() to service_role;
