-- Torna a coluna "Perdido" (slug 'perdido') padrão obrigatória do Kanban de Negócios:
-- criada automaticamente para empresas novas e retroativamente para empresas existentes,
-- e protegida contra exclusão/alteração de slug via trigger.

-- 1. Backfill: garante a coluna 'perdido' para todas as empresas que ainda não a têm
INSERT INTO public.kanban_colunas (empresa_id, slug, nome, cor, ordem, is_sistema)
SELECT e.id, 'perdido', 'Perdido', 'destructive',
       COALESCE((SELECT MAX(k.ordem) + 1 FROM public.kanban_colunas k WHERE k.empresa_id = e.id), 0),
       true
FROM public.empresas e
ON CONFLICT (empresa_id, slug) DO UPDATE SET is_sistema = true;

-- 2. Atualiza a função de seed para novas empresas incluir a coluna 'perdido'
CREATE OR REPLACE FUNCTION public.criar_kanban_colunas_padrao()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.kanban_colunas (empresa_id, slug, nome, cor, ordem, is_sistema) VALUES
    (NEW.id, 'novo_lead', 'Novo Lead', 'kanban-new', 0, true),
    (NEW.id, 'elaboracao', 'Elaboração de Orçamento', 'kanban-budget', 1, true),
    (NEW.id, 'enviado', 'Orçamento Enviado', 'kanban-sent', 2, true),
    (NEW.id, 'negociacao', 'Negociação', 'kanban-negotiation', 3, true),
    (NEW.id, 'fechamento', 'Fechamento', 'kanban-closed', 4, true),
    (NEW.id, 'perdido', 'Perdido', 'destructive', 5, true)
  ON CONFLICT (empresa_id, slug) DO NOTHING;
  RETURN NEW;
END; $$;

-- 3. Protege a coluna 'perdido' contra exclusão e troca de slug, a nível de banco
CREATE OR REPLACE FUNCTION public.proteger_kanban_coluna_perdido()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.slug = 'perdido' AND OLD.is_sistema THEN
      RAISE EXCEPTION 'A coluna "Perdido" é padrão do sistema e não pode ser excluída';
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.slug = 'perdido' AND OLD.is_sistema AND NEW.slug <> OLD.slug THEN
      RAISE EXCEPTION 'A coluna "Perdido" é padrão do sistema e não pode ter o slug alterado';
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS trg_proteger_kanban_coluna_perdido ON public.kanban_colunas;
CREATE TRIGGER trg_proteger_kanban_coluna_perdido
  BEFORE UPDATE OR DELETE ON public.kanban_colunas
  FOR EACH ROW EXECUTE FUNCTION public.proteger_kanban_coluna_perdido();
