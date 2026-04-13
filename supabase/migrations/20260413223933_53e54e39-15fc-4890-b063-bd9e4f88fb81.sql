
-- ============================================
-- 1. HELPER FUNCTIONS
-- ============================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.vendedores
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_my_empresa_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT empresa_id FROM public.vendedores WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.vendedor_in_my_empresa(_vendedor_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.vendedores
    WHERE id = _vendedor_id
    AND empresa_id = (SELECT empresa_id FROM public.vendedores WHERE user_id = auth.uid() LIMIT 1)
  );
$$;

-- ============================================
-- 2. VENDEDORES
-- ============================================
DROP POLICY IF EXISTS "vendedores_select" ON public.vendedores;
CREATE POLICY "vendedores_select" ON public.vendedores FOR SELECT TO authenticated
USING (is_admin() OR empresa_id = get_my_empresa_id());

DROP POLICY IF EXISTS "vendedores_insert" ON public.vendedores;
CREATE POLICY "vendedores_insert" ON public.vendedores FOR INSERT TO authenticated
WITH CHECK (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id()));

DROP POLICY IF EXISTS "vendedores_update" ON public.vendedores;
CREATE POLICY "vendedores_update" ON public.vendedores FOR UPDATE TO authenticated
USING (is_admin() OR user_id = auth.uid() OR (is_gestor() AND empresa_id = get_my_empresa_id()));

DROP POLICY IF EXISTS "vendedores_delete" ON public.vendedores;
CREATE POLICY "vendedores_delete" ON public.vendedores FOR DELETE TO authenticated
USING (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id()));

-- ============================================
-- 3. EMPRESAS
-- ============================================
DROP POLICY IF EXISTS "empresas_select" ON public.empresas;
CREATE POLICY "empresas_select" ON public.empresas FOR SELECT TO authenticated
USING (is_admin() OR id = get_my_empresa_id());

DROP POLICY IF EXISTS "empresas_insert" ON public.empresas;
CREATE POLICY "empresas_insert" ON public.empresas FOR INSERT TO authenticated
WITH CHECK (is_admin() OR owner_id = auth.uid());

DROP POLICY IF EXISTS "empresas_update" ON public.empresas;
CREATE POLICY "empresas_update" ON public.empresas FOR UPDATE TO authenticated
USING (is_admin() OR owner_id = auth.uid());

DROP POLICY IF EXISTS "empresas_delete" ON public.empresas;
CREATE POLICY "empresas_delete" ON public.empresas FOR DELETE TO authenticated
USING (is_admin());

-- ============================================
-- 4. CLIENTES
-- ============================================
DROP POLICY IF EXISTS "clientes_select" ON public.clientes;
CREATE POLICY "clientes_select" ON public.clientes FOR SELECT TO authenticated
USING (is_admin() OR vendedor_in_my_empresa(vendedor_id));

DROP POLICY IF EXISTS "clientes_insert" ON public.clientes;
CREATE POLICY "clientes_insert" ON public.clientes FOR INSERT TO authenticated
WITH CHECK (is_admin() OR vendedor_id = get_my_vendedor_id() OR (is_gestor() AND vendedor_in_my_empresa(vendedor_id)));

DROP POLICY IF EXISTS "clientes_update" ON public.clientes;
CREATE POLICY "clientes_update" ON public.clientes FOR UPDATE TO authenticated
USING (is_admin() OR vendedor_id = get_my_vendedor_id() OR (is_gestor() AND vendedor_in_my_empresa(vendedor_id)));

DROP POLICY IF EXISTS "clientes_delete" ON public.clientes;
CREATE POLICY "clientes_delete" ON public.clientes FOR DELETE TO authenticated
USING (is_admin() OR (is_gestor() AND vendedor_in_my_empresa(vendedor_id)));

-- ============================================
-- 5. PEDIDOS
-- ============================================
DROP POLICY IF EXISTS "pedidos_select" ON public.pedidos;
CREATE POLICY "pedidos_select" ON public.pedidos FOR SELECT TO authenticated
USING (is_admin() OR vendedor_in_my_empresa(vendedor_id));

DROP POLICY IF EXISTS "pedidos_insert" ON public.pedidos;
CREATE POLICY "pedidos_insert" ON public.pedidos FOR INSERT TO authenticated
WITH CHECK (is_admin() OR vendedor_id = get_my_vendedor_id() OR (is_gestor() AND vendedor_in_my_empresa(vendedor_id)));

DROP POLICY IF EXISTS "pedidos_update" ON public.pedidos;
CREATE POLICY "pedidos_update" ON public.pedidos FOR UPDATE TO authenticated
USING (is_admin() OR vendedor_id = get_my_vendedor_id() OR (is_gestor() AND vendedor_in_my_empresa(vendedor_id)));

DROP POLICY IF EXISTS "pedidos_delete" ON public.pedidos;
CREATE POLICY "pedidos_delete" ON public.pedidos FOR DELETE TO authenticated
USING (is_admin() OR (is_gestor() AND vendedor_in_my_empresa(vendedor_id)));

-- ============================================
-- 6. OBRAS (via clientes)
-- ============================================
DROP POLICY IF EXISTS "obras_select" ON public.obras;
CREATE POLICY "obras_select" ON public.obras FOR SELECT TO authenticated
USING (is_admin() OR EXISTS(SELECT 1 FROM clientes c WHERE c.id = obras.cliente_id AND vendedor_in_my_empresa(c.vendedor_id)));

DROP POLICY IF EXISTS "obras_insert" ON public.obras;
CREATE POLICY "obras_insert" ON public.obras FOR INSERT TO authenticated
WITH CHECK (is_admin() OR EXISTS(SELECT 1 FROM clientes c WHERE c.id = obras.cliente_id AND vendedor_in_my_empresa(c.vendedor_id)));

DROP POLICY IF EXISTS "obras_update" ON public.obras;
CREATE POLICY "obras_update" ON public.obras FOR UPDATE TO authenticated
USING (is_admin() OR EXISTS(SELECT 1 FROM clientes c WHERE c.id = obras.cliente_id AND vendedor_in_my_empresa(c.vendedor_id)));

DROP POLICY IF EXISTS "obras_delete" ON public.obras;
CREATE POLICY "obras_delete" ON public.obras FOR DELETE TO authenticated
USING (is_admin() OR (is_gestor() AND EXISTS(SELECT 1 FROM clientes c WHERE c.id = obras.cliente_id AND vendedor_in_my_empresa(c.vendedor_id))));

-- ============================================
-- 7. ITENS_PEDIDO (via pedidos)
-- ============================================
DROP POLICY IF EXISTS "itens_pedido_select" ON public.itens_pedido;
CREATE POLICY "itens_pedido_select" ON public.itens_pedido FOR SELECT TO authenticated
USING (is_admin() OR EXISTS(SELECT 1 FROM pedidos p WHERE p.id = itens_pedido.pedido_id AND vendedor_in_my_empresa(p.vendedor_id)));

DROP POLICY IF EXISTS "itens_pedido_insert" ON public.itens_pedido;
CREATE POLICY "itens_pedido_insert" ON public.itens_pedido FOR INSERT TO authenticated
WITH CHECK (is_admin() OR EXISTS(SELECT 1 FROM pedidos p WHERE p.id = itens_pedido.pedido_id AND (p.vendedor_id = get_my_vendedor_id() OR (is_gestor() AND vendedor_in_my_empresa(p.vendedor_id)))));

DROP POLICY IF EXISTS "itens_pedido_update" ON public.itens_pedido;
CREATE POLICY "itens_pedido_update" ON public.itens_pedido FOR UPDATE TO authenticated
USING (is_admin() OR EXISTS(SELECT 1 FROM pedidos p WHERE p.id = itens_pedido.pedido_id AND (p.vendedor_id = get_my_vendedor_id() OR (is_gestor() AND vendedor_in_my_empresa(p.vendedor_id)))));

DROP POLICY IF EXISTS "itens_pedido_delete" ON public.itens_pedido;
CREATE POLICY "itens_pedido_delete" ON public.itens_pedido FOR DELETE TO authenticated
USING (is_admin() OR EXISTS(SELECT 1 FROM pedidos p WHERE p.id = itens_pedido.pedido_id AND (p.vendedor_id = get_my_vendedor_id() OR (is_gestor() AND vendedor_in_my_empresa(p.vendedor_id)))));

-- ============================================
-- 8. HISTORICO_CONTATOS (via pedidos)
-- ============================================
DROP POLICY IF EXISTS "historico_contatos_select" ON public.historico_contatos;
CREATE POLICY "historico_contatos_select" ON public.historico_contatos FOR SELECT TO authenticated
USING (is_admin() OR EXISTS(SELECT 1 FROM pedidos p WHERE p.id = historico_contatos.pedido_id AND vendedor_in_my_empresa(p.vendedor_id)));

DROP POLICY IF EXISTS "historico_contatos_insert" ON public.historico_contatos;
CREATE POLICY "historico_contatos_insert" ON public.historico_contatos FOR INSERT TO authenticated
WITH CHECK (is_admin() OR EXISTS(SELECT 1 FROM pedidos p WHERE p.id = historico_contatos.pedido_id AND (p.vendedor_id = get_my_vendedor_id() OR (is_gestor() AND vendedor_in_my_empresa(p.vendedor_id)))));

DROP POLICY IF EXISTS "historico_contatos_update" ON public.historico_contatos;
CREATE POLICY "historico_contatos_update" ON public.historico_contatos FOR UPDATE TO authenticated
USING (is_admin() OR EXISTS(SELECT 1 FROM pedidos p WHERE p.id = historico_contatos.pedido_id AND (p.vendedor_id = get_my_vendedor_id() OR (is_gestor() AND vendedor_in_my_empresa(p.vendedor_id)))));

DROP POLICY IF EXISTS "historico_contatos_delete" ON public.historico_contatos;
CREATE POLICY "historico_contatos_delete" ON public.historico_contatos FOR DELETE TO authenticated
USING (is_admin() OR (is_gestor() AND EXISTS(SELECT 1 FROM pedidos p WHERE p.id = historico_contatos.pedido_id AND vendedor_in_my_empresa(p.vendedor_id))));

-- ============================================
-- 9. NOTIFICACOES
-- ============================================
DROP POLICY IF EXISTS "notificacoes_select" ON public.notificacoes;
CREATE POLICY "notificacoes_select" ON public.notificacoes FOR SELECT TO authenticated
USING (is_admin() OR vendedor_id = get_my_vendedor_id() OR (is_gestor() AND vendedor_in_my_empresa(vendedor_id)));

DROP POLICY IF EXISTS "notificacoes_insert" ON public.notificacoes;
CREATE POLICY "notificacoes_insert" ON public.notificacoes FOR INSERT TO authenticated
WITH CHECK (is_admin() OR (is_gestor() AND vendedor_in_my_empresa(vendedor_id)));

DROP POLICY IF EXISTS "notificacoes_update" ON public.notificacoes;
CREATE POLICY "notificacoes_update" ON public.notificacoes FOR UPDATE TO authenticated
USING (is_admin() OR vendedor_id = get_my_vendedor_id() OR (is_gestor() AND vendedor_in_my_empresa(vendedor_id)));

DROP POLICY IF EXISTS "notificacoes_delete" ON public.notificacoes;
CREATE POLICY "notificacoes_delete" ON public.notificacoes FOR DELETE TO authenticated
USING (is_admin() OR vendedor_id = get_my_vendedor_id() OR (is_gestor() AND vendedor_in_my_empresa(vendedor_id)));

-- ============================================
-- 10. TAREFAS
-- ============================================
DROP POLICY IF EXISTS "tarefas_select" ON public.tarefas;
CREATE POLICY "tarefas_select" ON public.tarefas FOR SELECT TO authenticated
USING (is_admin() OR vendedor_in_my_empresa(vendedor_id) OR vendedor_id IS NULL);

DROP POLICY IF EXISTS "tarefas_insert" ON public.tarefas;
CREATE POLICY "tarefas_insert" ON public.tarefas FOR INSERT TO authenticated
WITH CHECK (is_admin() OR vendedor_id = get_my_vendedor_id() OR (is_gestor() AND vendedor_in_my_empresa(vendedor_id)));

DROP POLICY IF EXISTS "tarefas_update" ON public.tarefas;
CREATE POLICY "tarefas_update" ON public.tarefas FOR UPDATE TO authenticated
USING (is_admin() OR vendedor_id = get_my_vendedor_id() OR (is_gestor() AND vendedor_in_my_empresa(vendedor_id)));

DROP POLICY IF EXISTS "tarefas_delete" ON public.tarefas;
CREATE POLICY "tarefas_delete" ON public.tarefas FOR DELETE TO authenticated
USING (is_admin() OR (is_gestor() AND vendedor_in_my_empresa(vendedor_id)));

-- ============================================
-- 11. CONTATOS
-- ============================================
DROP POLICY IF EXISTS "contatos_select" ON public.contatos;
CREATE POLICY "contatos_select" ON public.contatos FOR SELECT TO authenticated
USING (is_admin() OR vendedor_in_my_empresa(vendedor_id) OR vendedor_id IS NULL);

DROP POLICY IF EXISTS "contatos_insert" ON public.contatos;
CREATE POLICY "contatos_insert" ON public.contatos FOR INSERT TO authenticated
WITH CHECK (is_admin() OR vendedor_id = get_my_vendedor_id() OR (is_gestor() AND vendedor_in_my_empresa(vendedor_id)));

DROP POLICY IF EXISTS "contatos_update" ON public.contatos;
CREATE POLICY "contatos_update" ON public.contatos FOR UPDATE TO authenticated
USING (is_admin() OR vendedor_id = get_my_vendedor_id() OR (is_gestor() AND vendedor_in_my_empresa(vendedor_id)));

DROP POLICY IF EXISTS "contatos_delete" ON public.contatos;
CREATE POLICY "contatos_delete" ON public.contatos FOR DELETE TO authenticated
USING (is_admin() OR (is_gestor() AND vendedor_in_my_empresa(vendedor_id)));

-- ============================================
-- 12. MENSAGENS_WHATSAPP
-- ============================================
DROP POLICY IF EXISTS "whatsapp_select" ON public.mensagens_whatsapp;
CREATE POLICY "whatsapp_select" ON public.mensagens_whatsapp FOR SELECT TO authenticated
USING (is_admin() OR vendedor_id = get_my_vendedor_id() OR (is_gestor() AND vendedor_in_my_empresa(vendedor_id)));

DROP POLICY IF EXISTS "whatsapp_insert" ON public.mensagens_whatsapp;
CREATE POLICY "whatsapp_insert" ON public.mensagens_whatsapp FOR INSERT TO authenticated
WITH CHECK (is_admin() OR vendedor_id = get_my_vendedor_id());

DROP POLICY IF EXISTS "whatsapp_delete" ON public.mensagens_whatsapp;
CREATE POLICY "whatsapp_delete" ON public.mensagens_whatsapp FOR DELETE TO authenticated
USING (is_admin() OR (is_gestor() AND vendedor_in_my_empresa(vendedor_id)));

-- ============================================
-- 13. PERMISSOES_VENDEDOR
-- ============================================
DROP POLICY IF EXISTS "permissoes_select" ON public.permissoes_vendedor;
CREATE POLICY "permissoes_select" ON public.permissoes_vendedor FOR SELECT TO authenticated
USING (is_admin() OR vendedor_id = get_my_vendedor_id() OR (is_gestor() AND vendedor_in_my_empresa(vendedor_id)));

DROP POLICY IF EXISTS "permissoes_insert" ON public.permissoes_vendedor;
CREATE POLICY "permissoes_insert" ON public.permissoes_vendedor FOR INSERT TO authenticated
WITH CHECK (is_admin() OR (is_gestor() AND vendedor_in_my_empresa(vendedor_id)));

DROP POLICY IF EXISTS "permissoes_update" ON public.permissoes_vendedor;
CREATE POLICY "permissoes_update" ON public.permissoes_vendedor FOR UPDATE TO authenticated
USING (is_admin() OR (is_gestor() AND vendedor_in_my_empresa(vendedor_id)));

DROP POLICY IF EXISTS "permissoes_delete" ON public.permissoes_vendedor;
CREATE POLICY "permissoes_delete" ON public.permissoes_vendedor FOR DELETE TO authenticated
USING (is_admin() OR (is_gestor() AND vendedor_in_my_empresa(vendedor_id)));

-- ============================================
-- 14. AUDIT_PERMISSOES
-- ============================================
DROP POLICY IF EXISTS "audit_select" ON public.audit_permissoes;
CREATE POLICY "audit_select" ON public.audit_permissoes FOR SELECT TO authenticated
USING (is_admin() OR (is_gestor() AND vendedor_in_my_empresa(vendedor_id)));

DROP POLICY IF EXISTS "audit_insert" ON public.audit_permissoes;
CREATE POLICY "audit_insert" ON public.audit_permissoes FOR INSERT TO authenticated
WITH CHECK (is_admin() OR (is_gestor() AND vendedor_in_my_empresa(vendedor_id)));

-- ============================================
-- 15. FABRICANTES (admin/empresa gerenciam, todos da empresa leem)
-- ============================================
DROP POLICY IF EXISTS "fabricantes_insert" ON public.fabricantes;
CREATE POLICY "fabricantes_insert" ON public.fabricantes FOR INSERT TO authenticated
WITH CHECK (is_admin() OR is_gestor());

DROP POLICY IF EXISTS "fabricantes_update" ON public.fabricantes;
CREATE POLICY "fabricantes_update" ON public.fabricantes FOR UPDATE TO authenticated
USING (is_admin() OR is_gestor());

DROP POLICY IF EXISTS "fabricantes_delete" ON public.fabricantes;
CREATE POLICY "fabricantes_delete" ON public.fabricantes FOR DELETE TO authenticated
USING (is_admin());

-- ============================================
-- 16. CONFIGURACOES_AUTOMACAO
-- ============================================
DROP POLICY IF EXISTS "automacao_config_update" ON public.configuracoes_automacao;
CREATE POLICY "automacao_config_update" ON public.configuracoes_automacao FOR UPDATE TO authenticated
USING (is_admin() OR is_gestor());

DROP POLICY IF EXISTS "automacao_config_upsert" ON public.configuracoes_automacao;
CREATE POLICY "automacao_config_upsert" ON public.configuracoes_automacao FOR INSERT TO authenticated
WITH CHECK (is_admin() OR is_gestor());

-- ============================================
-- 17. AUTOMATION_LOGS
-- ============================================
DROP POLICY IF EXISTS "automation_logs_select" ON public.automation_logs;
CREATE POLICY "automation_logs_select" ON public.automation_logs FOR SELECT TO authenticated
USING (is_admin() OR is_gestor());

DROP POLICY IF EXISTS "automation_logs_insert" ON public.automation_logs;
CREATE POLICY "automation_logs_insert" ON public.automation_logs FOR INSERT TO authenticated
WITH CHECK (is_admin() OR is_gestor());
