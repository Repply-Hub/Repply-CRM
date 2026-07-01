-- Armazena a URL da foto de perfil do WhatsApp do contato, buscada via uazapi (POST /chat/details)
ALTER TABLE whatsapp_conversas
  ADD COLUMN IF NOT EXISTS foto_perfil_url TEXT;
