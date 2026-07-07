-- Suporte a grupos do WhatsApp: identifica a conversa como grupo e guarda
-- o participante (nome + telefone) que enviou cada mensagem recebida, para
-- exibir "quem enviou o quê" dentro de um grupo (o telefone/nome do
-- whatsapp_conversas é o do grupo, não de um participante específico).

ALTER TABLE whatsapp_conversas
  ADD COLUMN IF NOT EXISTS is_group BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE whatsapp_mensagens
  ADD COLUMN IF NOT EXISTS remetente_nome TEXT,
  ADD COLUMN IF NOT EXISTS remetente_telefone TEXT;
