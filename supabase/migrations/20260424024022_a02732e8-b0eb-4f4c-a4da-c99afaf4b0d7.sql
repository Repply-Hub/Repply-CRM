-- Update clientes select policy
DROP POLICY IF EXISTS "clientes_select" ON public.clientes;
CREATE POLICY "clientes_select" ON public.clientes
FOR SELECT TO authenticated
USING (
  is_admin() OR 
  (usuario_id = get_my_usuario_id()) OR 
  usuario_in_my_empresa(usuario_id)
);

-- Update pedidos select policy
DROP POLICY IF EXISTS "pedidos_select" ON public.pedidos;
CREATE POLICY "pedidos_select" ON public.pedidos
FOR SELECT TO authenticated
USING (
  is_admin() OR 
  (usuario_id = get_my_usuario_id()) OR 
  usuario_in_my_empresa(usuario_id)
);
