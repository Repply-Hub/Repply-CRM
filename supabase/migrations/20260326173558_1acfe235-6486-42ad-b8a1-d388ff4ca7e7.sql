
-- Função pública para validar código de acesso (sem precisar estar autenticado)
CREATE OR REPLACE FUNCTION public.validar_codigo_empresa(p_codigo text)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT json_build_object('id', id, 'nome', nome)
     FROM public.empresas
     WHERE codigo_acesso = upper(p_codigo)
     LIMIT 1),
    null::json
  );
$$;
