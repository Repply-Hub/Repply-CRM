-- fabricantes_delete exigia is_admin() (papel super-admin global, sem acesso ao pipeline de
-- vendas — ver CLAUDE.md), enquanto fabricantes_insert/update usam is_admin() OR is_gestor().
-- Resultado: nenhum usuário capaz de abrir a tela de Fabricantes conseguia de fato excluir um
-- registro — o DELETE batia 0 linhas (bloqueado pela policy) sem erro, e a UI mostrava sucesso.
DROP POLICY IF EXISTS "fabricantes_delete" ON public.fabricantes;
CREATE POLICY "fabricantes_delete" ON public.fabricantes FOR DELETE TO authenticated
USING (is_admin() OR is_gestor());
