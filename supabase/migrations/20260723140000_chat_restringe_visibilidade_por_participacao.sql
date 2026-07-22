-- Corrige vazamento de privacidade no chat interno: hoje QUALQUER usuário da empresa
-- consegue ler QUALQUER mensagem de grupo (a policy "Users can view relevant messages"
-- libera `grupo_id IS NOT NULL` sem checar se o usuário é membro do grupo) e existe uma
-- segunda policy SELECT ("chat_select") totalmente permissiva por empresa_id que, como
-- policies do mesmo comando são combinadas com OR, anula qualquer restrição da primeira.
-- Da mesma forma, chat_grupos_select mostra todos os grupos da empresa, não só os que o
-- usuário participa.
--
-- Regra nova:
--   - Chat Geral (grupo_id e recipient_id nulos): continua visível pra empresa toda.
--   - Mensagens de grupo: só visíveis pra quem é membro do grupo (chat_grupo_membros).
--   - DMs: só visíveis pro remetente e pro destinatário.
--   - is_admin() (super-admin global) continua enxergando tudo, para suporte.

DROP POLICY IF EXISTS chat_select ON public.chat_mensagens;
DROP POLICY IF EXISTS "Users can view relevant messages" ON public.chat_mensagens;

CREATE POLICY chat_select ON public.chat_mensagens FOR SELECT TO authenticated
  USING (
    is_admin()
    OR (
      empresa_id = get_my_empresa_id()
      AND (
        (grupo_id IS NULL AND recipient_id IS NULL)
        OR usuario_id = get_my_usuario_id()
        OR recipient_id = get_my_usuario_id()
        OR (
          grupo_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.chat_grupo_membros gm
            WHERE gm.grupo_id = chat_mensagens.grupo_id
              AND gm.usuario_id = get_my_usuario_id()
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS chat_grupos_select ON public.chat_grupos;
CREATE POLICY chat_grupos_select ON public.chat_grupos FOR SELECT TO authenticated
  USING (
    is_admin()
    OR (
      empresa_id = get_my_empresa_id()
      AND (
        criado_por = get_my_usuario_id()
        OR EXISTS (
          SELECT 1 FROM public.chat_grupo_membros gm
          WHERE gm.grupo_id = chat_grupos.id
            AND gm.usuario_id = get_my_usuario_id()
        )
      )
    )
  );

-- Mesma restrição pra lista de participantes: só quem já enxerga o grupo (membro,
-- criador ou admin) consegue listar quem está nele.
DROP POLICY IF EXISTS chat_grupo_membros_select ON public.chat_grupo_membros;
CREATE POLICY chat_grupo_membros_select ON public.chat_grupo_membros FOR SELECT TO authenticated
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM public.chat_grupos g
      WHERE g.id = chat_grupo_membros.grupo_id
        AND g.empresa_id = get_my_empresa_id()
        AND (
          g.criado_por = get_my_usuario_id()
          OR EXISTS (
            SELECT 1 FROM public.chat_grupo_membros gm2
            WHERE gm2.grupo_id = g.id AND gm2.usuario_id = get_my_usuario_id()
          )
        )
    )
  );
