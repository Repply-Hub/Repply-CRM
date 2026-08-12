-- Bug: quando `p_usuario_ids` filtra por UM vendedor só (visão restrita do próprio
-- vendedor no Dashboard, ou um gestor filtrando "Responsável" pra uma pessoa), o WHERE
-- `m.usuario_id = ANY(p_usuario_ids)` excluía TODA linha de meta de equipe (usuario_id
-- IS NULL nunca bate em ANY(array)) — então o vendedor só via a própria meta individual,
-- nunca a meta geral da empresa pra aquele fabricante, mesmo tendo permissão de leitura
-- via RLS (metas_vendas_select já libera equipe pra empresa toda).
--
-- Fix: no ramo de exatamente 1 vendedor, deixa a linha de equipe entrar no grupo e
-- aplica a mesma regra "equipe tem prioridade, individual é fallback" já usada no ramo
-- agregado ("Todos", p_usuario_ids NULL) — ver 20260812120000. Pra 2+ vendedores
-- selecionados, comportamento IGUAL a antes: só soma metas individuais desses
-- vendedores, sem meta de equipe (evita mistura de "meta da empresa toda" com "soma de
-- alguns vendedores").
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
        WHEN p_usuario_ids IS NULL OR array_length(p_usuario_ids, 1) = 1 THEN COALESCE(
          NULLIF(SUM(m.meta_valor) FILTER (WHERE m.usuario_id IS NULL), 0),
          SUM(m.meta_valor) FILTER (WHERE m.usuario_id IS NOT NULL)
        )
        ELSE SUM(m.meta_valor)
      END AS meta_valor
    FROM public.metas_vendas m
    WHERE m.ano = p_ano AND m.mes = p_mes
      AND (
        p_usuario_ids IS NULL
        OR m.usuario_id = ANY(p_usuario_ids)
        OR (array_length(p_usuario_ids, 1) = 1 AND m.usuario_id IS NULL)
      )
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
