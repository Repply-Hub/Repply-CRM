-- Permite registrar notificações de chamada de voz/vídeo recebida via WhatsApp
-- (evento "call" do webhook uazapi) como uma mensagem tipo 'chamada' na
-- conversa, renderizada como um chip de sistema no WhatsAppInbox.
ALTER TABLE whatsapp_mensagens DROP CONSTRAINT whatsapp_mensagens_tipo_check;
ALTER TABLE whatsapp_mensagens ADD CONSTRAINT whatsapp_mensagens_tipo_check
  CHECK (tipo IN ('texto', 'imagem', 'audio', 'video', 'documento', 'sticker', 'chamada'));
