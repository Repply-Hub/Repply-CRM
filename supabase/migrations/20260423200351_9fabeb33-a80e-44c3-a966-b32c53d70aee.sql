ALTER TABLE public.empresas 
ADD COLUMN IF NOT EXISTS logo_url TEXT,
ADD COLUMN IF NOT EXISTS nome_fantasia TEXT,
ADD COLUMN IF NOT EXISTS cor_primaria TEXT DEFAULT '#0f172a',
ADD COLUMN IF NOT EXISTS subtitulo_header TEXT DEFAULT 'Gestão Comercial',
ADD COLUMN IF NOT EXISTS banner_url TEXT;

-- Garantir que as permissões de RLS permitam que o dono da empresa atualize esses dados
CREATE POLICY "Donos podem atualizar sua própria empresa" 
ON public.empresas 
FOR UPDATE 
USING (auth.uid() = owner_id);
