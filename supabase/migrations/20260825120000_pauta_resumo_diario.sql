-- ============================================================================
-- Pauta do dia — fase final: quem recebe o resumo, e o agendamento das 7h
-- ============================================================================
--
-- Plano: docs/operacao/plano-pauta-do-dia.md §7.4.
--
-- A DECISÃO DE QUEM RECEBE MORA AQUI, NÃO NA FUNÇÃO DE SERVIDOR
--
-- Três condições e todas vivem no banco, junto da configuração que as define:
--
--   1. a empresa tem a seção "hoje" ligada       (`empresa_tem_secao_de`)
--   2. o gestor ligou o resumo diário            (`pauta_resumo_email`)
--   3. hoje é um dos dias que ele escolheu       (`pauta_dias_da_semana`)
--
-- Pôr isso na função de servidor significaria reimplementar em TypeScript o que o
-- `pauta_do_dia_de` já resolve em SQL — e no dia em que a regra mudasse, uma das duas
-- ficaria para trás. A função de servidor só pergunta "para quem eu mando?" e manda.
--
-- 🔴 QUEM ESTÁ COM A PAUTA VAZIA NÃO RECEBE NADA, e essa condição NÃO está aqui: ela é a
-- própria `pauta_do_dia_de` devolver zero linha, o que a função de servidor confere antes de
-- enviar. Medido em 25/08/2026: com o resumo ligado na MD, 13 pessoas passam pelas três
-- condições acima e só 8 têm item na pauta. As outras 5 não devem receber "você não tem nada
-- hoje" — é o caminho mais rápido para alguém criar uma regra de filtro e nunca mais ver o
-- e-mail.
-- ============================================================================

create or replace function public.pauta_resumo_destinatarios()
returns table (
  usuario_id uuid,
  nome       text,
  email      text,
  empresa_id uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_dow integer;
begin
  -- Dia da semana em Natal, não em UTC. O banco roda UTC: às 7h de Brasília já é o MESMO
  -- dia lá, mas num agendamento perto da meia-noite a diferença viraria "manda no dia
  -- errado". Fixar o fuso aqui tira a dúvida de quem for mexer no horário depois.
  --
  -- 0 = domingo … 6 = sábado, igual ao `getDay()` do JavaScript que a tela de Automação usa
  -- para gravar. Os dois lados falam a mesma numeração de propósito.
  v_dow := extract(dow from (now() at time zone 'America/Sao_Paulo'))::integer;

  return query
  select u.id, u.nome, a.email::text, u.empresa_id
  from usuarios u
  join auth.users a on a.id = u.user_id
  where u.deleted_at is null
    -- Sem endereço não há para onde mandar. `auth.users.email` é o endereço de LOGIN, o
    -- mesmo que já recebe os e-mails de senha — `usuarios.email` pode estar velho.
    and a.email is not null
    and empresa_tem_secao_de(u.empresa_id, 'hoje')
    and coalesce(
      (select (c.valor #>> '{}')::boolean
         from configuracoes_automacao c
        where c.empresa_id = u.empresa_id and c.chave = 'pauta_resumo_email'),
      false)                                   -- ausência de linha = DESLIGADO, aqui
    and v_dow = any(
      coalesce(
        (select array(select jsonb_array_elements_text(c.valor)::integer)
           from configuracoes_automacao c
          where c.empresa_id = u.empresa_id and c.chave = 'pauta_dias_da_semana'),
        array[1, 2, 3, 4, 5])                  -- ausência de linha = segunda a sexta
    );
end;
$$;

comment on function public.pauta_resumo_destinatarios() is
  'Quem deve receber o resumo diário da pauta HOJE: seção "hoje" ligada, resumo ligado pelo '
  'gestor, e hoje entre os dias escolhidos. NÃO confere se a pauta da pessoa está vazia — '
  'isso é a própria pauta_do_dia_de devolver zero, conferido por quem envia.';

-- Só o robô executa. A lista traz o e-mail de todo mundo da empresa: nas mãos de um usuário
-- logado seria um jeito de exportar a agenda de contatos da equipe.
revoke all on function public.pauta_resumo_destinatarios() from public;
revoke all on function public.pauta_resumo_destinatarios() from anon, authenticated;
grant execute on function public.pauta_resumo_destinatarios() to service_role;

-- ── O agendamento ──────────────────────────────────────────────────────────
--
-- 7h de Brasília = 10:00 UTC. O `pg_cron` deste projeto trabalha em UTC, e o Brasil não tem
-- horário de verão desde 2019 — então é fixo, sem a armadilha de o horário andar em outubro.
--
-- Uma vez por dia, não a cada N minutos: se a função falhar num dia, a pauta daquele dia
-- passou. Repetir tentaria mandar o mesmo resumo duas vezes, o que é pior que não mandar.
-- A função é idempotente por dia (ver o registro em `automation_logs`), mas o agendamento
-- não conta com isso.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'pauta-resumo-diario') then
    perform cron.unschedule('pauta-resumo-diario');
  end if;
end $$;

select cron.schedule(
  'pauta-resumo-diario',
  '0 10 * * *',
  $$ select public.chamar_edge_function('pauta-resumo-diario', '{}'::jsonb, 300000, true) $$
);
