-- Adicionar coluna para exclusão lógica
ALTER TABLE public.emails_recebidos 
ADD COLUMN IF NOT EXISTS excluido BOOLEAN DEFAULT false;

-- Atualizar política de visualização para não mostrar excluídos
DROP POLICY IF EXISTS "Usuários podem ver seus próprios e-mails recebidos" ON public.emails_recebidos;
CREATE POLICY "Usuários podem ver seus próprios e-mails recebidos" 
ON public.emails_recebidos 
FOR SELECT 
USING (auth.uid() = user_id AND (excluido IS FALSE OR excluido IS NULL));

-- Garantir que usuários podem atualizar seus próprios e-mails (para marcar como excluído)
DROP POLICY IF EXISTS "Usuários podem atualizar seus próprios e-mails recebidos" ON public.emails_recebidos;
CREATE POLICY "Usuários podem atualizar seus próprios e-mails recebidos" 
ON public.emails_recebidos 
FOR UPDATE 
USING (auth.uid() = user_id);
