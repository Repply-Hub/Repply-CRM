-- O toggle "Criação"/"Fechamento" não faz sentido no Dashboard (só em Negócios, onde
-- o usuário está olhando pra negócios individuais) — reverte p_date_field nas 3 RPCs
-- exclusivas do Dashboard, voltando ao comportamento original (sempre filtra por
-- data_pedido). pedidos_stats continua com p_date_field (usada por Negócios via
-- usePedidosStats) e com o fix de performance de 20260811140000 (OR de blocos em vez
-- de CASE) — não é tocada aqui.
DROP FUNCTION IF EXISTS public.dashboard_stats(uuid[], uuid[], date, date, text);

CREATE OR REPLACE FUNCTION public.dashboard_stats(
  p_usuario_ids uuid[] DEFAULT NULL,
  p_fabricante_ids uuid[] DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
)
RETURNS TABLE (
  total_pedidos bigint,
  pedidos_fechados bigint,
  total_faturamento numeric,
  segmentacao_alto bigint,
  segmentacao_medio bigint,
  segmentacao_baixo bigint,
  rendimento_fabricante jsonb,
  rendimento_vendedor jsonb
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      p.status,
      p.valor_total,
      f.nome AS fabricante_nome,
      u.nome AS vendedor_nome
    FROM public.pedidos p
    LEFT JOIN public.fabricantes f ON f.id = p.fabricante_id
    LEFT JOIN public.usuarios u ON u.id = p.usuario_id
    WHERE (p_usuario_ids IS NULL OR p.usuario_id = ANY(p_usuario_ids))
      AND (p_fabricante_ids IS NULL OR p.fabricante_id = ANY(p_fabricante_ids))
      AND (p_date_from IS NULL OR p.data_pedido >= p_date_from)
      AND (p_date_to IS NULL OR p.data_pedido <= p_date_to)
  )
  SELECT
    count(*)::bigint AS total_pedidos,
    count(*) FILTER (WHERE status = 'fechamento')::bigint AS pedidos_fechados,
    coalesce(sum(valor_total) FILTER (WHERE status = 'fechamento'), 0)::numeric AS total_faturamento,
    count(*) FILTER (WHERE coalesce(valor_total, 0) > 100000)::bigint AS segmentacao_alto,
    count(*) FILTER (WHERE coalesce(valor_total, 0) >= 30000 AND coalesce(valor_total, 0) <= 100000)::bigint AS segmentacao_medio,
    count(*) FILTER (WHERE coalesce(valor_total, 0) < 30000)::bigint AS segmentacao_baixo,
    (
      SELECT coalesce(jsonb_agg(jsonb_build_object('fabrica', fabricante_nome, 'valor', total) ORDER BY total DESC), '[]'::jsonb)
      FROM (
        SELECT fabricante_nome, sum(valor_total) AS total
        FROM base
        WHERE status = 'fechamento' AND fabricante_nome IS NOT NULL
        GROUP BY fabricante_nome
      ) rf
    ) AS rendimento_fabricante,
    (
      SELECT coalesce(jsonb_agg(jsonb_build_object('vendedor', vendedor_nome, 'valor', total) ORDER BY total DESC), '[]'::jsonb)
      FROM (
        SELECT vendedor_nome, sum(valor_total) AS total
        FROM base
        WHERE status = 'fechamento' AND vendedor_nome IS NOT NULL
        GROUP BY vendedor_nome
      ) rv
    ) AS rendimento_vendedor
  FROM base;
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_stats(uuid[], uuid[], date, date) TO authenticated;

DROP FUNCTION IF EXISTS public.dashboard_indicadores_vendedor(uuid[], date, date, text);

CREATE OR REPLACE FUNCTION public.dashboard_indicadores_vendedor(
  p_fabricante_ids uuid[] DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
)
RETURNS TABLE (
  usuario_id uuid,
  usuario_nome text,
  total_pedidos bigint,
  qtd_fechado bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    u.id AS usuario_id,
    u.nome AS usuario_nome,
    count(p.id)::bigint AS total_pedidos,
    count(p.id) FILTER (WHERE p.status = 'fechamento')::bigint AS qtd_fechado
  FROM public.usuarios u
  LEFT JOIN public.pedidos p
    ON p.usuario_id = u.id
    AND (p_fabricante_ids IS NULL OR p.fabricante_id = ANY(p_fabricante_ids))
    AND (p_date_from IS NULL OR p.data_pedido >= p_date_from)
    AND (p_date_to IS NULL OR p.data_pedido <= p_date_to)
  WHERE u.deleted_at IS NULL
  GROUP BY u.id, u.nome
  ORDER BY u.nome;
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_indicadores_vendedor(uuid[], date, date) TO authenticated;

DROP FUNCTION IF EXISTS public.dashboard_velocidade_fabricante(uuid[], uuid[], date, date, text);

CREATE OR REPLACE FUNCTION public.dashboard_velocidade_fabricante(
  p_usuario_ids uuid[] DEFAULT NULL,
  p_fabricante_ids uuid[] DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
)
RETURNS TABLE (
  fabricante_id uuid,
  fabricante_nome text,
  total_pedidos bigint,
  dias_medio_resposta numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH base AS (
    SELECT p.id, p.fabricante_id, p.created_at
    FROM public.pedidos p
    WHERE (p_usuario_ids IS NULL OR p.usuario_id = ANY(p_usuario_ids))
      AND (p_fabricante_ids IS NULL OR p.fabricante_id = ANY(p_fabricante_ids))
      AND (p_date_from IS NULL OR p.data_pedido >= p_date_from)
      AND (p_date_to IS NULL OR p.data_pedido <= p_date_to)
  ),
  primeiro_envio AS (
    SELECT DISTINCT ON (h.pedido_id) h.pedido_id, h.created_at AS enviado_em
    FROM public.pedidos_historico_status h
    WHERE h.status_novo = 'enviado'
    ORDER BY h.pedido_id, h.created_at ASC
  )
  SELECT
    f.id AS fabricante_id,
    f.nome AS fabricante_nome,
    count(b.id)::bigint AS total_pedidos,
    ROUND(
      AVG(EXTRACT(EPOCH FROM (pe.enviado_em - b.created_at)) / 86400)
        FILTER (WHERE pe.enviado_em IS NOT NULL),
      1
    ) AS dias_medio_resposta
  FROM base b
  JOIN public.fabricantes f ON f.id = b.fabricante_id
  LEFT JOIN primeiro_envio pe ON pe.pedido_id = b.id
  GROUP BY f.id, f.nome
  ORDER BY dias_medio_resposta DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_velocidade_fabricante(uuid[], uuid[], date, date) TO authenticated;
