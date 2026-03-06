
CREATE OR REPLACE VIEW public.vw_pedidos_inativos
WITH (security_invoker = true) AS
SELECT
  p.id AS pedido_id,
  p.vendedor_id,
  p.cliente_id,
  p.status,
  p.updated_at AS ultima_atualizacao,
  EXTRACT(DAY FROM (now() - p.updated_at))::int AS dias_parado,
  c.empresa AS cliente_nome,
  v.nome AS vendedor_nome,
  ca.valor->>'dias' AS dias_limite
FROM public.pedidos p
JOIN public.clientes c ON c.id = p.cliente_id
JOIN public.vendedores v ON v.id = p.vendedor_id
CROSS JOIN public.configuracoes_automacao ca
WHERE ca.chave = 'alerta_inatividade'
  AND p.status NOT IN ('fechado', 'perdido')
  AND EXTRACT(DAY FROM (now() - p.updated_at)) >= COALESCE((ca.valor->>'dias')::int, 5);
