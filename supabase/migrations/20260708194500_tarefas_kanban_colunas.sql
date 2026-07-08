-- Tabela de colunas customizadas do Kanban de Tarefas por empresa (espelha kanban_colunas,
-- mas em tabela própria em vez de campo discriminador — mesmo padrão adotado para status_obras).
CREATE TABLE public.tarefas_kanban_colunas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL,
  slug TEXT NOT NULL,
  nome TEXT NOT NULL,
  cor TEXT NOT NULL DEFAULT 'kanban-new',
  ordem INTEGER NOT NULL DEFAULT 0,
  is_sistema BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, slug)
);

CREATE INDEX idx_tarefas_kanban_colunas_empresa ON public.tarefas_kanban_colunas(empresa_id, ordem);

ALTER TABLE public.tarefas_kanban_colunas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tarefas_kanban_colunas_select"
ON public.tarefas_kanban_colunas FOR SELECT TO authenticated
USING (is_admin() OR empresa_id = get_my_empresa_id());

CREATE POLICY "tarefas_kanban_colunas_insert"
ON public.tarefas_kanban_colunas FOR INSERT TO authenticated
WITH CHECK (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id()));

CREATE POLICY "tarefas_kanban_colunas_update"
ON public.tarefas_kanban_colunas FOR UPDATE TO authenticated
USING (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id()));

CREATE POLICY "tarefas_kanban_colunas_delete"
ON public.tarefas_kanban_colunas FOR DELETE TO authenticated
USING (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id()));

CREATE TRIGGER update_tarefas_kanban_colunas_updated_at
BEFORE UPDATE ON public.tarefas_kanban_colunas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Popular colunas padrão para todas as empresas existentes. Os slugs usam os mesmos valores
-- já gravados em tarefas.status hoje ('pendente', 'em andamento', 'concluida') para que tarefas
-- existentes continuem caindo na coluna certa sem precisar de backfill.
INSERT INTO public.tarefas_kanban_colunas (empresa_id, slug, nome, cor, ordem, is_sistema)
SELECT e.id, v.slug, v.nome, v.cor, v.ordem, true
FROM public.empresas e
CROSS JOIN (VALUES
  ('pendente', 'A fazer', 'destructive', 0),
  ('em andamento', 'Em andamento', 'kanban-budget', 1),
  ('concluida', 'Concluído', 'kanban-closed', 2)
) AS v(slug, nome, cor, ordem)
ON CONFLICT (empresa_id, slug) DO NOTHING;

-- Trigger para popular colunas padrão ao criar nova empresa
CREATE OR REPLACE FUNCTION public.criar_tarefas_kanban_colunas_padrao()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.tarefas_kanban_colunas (empresa_id, slug, nome, cor, ordem, is_sistema) VALUES
    (NEW.id, 'pendente', 'A fazer', 'destructive', 0, true),
    (NEW.id, 'em andamento', 'Em andamento', 'kanban-budget', 1, true),
    (NEW.id, 'concluida', 'Concluído', 'kanban-closed', 2, true)
  ON CONFLICT (empresa_id, slug) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_criar_tarefas_kanban_colunas_padrao
AFTER INSERT ON public.empresas
FOR EACH ROW EXECUTE FUNCTION public.criar_tarefas_kanban_colunas_padrao();
