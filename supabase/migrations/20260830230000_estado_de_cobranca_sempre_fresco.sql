-- ============================================================================
-- O estado de cobrança de quem está logado, direto do banco, numa consulta só.
--
-- 🔴 POR QUE ISTO EXISTE. Relato do Lucas em 30/08/2026, depois de bloquear a empresa de
-- testes pelo painel de admin:
--
--    "fiz o teste de bloquear e mesmo assim ainda era possível de eu clicar em criar
--     contatos, criar negócios, etc, não aparecia nenhum aviso de bloqueio"
--
-- O banco estava certo: `empresa_plano_ativo()` já devolvia falso e a gravação era recusada.
-- Errada estava a TELA. Ela decidia o que mostrar lendo o perfil que o navegador carrega uma
-- vez, no login, e guarda. Bloquear alguém com o sistema aberto não mexe nesse retrato — então
-- nenhum aviso aparecia, a pessoa preenchia o formulário inteiro e só descobria no salvar.
--
-- Esta função é a fonte que NÃO envelhece. A tela pergunta ao banco, e o banco responde com o
-- que vale agora.
--
-- 🔴 UMA CHAMADA, NÃO SEIS. A tela precisa de seis respostas para escolher o que dizer
-- (encerrada? bloqueada? por quê? há quantos dias? em que degrau?). Seis consultas seriam
-- seis idas ao servidor a cada troca de tela, num caminho que roda em TODA página do app.
-- Um `jsonb` só resolve em uma.
--
-- 🔴 NÃO DECIDE NADA — só junta. Cada resposta vem da função que já era a dona dela
-- (`empresa_plano_ativo`, `degrau_da_regua`, `minha_empresa_foi_encerrada`). Reescrever
-- qualquer uma dessas regras aqui criaria a divergência clássica: o banco recusando por um
-- critério e a tela avisando por outro.
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
    -- Por que esta bloqueado, para a faixa escolher o texto certo. Ver `motivoDoBloqueio`
    -- no frontend: dizer "regularize seu pagamento" para quem nunca pagou e acusar de calote
    -- quem nao deve nada.
    'motivo', (
      select case
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

comment on function public.meu_estado_de_cobranca() is
  'Estado de cobranca da empresa de quem esta logado, sempre atual. A tela usa no lugar do '
  'perfil guardado no login, que nao acompanha bloqueio feito no meio da sessao.';

grant execute on function public.meu_estado_de_cobranca() to authenticated;
