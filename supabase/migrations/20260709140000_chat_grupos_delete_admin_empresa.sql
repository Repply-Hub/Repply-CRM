-- Restringe a exclusão de grupos do chat interno ao admin da empresa (usuarios.role = 'empresa'),
-- ao admin global, ou ao próprio criador do grupo. is_gestor() incluía também 'gestor', que
-- passa a não poder mais apagar grupos de terceiros.
DROP POLICY IF EXISTS chat_grupos_delete ON public.chat_grupos;
CREATE POLICY chat_grupos_delete ON public.chat_grupos FOR DELETE TO authenticated
  USING (
    criado_por = get_my_usuario_id()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE user_id = auth.uid() AND role = 'empresa'
    )
  );
