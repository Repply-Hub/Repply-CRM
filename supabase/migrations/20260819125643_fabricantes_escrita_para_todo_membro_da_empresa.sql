-- Vendedor também cria/edita/exclui fabricante e tabela de preços — pedido do
-- dono depois que a vendedora da JHS (papel 'vendedor', conta criada minutos
-- antes) tomou "new row violates row-level security" ao criar o primeiro
-- fabricante da empresa. A exigência de gestor era anterior à multi-tenancy de
-- ontem; nunca foi decisão de produto, era herança.
--
-- O que NÃO muda: o recorte por empresa. Vendedor da JHS continua sem ver nem
-- tocar nada da MD — só cai a exigência de papel DENTRO da própria empresa.
-- A FK de pedidos continua impedindo excluir fabricante com negócio.

DROP POLICY IF EXISTS "fabricantes_insert" ON public.fabricantes;
CREATE POLICY "fabricantes_insert" ON public.fabricantes FOR INSERT TO authenticated
  WITH CHECK (is_admin() OR empresa_id = get_my_empresa_id());

DROP POLICY IF EXISTS "fabricantes_update" ON public.fabricantes;
CREATE POLICY "fabricantes_update" ON public.fabricantes FOR UPDATE TO authenticated
  USING (is_admin() OR empresa_id = get_my_empresa_id());

DROP POLICY IF EXISTS "fabricantes_delete" ON public.fabricantes;
CREATE POLICY "fabricantes_delete" ON public.fabricantes FOR DELETE TO authenticated
  USING (is_admin() OR empresa_id = get_my_empresa_id());

DROP POLICY IF EXISTS "tabela_precos_insert" ON public.tabela_precos;
CREATE POLICY "tabela_precos_insert" ON public.tabela_precos FOR INSERT TO authenticated
  WITH CHECK (is_admin() OR empresa_id = get_my_empresa_id());

DROP POLICY IF EXISTS "tabela_precos_update" ON public.tabela_precos;
CREATE POLICY "tabela_precos_update" ON public.tabela_precos FOR UPDATE TO authenticated
  USING (is_admin() OR empresa_id = get_my_empresa_id());

DROP POLICY IF EXISTS "tabela_precos_delete" ON public.tabela_precos;
CREATE POLICY "tabela_precos_delete" ON public.tabela_precos FOR DELETE TO authenticated
  USING (is_admin() OR empresa_id = get_my_empresa_id());
