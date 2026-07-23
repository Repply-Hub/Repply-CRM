-- Permite vincular uma tarefa a um negócio (pedido), pra exibir o histórico de
-- tarefas no painel de detalhes do negócio (antes só existia vínculo com
-- cliente/conversa, não com o negócio específico).
ALTER TABLE public.tarefas ADD COLUMN IF NOT EXISTS pedido_id uuid REFERENCES public.pedidos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tarefas_pedido_id ON public.tarefas(pedido_id);
