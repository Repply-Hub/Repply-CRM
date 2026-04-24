-- Update clientes policies
DROP POLICY IF EXISTS "clientes_insert" ON public.clientes;
CREATE POLICY "clientes_insert" ON public.clientes
FOR INSERT 
TO authenticated
WITH CHECK (
  is_admin() OR 
  (usuario_id = get_my_usuario_id()) OR 
  usuario_in_my_empresa(usuario_id)
);

DROP POLICY IF EXISTS "clientes_update" ON public.clientes;
CREATE POLICY "clientes_update" ON public.clientes
FOR UPDATE
TO authenticated
USING (
  is_admin() OR 
  (usuario_id = get_my_usuario_id()) OR 
  usuario_in_my_empresa(usuario_id)
);

-- Update contatos policies
DROP POLICY IF EXISTS "contatos_insert" ON public.contatos;
CREATE POLICY "contatos_insert" ON public.contatos
FOR INSERT 
TO authenticated
WITH CHECK (
  is_admin() OR 
  (usuario_id = get_my_usuario_id()) OR 
  usuario_in_my_empresa(usuario_id)
);

DROP POLICY IF EXISTS "contatos_update" ON public.contatos;
CREATE POLICY "contatos_update" ON public.contatos
FOR UPDATE
TO authenticated
USING (
  is_admin() OR 
  (usuario_id = get_my_usuario_id()) OR 
  usuario_in_my_empresa(usuario_id)
);