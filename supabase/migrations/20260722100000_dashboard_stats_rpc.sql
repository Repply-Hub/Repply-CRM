-- O Dashboard (src/pages/Dashboard.tsx) buscava até 500 linhas de `pedidos` com 4
-- joins (usePedidos(empresaId, 0, 500)) só para somar/contar/agrupar tudo em
-- JavaScript no cliente — o mesmo anti-padrão já documentado no CLAUDE.md do
-- projeto (pedidos pode ter milhares de linhas). Substitui isso por uma única
-- RPC agregada, nos mesmos moldes de pedidos_stats (20260702000000): roda como o
-- usuário chamador (SECURITY INVOKER), então a RLS de pedidos já restringe à
-- empresa do usuário sozinha — sem precisar de um parâmetro de empresa.
CREATE OR REPLACE FUNCTION public.dashboard_stats(
  p_usuario_id uuid DEFAULT NULL,
  p_fabricante_id uuid DEFAULT NULL,
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
    WHERE (p_usuario_id IS NULL OR p.usuario_id = p_usuario_id)
      AND (p_fabricante_id IS NULL OR p.fabricante_id = p_fabricante_id)
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

GRANT EXECUTE ON FUNCTION public.dashboard_stats(uuid, uuid, date, date) TO authenticated;

-- Índices que faltavam nas colunas mais filtradas de `pedidos` (RLS via usuario_id
-- em toda query, e status/fabricante_id/data_pedido nos filtros do Dashboard,
-- Negócios e nas views vw_faturamento_mensal/vw_indicadores_usuario/
-- vw_velocidade_por_fabricante). Sem eles, tanto esta RPC quanto as views faziam
-- sequential scan na tabela inteira a cada carregamento.
CREATE INDEX IF NOT EXISTS idx_pedidos_usuario_id ON public.pedidos (usuario_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_status ON public.pedidos (status);
CREATE INDEX IF NOT EXISTS idx_pedidos_fabricante_id ON public.pedidos (fabricante_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_data_pedido ON public.pedidos (data_pedido);
