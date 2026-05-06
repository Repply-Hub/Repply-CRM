-- Adiciona colunas de controle de leitura se não existirem
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_mensagens' AND column_name = 'lida') THEN
    ALTER TABLE public.chat_mensagens ADD COLUMN lida BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_mensagens' AND column_name = 'lida_em') THEN
    ALTER TABLE public.chat_mensagens ADD COLUMN lida_em TIMESTAMP WITH TIME ZONE;
  END IF;
END $$;

-- Garante que todos possam atualizar o status de leitura das mensagens que recebem
-- Para DMs: o destinatário pode marcar como lida
CREATE POLICY "Destinatários podem marcar DMs como lidas" 
ON public.chat_mensagens 
FOR UPDATE 
USING (
  recipient_id IN (
    SELECT id FROM public.usuarios WHERE user_id = auth.uid()
  )
);

-- Para Grupos e Geral: No momento vamos permitir que qualquer um da mesma empresa atualize
-- (Idealmente teríamos uma tabela chat_mensagens_lidas para controle individual por usuário em grupos/geral,
-- mas para simplificar e atender o requisito de notificação similar ao e-mail:)
CREATE POLICY "Membros da empresa podem marcar mensagens de grupo como lidas" 
ON public.chat_mensagens 
FOR UPDATE 
USING (
  empresa_id IN (
    SELECT empresa_id FROM public.usuarios WHERE user_id = auth.uid()
  )
);
