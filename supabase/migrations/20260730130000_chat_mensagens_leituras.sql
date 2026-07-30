-- Confirmação de leitura por usuário para conversas com múltiplos participantes
-- (grupos e Chat Geral). chat_mensagens.lida é um único booleano por mensagem —
-- funciona pra DM (só 2 participantes), mas em grupo/geral ele vira true assim
-- que QUALQUER UM lê, fazendo o duplo-check ("visualizado") aparecer prematuramente
-- mesmo faltando gente ler. Esta tabela guarda uma linha por (mensagem, usuário
-- que leu), permitindo calcular "lida por todos os participantes" de verdade.

CREATE TABLE public.chat_mensagens_leituras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mensagem_id UUID NOT NULL REFERENCES public.chat_mensagens(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  lida_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (mensagem_id, usuario_id)
);

CREATE INDEX chat_mensagens_leituras_mensagem_id_idx ON public.chat_mensagens_leituras (mensagem_id);

ALTER TABLE public.chat_mensagens_leituras ENABLE ROW LEVEL SECURITY;

-- Só quem já enxerga a mensagem original (mesma regra de chat_select) pode ver quem a leu.
CREATE POLICY chat_mensagens_leituras_select ON public.chat_mensagens_leituras FOR SELECT TO authenticated
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM public.chat_mensagens m
      WHERE m.id = chat_mensagens_leituras.mensagem_id
        AND m.empresa_id = get_my_empresa_id()
        AND (
          (m.grupo_id IS NULL AND m.recipient_id IS NULL)
          OR m.usuario_id = get_my_usuario_id()
          OR m.recipient_id = get_my_usuario_id()
          OR (
            m.grupo_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM public.chat_grupo_membros gm
              WHERE gm.grupo_id = m.grupo_id AND gm.usuario_id = get_my_usuario_id()
            )
          )
        )
    )
  );

-- Só é permitido registrar a própria leitura (usuario_id = eu mesmo), de uma
-- mensagem de outra pessoa que eu já tenho permissão de ver.
CREATE POLICY chat_mensagens_leituras_insert ON public.chat_mensagens_leituras FOR INSERT TO authenticated
  WITH CHECK (
    usuario_id = get_my_usuario_id()
    AND EXISTS (
      SELECT 1 FROM public.chat_mensagens m
      WHERE m.id = mensagem_id
        AND m.usuario_id <> get_my_usuario_id()
        AND m.empresa_id = get_my_empresa_id()
        AND (
          (m.grupo_id IS NULL AND m.recipient_id IS NULL)
          OR m.recipient_id = get_my_usuario_id()
          OR (
            m.grupo_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM public.chat_grupo_membros gm
              WHERE gm.grupo_id = m.grupo_id AND gm.usuario_id = get_my_usuario_id()
            )
          )
        )
    )
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_mensagens_leituras;
