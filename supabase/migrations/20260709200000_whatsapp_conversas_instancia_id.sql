-- Rastreia de qual instância uazapi (configuracoes_wapi) a conversa recebeu/enviou
-- a última mensagem. Usado para filtrar conversas por instância na Caixa de Entrada
-- quando a empresa tem mais de uma instância conectada com usuários diferentes.
ALTER TABLE whatsapp_conversas
  ADD COLUMN IF NOT EXISTS instancia_id UUID REFERENCES configuracoes_wapi(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversas_instancia_id
  ON whatsapp_conversas(instancia_id);
