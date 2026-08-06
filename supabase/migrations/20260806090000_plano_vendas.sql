-- Plano de Vendas: cada vendedor tem uma meta mensal de valor por fabricante,
-- definida pelo gestor (o vendedor só visualiza, não edita — decisão de produto).
-- Consumida no Dashboard como "meta vs. realizado" por fabricante, no mesmo
-- recorte de dados já usado por `dashboard_stats` (status = 'fechamento').

CREATE TABLE public.metas_vendas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  fabricante_id UUID NOT NULL REFERENCES public.fabricantes(id) ON DELETE CASCADE,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  meta_valor NUMERIC NOT NULL DEFAULT 0 CHECK (meta_valor >= 0),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (usuario_id, fabricante_id, ano, mes)
);

CREATE INDEX idx_metas_vendas_usuario_periodo ON public.metas_vendas(usuario_id, ano, mes);
CREATE INDEX idx_metas_vendas_empresa_periodo ON public.metas_vendas(empresa_id, ano, mes);

ALTER TABLE public.metas_vendas ENABLE ROW LEVEL SECURITY;

-- SELECT: dono da meta, ou gestor/admin da mesma empresa. Mesmo padrão de
-- pedidos_insert/update (usuario_in_my_empresa), só que aqui SEM o "empresa toda
-- vê tudo" que pedidos ganhou depois — meta de vendedor é informação sensível,
-- não faz sentido um colega vendedor ver a meta do outro.
CREATE POLICY "metas_vendas_select" ON public.metas_vendas FOR SELECT TO authenticated
USING (is_admin() OR usuario_id = get_my_usuario_id() OR (is_gestor() AND usuario_in_my_empresa(usuario_id)));

-- INSERT/UPDATE/DELETE: só gestor/admin — decisão de produto confirmada é que o
-- vendedor não define a própria meta, só acompanha o que o gestor definiu.
CREATE POLICY "metas_vendas_insert" ON public.metas_vendas FOR INSERT TO authenticated
WITH CHECK (is_admin() OR (is_gestor() AND usuario_in_my_empresa(usuario_id) AND empresa_id = get_my_empresa_id()));

CREATE POLICY "metas_vendas_update" ON public.metas_vendas FOR UPDATE TO authenticated
USING (is_admin() OR (is_gestor() AND usuario_in_my_empresa(usuario_id)));

CREATE POLICY "metas_vendas_delete" ON public.metas_vendas FOR DELETE TO authenticated
USING (is_admin() OR (is_gestor() AND usuario_in_my_empresa(usuario_id)));

CREATE TRIGGER update_metas_vendas_updated_at
BEFORE UPDATE ON public.metas_vendas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Progresso (meta x vendido) por fabricante num mês/ano, para um vendedor
-- específico ou agregado pra empresa toda (p_usuario_id NULL). SECURITY INVOKER:
-- a RLS de metas_vendas e pedidos já escopam os dados ao chamador sozinhas, sem
-- precisar repetir a checagem de empresa aqui (mesmo padrão de dashboard_stats).
CREATE OR REPLACE FUNCTION public.plano_vendas_progresso(
  p_ano INTEGER,
  p_mes INTEGER,
  p_usuario_id UUID DEFAULT NULL
)
RETURNS TABLE (
  fabricante_id UUID,
  fabricante_nome TEXT,
  meta_valor NUMERIC,
  vendido_valor NUMERIC
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH metas AS (
    SELECT m.fabricante_id, SUM(m.meta_valor) AS meta_valor
    FROM public.metas_vendas m
    WHERE m.ano = p_ano AND m.mes = p_mes
      AND (p_usuario_id IS NULL OR m.usuario_id = p_usuario_id)
    GROUP BY m.fabricante_id
  ),
  vendido AS (
    SELECT p.fabricante_id, SUM(p.valor_total) AS vendido_valor
    FROM public.pedidos p
    WHERE p.status = 'fechamento'
      AND p.data_pedido >= make_date(p_ano, p_mes, 1)
      AND p.data_pedido < (make_date(p_ano, p_mes, 1) + INTERVAL '1 month')
      AND (p_usuario_id IS NULL OR p.usuario_id = p_usuario_id)
    GROUP BY p.fabricante_id
  )
  SELECT
    f.id AS fabricante_id,
    f.nome AS fabricante_nome,
    COALESCE(metas.meta_valor, 0) AS meta_valor,
    COALESCE(vendido.vendido_valor, 0) AS vendido_valor
  FROM metas
  FULL OUTER JOIN vendido ON vendido.fabricante_id = metas.fabricante_id
  JOIN public.fabricantes f ON f.id = COALESCE(metas.fabricante_id, vendido.fabricante_id)
  ORDER BY COALESCE(metas.meta_valor, 0) DESC, COALESCE(vendido.vendido_valor, 0) DESC;
$$;

GRANT EXECUTE ON FUNCTION public.plano_vendas_progresso(INTEGER, INTEGER, UUID) TO authenticated;
