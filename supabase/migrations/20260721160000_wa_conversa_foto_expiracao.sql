-- Fotos de perfil do WhatsApp vêm em URLs assinadas do CDN da Meta
-- (pps.whatsapp.net) com expiração embutida no parâmetro `oe` (timestamp unix em
-- hex). foto_perfil_url era salva uma vez e nunca revalidada, então depois que o
-- link vencia a imagem parava de carregar (cai no fallback de iniciais/ícone) até
-- alguém abrir a conversa de novo — na prática nunca, porque o fetch em
-- WhatsAppInbox.tsx só dispara quando foto_perfil_url está NULL.
--
-- Guarda a expiração para o front-end saber quando precisa buscar uma foto nova
-- em vez de tratar "já tem foto_perfil_url" como permanente.
ALTER TABLE public.whatsapp_conversas
  ADD COLUMN IF NOT EXISTS foto_perfil_expires_at timestamptz;
