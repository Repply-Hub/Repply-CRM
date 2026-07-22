-- Permite marcar manualmente uma conversa como "não lida" mesmo quando ela já
-- está atribuída a um responsável (conversas atribuídas deixam de mostrar o
-- estado "não lida" automaticamente a partir de mensagens recebidas — só voltam
-- a exibi-lo se o usuário selecionar essa ação no menu "..." do header).
ALTER TABLE public.whatsapp_conversas
  ADD COLUMN nao_lidas_forcada boolean NOT NULL DEFAULT false;
