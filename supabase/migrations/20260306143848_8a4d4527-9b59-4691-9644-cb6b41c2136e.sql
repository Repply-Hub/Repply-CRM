
-- Permissions table per vendedor per module
CREATE TABLE public.permissoes_vendedor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id uuid NOT NULL REFERENCES public.vendedores(id) ON DELETE CASCADE,
  modulo text NOT NULL,
  pode_ver boolean NOT NULL DEFAULT true,
  pode_criar boolean NOT NULL DEFAULT false,
  pode_editar boolean NOT NULL DEFAULT false,
  pode_excluir boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(vendedor_id, modulo)
);

-- Enable RLS
ALTER TABLE public.permissoes_vendedor ENABLE ROW LEVEL SECURITY;

-- Only gestores can manage permissions
CREATE POLICY "permissoes_select" ON public.permissoes_vendedor
  FOR SELECT TO authenticated
  USING (vendedor_id = get_my_vendedor_id() OR is_gestor());

CREATE POLICY "permissoes_insert" ON public.permissoes_vendedor
  FOR INSERT TO authenticated
  WITH CHECK (is_gestor());

CREATE POLICY "permissoes_update" ON public.permissoes_vendedor
  FOR UPDATE TO authenticated
  USING (is_gestor());

CREATE POLICY "permissoes_delete" ON public.permissoes_vendedor
  FOR DELETE TO authenticated
  USING (is_gestor());

-- Helper function to check module permission
CREATE OR REPLACE FUNCTION public.has_permission(_vendedor_id uuid, _modulo text, _acao text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE 
    WHEN EXISTS (SELECT 1 FROM vendedores WHERE id = _vendedor_id AND role = 'gestor') THEN true
    WHEN _acao = 'ver' THEN COALESCE((SELECT pode_ver FROM permissoes_vendedor WHERE vendedor_id = _vendedor_id AND modulo = _modulo), true)
    WHEN _acao = 'criar' THEN COALESCE((SELECT pode_criar FROM permissoes_vendedor WHERE vendedor_id = _vendedor_id AND modulo = _modulo), false)
    WHEN _acao = 'editar' THEN COALESCE((SELECT pode_editar FROM permissoes_vendedor WHERE vendedor_id = _vendedor_id AND modulo = _modulo), false)
    WHEN _acao = 'excluir' THEN COALESCE((SELECT pode_excluir FROM permissoes_vendedor WHERE vendedor_id = _vendedor_id AND modulo = _modulo), false)
    ELSE false
  END;
$$;

-- Trigger for updated_at
CREATE TRIGGER update_permissoes_updated_at
  BEFORE UPDATE ON public.permissoes_vendedor
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
