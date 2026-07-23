-- Reações (emoji) em mensagens do WhatsApp, como no app oficial. Um array em vez de
-- tabela separada porque cada mensagem tem no máximo uma reação por "identidade" (o
-- contato, ou "eu" no caso da própria instância) — não precisa de índices/joins.
-- Formato de cada item: { emoji, autor, nome, at }, onde `autor` é o telefone do
-- contato ou o literal "eu" para reações da própria instância (enviadas pelo CRM ou
-- refletidas do celular/WhatsApp Web).
ALTER TABLE public.whatsapp_mensagens
  ADD COLUMN reacoes jsonb NOT NULL DEFAULT '[]'::jsonb;
