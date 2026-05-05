CREATE TABLE public.configuracoes_tabelas (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    tabela_key TEXT NOT NULL,
    colunas JSONB NOT NULL DEFAULT '[]'::jsonb,
    colunas_visiveis JSONB NOT NULL DEFAULT '[]'::jsonb,
    labels_personalizados JSONB NOT NULL DEFAULT '{}'::jsonb,
    tamanho_pagina INTEGER NOT NULL DEFAULT 10,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(empresa_id, tabela_key)
);

-- Enable RLS
ALTER TABLE public.configuracoes_tabelas ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view settings for their company"
ON public.configuracoes_tabelas
FOR SELECT
USING (
    empresa_id IN (
        SELECT empresa_id FROM public.usuarios WHERE id = auth.uid()
    )
);

CREATE POLICY "Users can insert settings for their company"
ON public.configuracoes_tabelas
FOR INSERT
WITH CHECK (
    empresa_id IN (
        SELECT empresa_id FROM public.usuarios WHERE id = auth.uid()
    )
);

CREATE POLICY "Users can update settings for their company"
ON public.configuracoes_tabelas
FOR UPDATE
USING (
    empresa_id IN (
        SELECT empresa_id FROM public.usuarios WHERE id = auth.uid()
    )
);

-- Trigger for updated_at
CREATE TRIGGER update_configuracoes_tabelas_updated_at
BEFORE UPDATE ON public.configuracoes_tabelas
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
