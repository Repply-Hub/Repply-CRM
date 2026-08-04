-- Aplicada em tres partes (o arquivo unico estourou o tempo limite). As
-- versoes registradas no banco sao 20260804134805 / 134921 / 134949, e os
-- nomes destes arquivos as espelham para o `supabase db push` reconhecer como
-- ja aplicadas em vez de reexecutar.

-- =============================================================================
-- PAINEL DE CS — leitura e ação sobre as empresas assinantes
-- =============================================================================
-- O AdminDashboard atual inventa os dados de cobrança (o comentário dele diz
-- "como não existe tabela de assinaturas, vamos simular"). A tabela passou a
-- existir; a tela nunca foi atualizada. Estas funções são a fonte real.
--
-- POR QUE SECURITY DEFINER, CONTRA O PADRÃO DA CASA:
-- dashboard_stats e pedidos_stats são SECURITY INVOKER e confiam no RLS do
-- chamador. Aqui não dá por dois motivos: preciso ler `auth.users`
-- (last_sign_in_at é a única fonte de "última vez que usaram", e o RLS bloqueia
-- o schema auth) e preciso cruzar TODAS as empresas.
--
-- A contrapartida é a checagem de papel DENTRO do corpo, sem exceção. É
-- exatamente o que faltava em restaurar_usuario_por_email — SECURITY DEFINER,
-- GRANT para authenticated e nenhuma checagem — que virou porta de escalação de
-- privilégio e teve de ser corrigida em 20260803140113.

-- ---------------------------------------------------------------------------
-- 1. O gate: trial precisa vencer
-- ---------------------------------------------------------------------------
-- A versão anterior testava só `plan_status NOT IN ('inactive','canceled',
-- 'unpaid')`. Como 'trialing' não está na lista, um teste de 7 dias ficava ativo
-- para sempre — o painel poderia liberar acesso que nunca expira.
--
-- `current_period_end` NULL continua liberando de propósito: o webhook do Stripe
-- já gravou trial sem data (era o bug do current_period_end, corrigido em
-- 03/08), e trancar um cliente por causa de um campo vazio é mais caro que
-- liberar alguém a mais por alguns dias. Só bloqueia quando há data E ela passou.
CREATE OR REPLACE FUNCTION public.empresa_plano_ativo()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT CASE
        WHEN a.plan_status = 'trialing'
          THEN COALESCE(a.current_period_end > now(), true)
        ELSE a.plan_status NOT IN ('inactive', 'canceled', 'unpaid')
      END
      FROM public.empresa_assinaturas a
      WHERE a.empresa_id = public.get_my_empresa_id()
    ),
    true
  ) OR public.is_admin();
$$;

GRANT EXECUTE ON FUNCTION public.empresa_plano_ativo() TO authenticated;

