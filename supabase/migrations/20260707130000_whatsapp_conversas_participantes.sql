-- Guarda a lista de participantes de um grupo (nome + telefone) na própria conversa,
-- capturada no momento da criação via CRM, para exibir no header do grupo mesmo antes
-- de qualquer mensagem chegar (até então só derivávamos participantes dos remetentes
-- vistos nas mensagens já recebidas).

ALTER TABLE whatsapp_conversas
  ADD COLUMN IF NOT EXISTS participantes JSONB NOT NULL DEFAULT '[]'::jsonb;
