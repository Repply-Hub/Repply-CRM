-- A uazapi só expõe um único mecanismo de exclusão de mensagem (POST /message/delete),
-- que sempre revoga a mensagem no WhatsApp real para todos os participantes — não existe
-- na API deles um "apagar só localmente, sem afetar o outro lado". Por isso o conceito de
-- "apagar só para mim" (que ficaria oculto no CRM sem mexer no WhatsApp) foi descartado
-- em favor de uma única ação de exclusão, equivalente ao antigo "apagar para todos" (ver
-- [[whatsapp_mensagens_apagar]]) — a coluna `apagada_para`, criada para guardar quem
-- escondeu a mensagem individualmente, nunca chegou a ser usada em produção.
ALTER TABLE public.whatsapp_mensagens
  DROP COLUMN apagada_para;
