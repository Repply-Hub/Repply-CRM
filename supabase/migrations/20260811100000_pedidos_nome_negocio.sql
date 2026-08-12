-- Nome customizado do negócio. Quando NULL, o nome exibido continua sendo montado
-- automaticamente no front como "empresa + fabricante" (comportamento atual).
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS nome text;

COMMENT ON COLUMN public.pedidos.nome IS 'Nome customizado do negócio. NULL = usar nome automático (empresa | fabricante).';
