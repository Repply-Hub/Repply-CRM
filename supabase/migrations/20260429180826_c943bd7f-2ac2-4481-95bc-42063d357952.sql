CREATE TABLE public.emails_recebidos (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    resend_id TEXT UNIQUE NOT NULL,
    remetente TEXT NOT NULL,
    destinatarios TEXT[] NOT NULL,
    assunto TEXT,
    corpo_html TEXT,
    lido BOOLEAN DEFAULT false,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.emails_recebidos ENABLE ROW LEVEL SECURITY;

-- Política para permitir que usuários vejam e-mails destinados ao seu endereço configurado
-- Nota: Isso assume que o e-mail do destinatário bate com o e-mail do usuário ou um domínio que ele gerencia.
CREATE POLICY "Usuários podem ver seus próprios e-mails recebidos"
ON public.emails_recebidos
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.user_integrations
        WHERE user_integrations.resend_from_email = ANY(emails_recebidos.destinatarios)
        AND user_integrations.user_id = auth.uid()
    )
    OR 
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.email = ANY(emails_recebidos.destinatarios)
      AND auth.users.id = auth.uid()
    )
);
