-- O filtro "Atenção (7+ dias)" não deve contar negócios já encerrados: "Fechamento" (ganho)
-- e "Perdido" são etapas finais e nunca exibem o alerta de "X dias nesta etapa" no front
-- (ver KanbanCard.tsx/Negocios.tsx), então o total/soma do cabeçalho precisa ficar consistente
-- com isso e não somar negócios dessas duas etapas quando o filtro está ligado.
CREATE OR REPLACE FUNCTION public.pedidos_stats(
  p_usuario_ids uuid[] DEFAULT NULL,
  p_stages text[] DEFAULT NULL,
  p_fabricante_ids uuid[] DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_only_attention boolean DEFAULT false,
  p_funil_id uuid DEFAULT NULL,
  p_marcador_ids uuid[] DEFAULT NULL
)
RETURNS TABLE(total_count bigint, total_valor numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    COUNT(*)::bigint AS total_count,
    COALESCE(SUM(p.valor_total), 0)::numeric AS total_valor
  FROM public.pedidos p
  LEFT JOIN public.clientes c ON c.id = p.cliente_id
  LEFT JOIN public.fabricantes f ON f.id = p.fabricante_id
  WHERE (p_usuario_ids IS NULL OR p.usuario_id = ANY(p_usuario_ids))
    AND (p_stages IS NULL OR p.status = ANY(p_stages))
    AND (p_fabricante_ids IS NULL OR p.fabricante_id = ANY(p_fabricante_ids))
    AND (p_date_from IS NULL OR p.data_pedido >= p_date_from)
    AND (p_date_to IS NULL OR p.data_pedido <= p_date_to)
    AND (
      p_search IS NULL OR p_search = '' OR
      c.empresa ILIKE '%' || p_search || '%' OR
      f.nome ILIKE '%' || p_search || '%'
    )
    AND (
      NOT p_only_attention OR (
        p.created_at <= now() - interval '7 days'
        AND p.status NOT IN ('fechamento', 'perdido')
      )
    )
    AND (p_funil_id IS NULL OR p.funil_id = p_funil_id)
    AND (p_marcador_ids IS NULL OR p.marcador_id = ANY(p_marcador_ids));
$$;

GRANT EXECUTE ON FUNCTION public.pedidos_stats(uuid[], text[], uuid[], date, date, text, boolean, uuid, uuid[]) TO authenticated;
