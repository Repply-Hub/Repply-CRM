-- Alterar colunas para permitir NULL
ALTER TABLE public.empresas ALTER COLUMN nome DROP NOT NULL;
ALTER TABLE public.usuarios ALTER COLUMN nome DROP NOT NULL;
ALTER TABLE public.clientes ALTER COLUMN empresa DROP NOT NULL;
ALTER TABLE public.contatos ALTER COLUMN empresa DROP NOT NULL;
ALTER TABLE public.obras ALTER COLUMN nome_obra DROP NOT NULL;
ALTER TABLE public.fabricantes ALTER COLUMN nome DROP NOT NULL;
ALTER TABLE public.kanban_colunas ALTER COLUMN nome DROP NOT NULL;
ALTER TABLE public.chat_grupos ALTER COLUMN nome DROP NOT NULL;
ALTER TABLE public.colunas_customizadas ALTER COLUMN nome DROP NOT NULL;
ALTER TABLE public.perfis_customizados ALTER COLUMN nome DROP NOT NULL;
