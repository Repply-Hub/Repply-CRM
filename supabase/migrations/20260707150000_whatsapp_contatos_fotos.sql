-- Cache de foto de perfil por número de telefone (não por conversa), usado para
-- exibir a foto de cada participante de um grupo no painel de detalhes — a uazapi
-- não devolve fotos de participantes em lote, só uma consulta por número via
-- /chat/details, então cacheamos aqui pra não repetir a chamada toda vez que o
-- painel abrir ou o mesmo contato aparecer em outro grupo.

CREATE TABLE IF NOT EXISTS whatsapp_contatos_fotos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  telefone TEXT NOT NULL,
  foto_perfil_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, telefone)
);

ALTER TABLE whatsapp_contatos_fotos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "empresa_own_contatos_fotos" ON whatsapp_contatos_fotos
  FOR ALL USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios WHERE user_id = auth.uid()
    )
  );
