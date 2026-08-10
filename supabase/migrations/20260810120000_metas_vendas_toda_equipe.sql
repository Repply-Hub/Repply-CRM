-- Plano de Vendas (20260806090000) só permitia meta por vendedor individual —
-- a visão "empresa toda" no Dashboard já somava as metas de todos os vendedores,
-- mas não existia como definir uma meta que não fosse de ninguém em particular
-- (ex: uma meta de fabricante para o time inteiro, sem dividir por pessoa).
--
-- Libera usuario_id como NULL para representar "meta de equipe". A RPC
-- plano_vendas_progresso não precisa mudar: o filtro
-- `(p_usuario_id IS NULL OR m.usuario_id = p_usuario_id)` já inclui as linhas de
-- equipe automaticamente na visão agregada (p_usuario_id NULL) e já as exclui
-- corretamente da visão de um vendedor específico (usuario_id NULL nunca bate
-- com `m.usuario_id = p_usuario_id`).
ALTER TABLE public.metas_vendas ALTER COLUMN usuario_id DROP NOT NULL;

-- O UNIQUE (usuario_id, fabricante_id, ano, mes) original não protege duplicata
-- de meta de equipe: Postgres trata cada NULL como distinto num UNIQUE comum,
-- então duas metas de equipe pro mesmo fabricante/mês passariam batendo. Troca
-- por dois índices únicos parciais — um por variante — que também servem de alvo
-- de ON CONFLICT explícito na RPC de upsert abaixo (upsert via .from(...).upsert()
-- do supabase-js não consegue mirar um índice parcial).
ALTER TABLE public.metas_vendas DROP CONSTRAINT metas_vendas_usuario_id_fabricante_id_ano_mes_key;
CREATE UNIQUE INDEX metas_vendas_individual_uniq ON public.metas_vendas (usuario_id, fabricante_id, ano, mes) WHERE usuario_id IS NOT NULL;
CREATE UNIQUE INDEX metas_vendas_equipe_uniq ON public.metas_vendas (fabricante_id, ano, mes) WHERE usuario_id IS NULL;

-- RLS: meta de equipe (usuario_id NULL) é visível para toda a empresa (não é
-- informação sensível de uma pessoa, é o alvo compartilhado do time) — diferente
-- da meta individual, que continua restrita ao dono + gestor/admin.
DROP POLICY "metas_vendas_select" ON public.metas_vendas;
CREATE POLICY "metas_vendas_select" ON public.metas_vendas FOR SELECT TO authenticated
USING (
  is_admin()
  OR usuario_id = get_my_usuario_id()
  OR (usuario_id IS NULL AND empresa_id = get_my_empresa_id())
  OR (is_gestor() AND usuario_id IS NOT NULL AND usuario_in_my_empresa(usuario_id))
);

-- INSERT/UPDATE/DELETE continuam gestor/admin only; só passam a aceitar
-- usuario_id NULL desde que a linha seja da própria empresa do chamador.
DROP POLICY "metas_vendas_insert" ON public.metas_vendas;
CREATE POLICY "metas_vendas_insert" ON public.metas_vendas FOR INSERT TO authenticated
WITH CHECK (
  is_admin()
  OR (
    is_gestor() AND empresa_id = get_my_empresa_id()
    AND ((usuario_id IS NULL) OR usuario_in_my_empresa(usuario_id))
  )
);

DROP POLICY "metas_vendas_update" ON public.metas_vendas;
CREATE POLICY "metas_vendas_update" ON public.metas_vendas FOR UPDATE TO authenticated
USING (
  is_admin()
  OR (
    is_gestor()
    AND ((usuario_id IS NULL AND empresa_id = get_my_empresa_id()) OR usuario_in_my_empresa(usuario_id))
  )
);

DROP POLICY "metas_vendas_delete" ON public.metas_vendas;
CREATE POLICY "metas_vendas_delete" ON public.metas_vendas FOR DELETE TO authenticated
USING (
  is_admin()
  OR (
    is_gestor()
    AND ((usuario_id IS NULL AND empresa_id = get_my_empresa_id()) OR usuario_in_my_empresa(usuario_id))
  )
);

-- Upsert por RPC: supabase-js (.upsert com onConflict) só sabe mirar
-- ON CONFLICT (colunas), sem WHERE — não dá pra apontar pros índices parciais
-- acima direto do client. SECURITY INVOKER: a RLS de insert/update acima
-- continua sendo quem decide se o chamador pode gravar, essa função só resolve
-- a sintaxe do ON CONFLICT correto pra cada variante.
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
    ON CONFLICT (fabricante_id, ano, mes) WHERE usuario_id IS NULL
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
