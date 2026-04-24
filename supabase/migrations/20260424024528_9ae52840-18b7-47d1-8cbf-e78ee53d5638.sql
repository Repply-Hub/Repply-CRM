-- Add columns to clientes table
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS classificacao TEXT;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS data_criacao TEXT;

-- Add columns to contatos table
ALTER TABLE public.contatos ADD COLUMN IF NOT EXISTS classificacao TEXT;
ALTER TABLE public.contatos ADD COLUMN IF NOT EXISTS data_criacao TEXT;

-- Refresh view if any (none detected but good practice)
-- Ensure RLS is still active (it is, as we only added columns)
