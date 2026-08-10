-- Gestor/admin só conseguia ver o plano de vendas de UM vendedor por vez (via
-- filtro "Responsável" do Dashboard) ou a SOMA da empresa toda ("Todos") — não
-- dava pra ver o detalhamento de cada vendedor lado a lado sem trocar o filtro
-- repetidamente. RPC nova retorna uma linha por (vendedor, fabricante) com meta
-- e vendido, pro card "Plano de Vendas" listar todo mundo de uma vez quando
-- "Todos" está selecionado.
--
-- SECURITY INVOKER: mesma RLS de metas_vendas/pedidos que já protege
-- plano_vendas_progresso escopa aqui sozinha — um vendedor comum que chamasse
-- isso só enxergaria a própria linha (RLS de metas_vendas restringe
-- usuario_id = get_my_usuario_id() pra quem não é gestor), sem precisar
-- replicar a checagem de papel dentro da função. Ignora meta de equipe
-- (usuario_id NULL) de propósito — não é atribuível a nenhum vendedor
-- específico, então não faz sentido aparecer numa lista "por vendedor".
CREATE OR REPLACE FUNCTION public.plano_vendas_progresso_por_vendedor(
  p_ano INTEGER,
  p_mes INTEGER
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
    GROUP BY m.usuario_id, m.fabricante_id
  ),
  vendido AS (
    SELECT p.usuario_id, p.fabricante_id, SUM(p.valor_total) AS vendido_valor
    FROM public.pedidos p
    WHERE p.status = 'fechamento'
      AND p.data_pedido >= make_date(p_ano, p_mes, 1)
      AND p.data_pedido < (make_date(p_ano, p_mes, 1) + INTERVAL '1 month')
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

GRANT EXECUTE ON FUNCTION public.plano_vendas_progresso_por_vendedor(INTEGER, INTEGER) TO authenticated;
