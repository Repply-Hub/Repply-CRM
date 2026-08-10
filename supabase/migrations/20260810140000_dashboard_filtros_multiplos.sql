-- Os filtros "Fabricante" e "Responsável" do Dashboard passam a aceitar mais de
-- uma seleção (MultiSelectSearch em vez de Select simples). As 5 RPCs que
-- alimentam a tela só aceitavam um único uuid por filtro — troca pra uuid[] com
-- `= ANY(...)`, no mesmo padrão já usado por pedidos_stats (Negócios) desde
-- 20260702000000. NULL continua significando "sem filtro" (não confundir com
-- array vazio — um array vazio faria `= ANY('{}')` não bater com nada; o
-- frontend manda NULL quando nenhum item está selecionado, nunca `[]`).
--
-- CREATE OR REPLACE não basta aqui: mudar o tipo de um parâmetro (uuid -> uuid[])
-- cria uma função NOVA por overload em vez de substituir a antiga — precisa
-- dropar a assinatura antiga explicitamente primeiro, senão as duas ficam
-- coexistindo (ambíguo, e a antiga nunca mais seria chamada pelo frontend mas
-- continuaria ocupando espaço/permissão).

DROP FUNCTION IF EXISTS public.dashboard_stats(uuid, uuid, date, date);

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

DROP FUNCTION IF EXISTS public.dashboard_velocidade_fabricante(uuid, uuid, date, date);

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

DROP FUNCTION IF EXISTS public.dashboard_indicadores_vendedor(uuid, date, date);

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

DROP FUNCTION IF EXISTS public.plano_vendas_progresso(integer, integer, uuid);

CREATE OR REPLACE FUNCTION public.plano_vendas_progresso(
  p_ano INTEGER,
  p_mes INTEGER,
  p_usuario_ids uuid[] DEFAULT NULL,
  p_fabricante_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  fabricante_id UUID,
  fabricante_nome TEXT,
  meta_valor NUMERIC,
  vendido_valor NUMERIC
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH metas AS (
    SELECT m.fabricante_id, SUM(m.meta_valor) AS meta_valor
    FROM public.metas_vendas m
    WHERE m.ano = p_ano AND m.mes = p_mes
      AND (p_usuario_ids IS NULL OR m.usuario_id = ANY(p_usuario_ids))
      AND (p_fabricante_ids IS NULL OR m.fabricante_id = ANY(p_fabricante_ids))
    GROUP BY m.fabricante_id
  ),
  vendido AS (
    SELECT p.fabricante_id, SUM(p.valor_total) AS vendido_valor
    FROM public.pedidos p
    WHERE p.status = 'fechamento'
      AND p.data_pedido >= make_date(p_ano, p_mes, 1)
      AND p.data_pedido < (make_date(p_ano, p_mes, 1) + INTERVAL '1 month')
      AND (p_usuario_ids IS NULL OR p.usuario_id = ANY(p_usuario_ids))
      AND (p_fabricante_ids IS NULL OR p.fabricante_id = ANY(p_fabricante_ids))
    GROUP BY p.fabricante_id
  )
  SELECT
    f.id AS fabricante_id,
    f.nome AS fabricante_nome,
    COALESCE(metas.meta_valor, 0) AS meta_valor,
    COALESCE(vendido.vendido_valor, 0) AS vendido_valor
  FROM metas
  FULL OUTER JOIN vendido ON vendido.fabricante_id = metas.fabricante_id
  JOIN public.fabricantes f ON f.id = COALESCE(metas.fabricante_id, vendido.fabricante_id)
  ORDER BY COALESCE(metas.meta_valor, 0) DESC, COALESCE(vendido.vendido_valor, 0) DESC;
$$;

GRANT EXECUTE ON FUNCTION public.plano_vendas_progresso(integer, integer, uuid[], uuid[]) TO authenticated;

DROP FUNCTION IF EXISTS public.plano_vendas_progresso_por_vendedor(integer, integer);

CREATE OR REPLACE FUNCTION public.plano_vendas_progresso_por_vendedor(
  p_ano INTEGER,
  p_mes INTEGER,
  p_usuario_ids uuid[] DEFAULT NULL,
  p_fabricante_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  usuario_id UUID,
  usuario_nome TEXT,
  fabricante_id UUID,
  fabricante_nome TEXT,
  meta_valor NUMERIC,
  vendido_valor NUMERIC
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH metas AS (
    SELECT m.usuario_id, m.fabricante_id, SUM(m.meta_valor) AS meta_valor
    FROM public.metas_vendas m
    WHERE m.ano = p_ano AND m.mes = p_mes AND m.usuario_id IS NOT NULL
      AND (p_usuario_ids IS NULL OR m.usuario_id = ANY(p_usuario_ids))
      AND (p_fabricante_ids IS NULL OR m.fabricante_id = ANY(p_fabricante_ids))
    GROUP BY m.usuario_id, m.fabricante_id
  ),
  vendido AS (
    SELECT p.usuario_id, p.fabricante_id, SUM(p.valor_total) AS vendido_valor
    FROM public.pedidos p
    WHERE p.status = 'fechamento'
      AND p.data_pedido >= make_date(p_ano, p_mes, 1)
      AND p.data_pedido < (make_date(p_ano, p_mes, 1) + INTERVAL '1 month')
      AND (p_usuario_ids IS NULL OR p.usuario_id = ANY(p_usuario_ids))
      AND (p_fabricante_ids IS NULL OR p.fabricante_id = ANY(p_fabricante_ids))
    GROUP BY p.usuario_id, p.fabricante_id
  )
  SELECT
    u.id AS usuario_id,
    u.nome AS usuario_nome,
    f.id AS fabricante_id,
    f.nome AS fabricante_nome,
    COALESCE(metas.meta_valor, 0) AS meta_valor,
    COALESCE(vendido.vendido_valor, 0) AS vendido_valor
  FROM metas
  FULL OUTER JOIN vendido
    ON vendido.usuario_id = metas.usuario_id AND vendido.fabricante_id = metas.fabricante_id
  JOIN public.usuarios u ON u.id = COALESCE(metas.usuario_id, vendido.usuario_id)
  JOIN public.fabricantes f ON f.id = COALESCE(metas.fabricante_id, vendido.fabricante_id)
  WHERE COALESCE(metas.meta_valor, 0) > 0 OR COALESCE(vendido.vendido_valor, 0) > 0
  ORDER BY u.nome, COALESCE(metas.meta_valor, 0) DESC;
$$;

GRANT EXECUTE ON FUNCTION public.plano_vendas_progresso_por_vendedor(integer, integer, uuid[], uuid[]) TO authenticated;
