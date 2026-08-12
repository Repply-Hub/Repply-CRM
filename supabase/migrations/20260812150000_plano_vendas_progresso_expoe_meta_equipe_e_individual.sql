-- Usuário comum (não-gestor) só vê o próprio card do Dashboard, sem acesso ao diálogo
-- "Editar metas" (gestor-only) que já mostra "Meta geral" x "Sua meta" lado a lado. O
-- card, no detalhamento por fabricante, só expunha um `meta_valor` já resolvido (meta de
-- equipe OU individual, nunca os dois) — dava pra ver o alvo certo, mas não dava pra
-- distinguir "quanto é da equipe toda" de "quanto é a minha fatia dentro disso".
--
-- Adiciona meta_equipe_valor e meta_individual_valor ao retorno, só preenchidos quando
-- filtrado por exatamente 1 vendedor (o caso do card do usuário comum, e de um gestor
-- filtrando pra 1 pessoa) — meta_valor (usado pro total/porcentagem do card) continua
-- com a mesma regra "equipe tem prioridade" de antes, sem mudança de comportamento.
DROP FUNCTION IF EXISTS public.plano_vendas_progresso(integer, integer, uuid[], uuid[], boolean);

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
  vendido_valor NUMERIC,
  meta_equipe_valor NUMERIC,
  meta_individual_valor NUMERIC
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH metas AS (
    SELECT
      m.fabricante_id,
      SUM(m.meta_valor) FILTER (WHERE m.usuario_id IS NULL) AS meta_equipe_valor,
      CASE WHEN p_usuario_ids IS NOT NULL AND array_length(p_usuario_ids, 1) = 1
        THEN SUM(m.meta_valor) FILTER (WHERE m.usuario_id = ANY(p_usuario_ids))
        ELSE NULL
      END AS meta_individual_valor,
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
    COALESCE(vendido.vendido_valor, 0) AS vendido_valor,
    COALESCE(metas.meta_equipe_valor, 0) AS meta_equipe_valor,
    COALESCE(metas.meta_individual_valor, 0) AS meta_individual_valor
  FROM metas
  FULL OUTER JOIN vendido ON vendido.fabricante_id = metas.fabricante_id
  JOIN public.fabricantes f ON f.id = COALESCE(metas.fabricante_id, vendido.fabricante_id)
  WHERE NOT p_somente_com_meta OR COALESCE(metas.meta_valor, 0) > 0
  ORDER BY COALESCE(metas.meta_valor, 0) DESC, COALESCE(vendido.vendido_valor, 0) DESC;
$$;

GRANT EXECUTE ON FUNCTION public.plano_vendas_progresso(integer, integer, uuid[], uuid[], boolean) TO authenticated;
