-- Metas individuais são uma extensão da meta de equipe, não um bucket paralelo pra
-- exibição "por vendedor": um negócio fechado numa fábrica em que o vendedor não tem
-- meta INDIVIDUAL (só meta de equipe, ou nenhuma) não deve mais aparecer nem contar no
-- "Por vendedor" do Dashboard nem na visão detalhada de 1 vendedor só.
--
-- plano_vendas_progresso_por_vendedor: já filtrava usuario_id IS NOT NULL (só metas
-- individuais na consulta), mas o FULL OUTER JOIN com `vendido` + `WHERE meta > 0 OR
-- vendido > 0` deixava passar fabricante com venda mas SEM meta individual (linha
-- "meta não definida" hoje). Troca pra INNER JOIN a partir de `metas` (exige meta
-- individual > 0) com LEFT JOIN em `vendido` — vendas sem meta individual somem tanto
-- da lista quanto do total.
DROP FUNCTION IF EXISTS public.plano_vendas_progresso_por_vendedor(integer, integer, uuid[], uuid[]);

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
    HAVING SUM(m.meta_valor) > 0
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
    metas.meta_valor AS meta_valor,
    COALESCE(vendido.vendido_valor, 0) AS vendido_valor
  FROM metas
  JOIN public.usuarios u ON u.id = metas.usuario_id
  JOIN public.fabricantes f ON f.id = metas.fabricante_id
  LEFT JOIN vendido ON vendido.usuario_id = metas.usuario_id AND vendido.fabricante_id = metas.fabricante_id
  ORDER BY u.nome, metas.meta_valor DESC;
$$;

GRANT EXECUTE ON FUNCTION public.plano_vendas_progresso_por_vendedor(integer, integer, uuid[], uuid[]) TO authenticated;

-- plano_vendas_progresso: usada tanto pro total agregado da empresa ("Todos", inclui
-- metas de equipe) quanto pra visão detalhada de 1 vendedor só (mostrarDetalhado). Novo
-- p_somente_com_meta (default false, preserva o comportamento atual pra "Todos") — o
-- frontend manda true só quando filtra por exatamente 1 vendedor, pra aplicar a mesma
-- regra acima (só fábrica com meta individual > 0 aparece/soma).
DROP FUNCTION IF EXISTS public.plano_vendas_progresso(integer, integer, uuid[], uuid[]);

CREATE OR REPLACE FUNCTION public.plano_vendas_progresso(
  p_ano INTEGER,
  p_mes INTEGER,
  p_usuario_ids uuid[] DEFAULT NULL,
  p_fabricante_ids uuid[] DEFAULT NULL,
  p_somente_com_meta boolean DEFAULT false
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
  WHERE NOT p_somente_com_meta OR COALESCE(metas.meta_valor, 0) > 0
  ORDER BY COALESCE(metas.meta_valor, 0) DESC, COALESCE(vendido.vendido_valor, 0) DESC;
$$;

GRANT EXECUTE ON FUNCTION public.plano_vendas_progresso(integer, integer, uuid[], uuid[], boolean) TO authenticated;
