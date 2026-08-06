-- O card "Velocidade de Resposta por Fábrica" do Dashboard estava travado em
-- zero pra todo mundo: a view vw_velocidade_por_fabricante perdeu a coluna
-- tempo_medio_ate_orcamento_dias numa recriação anterior (só sobrou
-- fabricante_id/nome/empresa_id/total_pedidos) e o frontend hardcodava `dias: 0`
-- com um comentário sinalizando isso (ver src/pages/Dashboard.tsx).
--
-- Substitui por uma RPC que calcula a métrica de verdade — dias entre a criação
-- do negócio e o primeiro envio de orçamento (transição pra status 'enviado' em
-- pedidos_historico_status, alimentada por trigger desde 20260730180000) — e que
-- aceita os mesmos filtros de Período/Responsável/Fabricante que dashboard_stats,
-- já que o card antigo ignorava esses filtros por completo.
--
-- Pedidos sem transição registrada pra 'enviado' (nunca chegaram lá, ou
-- chegaram antes do trigger existir) ficam de fora da média — não entram como
-- zero, porque zero dias significaria "respondido instantaneamente", não "sem
-- dado". O frontend decide como exibir a ausência de dado.
CREATE OR REPLACE FUNCTION public.dashboard_velocidade_fabricante(
  p_usuario_id uuid DEFAULT NULL,
  p_fabricante_id uuid DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
)
RETURNS TABLE (
  fabricante_id uuid,
  fabricante_nome text,
  total_pedidos bigint,
  dias_medio_resposta numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH base AS (
    SELECT p.id, p.fabricante_id, p.created_at
    FROM public.pedidos p
    WHERE (p_usuario_id IS NULL OR p.usuario_id = p_usuario_id)
      AND (p_fabricante_id IS NULL OR p.fabricante_id = p_fabricante_id)
      AND (p_date_from IS NULL OR p.data_pedido >= p_date_from)
      AND (p_date_to IS NULL OR p.data_pedido <= p_date_to)
  ),
  primeiro_envio AS (
    SELECT DISTINCT ON (h.pedido_id) h.pedido_id, h.created_at AS enviado_em
    FROM public.pedidos_historico_status h
    WHERE h.status_novo = 'enviado'
    ORDER BY h.pedido_id, h.created_at ASC
  )
  SELECT
    f.id AS fabricante_id,
    f.nome AS fabricante_nome,
    count(b.id)::bigint AS total_pedidos,
    ROUND(
      AVG(EXTRACT(EPOCH FROM (pe.enviado_em - b.created_at)) / 86400)
        FILTER (WHERE pe.enviado_em IS NOT NULL),
      1
    ) AS dias_medio_resposta
  FROM base b
  JOIN public.fabricantes f ON f.id = b.fabricante_id
  LEFT JOIN primeiro_envio pe ON pe.pedido_id = b.id
  GROUP BY f.id, f.nome
  ORDER BY dias_medio_resposta DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_velocidade_fabricante(uuid, uuid, date, date) TO authenticated;

-- Sustenta o filtro `status_novo = 'enviado'` + DISTINCT ON (pedido_id, created_at)
-- da RPC acima sem sequential scan.
CREATE INDEX IF NOT EXISTS idx_pedidos_historico_status_novo_pedido
  ON public.pedidos_historico_status (status_novo, pedido_id, created_at);
