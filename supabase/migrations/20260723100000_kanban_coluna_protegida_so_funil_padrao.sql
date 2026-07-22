-- A proteção contra exclusão/troca de slug das colunas "Fechamento"/"Perdido" deve valer
-- só para o funil padrão da empresa (o pipeline "oficial" do sistema). Funis criados pelo
-- usuário (is_padrao = false) podem ter essas colunas livremente editadas/excluídas, já que
-- não deixam de existir os slugs 'perdido'/'fechamento' de fato — apenas não são "o" funil
-- protegido do sistema.
CREATE OR REPLACE FUNCTION public.proteger_kanban_coluna_perdido()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_funil_padrao BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.slug IN ('perdido', 'fechamento') AND OLD.is_sistema THEN
      SELECT is_padrao INTO v_funil_padrao FROM public.funis WHERE id = OLD.funil_id;
      IF COALESCE(v_funil_padrao, false) THEN
        RAISE EXCEPTION 'A coluna "%" é padrão do sistema e não pode ser excluída', OLD.nome;
      END IF;
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.slug IN ('perdido', 'fechamento') AND OLD.is_sistema AND NEW.slug <> OLD.slug THEN
      SELECT is_padrao INTO v_funil_padrao FROM public.funis WHERE id = OLD.funil_id;
      IF COALESCE(v_funil_padrao, false) THEN
        RAISE EXCEPTION 'A coluna "%" é padrão do sistema e não pode ter o slug alterado', OLD.nome;
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END; $$;
