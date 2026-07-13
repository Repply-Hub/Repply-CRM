-- Apelido opcional e amigável para a instância WhatsApp, exibido no lugar do
-- instance_name (que é um identificador técnico tipo "bb5fce8c_ohdsdv") na UI.
ALTER TABLE configuracoes_wapi
  ADD COLUMN IF NOT EXISTS apelido TEXT;
