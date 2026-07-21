-- Permite que qualquer gestor da empresa (não só o owner original) gere/regenere o código de acesso.
DROP POLICY IF EXISTS "empresas_update" ON public.empresas;
CREATE POLICY "empresas_update" ON public.empresas FOR UPDATE TO authenticated
USING (is_admin() OR owner_id = auth.uid() OR (is_gestor() AND id = get_my_empresa_id()));
