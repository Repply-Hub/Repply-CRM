-- Marcadores padrão do sistema (is_sistema = true: Quente, Frio, Futura) não podem ser
-- excluídos nem ter o slug alterado, mesmo por admin/gestor via API direta — mesma proteção
-- já aplicada às colunas de sistema do Kanban (ver 20260722131000_kanban_coluna_fechamento_protegida.sql).

CREATE OR REPLACE FUNCTION public.proteger_marcador_sistema()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_sistema THEN
      RAISE EXCEPTION 'O marcador "%" é padrão do sistema e não pode ser excluído', OLD.nome;
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.is_sistema AND NEW.slug <> OLD.slug THEN
      RAISE EXCEPTION 'O marcador "%" é padrão do sistema e não pode ter o slug alterado', OLD.nome;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END; $$;

CREATE TRIGGER trg_proteger_marcador_sistema
BEFORE UPDATE OR DELETE ON public.marcadores
FOR EACH ROW EXECUTE FUNCTION public.proteger_marcador_sistema();
