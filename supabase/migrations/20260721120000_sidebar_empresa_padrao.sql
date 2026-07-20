-- Tabela para o layout de sidebar padrão da empresa, definido por um gestor/admin.
-- Usuários sem preferências próprias em sidebar_preferences passam a herdar este layout
-- em vez do DEFAULT_SIDEBAR_ITEMS hardcoded no frontend.
CREATE TABLE public.sidebar_empresa_padrao (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL UNIQUE,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.sidebar_empresa_padrao ENABLE ROW LEVEL SECURITY;

-- Legível por qualquer usuário da empresa (precisam herdar o layout padrão),
-- gravável apenas por gestor/admin da própria empresa.
CREATE POLICY "sidebar_empresa_padrao_select"
ON public.sidebar_empresa_padrao FOR SELECT TO authenticated
USING (is_admin() OR empresa_id = get_my_empresa_id());

CREATE POLICY "sidebar_empresa_padrao_insert"
ON public.sidebar_empresa_padrao FOR INSERT TO authenticated
WITH CHECK (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id()));

CREATE POLICY "sidebar_empresa_padrao_update"
ON public.sidebar_empresa_padrao FOR UPDATE TO authenticated
USING (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id()));

CREATE POLICY "sidebar_empresa_padrao_delete"
ON public.sidebar_empresa_padrao FOR DELETE TO authenticated
USING (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id()));

CREATE TRIGGER update_sidebar_empresa_padrao_updated_at
BEFORE UPDATE ON public.sidebar_empresa_padrao
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
