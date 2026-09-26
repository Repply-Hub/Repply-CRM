-- Liga a tarefa a uma OBRA de verdade (antes "Projeto/Obra" era texto livre em localStorage).
-- Anulável, herda a RLS existente de `tarefas` (sem política nova). A coluna `projeto` (texto)
-- fica como legado exibível.
ALTER TABLE public.tarefas
  ADD COLUMN IF NOT EXISTS obra_id uuid REFERENCES public.obras(id);
