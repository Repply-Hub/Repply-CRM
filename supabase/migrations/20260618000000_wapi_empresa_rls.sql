-- Expande o RLS de configuracoes_wapi para que gestor/empresa/admin
-- possam visualizar e atualizar as instâncias de todos os usuários da empresa.

-- SELECT: próprio usuário OU admin OU gestor/empresa da mesma empresa
DROP POLICY IF EXISTS "usuario_own_wapi_config_select" ON public.configuracoes_wapi;

CREATE POLICY "wapi_config_select" ON public.configuracoes_wapi
  FOR SELECT USING (
    usuario_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE user_id = auth.uid() AND role = 'admin'
    )
    OR (
      empresa_id IS NOT NULL
      AND empresa_id IN (
        SELECT u.empresa_id FROM public.usuarios u
        WHERE u.user_id = auth.uid()
          AND u.role IN ('gestor', 'empresa')
      )
    )
  );

-- UPDATE: mesmo critério (gestor/empresa precisam sincronizar status remotamente)
DROP POLICY IF EXISTS "usuario_own_wapi_config_update" ON public.configuracoes_wapi;

CREATE POLICY "wapi_config_update" ON public.configuracoes_wapi
  FOR UPDATE
  USING (
    usuario_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE user_id = auth.uid() AND role = 'admin'
    )
    OR (
      empresa_id IS NOT NULL
      AND empresa_id IN (
        SELECT u.empresa_id FROM public.usuarios u
        WHERE u.user_id = auth.uid()
          AND u.role IN ('gestor', 'empresa')
      )
    )
  )
  WITH CHECK (
    usuario_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE user_id = auth.uid() AND role = 'admin'
    )
    OR (
      empresa_id IS NOT NULL
      AND empresa_id IN (
        SELECT u.empresa_id FROM public.usuarios u
        WHERE u.user_id = auth.uid()
          AND u.role IN ('gestor', 'empresa')
      )
    )
  );
