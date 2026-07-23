-- A proteção contra exclusão de "Fechamento"/"Perdido" deve bloquear apenas a exclusão
-- direta da coluna (usuário tentando apagar só a coluna, com o funil ainda existindo).
-- Ela não pode impedir a exclusão em cascata dessas colunas quando o próprio funil é
-- excluído — hoje isso trava a exclusão de qualquer funil criado pelo usuário, porque o
-- DELETE FROM funis cascadeia para kanban_colunas e o trigger barrava a cascata inteira.
--
-- Como a ação de FK ON DELETE CASCADE roda como um trigger AFTER DELETE na tabela pai
-- (funis), quando a cascata chega em kanban_colunas a linha do funil já foi removida.
-- Usamos isso para distinguir: se o funil ainda existe, é exclusão direta da coluna
-- (bloqueia); se o funil não existe mais, é cascata da exclusão do funil (permite).
CREATE OR REPLACE FUNCTION public.proteger_kanban_coluna_perdido()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_funil_existe BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.slug IN ('perdido', 'fechamento') AND OLD.is_sistema THEN
      SELECT EXISTS(SELECT 1 FROM public.funis WHERE id = OLD.funil_id) INTO v_funil_existe;
      IF v_funil_existe THEN
        RAISE EXCEPTION 'A coluna "%" é padrão do sistema e não pode ser excluída', OLD.nome;
      END IF;
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
