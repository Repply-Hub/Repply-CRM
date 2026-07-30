-- Evita que o webhook do WhatsApp sobrescreva um nome de contato editado manualmente
-- no CRM com o nome de perfil vindo da uazapi na próxima mensagem recebida.
ALTER TABLE whatsapp_conversas
  ADD COLUMN IF NOT EXISTS nome_contato_editado_manualmente BOOLEAN NOT NULL DEFAULT false;
