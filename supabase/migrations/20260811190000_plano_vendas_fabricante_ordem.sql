-- Permite ao gestor definir a ordem em que os fabricantes aparecem no Plano de
-- Vendas (card do Dashboard e diálogo "Editar metas"), em vez da ordem fixa por
-- valor de meta (maior meta primeiro) que existia até aqui. Guardada por empresa
-- (fabricantes é uma tabela global, sem empresa_id — ver comentário em
-- Dashboard.tsx) e não por vendedor/mês, já que a ordem é uma preferência de
-- exibição da empresa como um todo, não do plano de um vendedor específico.

CREATE TABLE public.plano_vendas_fabricante_ordem (
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  fabricante_id UUID NOT NULL REFERENCES public.fabricantes(id) ON DELETE CASCADE,
  ordem INTEGER NOT NULL,
  PRIMARY KEY (empresa_id, fabricante_id)
);

ALTER TABLE public.plano_vendas_fabricante_ordem ENABLE ROW LEVEL SECURITY;

-- SELECT liberado pra qualquer usuário da empresa (não só gestor): o card do
-- Plano de Vendas é visível a todo mundo, só "Editar metas" (e portanto
-- reordenar) é exclusivo de gestor/admin.
CREATE POLICY "plano_vendas_fabricante_ordem_select" ON public.plano_vendas_fabricante_ordem FOR SELECT TO authenticated
USING (is_admin() OR empresa_id = get_my_empresa_id());

CREATE POLICY "plano_vendas_fabricante_ordem_insert" ON public.plano_vendas_fabricante_ordem FOR INSERT TO authenticated
WITH CHECK (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id()));

CREATE POLICY "plano_vendas_fabricante_ordem_update" ON public.plano_vendas_fabricante_ordem FOR UPDATE TO authenticated
USING (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id()));

CREATE POLICY "plano_vendas_fabricante_ordem_delete" ON public.plano_vendas_fabricante_ordem FOR DELETE TO authenticated
USING (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id()));

-- Mesma assinatura de antes (não precisa DROP FUNCTION) — só troca o ORDER BY:
-- fabricante com ordem customizada definida vai primeiro (na ordem escolhida),
-- o resto continua caindo pro critério antigo (maior meta primeiro), então
-- empresas que nunca usarem "reordenar" mantêm o comportamento de sempre.
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
  LEFT JOIN public.plano_vendas_fabricante_ordem fo
    ON fo.fabricante_id = f.id AND fo.empresa_id = get_my_empresa_id()
  WHERE NOT p_somente_com_meta OR COALESCE(metas.meta_valor, 0) > 0
  ORDER BY COALESCE(fo.ordem, 2147483647), COALESCE(metas.meta_valor, 0) DESC, COALESCE(vendido.vendido_valor, 0) DESC;
$$;

GRANT EXECUTE ON FUNCTION public.plano_vendas_progresso(integer, integer, uuid[], uuid[], boolean) TO authenticated;

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
  LEFT JOIN public.plano_vendas_fabricante_ordem fo
    ON fo.fabricante_id = f.id AND fo.empresa_id = get_my_empresa_id()
  ORDER BY u.nome, COALESCE(fo.ordem, 2147483647), metas.meta_valor DESC;
$$;

GRANT EXECUTE ON FUNCTION public.plano_vendas_progresso_por_vendedor(integer, integer, uuid[], uuid[]) TO authenticated;
