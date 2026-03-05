
-- =============================================
-- VIEW: vw_indicadores_vendedor
-- =============================================
CREATE OR REPLACE VIEW public.vw_indicadores_vendedor AS
SELECT
  v.id AS vendedor_id,
  v.nome AS vendedor_nome,
  COUNT(p.id) AS total_pedidos,
  COUNT(p.id) FILTER (WHERE p.status = 'novo_lead') AS qtd_novo_lead,
  COUNT(p.id) FILTER (WHERE p.status = 'elaborando_orcamento') AS qtd_elaborando,
  COUNT(p.id) FILTER (WHERE p.status = 'orcamento_enviado') AS qtd_enviado,
  COUNT(p.id) FILTER (WHERE p.status = 'negociacao') AS qtd_negociacao,
  COUNT(p.id) FILTER (WHERE p.status = 'fechado') AS qtd_fechado,
  COUNT(p.id) FILTER (WHERE p.status = 'perdido') AS qtd_perdido,
  CASE
    WHEN COUNT(p.id) > 0
    THEN ROUND(COUNT(p.id) FILTER (WHERE p.status = 'fechado')::numeric / COUNT(p.id) * 100, 1)
    ELSE 0
  END AS taxa_fechamento,
  COALESCE(
    ROUND(AVG(p.valor_total) FILTER (WHERE p.status = 'fechado'), 2),
    0
  ) AS ticket_medio_fechado,
  COALESCE(
    ROUND(AVG(
      EXTRACT(EPOCH FROM (
        (SELECT MIN(hc.data_contato) FROM public.historico_contatos hc WHERE hc.pedido_id = p.id AND hc.tipo = 'automatico')
        - p.created_at
      )) / 86400
    ) FILTER (WHERE p.status IN ('orcamento_enviado','negociacao','fechado','perdido')), 1),
    0
  ) AS tempo_medio_ate_orcamento_dias
FROM public.vendedores v
LEFT JOIN public.pedidos p ON p.vendedor_id = v.id
GROUP BY v.id, v.nome;

-- =============================================
-- VIEW: vw_velocidade_por_fabricante
-- =============================================
CREATE OR REPLACE VIEW public.vw_velocidade_por_fabricante AS
SELECT
  f.id AS fabricante_id,
  f.nome AS fabricante_nome,
  COUNT(p.id) AS total_pedidos,
  COALESCE(
    ROUND(AVG(
      EXTRACT(EPOCH FROM (p.updated_at - p.created_at)) / 86400
    ) FILTER (WHERE p.status IN ('orcamento_enviado','negociacao','fechado','perdido')), 1),
    0
  ) AS tempo_medio_ate_orcamento_dias
FROM public.fabricantes f
LEFT JOIN public.pedidos p ON p.fabricante_id = f.id
GROUP BY f.id, f.nome;

-- =============================================
-- VIEW: vw_faturamento_mensal
-- =============================================
CREATE OR REPLACE VIEW public.vw_faturamento_mensal AS
SELECT
  DATE_TRUNC('month', p.data_pedido)::date AS mes,
  TO_CHAR(p.data_pedido, 'YYYY-MM') AS mes_ano,
  COALESCE(SUM(p.valor_total), 0) AS faturamento_total,
  COUNT(p.id) AS qtd_pedidos_fechados,
  COALESCE(ROUND(AVG(p.valor_total), 2), 0) AS ticket_medio
FROM public.pedidos p
WHERE p.status = 'fechado'
GROUP BY DATE_TRUNC('month', p.data_pedido), TO_CHAR(p.data_pedido, 'YYYY-MM')
ORDER BY mes DESC;
