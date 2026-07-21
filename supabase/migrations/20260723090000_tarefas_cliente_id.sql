-- Permite vincular uma tarefa a um cliente/empresa, pra aparecer no painel de
-- detalhe do cliente junto com os negócios (não havia nenhuma relação com
-- clientes até então, só campos livres como "projeto").
ALTER TABLE public.tarefas ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tarefas_cliente_id ON public.tarefas(cliente_id);
