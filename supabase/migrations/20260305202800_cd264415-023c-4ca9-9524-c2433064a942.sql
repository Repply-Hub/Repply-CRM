ALTER TABLE public.pedidos 
  ADD COLUMN IF NOT EXISTS origem_lead text,
  ADD COLUMN IF NOT EXISTS prazo_resposta date,
  ADD COLUMN IF NOT EXISTS endereco_entrega text;