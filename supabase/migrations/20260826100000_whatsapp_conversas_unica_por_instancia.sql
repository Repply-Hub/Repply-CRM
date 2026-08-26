-- A conversa era identificada só por (empresa_id, telefone): quando o mesmo cliente
-- mandava mensagem para DUAS instâncias diferentes da mesma empresa (dois números
-- conectados em configuracoes_wapi), a segunda mensagem encontrava a mesma linha
-- da primeira e a "sequestrava" — instancia_id virava um carimbo de "última
-- instância que tocou a conversa", em vez de identificar qual conversa é qual, e
-- as duas se misturavam na Caixa de Entrada. Ver comentário completo em
-- whatsapp-webhook/index.ts (handleIncomingMessage) e whatsapp-send/index.ts.
--
-- Passa a existir uma conversa por (empresa, telefone, instância). Conversas
-- criadas antes desta migration com instancia_id NULL continuam podendo ter mais
-- de uma linha para o mesmo telefone — NULL nunca colide em UNIQUE — mas isso é
-- aceitável aqui: não há como saber retroativamente de qual instância veio cada
-- mensagem histórica já mesclada (whatsapp_mensagens não guarda instância por
-- mensagem), então o histórico antigo já misturado permanece como está por
-- decisão do Lucas em 26/08/2026.
ALTER TABLE whatsapp_conversas
  DROP CONSTRAINT whatsapp_conversas_empresa_id_telefone_key;

ALTER TABLE whatsapp_conversas
  ADD CONSTRAINT whatsapp_conversas_empresa_telefone_instancia_key
  UNIQUE (empresa_id, telefone, instancia_id);
