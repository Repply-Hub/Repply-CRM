-- Cartão de contato (vCard) no WhatsApp Inbox: enviar um contato para o cliente
-- e receber um contato que ele mandou.
--
-- 1. Libera o tipo 'contato' em whatsapp_mensagens (mesmo padrão do 'chamada' em
--    20260729150000 — o CHECK é refeito por completo, nunca editado no arquivo antigo).
-- 2. Coluna contato_payload: guarda nome + telefone da pessoa compartilhada, já
--    normalizados, para a tela desenhar o cartão sem reparsear vCard.
--    Formato: { "itens": [ { "nome": "...", "telefone": "5584..." } ] }
--    É lista porque um envio pode compartilhar vários contatos de uma vez; no
--    recebimento a uazapi entrega um contato por mensagem, mas o formato é o mesmo.

ALTER TABLE whatsapp_mensagens DROP CONSTRAINT whatsapp_mensagens_tipo_check;
ALTER TABLE whatsapp_mensagens ADD CONSTRAINT whatsapp_mensagens_tipo_check
  CHECK (tipo IN ('texto', 'imagem', 'audio', 'video', 'documento', 'sticker', 'chamada', 'contato'));

ALTER TABLE whatsapp_mensagens ADD COLUMN IF NOT EXISTS contato_payload JSONB;

COMMENT ON COLUMN whatsapp_mensagens.contato_payload IS
  'Cartão de contato (tipo=contato): { itens: [{ nome, telefone }] }. Preenchido no envio (whatsapp-send) e no recebimento (whatsapp-webhook).';
