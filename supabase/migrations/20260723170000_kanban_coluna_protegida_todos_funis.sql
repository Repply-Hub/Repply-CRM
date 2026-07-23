-- As colunas "Fechamento"/"Perdido" devem ser fixas em TODO funil (não só no padrão):
-- todo funil novo criado já vem com elas via criar_funil()/criar_kanban_colunas_padrao(),
-- e o usuário não pode excluí-las nem trocar seus slugs em nenhum funil.
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
