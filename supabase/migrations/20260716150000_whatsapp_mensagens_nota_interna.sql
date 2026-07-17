-- Notas internas no timeline do WhatsApp Inbox (ex: "Fulano assumiu esta conversa"):
-- nunca são enviadas ao WhatsApp (não passam por whatsapp-send/uazapi) e só ficam
-- visíveis para usuários internos, já que a RLS de whatsapp_mensagens (wa_mensagens_access)
-- exige auth.uid() mapeado em usuarios da mesma empresa — não há acesso de lead/portal.
ALTER TABLE public.whatsapp_mensagens
  ADD COLUMN IF NOT EXISTS is_nota_interna boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.whatsapp_mensagens.is_nota_interna IS
  'Nota de sistema (ex: atribuição de responsável) — não é uma mensagem real trocada com o contato.';
