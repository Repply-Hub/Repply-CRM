-- Soft-delete de mensagens do WhatsApp, como no app oficial: "apagar para mim" só
-- esconde a mensagem de quem apagou (útil já que a conversa é compartilhada entre
-- vários atendentes), enquanto "apagar para todos" reflete no WhatsApp real via
-- POST /message/delete da uazapi (ver edge function whatsapp-delete-message) e some
-- para todo mundo. Mantém `conteudo`/`media_url` intactos no banco (só oculta na UI)
-- para não perder o histórico usado por useWaBuscarMensagens e pela auditoria.
ALTER TABLE public.whatsapp_mensagens
  ADD COLUMN apagada_para_todos boolean NOT NULL DEFAULT false,
  ADD COLUMN apagada_para uuid[] NOT NULL DEFAULT '{}';
