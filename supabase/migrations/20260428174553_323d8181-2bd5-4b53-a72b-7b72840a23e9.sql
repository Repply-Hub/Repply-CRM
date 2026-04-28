CREATE TABLE public.status_obras (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL,
  slug TEXT NOT NULL,
  nome TEXT NOT NULL,
  cor TEXT NOT NULL DEFAULT 'primary',
  ordem INTEGER NOT NULL DEFAULT 0,
  is_sistema BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.status_obras ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own company status_obras" 
ON public.status_obras 
FOR SELECT 
USING (empresa_id IN (SELECT empresa_id FROM public.usuarios WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert their own company status_obras" 
ON public.status_obras 
FOR INSERT 
WITH CHECK (empresa_id IN (SELECT empresa_id FROM public.usuarios WHERE user_id = auth.uid()));

CREATE POLICY "Users can update their own company status_obras" 
ON public.status_obras 
FOR UPDATE 
USING (empresa_id IN (SELECT empresa_id FROM public.usuarios WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete their own company status_obras" 
ON public.status_obras 
FOR DELETE 
USING (empresa_id IN (SELECT empresa_id FROM public.usuarios WHERE user_id = auth.uid()));

-- Add unique constraint for company + slug
ALTER TABLE public.status_obras ADD CONSTRAINT unique_status_obra_slug_per_company UNIQUE (empresa_id, slug);

-- Add trigger for updated_at
CREATE TRIGGER update_status_obras_updated_at
BEFORE UPDATE ON public.status_obras
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Function to seed default status for new companies or existing ones
CREATE OR REPLACE FUNCTION public.seed_default_status_obras(target_empresa_id UUID)
RETURNS void AS $$
BEGIN
  INSERT INTO public.status_obras (empresa_id, slug, nome, ordem, is_sistema, cor)
  VALUES 
    (target_empresa_id, 'projeto', 'Projeto', 0, true, 'primary'),
    (target_empresa_id, 'lancamento', 'Lançamento', 1, true, 'primary'),
    (target_empresa_id, 'fundacao', 'Fundação', 2, true, 'primary'),
    (target_empresa_id, 'estrutura', 'Estrutura', 3, true, 'primary'),
    (target_empresa_id, 'acabamento_inicial', 'Acabamento inicial', 4, true, 'primary'),
    (target_empresa_id, 'acabamento_final', 'Acabamento final', 5, true, 'primary'),
    (target_empresa_id, 'concluida', 'Concluída', 6, true, 'primary')
  ON CONFLICT (empresa_id, slug) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
