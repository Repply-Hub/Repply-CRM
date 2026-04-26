-- Drop existing views using CASCADE to handle dependencies
DROP VIEW IF EXISTS public.vw_faturamento_mensal CASCADE;
DROP VIEW IF EXISTS public.vw_indicadores_usuario CASCADE;

-- Recreate vw_faturamento_mensal with correct status
CREATE VIEW public.vw_faturamento_mensal AS
 SELECT to_char(date_trunc('month'::text, data_pedido::timestamp with time zone), 'YYYY-MM'::text) AS mes_ano,
    to_char(date_trunc('month'::text, data_pedido::timestamp with time zone), 'Mon/YY'::text) AS mes,
    COALESCE(sum(valor_total), 0::numeric) AS faturamento_total,
    count(id) AS qtd_pedidos_fechados,
        CASE
            WHEN count(id) > 0 THEN COALESCE(sum(valor_total), 0::numeric) / count(id)::numeric
            ELSE 0::numeric
        END AS ticket_medio
   FROM pedidos p
  WHERE status = 'fechamento'::text
  GROUP BY (date_trunc('month'::text, data_pedido::timestamp with time zone))
  ORDER BY (date_trunc('month'::text, data_pedido::timestamp with time zone));

-- Recreate vw_indicadores_usuario with correct status
CREATE VIEW public.vw_indicadores_usuario AS
 SELECT u.id AS usuario_id,
    u.nome AS usuario_nome,
    count(p.id) AS total_pedidos,
    count(p.id) FILTER (WHERE p.status = 'novo_lead'::text) AS qtd_novo_lead,
    count(p.id) FILTER (WHERE p.status = 'elaborando'::text) AS qtd_elaborando,
    count(p.id) FILTER (WHERE p.status = 'enviado'::text) AS qtd_enviado,
    count(p.id) FILTER (WHERE p.status = 'negociacao'::text) AS qtd_negociacao,
    count(p.id) FILTER (WHERE p.status = 'fechamento'::text) AS qtd_fechado,
    count(p.id) FILTER (WHERE p.status = 'perdido'::text) AS qtd_perdido,
        CASE
            WHEN count(p.id) FILTER (WHERE p.status = ANY (ARRAY['fechamento'::text, 'perdido'::text])) > 0 THEN round(100.0 * count(p.id) FILTER (WHERE p.status = 'fechamento'::text)::numeric / count(p.id) FILTER (WHERE p.status = ANY (ARRAY['fechamento'::text, 'perdido'::text]))::numeric, 2)
            ELSE 0::numeric
        END AS taxa_fechamento,
    COALESCE(avg(p.valor_total) FILTER (WHERE p.status = 'fechamento'::text), 0::numeric) AS ticket_medio_fechado,
    COALESCE(avg(EXTRACT(epoch FROM p.updated_at - p.created_at) / 86400::numeric) FILTER (WHERE p.status = ANY (ARRAY['enviado'::text, 'negociacao'::text, 'fechamento'::text])), 0::numeric) AS tempo_medio_ate_orcamento_dias
   FROM usuarios u
     LEFT JOIN pedidos p ON p.usuario_id = u.id
  GROUP BY u.id, u.nome;

-- Recreate dependent view vw_indicadores_vendedor
CREATE VIEW public.vw_indicadores_vendedor AS
 SELECT usuario_id AS vendedor_id,
    usuario_nome AS vendedor_nome,
    total_pedidos,
    qtd_novo_lead,
    qtd_elaborando,
    qtd_enviado,
    qtd_negociacao,
    qtd_fechado,
    qtd_perdido,
    taxa_fechamento,
    ticket_medio_fechado,
    tempo_medio_ate_orcamento_dias
   FROM public.vw_indicadores_usuario;