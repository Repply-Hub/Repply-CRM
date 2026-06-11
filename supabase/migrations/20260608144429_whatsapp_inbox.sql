-- WhatsApp Inbox: configurações uazapi, conversas e mensagens bidirecionais

-- Credenciais do uazapi por empresa
CREATE TABLE IF NOT EXISTS configuracoes_wapi (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  instance_url TEXT NOT NULL,
  api_key TEXT NOT NULL,
  instance_name TEXT NOT NULL DEFAULT 'default',
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'connecting')),
  webhook_secret TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id)
);

-- Thread de conversa por número de telefone
CREATE TABLE IF NOT EXISTS whatsapp_conversas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  telefone TEXT NOT NULL,
  nome_contato TEXT,
  cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL,
  contato_id UUID REFERENCES contatos(id) ON DELETE SET NULL,
  ultima_mensagem TEXT,
  ultima_mensagem_at TIMESTAMPTZ,
  nao_lidas INTEGER NOT NULL DEFAULT 0,
  arquivada BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, telefone)
);

-- Mensagens bidirecionais por conversa
CREATE TABLE IF NOT EXISTS whatsapp_mensagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id UUID NOT NULL REFERENCES whatsapp_conversas(id) ON DELETE CASCADE,
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  direcao TEXT NOT NULL CHECK (direcao IN ('entrada', 'saida')),
  conteudo TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'texto' CHECK (tipo IN ('texto', 'imagem', 'audio', 'video', 'documento', 'sticker')),
  media_url TEXT,
  media_mime TEXT,
  wamid TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'enviado' CHECK (status IN ('enviando', 'enviado', 'entregue', 'lido', 'erro')),
  usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  lida BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversas_empresa ON whatsapp_conversas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversas_telefone ON whatsapp_conversas(telefone);
CREATE INDEX IF NOT EXISTS idx_whatsapp_mensagens_conversa ON whatsapp_mensagens(conversa_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_mensagens_empresa ON whatsapp_mensagens(empresa_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_mensagens_created ON whatsapp_mensagens(created_at);

-- RLS
ALTER TABLE configuracoes_wapi ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_conversas ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_mensagens ENABLE ROW LEVEL SECURITY;

-- configuracoes_wapi: só a própria empresa acessa
CREATE POLICY "empresa_own_wapi_config" ON configuracoes_wapi
  FOR ALL USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios WHERE user_id = auth.uid()
    )
  );

-- whatsapp_conversas: mesma empresa
CREATE POLICY "empresa_own_conversas" ON whatsapp_conversas
  FOR ALL USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios WHERE user_id = auth.uid()
    )
  );

-- whatsapp_mensagens: mesma empresa
CREATE POLICY "empresa_own_mensagens" ON whatsapp_mensagens
  FOR ALL USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios WHERE user_id = auth.uid()
    )
  );

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_configuracoes_wapi_updated_at
  BEFORE UPDATE ON configuracoes_wapi
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_whatsapp_conversas_updated_at
  BEFORE UPDATE ON whatsapp_conversas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
