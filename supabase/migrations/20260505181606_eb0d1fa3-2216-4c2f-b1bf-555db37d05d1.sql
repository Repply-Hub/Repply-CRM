ALTER TABLE public.configuracoes_tabelas 
ADD COLUMN modelos JSONB NOT NULL DEFAULT '[]'::jsonb;
