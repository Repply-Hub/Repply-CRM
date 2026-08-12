-- Bug: `fabricantes` é uma tabela GLOBAL (compartilhada entre todas as empresas do
-- sistema, sem coluna empresa_id) — mas o índice único que evita meta de equipe
-- duplicada por fabricante/mês (20260810120000_metas_vendas_toda_equipe.sql) foi
-- criado como (fabricante_id, ano, mes) WHERE usuario_id IS NULL, SEM empresa_id.
--
-- Consequência: duas empresas distintas (ex: "MD Representações" e "MD", tenants
-- quase-idênticos que compartilham fabricantes do catálogo global) não conseguiam
-- ter cada uma sua PRÓPRIA meta de equipe pro mesmo fabricante no mesmo mês — a
-- segunda empresa a criar colidia no índice com a linha da primeira, o upsert virava
-- um UPDATE na linha ALHEIA, e a RLS corretamente barrava com "new row violates row-
-- level security policy (USING expression)" (código 42501). Reproduzido e confirmado
-- em produção antes desta migration.
--
-- Fix: inclui empresa_id no índice — cada empresa passa a ter seu próprio espaço de
-- "uma meta de equipe por fabricante/mês", igual já acontecia (corretamente) pro
-- índice de meta individual, onde usuario_id já amarra a linha a uma empresa só. Mais
-- permissivo que o índice antigo (nunca quebra dado existente), então não precisa de
-- limpeza prévia.
DROP INDEX IF EXISTS public.metas_vendas_equipe_uniq;
CREATE UNIQUE INDEX metas_vendas_equipe_uniq ON public.metas_vendas (empresa_id, fabricante_id, ano, mes) WHERE usuario_id IS NULL;

-- upsert_meta_venda precisa mirar o ON CONFLICT no novo formato do índice (Postgres
-- exige que a lista de colunas do ON CONFLICT bata exatamente com a do índice-alvo).
CREATE OR REPLACE FUNCTION public.upsert_meta_venda(
  p_empresa_id uuid,
  p_usuario_id uuid,
  p_fabricante_id uuid,
  p_ano integer,
  p_mes integer,
  p_meta_valor numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_usuario_id IS NULL THEN
    INSERT INTO public.metas_vendas (empresa_id, usuario_id, fabricante_id, ano, mes, meta_valor)
    VALUES (p_empresa_id, NULL, p_fabricante_id, p_ano, p_mes, p_meta_valor)
    ON CONFLICT (empresa_id, fabricante_id, ano, mes) WHERE usuario_id IS NULL
    DO UPDATE SET meta_valor = EXCLUDED.meta_valor, updated_at = now();
  ELSE
    INSERT INTO public.metas_vendas (empresa_id, usuario_id, fabricante_id, ano, mes, meta_valor)
    VALUES (p_empresa_id, p_usuario_id, p_fabricante_id, p_ano, p_mes, p_meta_valor)
    ON CONFLICT (usuario_id, fabricante_id, ano, mes) WHERE usuario_id IS NOT NULL
    DO UPDATE SET meta_valor = EXCLUDED.meta_valor, updated_at = now();
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_meta_venda(uuid, uuid, uuid, integer, integer, numeric) TO authenticated;
