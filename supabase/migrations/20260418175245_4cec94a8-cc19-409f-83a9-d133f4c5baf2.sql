-- Tabela de colunas customizadas do Kanban por empresa
CREATE TABLE public.kanban_colunas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL,
  slug TEXT NOT NULL,
  nome TEXT NOT NULL,
  cor TEXT NOT NULL DEFAULT 'kanban-new',
  ordem INTEGER NOT NULL DEFAULT 0,
  is_sistema BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, slug)
);

CREATE INDEX idx_kanban_colunas_empresa ON public.kanban_colunas(empresa_id, ordem);

ALTER TABLE public.kanban_colunas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kanban_colunas_select"
ON public.kanban_colunas FOR SELECT TO authenticated
USING (is_admin() OR empresa_id = get_my_empresa_id());

CREATE POLICY "kanban_colunas_insert"
ON public.kanban_colunas FOR INSERT TO authenticated
WITH CHECK (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id()));

CREATE POLICY "kanban_colunas_update"
ON public.kanban_colunas FOR UPDATE TO authenticated
USING (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id()));

CREATE POLICY "kanban_colunas_delete"
ON public.kanban_colunas FOR DELETE TO authenticated
USING (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id()));

CREATE TRIGGER update_kanban_colunas_updated_at
BEFORE UPDATE ON public.kanban_colunas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Popular colunas padrão para todas as empresas existentes
INSERT INTO public.kanban_colunas (empresa_id, slug, nome, cor, ordem, is_sistema)
SELECT e.id, v.slug, v.nome, v.cor, v.ordem, true
FROM public.empresas e
CROSS JOIN (VALUES
  ('novo_lead', 'Novo Lead', 'kanban-new', 0),
  ('elaboracao', 'Elaboração de Orçamento', 'kanban-budget', 1),
  ('enviado', 'Orçamento Enviado', 'kanban-sent', 2),
  ('negociacao', 'Negociação', 'kanban-negotiation', 3),
  ('fechamento', 'Fechamento', 'kanban-closed', 4)
) AS v(slug, nome, cor, ordem)
ON CONFLICT (empresa_id, slug) DO NOTHING;

-- Trigger para popular colunas padrão ao criar nova empresa
CREATE OR REPLACE FUNCTION public.criar_kanban_colunas_padrao()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.kanban_colunas (empresa_id, slug, nome, cor, ordem, is_sistema) VALUES
    (NEW.id, 'novo_lead', 'Novo Lead', 'kanban-new', 0, true),
    (NEW.id, 'elaboracao', 'Elaboração de Orçamento', 'kanban-budget', 1, true),
    (NEW.id, 'enviado', 'Orçamento Enviado', 'kanban-sent', 2, true),
    (NEW.id, 'negociacao', 'Negociação', 'kanban-negotiation', 3, true),
    (NEW.id, 'fechamento', 'Fechamento', 'kanban-closed', 4, true)
  ON CONFLICT (empresa_id, slug) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_criar_kanban_colunas_padrao
AFTER INSERT ON public.empresas
FOR EACH ROW EXECUTE FUNCTION public.criar_kanban_colunas_padrao();