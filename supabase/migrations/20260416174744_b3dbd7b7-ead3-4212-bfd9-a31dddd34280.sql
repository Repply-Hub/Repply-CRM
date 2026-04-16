
-- Drop funções com parâmetros antigos primeiro
DROP FUNCTION IF EXISTS public.has_permission(uuid, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.has_funcionalidade(uuid, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.vendedor_in_my_empresa(uuid) CASCADE;

-- 1. Renomear tabela principal
ALTER TABLE public.vendedores RENAME TO usuarios;

-- 2. Renomear colunas vendedor_id → usuario_id
ALTER TABLE public.audit_permissoes RENAME COLUMN vendedor_id TO usuario_id;
ALTER TABLE public.chat_grupo_membros RENAME COLUMN vendedor_id TO usuario_id;
ALTER TABLE public.chat_mensagens RENAME COLUMN vendedor_id TO usuario_id;
ALTER TABLE public.clientes RENAME COLUMN vendedor_id TO usuario_id;
ALTER TABLE public.contatos RENAME COLUMN vendedor_id TO usuario_id;
ALTER TABLE public.historico_contatos RENAME COLUMN vendedor_id TO usuario_id;
ALTER TABLE public.mensagens_whatsapp RENAME COLUMN vendedor_id TO usuario_id;
ALTER TABLE public.notificacoes RENAME COLUMN vendedor_id TO usuario_id;
ALTER TABLE public.pedidos RENAME COLUMN vendedor_id TO usuario_id;
ALTER TABLE public.permissoes_vendedor RENAME COLUMN vendedor_id TO usuario_id;
ALTER TABLE public.tarefas RENAME COLUMN vendedor_id TO usuario_id;

-- 3. Renomear tabela de permissões
ALTER TABLE public.permissoes_vendedor RENAME TO permissoes_usuario;

-- 4. Funções principais
CREATE OR REPLACE FUNCTION public.get_my_usuario_id()
 RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT id FROM public.usuarios WHERE user_id = auth.uid() LIMIT 1; $$;

CREATE OR REPLACE FUNCTION public.usuario_in_my_empresa(_usuario_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios
    WHERE id = _usuario_id
    AND empresa_id = (SELECT empresa_id FROM public.usuarios WHERE user_id = auth.uid() LIMIT 1)
  );
$$;

-- Aliases legados para compatibilidade
CREATE OR REPLACE FUNCTION public.get_my_vendedor_id()
 RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT public.get_my_usuario_id(); $$;

CREATE OR REPLACE FUNCTION public.vendedor_in_my_empresa(_usuario_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT public.usuario_in_my_empresa(_usuario_id); $$;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.usuarios WHERE user_id = auth.uid() AND role = 'admin'); $$;

CREATE OR REPLACE FUNCTION public.is_gestor()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.usuarios WHERE user_id = auth.uid() AND role IN ('gestor', 'admin', 'empresa')); $$;

CREATE OR REPLACE FUNCTION public.get_my_empresa_id()
 RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT empresa_id FROM public.usuarios WHERE user_id = auth.uid() LIMIT 1; $$;

CREATE FUNCTION public.has_permission(_usuario_id uuid, _modulo text, _acao text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT CASE 
    WHEN EXISTS (SELECT 1 FROM usuarios WHERE id = _usuario_id AND role = 'gestor') THEN true
    WHEN _acao = 'ver' THEN COALESCE((SELECT pode_ver FROM permissoes_usuario WHERE usuario_id = _usuario_id AND modulo = _modulo), true)
    WHEN _acao = 'criar' THEN COALESCE((SELECT pode_criar FROM permissoes_usuario WHERE usuario_id = _usuario_id AND modulo = _modulo), false)
    WHEN _acao = 'editar' THEN COALESCE((SELECT pode_editar FROM permissoes_usuario WHERE usuario_id = _usuario_id AND modulo = _modulo), false)
    WHEN _acao = 'excluir' THEN COALESCE((SELECT pode_excluir FROM permissoes_usuario WHERE usuario_id = _usuario_id AND modulo = _modulo), false)
    ELSE false
  END;
$$;

CREATE FUNCTION public.has_funcionalidade(_usuario_id uuid, _modulo text, _funcionalidade text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM usuarios WHERE id = _usuario_id AND role IN ('gestor', 'admin', 'empresa')) THEN true
    ELSE COALESCE(
      (SELECT (funcionalidades->>_funcionalidade)::boolean
       FROM permissoes_usuario WHERE usuario_id = _usuario_id AND modulo = _modulo),
      false
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _empresa_id uuid;
  _role text;
BEGIN
  _role := COALESCE(NEW.raw_user_meta_data->>'role', 'vendedor');
  IF _role = 'empresa' OR _role = 'gestor' THEN
    IF NEW.raw_user_meta_data->>'nome_empresa' IS NOT NULL AND NEW.raw_user_meta_data->>'nome_empresa' != '' THEN
      INSERT INTO public.empresas (nome, cnpj, owner_id)
      VALUES (NEW.raw_user_meta_data->>'nome_empresa', NULLIF(NEW.raw_user_meta_data->>'cnpj_empresa', ''), NEW.id)
      RETURNING id INTO _empresa_id;
    END IF;
    INSERT INTO public.usuarios (user_id, nome, email, role, empresa_id)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)),
      NEW.email, CASE WHEN _role = 'gestor' THEN 'empresa' ELSE _role END, _empresa_id)
    ON CONFLICT DO NOTHING;
  ELSE
    IF NEW.raw_user_meta_data->>'codigo_empresa' IS NOT NULL THEN
      SELECT id INTO _empresa_id FROM public.empresas WHERE codigo_acesso = upper(NEW.raw_user_meta_data->>'codigo_empresa');
    END IF;
    INSERT INTO public.usuarios (user_id, nome, email, role, empresa_id)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)),
      NEW.email, 'vendedor', _empresa_id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- 5. Recriar VIEWS
DROP VIEW IF EXISTS public.vw_indicadores_vendedor CASCADE;
DROP VIEW IF EXISTS public.vw_pedidos_inativos CASCADE;
DROP VIEW IF EXISTS public.vw_velocidade_por_fabricante CASCADE;
DROP VIEW IF EXISTS public.vw_faturamento_mensal CASCADE;

CREATE VIEW public.vw_indicadores_usuario AS
SELECT
  u.id AS usuario_id, u.nome AS usuario_nome,
  COUNT(p.id) AS total_pedidos,
  COUNT(p.id) FILTER (WHERE p.status = 'novo_lead') AS qtd_novo_lead,
  COUNT(p.id) FILTER (WHERE p.status = 'elaborando') AS qtd_elaborando,
  COUNT(p.id) FILTER (WHERE p.status = 'enviado') AS qtd_enviado,
  COUNT(p.id) FILTER (WHERE p.status = 'negociacao') AS qtd_negociacao,
  COUNT(p.id) FILTER (WHERE p.status = 'fechado') AS qtd_fechado,
  COUNT(p.id) FILTER (WHERE p.status = 'perdido') AS qtd_perdido,
  CASE WHEN COUNT(p.id) FILTER (WHERE p.status IN ('fechado', 'perdido')) > 0
    THEN ROUND(100.0 * COUNT(p.id) FILTER (WHERE p.status = 'fechado')::numeric
              / COUNT(p.id) FILTER (WHERE p.status IN ('fechado', 'perdido'))::numeric, 2)
    ELSE 0 END AS taxa_fechamento,
  COALESCE(AVG(p.valor_total) FILTER (WHERE p.status = 'fechado'), 0) AS ticket_medio_fechado,
  COALESCE(AVG(EXTRACT(EPOCH FROM (p.updated_at - p.created_at)) / 86400)
    FILTER (WHERE p.status IN ('enviado', 'negociacao', 'fechado')), 0) AS tempo_medio_ate_orcamento_dias
FROM public.usuarios u
LEFT JOIN public.pedidos p ON p.usuario_id = u.id
GROUP BY u.id, u.nome;

CREATE VIEW public.vw_pedidos_inativos AS
SELECT p.id AS pedido_id, p.status, p.updated_at AS ultima_atualizacao,
  EXTRACT(DAY FROM (now() - p.updated_at))::integer AS dias_parado,
  CASE WHEN p.status = 'novo_lead' THEN '3 dias'
    WHEN p.status = 'elaborando' THEN '7 dias'
    WHEN p.status IN ('enviado', 'negociacao') THEN '15 dias'
    ELSE 'N/A' END AS dias_limite,
  c.id AS cliente_id, c.empresa AS cliente_nome,
  u.id AS usuario_id, u.nome AS usuario_nome
FROM public.pedidos p
JOIN public.clientes c ON c.id = p.cliente_id
JOIN public.usuarios u ON u.id = p.usuario_id
WHERE p.status NOT IN ('fechado', 'perdido');

CREATE VIEW public.vw_velocidade_por_fabricante AS
SELECT f.id AS fabricante_id, f.nome AS fabricante_nome,
  COUNT(p.id) AS total_pedidos,
  COALESCE(AVG(EXTRACT(EPOCH FROM (p.updated_at - p.created_at)) / 86400)
    FILTER (WHERE p.status IN ('enviado', 'negociacao', 'fechado')), 0) AS tempo_medio_ate_orcamento_dias
FROM public.fabricantes f
LEFT JOIN public.pedidos p ON p.fabricante_id = f.id
GROUP BY f.id, f.nome;

CREATE VIEW public.vw_faturamento_mensal AS
SELECT TO_CHAR(DATE_TRUNC('month', p.data_pedido), 'YYYY-MM') AS mes_ano,
  TO_CHAR(DATE_TRUNC('month', p.data_pedido), 'Mon/YY') AS mes,
  COALESCE(SUM(p.valor_total), 0) AS faturamento_total,
  COUNT(p.id) AS qtd_pedidos_fechados,
  CASE WHEN COUNT(p.id) > 0 THEN COALESCE(SUM(p.valor_total), 0) / COUNT(p.id) ELSE 0 END AS ticket_medio
FROM public.pedidos p WHERE p.status = 'fechado'
GROUP BY DATE_TRUNC('month', p.data_pedido)
ORDER BY DATE_TRUNC('month', p.data_pedido);

-- View legada para compatibilidade frontend
CREATE VIEW public.vw_indicadores_vendedor AS
SELECT usuario_id AS vendedor_id, usuario_nome AS vendedor_nome,
  total_pedidos, qtd_novo_lead, qtd_elaborando, qtd_enviado, qtd_negociacao,
  qtd_fechado, qtd_perdido, taxa_fechamento, ticket_medio_fechado, tempo_medio_ate_orcamento_dias
FROM public.vw_indicadores_usuario;

-- 6. RLS Policies recriadas
DROP POLICY IF EXISTS vendedores_select ON public.usuarios;
DROP POLICY IF EXISTS vendedores_insert ON public.usuarios;
DROP POLICY IF EXISTS vendedores_update ON public.usuarios;
DROP POLICY IF EXISTS vendedores_delete ON public.usuarios;
CREATE POLICY usuarios_select ON public.usuarios FOR SELECT TO authenticated
  USING (is_admin() OR (empresa_id = get_my_empresa_id()));
CREATE POLICY usuarios_insert ON public.usuarios FOR INSERT TO authenticated
  WITH CHECK (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id()));
CREATE POLICY usuarios_update ON public.usuarios FOR UPDATE TO authenticated
  USING (is_admin() OR (user_id = auth.uid()) OR (is_gestor() AND empresa_id = get_my_empresa_id()));
CREATE POLICY usuarios_delete ON public.usuarios FOR DELETE TO authenticated
  USING (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id()));

DROP POLICY IF EXISTS permissoes_select ON public.permissoes_usuario;
DROP POLICY IF EXISTS permissoes_insert ON public.permissoes_usuario;
DROP POLICY IF EXISTS permissoes_update ON public.permissoes_usuario;
DROP POLICY IF EXISTS permissoes_delete ON public.permissoes_usuario;
CREATE POLICY permissoes_select ON public.permissoes_usuario FOR SELECT TO authenticated
  USING (is_admin() OR (usuario_id = get_my_usuario_id()) OR (is_gestor() AND usuario_in_my_empresa(usuario_id)));
CREATE POLICY permissoes_insert ON public.permissoes_usuario FOR INSERT TO authenticated
  WITH CHECK (is_admin() OR (is_gestor() AND usuario_in_my_empresa(usuario_id)));
CREATE POLICY permissoes_update ON public.permissoes_usuario FOR UPDATE TO authenticated
  USING (is_admin() OR (is_gestor() AND usuario_in_my_empresa(usuario_id)));
CREATE POLICY permissoes_delete ON public.permissoes_usuario FOR DELETE TO authenticated
  USING (is_admin() OR (is_gestor() AND usuario_in_my_empresa(usuario_id)));

DROP POLICY IF EXISTS audit_select ON public.audit_permissoes;
DROP POLICY IF EXISTS audit_insert ON public.audit_permissoes;
CREATE POLICY audit_select ON public.audit_permissoes FOR SELECT TO authenticated
  USING (is_admin() OR (is_gestor() AND usuario_in_my_empresa(usuario_id)));
CREATE POLICY audit_insert ON public.audit_permissoes FOR INSERT TO authenticated
  WITH CHECK (is_admin() OR (is_gestor() AND usuario_in_my_empresa(usuario_id)));

DROP POLICY IF EXISTS clientes_select ON public.clientes;
DROP POLICY IF EXISTS clientes_insert ON public.clientes;
DROP POLICY IF EXISTS clientes_update ON public.clientes;
DROP POLICY IF EXISTS clientes_delete ON public.clientes;
CREATE POLICY clientes_select ON public.clientes FOR SELECT TO authenticated
  USING (is_admin() OR usuario_in_my_empresa(usuario_id));
CREATE POLICY clientes_insert ON public.clientes FOR INSERT TO authenticated
  WITH CHECK (is_admin() OR (usuario_id = get_my_usuario_id()) OR (is_gestor() AND usuario_in_my_empresa(usuario_id)));
CREATE POLICY clientes_update ON public.clientes FOR UPDATE TO authenticated
  USING (is_admin() OR (usuario_id = get_my_usuario_id()) OR (is_gestor() AND usuario_in_my_empresa(usuario_id)));
CREATE POLICY clientes_delete ON public.clientes FOR DELETE TO authenticated
  USING (is_admin() OR (is_gestor() AND usuario_in_my_empresa(usuario_id)));

DROP POLICY IF EXISTS contatos_select ON public.contatos;
DROP POLICY IF EXISTS contatos_insert ON public.contatos;
DROP POLICY IF EXISTS contatos_update ON public.contatos;
DROP POLICY IF EXISTS contatos_delete ON public.contatos;
CREATE POLICY contatos_select ON public.contatos FOR SELECT TO authenticated
  USING (is_admin() OR usuario_in_my_empresa(usuario_id) OR (usuario_id IS NULL));
CREATE POLICY contatos_insert ON public.contatos FOR INSERT TO authenticated
  WITH CHECK (is_admin() OR (usuario_id = get_my_usuario_id()) OR (is_gestor() AND usuario_in_my_empresa(usuario_id)));
CREATE POLICY contatos_update ON public.contatos FOR UPDATE TO authenticated
  USING (is_admin() OR (usuario_id = get_my_usuario_id()) OR (is_gestor() AND usuario_in_my_empresa(usuario_id)));
CREATE POLICY contatos_delete ON public.contatos FOR DELETE TO authenticated
  USING (is_admin() OR (is_gestor() AND usuario_in_my_empresa(usuario_id)));

DROP POLICY IF EXISTS pedidos_select ON public.pedidos;
DROP POLICY IF EXISTS pedidos_insert ON public.pedidos;
DROP POLICY IF EXISTS pedidos_update ON public.pedidos;
DROP POLICY IF EXISTS pedidos_delete ON public.pedidos;
CREATE POLICY pedidos_select ON public.pedidos FOR SELECT TO authenticated
  USING (is_admin() OR usuario_in_my_empresa(usuario_id));
CREATE POLICY pedidos_insert ON public.pedidos FOR INSERT TO authenticated
  WITH CHECK (is_admin() OR (usuario_id = get_my_usuario_id()) OR (is_gestor() AND usuario_in_my_empresa(usuario_id)));
CREATE POLICY pedidos_update ON public.pedidos FOR UPDATE TO authenticated
  USING (is_admin() OR (usuario_id = get_my_usuario_id()) OR (is_gestor() AND usuario_in_my_empresa(usuario_id)));
CREATE POLICY pedidos_delete ON public.pedidos FOR DELETE TO authenticated
  USING (is_admin() OR (is_gestor() AND usuario_in_my_empresa(usuario_id)));

DROP POLICY IF EXISTS tarefas_select ON public.tarefas;
DROP POLICY IF EXISTS tarefas_insert ON public.tarefas;
DROP POLICY IF EXISTS tarefas_update ON public.tarefas;
DROP POLICY IF EXISTS tarefas_delete ON public.tarefas;
CREATE POLICY tarefas_select ON public.tarefas FOR SELECT TO authenticated
  USING (is_admin() OR usuario_in_my_empresa(usuario_id) OR (usuario_id IS NULL));
CREATE POLICY tarefas_insert ON public.tarefas FOR INSERT TO authenticated
  WITH CHECK (is_admin() OR (usuario_id = get_my_usuario_id()) OR (is_gestor() AND usuario_in_my_empresa(usuario_id)));
CREATE POLICY tarefas_update ON public.tarefas FOR UPDATE TO authenticated
  USING (is_admin() OR (usuario_id = get_my_usuario_id()) OR (is_gestor() AND usuario_in_my_empresa(usuario_id)));
CREATE POLICY tarefas_delete ON public.tarefas FOR DELETE TO authenticated
  USING (is_admin() OR (is_gestor() AND usuario_in_my_empresa(usuario_id)));

DROP POLICY IF EXISTS notificacoes_select ON public.notificacoes;
DROP POLICY IF EXISTS notificacoes_insert ON public.notificacoes;
DROP POLICY IF EXISTS notificacoes_update ON public.notificacoes;
DROP POLICY IF EXISTS notificacoes_delete ON public.notificacoes;
CREATE POLICY notificacoes_select ON public.notificacoes FOR SELECT TO authenticated
  USING (is_admin() OR (usuario_id = get_my_usuario_id()) OR (is_gestor() AND usuario_in_my_empresa(usuario_id)));
CREATE POLICY notificacoes_insert ON public.notificacoes FOR INSERT TO authenticated
  WITH CHECK (is_admin() OR (is_gestor() AND usuario_in_my_empresa(usuario_id)));
CREATE POLICY notificacoes_update ON public.notificacoes FOR UPDATE TO authenticated
  USING (is_admin() OR (usuario_id = get_my_usuario_id()) OR (is_gestor() AND usuario_in_my_empresa(usuario_id)));
CREATE POLICY notificacoes_delete ON public.notificacoes FOR DELETE TO authenticated
  USING (is_admin() OR (usuario_id = get_my_usuario_id()) OR (is_gestor() AND usuario_in_my_empresa(usuario_id)));

DROP POLICY IF EXISTS whatsapp_select ON public.mensagens_whatsapp;
DROP POLICY IF EXISTS whatsapp_insert ON public.mensagens_whatsapp;
DROP POLICY IF EXISTS whatsapp_delete ON public.mensagens_whatsapp;
CREATE POLICY whatsapp_select ON public.mensagens_whatsapp FOR SELECT TO authenticated
  USING (is_admin() OR (usuario_id = get_my_usuario_id()) OR (is_gestor() AND usuario_in_my_empresa(usuario_id)));
CREATE POLICY whatsapp_insert ON public.mensagens_whatsapp FOR INSERT TO authenticated
  WITH CHECK (is_admin() OR (usuario_id = get_my_usuario_id()));
CREATE POLICY whatsapp_delete ON public.mensagens_whatsapp FOR DELETE TO authenticated
  USING (is_admin() OR (is_gestor() AND usuario_in_my_empresa(usuario_id)));

DROP POLICY IF EXISTS historico_contatos_select ON public.historico_contatos;
DROP POLICY IF EXISTS historico_contatos_insert ON public.historico_contatos;
DROP POLICY IF EXISTS historico_contatos_update ON public.historico_contatos;
DROP POLICY IF EXISTS historico_contatos_delete ON public.historico_contatos;
CREATE POLICY historico_contatos_select ON public.historico_contatos FOR SELECT TO authenticated
  USING (is_admin() OR (EXISTS (SELECT 1 FROM pedidos p WHERE p.id = historico_contatos.pedido_id AND usuario_in_my_empresa(p.usuario_id))));
CREATE POLICY historico_contatos_insert ON public.historico_contatos FOR INSERT TO authenticated
  WITH CHECK (is_admin() OR (EXISTS (SELECT 1 FROM pedidos p WHERE p.id = historico_contatos.pedido_id AND ((p.usuario_id = get_my_usuario_id()) OR (is_gestor() AND usuario_in_my_empresa(p.usuario_id))))));
CREATE POLICY historico_contatos_update ON public.historico_contatos FOR UPDATE TO authenticated
  USING (is_admin() OR (EXISTS (SELECT 1 FROM pedidos p WHERE p.id = historico_contatos.pedido_id AND ((p.usuario_id = get_my_usuario_id()) OR (is_gestor() AND usuario_in_my_empresa(p.usuario_id))))));
CREATE POLICY historico_contatos_delete ON public.historico_contatos FOR DELETE TO authenticated
  USING (is_admin() OR (is_gestor() AND (EXISTS (SELECT 1 FROM pedidos p WHERE p.id = historico_contatos.pedido_id AND usuario_in_my_empresa(p.usuario_id)))));

DROP POLICY IF EXISTS itens_pedido_select ON public.itens_pedido;
DROP POLICY IF EXISTS itens_pedido_insert ON public.itens_pedido;
DROP POLICY IF EXISTS itens_pedido_update ON public.itens_pedido;
DROP POLICY IF EXISTS itens_pedido_delete ON public.itens_pedido;
CREATE POLICY itens_pedido_select ON public.itens_pedido FOR SELECT TO authenticated
  USING (is_admin() OR (EXISTS (SELECT 1 FROM pedidos p WHERE p.id = itens_pedido.pedido_id AND usuario_in_my_empresa(p.usuario_id))));
CREATE POLICY itens_pedido_insert ON public.itens_pedido FOR INSERT TO authenticated
  WITH CHECK (is_admin() OR (EXISTS (SELECT 1 FROM pedidos p WHERE p.id = itens_pedido.pedido_id AND ((p.usuario_id = get_my_usuario_id()) OR (is_gestor() AND usuario_in_my_empresa(p.usuario_id))))));
CREATE POLICY itens_pedido_update ON public.itens_pedido FOR UPDATE TO authenticated
  USING (is_admin() OR (EXISTS (SELECT 1 FROM pedidos p WHERE p.id = itens_pedido.pedido_id AND ((p.usuario_id = get_my_usuario_id()) OR (is_gestor() AND usuario_in_my_empresa(p.usuario_id))))));
CREATE POLICY itens_pedido_delete ON public.itens_pedido FOR DELETE TO authenticated
  USING (is_admin() OR (EXISTS (SELECT 1 FROM pedidos p WHERE p.id = itens_pedido.pedido_id AND ((p.usuario_id = get_my_usuario_id()) OR (is_gestor() AND usuario_in_my_empresa(p.usuario_id))))));

DROP POLICY IF EXISTS chat_grupo_membros_select ON public.chat_grupo_membros;
DROP POLICY IF EXISTS chat_grupo_membros_insert ON public.chat_grupo_membros;
DROP POLICY IF EXISTS chat_grupo_membros_delete ON public.chat_grupo_membros;
CREATE POLICY chat_grupo_membros_select ON public.chat_grupo_membros FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM chat_grupos g WHERE g.id = chat_grupo_membros.grupo_id AND g.empresa_id = (SELECT empresa_id FROM usuarios WHERE user_id = auth.uid() LIMIT 1)));
CREATE POLICY chat_grupo_membros_insert ON public.chat_grupo_membros FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM chat_grupos g WHERE g.id = chat_grupo_membros.grupo_id AND g.empresa_id = (SELECT empresa_id FROM usuarios WHERE user_id = auth.uid() LIMIT 1)));
CREATE POLICY chat_grupo_membros_delete ON public.chat_grupo_membros FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM chat_grupos g WHERE g.id = chat_grupo_membros.grupo_id AND ((g.criado_por = get_my_usuario_id()) OR is_gestor())));

DROP POLICY IF EXISTS chat_grupos_select ON public.chat_grupos;
DROP POLICY IF EXISTS chat_grupos_insert ON public.chat_grupos;
DROP POLICY IF EXISTS chat_grupos_update ON public.chat_grupos;
DROP POLICY IF EXISTS chat_grupos_delete ON public.chat_grupos;
CREATE POLICY chat_grupos_select ON public.chat_grupos FOR SELECT TO authenticated
  USING (empresa_id = (SELECT empresa_id FROM usuarios WHERE user_id = auth.uid() LIMIT 1));
CREATE POLICY chat_grupos_insert ON public.chat_grupos FOR INSERT TO authenticated
  WITH CHECK (empresa_id = (SELECT empresa_id FROM usuarios WHERE user_id = auth.uid() LIMIT 1));
CREATE POLICY chat_grupos_update ON public.chat_grupos FOR UPDATE TO authenticated
  USING ((criado_por = get_my_usuario_id()) OR is_gestor());
CREATE POLICY chat_grupos_delete ON public.chat_grupos FOR DELETE TO authenticated
  USING ((criado_por = get_my_usuario_id()) OR is_gestor());

DROP POLICY IF EXISTS chat_select ON public.chat_mensagens;
DROP POLICY IF EXISTS chat_insert ON public.chat_mensagens;
DROP POLICY IF EXISTS chat_delete ON public.chat_mensagens;
CREATE POLICY chat_select ON public.chat_mensagens FOR SELECT TO authenticated
  USING (empresa_id = (SELECT empresa_id FROM usuarios WHERE user_id = auth.uid() LIMIT 1));
CREATE POLICY chat_insert ON public.chat_mensagens FOR INSERT TO authenticated
  WITH CHECK ((usuario_id = get_my_usuario_id()) AND (empresa_id = (SELECT empresa_id FROM usuarios WHERE user_id = auth.uid() LIMIT 1)));
CREATE POLICY chat_delete ON public.chat_mensagens FOR DELETE TO authenticated
  USING (is_gestor());

DROP POLICY IF EXISTS obras_select ON public.obras;
DROP POLICY IF EXISTS obras_insert ON public.obras;
DROP POLICY IF EXISTS obras_update ON public.obras;
DROP POLICY IF EXISTS obras_delete ON public.obras;
CREATE POLICY obras_select ON public.obras FOR SELECT TO authenticated
  USING (is_admin() OR (EXISTS (SELECT 1 FROM clientes c WHERE c.id = obras.cliente_id AND usuario_in_my_empresa(c.usuario_id))));
CREATE POLICY obras_insert ON public.obras FOR INSERT TO authenticated
  WITH CHECK (is_admin() OR (EXISTS (SELECT 1 FROM clientes c WHERE c.id = obras.cliente_id AND usuario_in_my_empresa(c.usuario_id))));
CREATE POLICY obras_update ON public.obras FOR UPDATE TO authenticated
  USING (is_admin() OR (EXISTS (SELECT 1 FROM clientes c WHERE c.id = obras.cliente_id AND usuario_in_my_empresa(c.usuario_id))));
CREATE POLICY obras_delete ON public.obras FOR DELETE TO authenticated
  USING (is_admin() OR (is_gestor() AND (EXISTS (SELECT 1 FROM clientes c WHERE c.id = obras.cliente_id AND usuario_in_my_empresa(c.usuario_id)))));
