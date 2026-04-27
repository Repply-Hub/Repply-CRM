-- Create table for email tracking
CREATE TABLE public.emails (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    remetente TEXT NOT NULL,
    destinatario TEXT NOT NULL,
    assunto TEXT NOT NULL,
    corpo TEXT,
    html TEXT,
    status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'received', 'pending', 'error')),
    resend_id TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    user_id UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.emails ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own emails" 
ON public.emails 
FOR SELECT 
USING (auth.uid() = user_id OR (SELECT role FROM public.usuarios WHERE user_id = auth.uid()) IN ('admin', 'gestor'));

CREATE POLICY "Users can insert their own emails" 
ON public.emails 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_emails_updated_at
BEFORE UPDATE ON public.emails
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
