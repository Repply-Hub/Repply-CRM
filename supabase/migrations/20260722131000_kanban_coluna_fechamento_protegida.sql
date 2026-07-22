-- Estende a proteção contra exclusão/troca de slug que já existia só para 'perdido'
-- (ver 20260722120000_kanban_coluna_perdido_padrao.sql) para também cobrir 'fechamento',
-- deixando as duas colunas de sistema com o mesmo nível de proteção.

CREATE OR REPLACE FUNCTION public.proteger_kanban_coluna_perdido()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.slug IN ('perdido', 'fechamento') AND OLD.is_sistema THEN
      RAISE EXCEPTION 'A coluna "%" é padrão do sistema e não pode ser excluída', OLD.nome;
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.slug IN ('perdido', 'fechamento') AND OLD.is_sistema AND NEW.slug <> OLD.slug THEN
      RAISE EXCEPTION 'A coluna "%" é padrão do sistema e não pode ter o slug alterado', OLD.nome;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END; $$;
