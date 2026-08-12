-- 20260811120000 implementou a escolha de campo de data (criação/fechamento) com um
-- CASE dentro da comparação: `(CASE WHEN p_date_field = 'fechado_em' THEN
-- p.fechado_em::date ELSE p.data_pedido END) >= p_date_from`. Isso quebrou a
-- performance das 4 RPCs em produção (Negócios e Dashboard demorando muito pra
-- carregar): o PostgREST sempre chama RPC via argumentos NOMEADOS
-- (`func(p_a := ..., p_b := ...)`), e um CASE comparando DUAS colunas diferentes
-- dentro de uma função SQL chamada por nome (em vez de posicionalmente) faz o
-- Postgres descartar o Bitmap/Index Scan em idx_pedidos_data_pedido/idx_pedidos_fechado_em
-- e cair num plano genérico — medido em produção: pedidos_stats saltou de ~4ms pra
-- 16-31 SEGUNDOS pra uma tabela de ~15 mil linhas, mesmo com os índices existindo.
-- Chamar com argumento posicional (sem `:=`) ficava rápido, mas não dá pra controlar
-- como o supabase-js monta a chamada RPC.
--
-- Fix: troca o CASE por um OR de dois blocos independentes, cada um comparando UMA
-- coluna só contra uma constante — Postgres consegue gerar um BitmapOr usando os dois
-- índices normalmente (cada branch é sargable por si só), independente de como a
-- função foi chamada. Testado em produção: pedidos_stats caiu pra ~30-200ms.
DROP FUNCTION IF EXISTS public.pedidos_stats(uuid[], text[], uuid[], date, date, text, boolean, uuid, uuid[], boolean, text);

CREATE OR REPLACE FUNCTION public.pedidos_stats(
  p_usuario_ids uuid[] DEFAULT NULL,
  p_stages text[] DEFAULT NULL,
  p_fabricante_ids uuid[] DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_only_attention boolean DEFAULT false,
  p_funil_id uuid DEFAULT NULL,
  p_marcador_ids uuid[] DEFAULT NULL,
  p_hide_importados boolean DEFAULT false,
  p_date_field text DEFAULT 'data_pedido'
)
RETURNS TABLE(total_count bigint, total_valor numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    COUNT(*)::bigint AS total_count,
    COALESCE(SUM(p.valor_total), 0)::numeric AS total_valor
  FROM public.pedidos p
  LEFT JOIN public.clientes c ON c.id = p.cliente_id
  LEFT JOIN public.fabricantes f ON f.id = p.fabricante_id
  LEFT JOIN public.obras o ON o.id = p.obra_id
  WHERE (p_usuario_ids IS NULL OR p.usuario_id = ANY(p_usuario_ids))
    AND (p_stages IS NULL OR p.status = ANY(p_stages))
    AND (p_fabricante_ids IS NULL OR p.fabricante_id = ANY(p_fabricante_ids))
    AND (
      (p_date_field IS DISTINCT FROM 'fechado_em'
        AND (p_date_from IS NULL OR p.data_pedido >= p_date_from)
        AND (p_date_to IS NULL OR p.data_pedido <= p_date_to))
      OR
      (p_date_field = 'fechado_em'
        AND (p_date_from IS NULL OR p.fechado_em::date >= p_date_from)
        AND (p_date_to IS NULL OR p.fechado_em::date <= p_date_to))
    )
    AND (
      p_search IS NULL OR p_search = '' OR
      c.empresa ILIKE '%' || p_search || '%' OR
      f.nome ILIKE '%' || p_search || '%' OR
      o.nome_obra ILIKE '%' || p_search || '%'
    )
    AND (
      NOT p_only_attention OR (
        p.created_at <= now() - interval '7 days'
        AND p.status NOT IN ('fechamento', 'perdido')
      )
    )
    AND (p_funil_id IS NULL OR p.funil_id = p_funil_id)
    AND (p_marcador_ids IS NULL OR p.marcador_id = ANY(p_marcador_ids))
    AND (NOT p_hide_importados OR p.import_hash IS NULL);
$$;

GRANT EXECUTE ON FUNCTION public.pedidos_stats(uuid[], text[], uuid[], date, date, text, boolean, uuid, uuid[], boolean, text) TO authenticated;

DROP FUNCTION IF EXISTS public.dashboard_stats(uuid[], uuid[], date, date, text);

CREATE OR REPLACE FUNCTION public.dashboard_stats(
  p_usuario_ids uuid[] DEFAULT NULL,
  p_fabricante_ids uuid[] DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_date_field text DEFAULT 'data_pedido'
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
      AND (
        (p_date_field IS DISTINCT FROM 'fechado_em'
          AND (p_date_from IS NULL OR p.data_pedido >= p_date_from)
          AND (p_date_to IS NULL OR p.data_pedido <= p_date_to))
        OR
        (p_date_field = 'fechado_em'
          AND (p_date_from IS NULL OR p.fechado_em::date >= p_date_from)
          AND (p_date_to IS NULL OR p.fechado_em::date <= p_date_to))
      )
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

GRANT EXECUTE ON FUNCTION public.dashboard_stats(uuid[], uuid[], date, date, text) TO authenticated;

DROP FUNCTION IF EXISTS public.dashboard_indicadores_vendedor(uuid[], date, date, text);

CREATE OR REPLACE FUNCTION public.dashboard_indicadores_vendedor(
  p_fabricante_ids uuid[] DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_date_field text DEFAULT 'data_pedido'
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
    AND (
      (p_date_field IS DISTINCT FROM 'fechado_em'
        AND (p_date_from IS NULL OR p.data_pedido >= p_date_from)
        AND (p_date_to IS NULL OR p.data_pedido <= p_date_to))
      OR
      (p_date_field = 'fechado_em'
        AND (p_date_from IS NULL OR p.fechado_em::date >= p_date_from)
        AND (p_date_to IS NULL OR p.fechado_em::date <= p_date_to))
    )
  WHERE u.deleted_at IS NULL
  GROUP BY u.id, u.nome
  ORDER BY u.nome;
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_indicadores_vendedor(uuid[], date, date, text) TO authenticated;

DROP FUNCTION IF EXISTS public.dashboard_velocidade_fabricante(uuid[], uuid[], date, date, text);

CREATE OR REPLACE FUNCTION public.dashboard_velocidade_fabricante(
  p_usuario_ids uuid[] DEFAULT NULL,
  p_fabricante_ids uuid[] DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_date_field text DEFAULT 'data_pedido'
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
      AND (
        (p_date_field IS DISTINCT FROM 'fechado_em'
          AND (p_date_from IS NULL OR p.data_pedido >= p_date_from)
          AND (p_date_to IS NULL OR p.data_pedido <= p_date_to))
        OR
        (p_date_field = 'fechado_em'
          AND (p_date_from IS NULL OR p.fechado_em::date >= p_date_from)
          AND (p_date_to IS NULL OR p.fechado_em::date <= p_date_to))
      )
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

GRANT EXECUTE ON FUNCTION public.dashboard_velocidade_fabricante(uuid[], uuid[], date, date, text) TO authenticated;
