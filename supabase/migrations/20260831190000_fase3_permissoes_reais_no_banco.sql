-- ============================================================================
-- Fase 3 de segurança: `has_permission()`/`has_funcionalidade()` passam a valer
-- no banco em mais módulos — hoje só `pedidos` (Negócios) e exclusão de
-- arquivo em `fabricantes` liam a matriz de permissões; os outros 12 módulos
-- da tela Configurações → Usuários salvavam o checkbox e nada olhava de volta.
-- ============================================================================
--
-- Três blocos, três riscos diferentes:
--
-- A) DELETE aditivo em clientes/contatos/tarefas/obras/whatsapp — hoje já são
--    só-gestor. Somar `has_permission(...)` só ADICIONA capacidade a quem for
--    marcado; ninguém que já podia excluir perde nada. Mesmo padrão de
--    `pedidos_delete` (`20260824143000_pedidos_rls_fase_zero.sql`).
--    `clientes_delete` ficou pendente desde a Fase 2 (aquela migration só
--    tirou a policy legada "Acesso por empresa", não chegou a ligar
--    `has_permission`) — fecha aqui.
--
-- B) Módulo `pipeline` sai da matriz de permissões — Kanban e lista de
--    Negócios leem e escrevem a MESMA tabela `pedidos`; não existe (nem
--    pode existir) uma trava de banco independente para as duas. As duas
--    funcionalidades exclusivas de `pipeline` (`mover_cards`,
--    `filtrar_avancado`) migram para dentro de `pedidos` no código do
--    frontend (`src/hooks/use-permissoes.ts`) — aqui só falta a função de
--    banco que semeia o preset padrão de empresa nova parar de criar a
--    linha `pipeline` e passar a incluir as duas funcionalidades em
--    `pedidos`. Empresas já existentes mantêm a linha `pipeline` antiga em
--    `permissao_presets` como dado morto — inofensivo, nenhuma policy olha
--    para ela, mesmo raciocínio de "sai da tela, fica no banco" já usado em
--    `PermissaoMatrixEditor.tsx`.
--
-- C) Delegação real de "Gerenciar Usuários" e "Gerenciar Permissões"
--    (funcionalidades do módulo `configuracoes`, hoje 100% decorativas) via
--    `has_funcionalidade()` — já existe no banco, mesmo bypass de
--    gestor/admin/empresa que `has_permission`. Decisão de produto: um
--    vendedor comum PODE receber essa funcionalidade e de fato mexer em
--    conta de colega e em permissão de colega.
--
--    A salvaguarda contra autopromoção NÃO precisa de trigger nova — já
--    existem duas, criadas em `20260803140113_blindagem_rls_usuarios.sql` e
--    `20260824210000_fecha_escrita_anonima_e_escalacao_de_cargo.sql`:
--      · `impedir_auto_escalacao_usuario` bloqueia QUALQUER UM (inclusive
--        admin) de mudar a PRÓPRIA role/empresa_id/user_id/deleted_at.
--      · `impedir_escalacao_cargo_usuario` bloqueia quem não é admin de dar
--        ou tirar 'admin' de terceiro, ou mudar empresa_id/user_id de
--        terceiro.
--    O que faltava é orelha de menor escala: um delegado (não-gestor) não
--    pode alcançar a linha de quem já é gestor/admin/empresa nem gravar
--    `role` nova que seja gestor/admin/empresa num colega vendedor. Isso é
--    RLS pura, sem trigger: `WITH CHECK` em Postgres avalia a linha NOVA, não
--    a antiga (o mesmo mecanismo que a migration de 24/08 já documenta) — a
--    condição `role NOT IN ('gestor','admin','empresa')` repetida no `USING`
--    (barra tocar em quem já manda) e no `WITH CHECK` (barra promover
--    alguém para lá) fecha o caminho sozinha.
--
--    `permissoes_usuario` não tem coluna tipo `role` para comparar
--    antes/depois, então a mesma lógica cabe inteira em RLS: delegado nunca
--    toca a própria linha nem a de quem já é gestor/admin/empresa.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- A) DELETE aditivo
-- ─────────────────────────────────────────────────────────────────────────────

ALTER POLICY clientes_delete ON public.clientes
  USING (
    (is_gestor() AND usuario_in_my_empresa(usuario_id))
    OR (has_permission(get_my_usuario_id(), 'clientes', 'excluir') AND usuario_in_my_empresa(usuario_id))
  );

ALTER POLICY contatos_delete ON public.contatos
  USING (
    (is_gestor() AND usuario_in_my_empresa(usuario_id))
    OR (has_permission(get_my_usuario_id(), 'contatos', 'excluir') AND usuario_in_my_empresa(usuario_id))
  );

ALTER POLICY tarefas_delete ON public.tarefas
  USING (
    (is_gestor() AND usuario_in_my_empresa(usuario_id))
    OR (has_permission(get_my_usuario_id(), 'tarefas', 'excluir') AND usuario_in_my_empresa(usuario_id))
  );

ALTER POLICY obras_delete ON public.obras
  USING (
    (is_gestor() AND EXISTS (
      SELECT 1 FROM clientes c WHERE c.id = obras.cliente_id AND usuario_in_my_empresa(c.usuario_id)
    ))
    OR (has_permission(get_my_usuario_id(), 'obras', 'excluir') AND EXISTS (
      SELECT 1 FROM clientes c WHERE c.id = obras.cliente_id AND usuario_in_my_empresa(c.usuario_id)
    ))
  );

ALTER POLICY whatsapp_delete ON public.mensagens_whatsapp
  USING (
    (is_gestor() AND usuario_in_my_empresa(usuario_id))
    OR (has_permission(get_my_usuario_id(), 'whatsapp', 'excluir') AND usuario_in_my_empresa(usuario_id))
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- B) Preset padrão de empresa nova: 'pipeline' sai, funcionalidades vão para 'pedidos'
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.montar_permissoes_preset_padrao(p_preset_key text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT jsonb_object_agg(modulo, jsonb_build_object(
    'pode_ver', p_preset_key <> 'nenhum',
    'pode_criar', p_preset_key IN ('operacional', 'total'),
    'pode_editar', p_preset_key IN ('operacional', 'total'),
    'pode_excluir', p_preset_key = 'total',
    'funcionalidades', CASE
      WHEN p_preset_key = 'total' THEN
        (SELECT jsonb_object_agg(f, true) FROM jsonb_array_elements_text(funcs) f)
      WHEN p_preset_key = 'operacional' THEN
        (SELECT jsonb_object_agg(f, f NOT IN ('gerenciar_usuarios', 'gerenciar_permissoes'))
         FROM jsonb_array_elements_text(funcs) f)
      ELSE '{}'::jsonb
    END
  ))
  FROM (VALUES
    ('dashboard',    '["filtrar_vendedor","exportar_relatorio"]'::jsonb),
    ('clientes',     '["importar","exportar","whatsapp"]'::jsonb),
    ('contatos',     '["whatsapp"]'::jsonb),
    ('pedidos',      '["importar","exportar_pdf","alterar_status","whatsapp","mover_cards","filtrar_avancado"]'::jsonb),
    ('obras',        '["alterar_status"]'::jsonb),
    ('fabricantes',  '["importar_precos","gerenciar_precos"]'::jsonb),
    ('portal',       '["importar_licencas"]'::jsonb),
    ('calendario',   '[]'::jsonb),
    ('tarefas',      '["atribuir_responsavel","alterar_status"]'::jsonb),
    ('chat',         '["criar_grupo","enviar_arquivo"]'::jsonb),
    ('whatsapp',     '[]'::jsonb),
    ('emails',       '[]'::jsonb),
    ('configuracoes','["gerenciar_usuarios","gerenciar_permissoes","ver_codigo_acesso"]'::jsonb)
  ) AS m(modulo, funcs);
$function$;


-- ─────────────────────────────────────────────────────────────────────────────
-- C) Delegação de "Gerenciar Usuários" e "Gerenciar Permissões"
-- ─────────────────────────────────────────────────────────────────────────────

ALTER POLICY usuarios_insert ON public.usuarios
  WITH CHECK (
    is_admin()
    OR (is_gestor() AND empresa_id = get_my_empresa_id())
    OR (
      has_funcionalidade(get_my_usuario_id(), 'configuracoes', 'gerenciar_usuarios')
      AND empresa_id = get_my_empresa_id()
      AND role NOT IN ('gestor', 'admin', 'empresa')
    )
  );

ALTER POLICY usuarios_delete ON public.usuarios
  USING (
    is_admin()
    OR (is_gestor() AND empresa_id = get_my_empresa_id())
    OR (
      has_funcionalidade(get_my_usuario_id(), 'configuracoes', 'gerenciar_usuarios')
      AND empresa_id = get_my_empresa_id()
      AND role NOT IN ('gestor', 'admin', 'empresa')
    )
  );

ALTER POLICY usuarios_update ON public.usuarios
  USING (
    is_admin()
    OR user_id = auth.uid()
    OR (is_gestor() AND empresa_id = get_my_empresa_id())
    OR (
      has_funcionalidade(get_my_usuario_id(), 'configuracoes', 'gerenciar_usuarios')
      AND empresa_id = get_my_empresa_id()
      AND role NOT IN ('gestor', 'admin', 'empresa')
      AND user_id <> auth.uid()
    )
  )
  WITH CHECK (
    is_admin()
    OR user_id = auth.uid()
    OR (is_gestor() AND empresa_id = get_my_empresa_id())
    OR (
      has_funcionalidade(get_my_usuario_id(), 'configuracoes', 'gerenciar_usuarios')
      AND empresa_id = get_my_empresa_id()
      AND role NOT IN ('gestor', 'admin', 'empresa')
      AND user_id <> auth.uid()
    )
  );

-- A policy de SELECT também precisa da cláusula do delegado — não é redundância.
-- `.upsert()`/`.update()` do supabase-js pedem a linha de volta por padrão (RETURNING), e
-- RETURNING de um INSERT/UPDATE é filtrado pela política de SELECT antes de voltar pro
-- cliente. Sem isto, a gravação em si teria sucesso (INSERT/UPDATE aprovado), mas o
-- Postgres falharia ao tentar devolver a linha ("new row violates row-level security
-- policy"), e a tela mostraria erro mesmo com o dado já gravado — medido em transação
-- revertida em 31/08/2026 com um delegado de teste tentando editar a permissão de um
-- colega vendedor.
ALTER POLICY permissoes_select ON public.permissoes_usuario
  USING (
    is_admin()
    OR (usuario_id = get_my_usuario_id())
    OR (is_gestor() AND usuario_in_my_empresa(usuario_id))
    OR (
      has_funcionalidade(get_my_usuario_id(), 'configuracoes', 'gerenciar_permissoes')
      AND usuario_in_my_empresa(usuario_id)
      AND NOT EXISTS (
        SELECT 1 FROM usuarios u WHERE u.id = permissoes_usuario.usuario_id AND u.role IN ('gestor', 'admin', 'empresa')
      )
    )
  );

ALTER POLICY permissoes_insert ON public.permissoes_usuario
  WITH CHECK (
    is_admin()
    OR (is_gestor() AND usuario_in_my_empresa(usuario_id))
    OR (
      has_funcionalidade(get_my_usuario_id(), 'configuracoes', 'gerenciar_permissoes')
      AND usuario_in_my_empresa(usuario_id)
      AND usuario_id <> get_my_usuario_id()
      AND NOT EXISTS (
        SELECT 1 FROM usuarios u WHERE u.id = permissoes_usuario.usuario_id AND u.role IN ('gestor', 'admin', 'empresa')
      )
    )
  );

ALTER POLICY permissoes_update ON public.permissoes_usuario
  USING (
    is_admin()
    OR (is_gestor() AND usuario_in_my_empresa(usuario_id))
    OR (
      has_funcionalidade(get_my_usuario_id(), 'configuracoes', 'gerenciar_permissoes')
      AND usuario_in_my_empresa(usuario_id)
      AND usuario_id <> get_my_usuario_id()
      AND NOT EXISTS (
        SELECT 1 FROM usuarios u WHERE u.id = permissoes_usuario.usuario_id AND u.role IN ('gestor', 'admin', 'empresa')
      )
    )
  );

ALTER POLICY permissoes_delete ON public.permissoes_usuario
  USING (
    is_admin()
    OR (is_gestor() AND usuario_in_my_empresa(usuario_id))
    OR (
      has_funcionalidade(get_my_usuario_id(), 'configuracoes', 'gerenciar_permissoes')
      AND usuario_in_my_empresa(usuario_id)
      AND usuario_id <> get_my_usuario_id()
      AND NOT EXISTS (
        SELECT 1 FROM usuarios u WHERE u.id = permissoes_usuario.usuario_id AND u.role IN ('gestor', 'admin', 'empresa')
      )
    )
  );
