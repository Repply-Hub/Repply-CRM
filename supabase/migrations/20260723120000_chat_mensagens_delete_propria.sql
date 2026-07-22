-- Permite que o autor de uma mensagem do chat interno a exclua, além dos casos já
-- cobertos (admin global e admin da empresa via "Limpar conversa").
DROP POLICY IF EXISTS chat_delete ON public.chat_mensagens;
CREATE POLICY chat_delete ON public.chat_mensagens FOR DELETE TO authenticated
  USING (
    usuario_id = get_my_usuario_id()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE user_id = auth.uid() AND role = 'empresa'
    )
  );
