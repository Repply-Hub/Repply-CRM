ALTER TABLE public.tarefas ADD COLUMN IF NOT EXISTS campos_extras JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.fabricantes ADD COLUMN IF NOT EXISTS campos_extras JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.obras ADD COLUMN IF NOT EXISTS campos_extras JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_tarefas_campos_extras ON public.tarefas USING GIN (campos_extras);
CREATE INDEX IF NOT EXISTS idx_fabricantes_campos_extras ON public.fabricantes USING GIN (campos_extras);
CREATE INDEX IF NOT EXISTS idx_obras_campos_extras ON public.obras USING GIN (campos_extras);
