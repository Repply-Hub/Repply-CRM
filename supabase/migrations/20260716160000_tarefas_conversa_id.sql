-- Vínculo opcional entre uma tarefa e a conversa do WhatsApp que a originou, usado
-- pelo histórico de "Notas e tarefas" no painel de detalhes do WhatsApp Inbox.
ALTER TABLE public.tarefas
  ADD COLUMN IF NOT EXISTS conversa_id uuid REFERENCES public.whatsapp_conversas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tarefas_conversa_id ON public.tarefas (conversa_id);
