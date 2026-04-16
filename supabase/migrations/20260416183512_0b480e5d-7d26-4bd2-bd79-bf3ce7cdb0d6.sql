-- Limpeza: manter apenas a empresa do email md@teste.com (16e3bd8a-2ca7-4e9c-b635-67c0907c9f2e)
-- Remover empresas: MD Teste (4b36b1f9...) e MD Representações duplicada (ff5de102...)

DO $$
DECLARE
  v_empresas_remover uuid[] := ARRAY[
    '4b36b1f9-db7d-4ee6-a238-e35a45f89020'::uuid,
    'ff5de102-1208-4670-b869-5df143cc2490'::uuid
  ];
  v_usuarios_remover uuid[];
  v_auth_users_remover uuid[];
BEGIN
  -- IDs dos usuarios vinculados a essas empresas
  SELECT array_agg(id), array_agg(user_id) FILTER (WHERE user_id IS NOT NULL)
    INTO v_usuarios_remover, v_auth_users_remover
  FROM public.usuarios
  WHERE empresa_id = ANY(v_empresas_remover);

  -- Limpar dependencias dos usuarios (se houver)
  IF v_usuarios_remover IS NOT NULL THEN
    DELETE FROM public.permissoes_usuario WHERE usuario_id = ANY(v_usuarios_remover);
    DELETE FROM public.notificacoes WHERE usuario_id = ANY(v_usuarios_remover);
    DELETE FROM public.mensagens_whatsapp WHERE usuario_id = ANY(v_usuarios_remover);
    DELETE FROM public.historico_contatos WHERE usuario_id = ANY(v_usuarios_remover);
    DELETE FROM public.chat_mensagens WHERE usuario_id = ANY(v_usuarios_remover);
    DELETE FROM public.chat_grupo_membros WHERE usuario_id = ANY(v_usuarios_remover);
    DELETE FROM public.audit_permissoes WHERE usuario_id = ANY(v_usuarios_remover) OR admin_id = ANY(v_usuarios_remover);

    -- Itens/historico de pedidos pertencentes a esses usuarios
    DELETE FROM public.itens_pedido WHERE pedido_id IN (SELECT id FROM public.pedidos WHERE usuario_id = ANY(v_usuarios_remover));
    DELETE FROM public.historico_contatos WHERE pedido_id IN (SELECT id FROM public.pedidos WHERE usuario_id = ANY(v_usuarios_remover));
    DELETE FROM public.pedidos WHERE usuario_id = ANY(v_usuarios_remover);

    -- Obras dos clientes desses usuarios
    DELETE FROM public.obras WHERE cliente_id IN (SELECT id FROM public.clientes WHERE usuario_id = ANY(v_usuarios_remover));
    DELETE FROM public.clientes WHERE usuario_id = ANY(v_usuarios_remover);
    DELETE FROM public.contatos WHERE usuario_id = ANY(v_usuarios_remover);
    DELETE FROM public.tarefas WHERE usuario_id = ANY(v_usuarios_remover);
  END IF;

  -- Eventos sao por user_id (auth.uid)
  IF v_auth_users_remover IS NOT NULL THEN
    DELETE FROM public.eventos WHERE user_id = ANY(v_auth_users_remover);
    DELETE FROM public.sidebar_preferences WHERE user_id = ANY(v_auth_users_remover);
  END IF;

  -- Chat grupos das empresas removidas
  DELETE FROM public.chat_grupo_membros WHERE grupo_id IN (SELECT id FROM public.chat_grupos WHERE empresa_id = ANY(v_empresas_remover));
  DELETE FROM public.chat_mensagens WHERE grupo_id IN (SELECT id FROM public.chat_grupos WHERE empresa_id = ANY(v_empresas_remover));
  DELETE FROM public.chat_mensagens WHERE empresa_id = ANY(v_empresas_remover);
  DELETE FROM public.chat_grupos WHERE empresa_id = ANY(v_empresas_remover);

  -- Remover usuarios da tabela publica
  DELETE FROM public.usuarios WHERE empresa_id = ANY(v_empresas_remover);

  -- Remover as empresas
  DELETE FROM public.empresas WHERE id = ANY(v_empresas_remover);

  -- Remover do auth.users tambem (cascade limpa identities/sessions)
  IF v_auth_users_remover IS NOT NULL THEN
    DELETE FROM auth.users WHERE id = ANY(v_auth_users_remover);
  END IF;
END $$;