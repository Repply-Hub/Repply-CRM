-- Acrescenta a admin_empresas_cs as duas datas que o painel precisa distinguir:
-- quando a empresa ENTROU e quando PAGOU.
--
-- POR QUE `ativado_em` SOZINHO NAO RESPONDE "QUANDO PAGOU":
-- nas empresas legacy esse campo guarda o instante em que a migration de
-- grandfathering rodou (03/08 14:02 nas tres, identico) -- e nao um pagamento,
-- porque elas nunca pagaram. Sem o par `tem_assinatura_stripe`, a tela exibiria
-- "pagou em 03/08" para quem nunca passou pelo checkout, inventando receita.
--
-- A funcao devolve os dois fatos crus e deixa a interpretacao para a tela:
--   ativado_em            -> quando o acesso foi liberado, seja como for
--   tem_assinatura_stripe -> se ha assinatura de verdade por tras
--
-- DROP antes do CREATE porque mudar as colunas de retorno muda o tipo da funcao
-- e o Postgres recusa o CREATE OR REPLACE nesse caso.
DROP FUNCTION IF EXISTS public.admin_empresas_cs();

CREATE FUNCTION public.admin_empresas_cs()
RETURNS TABLE (
  empresa_id UUID, nome TEXT, codigo_acesso TEXT, criada_em TIMESTAMPTZ,
  plan_status TEXT, origem TEXT, plano_slug TEXT,
  current_period_end TIMESTAMPTZ, cancel_at_period_end BOOLEAN,
  tem_customer_stripe BOOLEAN,
  tem_assinatura_stripe BOOLEAN,
  ativado_em TIMESTAMPTZ,
  usuarios BIGINT, usuarios_ativos_7d BIGINT, ultimo_acesso TIMESTAMPTZ,
  negocios_30d BIGINT, wa_msgs_30d BIGINT, emails_30d BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas o administrador global pode consultar as empresas.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH acesso AS (
    SELECT u.empresa_id AS eid, count(*) AS total,
           count(*) FILTER (WHERE au.last_sign_in_at > now() - interval '7 days') AS ativos,
           max(au.last_sign_in_at) AS ultimo
    FROM public.usuarios u JOIN auth.users au ON au.id = u.user_id
    WHERE u.deleted_at IS NULL AND u.empresa_id IS NOT NULL
    GROUP BY u.empresa_id
  ),
  negocios AS (
    SELECT u.empresa_id AS eid, count(*) AS n
    FROM public.pedidos p JOIN public.usuarios u ON u.id = p.usuario_id
    WHERE p.created_at > now() - interval '30 days'
    GROUP BY u.empresa_id
  ),
  wamsg AS (
    SELECT w.empresa_id AS eid, count(*) AS n FROM public.whatsapp_mensagens w
    WHERE w.created_at > now() - interval '30 days' GROUP BY w.empresa_id
  ),
  emmsg AS (
    SELECT m.empresa_id AS eid, count(*) AS n FROM public.email_mensagens m
    WHERE m.criado_em > now() - interval '30 days' GROUP BY m.empresa_id
  )
  SELECT e.id, e.nome, e.codigo_acesso, e.created_at,
         a.plan_status, a.origem, a.plano_slug,
         a.current_period_end, a.cancel_at_period_end,
         (a.stripe_customer_id IS NOT NULL),
         (a.stripe_subscription_id IS NOT NULL),
         a.ativado_em,
         COALESCE(ac.total,0), COALESCE(ac.ativos,0), ac.ultimo,
         COALESCE(ng.n,0), COALESCE(wm.n,0), COALESCE(em.n,0)
  FROM public.empresas e
  LEFT JOIN public.empresa_assinaturas a ON a.empresa_id = e.id
  LEFT JOIN acesso ac ON ac.eid = e.id
  LEFT JOIN negocios ng ON ng.eid = e.id
  LEFT JOIN wamsg wm ON wm.eid = e.id
  LEFT JOIN emmsg em ON em.eid = e.id
  ORDER BY ac.ultimo DESC NULLS LAST;
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_empresas_cs() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_empresas_cs() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_empresas_cs() TO authenticated;
