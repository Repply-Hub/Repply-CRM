-- Suporte a "responder mensagem" (reply/quote) no chat WhatsApp, para grupos e
-- conversas individuais. Guarda um snapshot da mensagem citada (em vez de só o
-- wamid) para a citação continuar sendo exibida mesmo se a mensagem original for
-- apagada depois.
ALTER TABLE whatsapp_mensagens
  ADD COLUMN IF NOT EXISTS quoted_wamid TEXT,
  ADD COLUMN IF NOT EXISTS quoted_conteudo TEXT,
  ADD COLUMN IF NOT EXISTS quoted_tipo TEXT,
  ADD COLUMN IF NOT EXISTS quoted_remetente_nome TEXT;
