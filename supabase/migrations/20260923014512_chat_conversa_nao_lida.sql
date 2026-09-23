-- "Marcar conversa como não lida" no chat interno, privado por pessoa.
--
-- O não-lido do chat interno é um booleano por mensagem (chat_mensagens.lida), que vira
-- true assim que QUALQUER UM lê — então reverter lida=false num grupo reapareceria como
-- não-lida para TODOS. Esta tabela guarda a marcação de UMA pessoa para UMA conversa, sem
-- tocar nas mensagens: fica privada e acompanha a pessoa em qualquer aparelho.
--
-- `alvo` é a chave da conversa, a mesma de chaveDoAlvo/useUnreadChatByTarget:
--   'geral' | 'grupo_<uuid>' | 'dm_<uuid do outro>'.

CREATE TABLE public.chat_conversa_nao_lida (
  usuario_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  alvo TEXT NOT NULL,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, alvo)
);

ALTER TABLE public.chat_conversa_nao_lida ENABLE ROW LEVEL SECURITY;

-- Cada pessoa só enxerga, cria e apaga as PRÓPRIAS marcações. is_admin() mantém suporte.
CREATE POLICY chat_conversa_nao_lida_select ON public.chat_conversa_nao_lida FOR SELECT TO authenticated
  USING (is_admin() OR usuario_id = get_my_usuario_id());

CREATE POLICY chat_conversa_nao_lida_insert ON public.chat_conversa_nao_lida FOR INSERT TO authenticated
  WITH CHECK (usuario_id = get_my_usuario_id() AND empresa_id = get_my_empresa_id());

CREATE POLICY chat_conversa_nao_lida_delete ON public.chat_conversa_nao_lida FOR DELETE TO authenticated
  USING (usuario_id = get_my_usuario_id());

-- Tempo real: marcar num aparelho reflete no outro na hora (como chat_mensagens_leituras).
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_conversa_nao_lida;
