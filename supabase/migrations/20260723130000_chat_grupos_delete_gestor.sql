-- Permite que usuários com role 'gestor' também excluam qualquer grupo do chat interno
-- dentro da própria empresa, além do criador, do admin da empresa (role 'empresa') e do
-- admin global. A restrição anterior (20260709140000) havia tirado essa permissão de
-- 'gestor' para evitar que gerentes apagassem grupos de terceiros sem critério; a regra
-- de negócio mudou e agora 'gestor' deve ter essa capacidade de novo, escopada à empresa.
DROP POLICY IF EXISTS chat_grupos_delete ON public.chat_grupos;
CREATE POLICY chat_grupos_delete ON public.chat_grupos FOR DELETE TO authenticated
  USING (
    criado_por = get_my_usuario_id()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE user_id = auth.uid()
        AND role IN ('empresa', 'gestor')
        AND empresa_id = chat_grupos.empresa_id
    )
  );
