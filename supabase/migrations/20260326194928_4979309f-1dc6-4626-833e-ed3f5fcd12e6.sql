ALTER TABLE public.licencas_natal
  ADD COLUMN IF NOT EXISTS nome_contato text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS telefone text,
  ADD COLUMN IF NOT EXISTS endereco_obra text,
  ADD COLUMN IF NOT EXISTS construtora text,
  ADD COLUMN IF NOT EXISTS fase_obra text;