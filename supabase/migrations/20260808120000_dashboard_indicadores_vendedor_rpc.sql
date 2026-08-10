-- O card "Conversão por Vendedor" do Dashboard (src/pages/Dashboard.tsx) ignorava
-- por completo os filtros de Período/Fabricante do topo da tela: vw_indicadores_usuario
-- (usada por useIndicadoresVendedor) sempre reagrega o histórico INTEIRO de
-- `pedidos` de cada usuário, sem nenhum filtro — cada vez mais caro conforme a
-- base cresce, e mostrando números que não batem com o resto da tela quando um
-- filtro está ativo. Substitui por uma RPC nos mesmos moldes de
-- dashboard_stats/dashboard_velocidade_fabricante (20260722100000/20260806100000):
-- roda como o usuário chamador (SECURITY INVOKER), então a RLS de usuarios/pedidos
-- já escopa por empresa sozinha, sem precisar de parâmetro de empresa.
--
-- O filtro de fabricante/data entra na condição do LEFT JOIN (não num WHERE sobre
-- pedidos) de propósito: essa mesma lista alimenta o seletor "Responsável" e o
-- Plano de Vendas no Dashboard, então todo usuário da empresa precisa continuar
-- aparecendo mesmo com total_pedidos = 0 no período selecionado — só as
-- CONTAGENS são filtradas, nunca quem aparece na lista.
CREATE OR REPLACE FUNCTION public.dashboard_indicadores_vendedor(
  p_fabricante_id uuid DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
)
RETURNS TABLE (
  usuario_id uuid,
  usuario_nome text,
  total_pedidos bigint,
  qtd_fechado bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    u.id AS usuario_id,
    u.nome AS usuario_nome,
    count(p.id)::bigint AS total_pedidos,
    count(p.id) FILTER (WHERE p.status = 'fechamento')::bigint AS qtd_fechado
  FROM public.usuarios u
  LEFT JOIN public.pedidos p
    ON p.usuario_id = u.id
    AND (p_fabricante_id IS NULL OR p.fabricante_id = p_fabricante_id)
    AND (p_date_from IS NULL OR p.data_pedido >= p_date_from)
    AND (p_date_to IS NULL OR p.data_pedido <= p_date_to)
  WHERE u.deleted_at IS NULL
  GROUP BY u.id, u.nome
  ORDER BY u.nome;
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_indicadores_vendedor(uuid, date, date) TO authenticated;
