-- 1) Cria obras únicas a partir dos pedidos (cliente + nome extraído de observacoes)
WITH pedidos_com_obra AS (
  SELECT DISTINCT
    p.cliente_id,
    NULLIF(TRIM(SPLIT_PART(p.observacoes, '|', 1)), '') AS nome_obra,
    c.endereco AS endereco_entrega
  FROM public.pedidos p
  JOIN public.clientes c ON c.id = p.cliente_id
  WHERE p.obra_id IS NULL
    AND p.observacoes IS NOT NULL
    AND NULLIF(TRIM(SPLIT_PART(p.observacoes, '|', 1)), '') IS NOT NULL
),
obras_a_criar AS (
  SELECT pco.cliente_id, pco.nome_obra, pco.endereco_entrega
  FROM pedidos_com_obra pco
  WHERE NOT EXISTS (
    SELECT 1 FROM public.obras o
    WHERE o.cliente_id = pco.cliente_id
      AND LOWER(o.nome_obra) = LOWER(pco.nome_obra)
  )
)
INSERT INTO public.obras (cliente_id, nome_obra, endereco_entrega, status)
SELECT cliente_id, nome_obra, endereco_entrega, 'em_andamento'
FROM obras_a_criar;

-- 2) Vincula cada pedido sem obra_id à obra correspondente
UPDATE public.pedidos p
SET obra_id = o.id
FROM public.obras o
WHERE p.obra_id IS NULL
  AND o.cliente_id = p.cliente_id
  AND LOWER(o.nome_obra) = LOWER(NULLIF(TRIM(SPLIT_PART(p.observacoes, '|', 1)), ''));