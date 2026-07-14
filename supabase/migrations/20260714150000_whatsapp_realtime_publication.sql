-- whatsapp_conversas/whatsapp_mensagens nunca foram adicionadas à publicação
-- supabase_realtime (diferente de chat_mensagens/chat_grupos, que já estavam).
-- src/hooks/use-whatsapp-inbox.ts depende inteiramente de postgres_changes para
-- atualizar a lista de conversas e as mensagens em tempo real, sem nenhum
-- polling de fallback — sem a tabela na publicação, mensagens novas só
-- aparecem se o usuário fechar/reabrir a conversa ou recarregar a página.

ALTER TABLE public.whatsapp_conversas REPLICA IDENTITY FULL;
ALTER TABLE public.whatsapp_mensagens REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'whatsapp_conversas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_conversas;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'whatsapp_mensagens'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_mensagens;
  END IF;
END $$;
