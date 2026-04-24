-- 1. Add recipient_id column for DMs
ALTER TABLE public.chat_mensagens 
ADD COLUMN recipient_id UUID REFERENCES public.usuarios(id);

-- 2. Update existing messages (optional, here they are all 'geral' anyway)
-- UPDATE public.chat_mensagens SET recipient_id = NULL WHERE recipient_id IS NOT NULL;

-- 3. Update RLS policies for chat_mensagens
-- We need to ensure users only see messages where:
-- - It's a public channel (grupo_id IS NULL AND recipient_id IS NULL)
-- - It's a group they belong to (not implemented yet, but keeping grupo_id logic)
-- - They are the sender OR the recipient of a DM

DROP POLICY IF EXISTS "Users can view messages from their company" ON public.chat_mensagens;

CREATE POLICY "Users can view relevant messages"
ON public.chat_mensagens
FOR SELECT
TO authenticated
USING (
  empresa_id IN (
    SELECT empresa_id FROM public.usuarios WHERE user_id = auth.uid()
  ) AND (
    (grupo_id IS NULL AND recipient_id IS NULL) OR -- Chat Geral
    (recipient_id = (SELECT id FROM public.usuarios WHERE user_id = auth.uid())) OR -- They are recipient
    (usuario_id = (SELECT id FROM public.usuarios WHERE user_id = auth.uid())) OR -- They are sender
    (grupo_id IS NOT NULL) -- Keeping group logic open (simplified for now)
  )
);
