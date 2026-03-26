
-- Update is_gestor to also recognize 'admin' role
CREATE OR REPLACE FUNCTION public.is_gestor()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.vendedores
    WHERE user_id = auth.uid() AND role IN ('gestor', 'admin')
  );
$$;
