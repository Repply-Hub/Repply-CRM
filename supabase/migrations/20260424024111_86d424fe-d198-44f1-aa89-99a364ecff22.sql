-- Update contatos select policy
DROP POLICY IF EXISTS "contatos_select" ON public.contatos;
CREATE POLICY "contatos_select" ON public.contatos
FOR SELECT TO authenticated
USING (
  is_admin() OR 
  (usuario_id = get_my_usuario_id()) OR 
  usuario_in_my_empresa(usuario_id) OR
  (usuario_id IS NULL)
);

-- Update tarefas select policy
DROP POLICY IF EXISTS "tarefas_select" ON public.tarefas;
CREATE POLICY "tarefas_select" ON public.tarefas
FOR SELECT TO authenticated
USING (
  is_admin() OR 
  (usuario_id = get_my_usuario_id()) OR 
  usuario_in_my_empresa(usuario_id) OR
  (usuario_id IS NULL)
);
