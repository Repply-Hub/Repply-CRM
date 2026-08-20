-- Fabricantes e tabela de preços passam a ser POR EMPRESA.
--
-- As duas tabelas nasceram sem empresa_id e com SELECT liberado para qualquer
-- autenticado; escrita exigia só papel (is_gestor), sem recorte de tenant.
-- Resultado observado em produção: uma empresa recém-cadastrada (JHS) via os
-- 31 fabricantes da MD Representações — e o gestor dela tinha poder de editar
-- e excluir o catálogo alheio (o DELETE só era barrado pela FK de pedidos,
-- quando havia pedido).
--
-- O dono confirmou: todos os 31 fabricantes existentes são da MD Representações
-- (0c5df684). A empresa legada "MD" (bb5fce8c, sem pedidos desde 2023) fica sem
-- catálogo, de propósito.

ALTER TABLE public.fabricantes
  ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES public.empresas(id);
ALTER TABLE public.tabela_precos
  ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES public.empresas(id);

UPDATE public.fabricantes
SET empresa_id = '0c5df684-20d1-4d4f-b0f0-30676d4d4128'
WHERE empresa_id IS NULL;

UPDATE public.tabela_precos tp
SET empresa_id = f.empresa_id
FROM public.fabricantes f
WHERE f.id = tp.fabricante_id AND tp.empresa_id IS NULL;

ALTER TABLE public.fabricantes ALTER COLUMN empresa_id SET NOT NULL;
ALTER TABLE public.tabela_precos ALTER COLUMN empresa_id SET NOT NULL;

-- A RLS filtra por empresa_id em toda leitura; sem índice vira varredura.
CREATE INDEX IF NOT EXISTS idx_fabricantes_empresa_id ON public.fabricantes (empresa_id);
CREATE INDEX IF NOT EXISTS idx_tabela_precos_empresa_id ON public.tabela_precos (empresa_id);

-- Preenche empresa_id sozinho no INSERT: cobre a tela, a importação (que cria
-- fabricante pelo cliente, na sessão do usuário) e qualquer escritor futuro.
-- O BEFORE trigger roda ANTES do WITH CHECK da policy, então a linha chega à
-- checagem já preenchida.
CREATE OR REPLACE FUNCTION public.fabricantes_preenche_empresa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.empresa_id IS NULL THEN
    NEW.empresa_id := public.get_my_empresa_id();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fabricantes_preenche_empresa ON public.fabricantes;
CREATE TRIGGER trg_fabricantes_preenche_empresa
  BEFORE INSERT ON public.fabricantes
  FOR EACH ROW EXECUTE FUNCTION public.fabricantes_preenche_empresa();

-- Item de preço herda a empresa DO FABRICANTE, não a de quem digita: o item
-- pertence ao catálogo. Se alguém tentar pendurar preço em fabricante de outra
-- empresa, o trigger preenche a empresa alheia e o WITH CHECK da policy recusa.
CREATE OR REPLACE FUNCTION public.tabela_precos_preenche_empresa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.empresa_id IS NULL THEN
    SELECT f.empresa_id INTO NEW.empresa_id
    FROM public.fabricantes f WHERE f.id = NEW.fabricante_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tabela_precos_preenche_empresa ON public.tabela_precos;
CREATE TRIGGER trg_tabela_precos_preenche_empresa
  BEFORE INSERT ON public.tabela_precos
  FOR EACH ROW EXECUTE FUNCTION public.tabela_precos_preenche_empresa();

-- Políticas no idioma que o resto do schema já usa (clientes, obras):
-- leitura por empresa; escrita por papel E empresa. No UPDATE, o USING sem
-- WITH CHECK vale também para a linha nova — ninguém move registro de tenant.
DROP POLICY IF EXISTS "fabricantes_select" ON public.fabricantes;
CREATE POLICY "fabricantes_select" ON public.fabricantes FOR SELECT TO authenticated
  USING (is_admin() OR empresa_id = get_my_empresa_id());

DROP POLICY IF EXISTS "fabricantes_insert" ON public.fabricantes;
CREATE POLICY "fabricantes_insert" ON public.fabricantes FOR INSERT TO authenticated
  WITH CHECK (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id()));

DROP POLICY IF EXISTS "fabricantes_update" ON public.fabricantes;
CREATE POLICY "fabricantes_update" ON public.fabricantes FOR UPDATE TO authenticated
  USING (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id()));

DROP POLICY IF EXISTS "fabricantes_delete" ON public.fabricantes;
CREATE POLICY "fabricantes_delete" ON public.fabricantes FOR DELETE TO authenticated
  USING (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id()));

DROP POLICY IF EXISTS "tabela_precos_select" ON public.tabela_precos;
CREATE POLICY "tabela_precos_select" ON public.tabela_precos FOR SELECT TO authenticated
  USING (is_admin() OR empresa_id = get_my_empresa_id());

DROP POLICY IF EXISTS "tabela_precos_insert" ON public.tabela_precos;
CREATE POLICY "tabela_precos_insert" ON public.tabela_precos FOR INSERT TO authenticated
  WITH CHECK (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id()));

DROP POLICY IF EXISTS "tabela_precos_update" ON public.tabela_precos;
CREATE POLICY "tabela_precos_update" ON public.tabela_precos FOR UPDATE TO authenticated
  USING (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id()));

DROP POLICY IF EXISTS "tabela_precos_delete" ON public.tabela_precos;
CREATE POLICY "tabela_precos_delete" ON public.tabela_precos FOR DELETE TO authenticated
  USING (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id()));
