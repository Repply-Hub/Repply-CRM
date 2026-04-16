-- Add funcionalidades JSONB column to permissoes_vendedor
ALTER TABLE public.permissoes_vendedor
ADD COLUMN IF NOT EXISTS funcionalidades jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Create helper function to check specific functionality permissions
CREATE OR REPLACE FUNCTION public.has_funcionalidade(_vendedor_id uuid, _modulo text, _funcionalidade text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM vendedores WHERE id = _vendedor_id AND role IN ('gestor', 'admin', 'empresa')) THEN true
    ELSE COALESCE(
      (SELECT (funcionalidades->>_funcionalidade)::boolean
       FROM permissoes_vendedor
       WHERE vendedor_id = _vendedor_id AND modulo = _modulo),
      false
    )
  END;
$$;