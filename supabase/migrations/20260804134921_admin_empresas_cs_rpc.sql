-- Aplicada em tres partes (o arquivo unico estourou o tempo limite). As
-- versoes registradas no banco sao 20260804134805 / 134921 / 134949, e os
-- nomes destes arquivos as espelham para o `supabase db push` reconhecer como
-- ja aplicadas em vez de reexecutar.

-- ---------------------------------------------------------------------------
-- 2. Panorama das empresas
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_empresas_cs()
RETURNS TABLE (
  empresa_id UUID,
  nome TEXT,
  codigo_acesso TEXT,
  criada_em TIMESTAMPTZ,
  plan_status TEXT,
  origem TEXT,
  plano_slug TEXT,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN,
  -- Booleano em vez do id: saber SE pagou é o que a tela precisa; o
  -- stripe_customer_id é identificador de cobrança e não tem por que trafegar.
  tem_customer_stripe BOOLEAN,
  usuarios BIGINT,
  usuarios_ativos_7d BIGINT,
  ultimo_acesso TIMESTAMPTZ,
  negocios_30d BIGINT,
  wa_msgs_30d BIGINT,
  emails_30d BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas o administrador global pode consultar as empresas.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH acesso AS (
    -- last_sign_in_at é a única fonte de "usaram quando". Fica em auth.users,
    -- inalcançável pelo cliente — é o motivo desta função existir.
    SELECT u.empresa_id,
           count(*)                                                        AS total,
           count(*) FILTER (WHERE au.last_sign_in_at > now() - interval '7 days') AS ativos,
           max(au.last_sign_in_at)                                         AS ultimo
    FROM public.usuarios u
    JOIN auth.users au ON au.id = u.user_id
    WHERE u.deleted_at IS NULL AND u.empresa_id IS NOT NULL
    GROUP BY u.empresa_id
  ),
  negocios AS (
    -- pedidos não tem empresa_id: o vínculo é usuario_id -> usuarios.empresa_id.
    -- É o mesmo caminho das views vw_faturamento_mensal e vw_indicadores_usuario.
    SELECT u.empresa_id, count(*) AS n
    FROM public.pedidos p
    JOIN public.usuarios u ON u.id = p.usuario_id
    WHERE p.created_at > now() - interval '30 days'
    GROUP BY u.empresa_id
  ),
  wa AS (
    SELECT w.empresa_id, count(*) AS n
    FROM public.whatsapp_mensagens w
    WHERE w.created_at > now() - interval '30 days'
    GROUP BY w.empresa_id
  ),
  em AS (
    SELECT m.empresa_id, count(*) AS n
    FROM public.email_mensagens m
    WHERE m.criado_em > now() - interval '30 days'
    GROUP BY m.empresa_id
  )
  SELECT
    e.id,
    e.nome,
    e.codigo_acesso,
    e.created_at,
    a.plan_status,
    a.origem,
    a.plano_slug,
    a.current_period_end,
    a.cancel_at_period_end,
    (a.stripe_customer_id IS NOT NULL),
    COALESCE(ac.total, 0),
    COALESCE(ac.ativos, 0),
    ac.ultimo,
    COALESCE(ng.n, 0),
    COALESCE(wa.n, 0),
    COALESCE(em.n, 0)
  FROM public.empresas e
  LEFT JOIN public.empresa_assinaturas a ON a.empresa_id = e.id
  LEFT JOIN acesso   ac ON ac.empresa_id = e.id
  LEFT JOIN negocios ng ON ng.empresa_id = e.id
  LEFT JOIN wa          ON wa.empresa_id = e.id
  LEFT JOIN em          ON em.empresa_id = e.id
  ORDER BY ac.ultimo DESC NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_empresas_cs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_empresas_cs() TO authenticated;

