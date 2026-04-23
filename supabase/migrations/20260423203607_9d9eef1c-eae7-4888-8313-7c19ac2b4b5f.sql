CREATE TABLE public.colunas_customizadas (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    tabela TEXT NOT NULL, -- 'pedidos', 'clientes', 'tarefas', etc.
    nome TEXT NOT NULL,
    slug TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'text', -- 'text', 'number', 'date'
    ordem INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(empresa_id, tabela, slug)
);

ALTER TABLE public.colunas_customizadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Colunas customizadas são visíveis pela empresa"
ON public.colunas_customizadas FOR SELECT
USING (auth.uid() IN (SELECT user_id FROM public.usuarios WHERE empresa_id = colunas_customizadas.empresa_id));

CREATE POLICY "Gestores podem gerenciar colunas customizadas"
ON public.colunas_customizadas FOR ALL
USING (auth.uid() IN (SELECT user_id FROM public.usuarios WHERE empresa_id = colunas_customizadas.empresa_id AND role IN ('admin', 'gestor', 'empresa')));

CREATE TRIGGER update_colunas_customizadas_updated_at
BEFORE UPDATE ON public.colunas_customizadas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
