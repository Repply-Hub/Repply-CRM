-- Marcadores (tags coloridas) para negócios: "Quente", "Frio" e "Futura" por padrão,
-- com nome/cor editáveis por empresa e criação livre de novos marcadores.

CREATE TABLE public.marcadores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id),
  slug TEXT NOT NULL,
  nome TEXT NOT NULL,
  cor TEXT NOT NULL DEFAULT 'muted-foreground',
  ordem INTEGER NOT NULL DEFAULT 0,
  is_sistema BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, slug)
);

CREATE INDEX idx_marcadores_empresa ON public.marcadores(empresa_id, ordem);

ALTER TABLE public.marcadores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "marcadores_select"
ON public.marcadores FOR SELECT TO authenticated
USING (is_admin() OR empresa_id = get_my_empresa_id());

CREATE POLICY "marcadores_insert"
ON public.marcadores FOR INSERT TO authenticated
WITH CHECK (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id()));

CREATE POLICY "marcadores_update"
ON public.marcadores FOR UPDATE TO authenticated
USING (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id()));

CREATE POLICY "marcadores_delete"
ON public.marcadores FOR DELETE TO authenticated
USING (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id()));

CREATE TRIGGER update_marcadores_updated_at
BEFORE UPDATE ON public.marcadores
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Campo de marcador em negócios (opcional, um único marcador por negócio)
ALTER TABLE public.pedidos ADD COLUMN marcador_id UUID REFERENCES public.marcadores(id) ON DELETE SET NULL;
CREATE INDEX idx_pedidos_marcador_id ON public.pedidos(marcador_id);

-- Popula marcadores padrão para todas as empresas existentes
INSERT INTO public.marcadores (empresa_id, slug, nome, cor, ordem, is_sistema)
SELECT e.id, v.slug, v.nome, v.cor, v.ordem, true
FROM public.empresas e
CROSS JOIN (VALUES
  ('quente', 'Quente', 'destructive', 0),
  ('frio', 'Frio', 'kanban-negotiation', 1),
  ('futura', 'Futura', 'muted-foreground', 2)
) AS v(slug, nome, cor, ordem)
ON CONFLICT (empresa_id, slug) DO NOTHING;

-- Trigger para popular marcadores padrão ao criar uma nova empresa
CREATE OR REPLACE FUNCTION public.criar_marcadores_padrao()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.marcadores (empresa_id, slug, nome, cor, ordem, is_sistema) VALUES
    (NEW.id, 'quente', 'Quente', 'destructive', 0, true),
    (NEW.id, 'frio', 'Frio', 'kanban-negotiation', 1, true),
    (NEW.id, 'futura', 'Futura', 'muted-foreground', 2, true)
  ON CONFLICT (empresa_id, slug) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_criar_marcadores_padrao
AFTER INSERT ON public.empresas
FOR EACH ROW EXECUTE FUNCTION public.criar_marcadores_padrao();

-- RPC pedidos_stats ganha filtro opcional por marcador (parâmetro novo no final, com
-- DEFAULT NULL — não quebra chamadas existentes que não o informam).
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
    AND (NOT p_only_attention OR p.created_at <= now() - interval '7 days')
    AND (p_funil_id IS NULL OR p.funil_id = p_funil_id)
    AND (p_marcador_ids IS NULL OR p.marcador_id = ANY(p_marcador_ids));
$$;

GRANT EXECUTE ON FUNCTION public.pedidos_stats(uuid[], text[], uuid[], date, date, text, boolean, uuid, uuid[]) TO authenticated;
