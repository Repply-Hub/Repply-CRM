-- Bug: na visão agregada "Todos" (p_usuario_ids NULL), o CTE `metas` somava TODAS as
-- linhas de metas_vendas por fabricante — meta de equipe (usuario_id IS NULL) E toda
-- meta individual de cada vendedor, juntas. Meta individual é uma EXTENSÃO da meta de
-- equipe (ver 20260811170000_plano_vendas_meta_individual_extensao_equipe.sql), não um
-- valor adicional — então uma fábrica com meta de equipe R$150.000 + meta individual de
-- 1 vendedor R$50.000 pra essa mesma fábrica inflava o total pra R$200.000 em vez de
-- manter os R$150.000 (a meta individual já está contida na de equipe).
--
-- Fix: no ramo "Todos" (p_usuario_ids IS NULL), usa a meta de equipe quando ela existir
-- (> 0); só cai pra soma das metas individuais quando NÃO existe meta de equipe
-- cadastrada pra aquela fábrica (empresa que só define metas por vendedor, sem meta de
-- equipe). O ramo filtrado por vendedor(es) específico(s) fica idêntico ao anterior (o
-- WHERE já excluía linhas de equipe nesse caso, então SUM simples continua correto).
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
    SELECT
      m.fabricante_id,
      CASE
        WHEN p_usuario_ids IS NULL THEN COALESCE(
          NULLIF(SUM(m.meta_valor) FILTER (WHERE m.usuario_id IS NULL), 0),
          SUM(m.meta_valor) FILTER (WHERE m.usuario_id IS NOT NULL)
        )
        ELSE SUM(m.meta_valor)
      END AS meta_valor
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
