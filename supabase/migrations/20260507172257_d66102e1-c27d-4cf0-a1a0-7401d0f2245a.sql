CREATE TABLE public.linhas_ignoradas_importacao (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tipo_importacao TEXT NOT NULL,
    dados_originais JSONB NOT NULL,
    motivo_ignorado TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.linhas_ignoradas_importacao ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Usuários podem ver suas próprias linhas ignoradas"
ON public.linhas_ignoradas_importacao
FOR SELECT
USING (auth.uid() = usuario_id);

CREATE POLICY "Usuários podem inserir suas próprias linhas ignoradas"
ON public.linhas_ignoradas_importacao
FOR INSERT
WITH CHECK (auth.uid() = usuario_id);

CREATE POLICY "Usuários podem excluir suas próprias linhas ignoradas"
ON public.linhas_ignoradas_importacao
FOR DELETE
USING (auth.uid() = usuario_id);

-- Create index for performance
CREATE INDEX idx_linhas_ignoradas_usuario ON public.linhas_ignoradas_importacao(usuario_id);
CREATE INDEX idx_linhas_ignoradas_tipo ON public.linhas_ignoradas_importacao(tipo_importacao);
