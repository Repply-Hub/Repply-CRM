-- Adiciona coluna campos_extras (JSONB) para armazenar dados de importação não mapeados a campos nativos
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS campos_extras JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.contatos
  ADD COLUMN IF NOT EXISTS campos_extras JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS campos_extras JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Índices GIN para permitir consultas eficientes nos campos extras
CREATE INDEX IF NOT EXISTS idx_clientes_campos_extras ON public.clientes USING GIN (campos_extras);
CREATE INDEX IF NOT EXISTS idx_contatos_campos_extras ON public.contatos USING GIN (campos_extras);
CREATE INDEX IF NOT EXISTS idx_pedidos_campos_extras ON public.pedidos USING GIN (campos_extras);