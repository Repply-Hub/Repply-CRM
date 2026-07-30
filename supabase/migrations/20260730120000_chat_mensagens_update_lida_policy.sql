-- chat_mensagens tem policies de SELECT/INSERT/DELETE, mas nunca teve uma de UPDATE.
-- Sem ela, o UPDATE de useMarkChatAsRead (marcar lida=true/lida_em=now()) é bloqueado
-- silenciosamente pelo RLS (0 linhas afetadas, sem erro) — o que quebra tanto o badge de
-- não lidas quanto a nova confirmação de leitura (double-check) no chat interno, já que
-- ambos dependem da coluna `lida` realmente mudar no banco.
--
-- Regra: só quem participa da conversa (destinatário da DM, membro do grupo, ou qualquer
-- um da empresa no Chat Geral) pode marcar como lida — e nunca a própria mensagem
-- (usuario_id <> get_my_usuario_id()), espelhando o filtro .neq('usuario_id', me.id) que
-- o hook já aplica no client. is_admin() mantém acesso de suporte, como nas demais policies.

DROP POLICY IF EXISTS chat_update_lida ON public.chat_mensagens;

CREATE POLICY chat_update_lida ON public.chat_mensagens FOR UPDATE TO authenticated
  USING (
    is_admin()
    OR (
      empresa_id = get_my_empresa_id()
      AND usuario_id <> get_my_usuario_id()
      AND (
        (grupo_id IS NULL AND recipient_id IS NULL)
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
  )
  WITH CHECK (
    is_admin()
    OR (
      empresa_id = get_my_empresa_id()
      AND usuario_id <> get_my_usuario_id()
      AND (
        (grupo_id IS NULL AND recipient_id IS NULL)
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
