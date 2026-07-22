-- Suporte a "responder mensagem" (citação) no chat interno, no mesmo espírito do
-- reply do WhatsApp Inbox (20260716120000_whatsapp_mensagens_reply.sql): guarda um
-- snapshot por valor do conteúdo/remetente citados, não só a FK, pra citação continuar
-- aparecendo mesmo se a mensagem original for apagada depois (chat_mensagens_delete_propria
-- já permite o autor excluir a própria mensagem). quoted_mensagem_id é mantido à parte
-- pra permitir "pular pra mensagem original" quando ela ainda existir.
ALTER TABLE public.chat_mensagens
  ADD COLUMN IF NOT EXISTS quoted_mensagem_id UUID REFERENCES public.chat_mensagens(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quoted_conteudo TEXT,
  ADD COLUMN IF NOT EXISTS quoted_arquivo_nome TEXT,
  ADD COLUMN IF NOT EXISTS quoted_arquivo_tipo TEXT,
  ADD COLUMN IF NOT EXISTS quoted_remetente_nome TEXT;
