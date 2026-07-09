-- Restringe a exclusão de mensagens do chat interno (botão "Limpar conversa") ao admin da
-- empresa (usuarios.role = 'empresa'), em vez de qualquer gestor. is_gestor() inclui
-- 'gestor'/'admin'/'empresa' e por isso era permissivo demais para essa ação destrutiva.
DROP POLICY IF EXISTS chat_delete ON public.chat_mensagens;
CREATE POLICY chat_delete ON public.chat_mensagens FOR DELETE TO authenticated
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE user_id = auth.uid() AND role = 'empresa'
    )
  );
