-- Obrigatoriedade de campos (padrão/customizado) condicionada a etapas específicas do
-- funil de Negócios. Hoje `configuracoes_campos.obrigatorio` é sempre global; isso
-- adiciona um escopo opcional: "obrigatório só quando o pedido está numa destas colunas
-- do kanban". Só faz sentido para entidade = 'pedidos' (única com conceito de funil/etapa).
--
-- Importante: a coluna `configuracoes_campos.etapa` já existente NÃO tem relação com isso
-- — ela é só o rótulo do passo do wizard do formulário (ex.: "Itens do Negócio"). Este
-- recurso novo trata de etapas do KANBAN (funil de vendas), por isso usa nomes distintos.

ALTER TABLE public.configuracoes_campos
  ADD COLUMN obrigatorio_escopo TEXT NOT NULL DEFAULT 'global'
  CHECK (obrigatorio_escopo IN ('global', 'etapas'));

CREATE TABLE public.configuracoes_campos_etapas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  configuracao_campo_id UUID NOT NULL REFERENCES public.configuracoes_campos(id) ON DELETE CASCADE,
  kanban_coluna_id UUID NOT NULL REFERENCES public.kanban_colunas(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (configuracao_campo_id, kanban_coluna_id)
);

CREATE INDEX idx_configuracoes_campos_etapas_campo ON public.configuracoes_campos_etapas(configuracao_campo_id);
CREATE INDEX idx_configuracoes_campos_etapas_coluna ON public.configuracoes_campos_etapas(kanban_coluna_id);

-- Guarda de integridade: só permite vincular campos da entidade 'pedidos' (única com
-- funil/kanban) e exige que o campo e a coluna pertençam à mesma empresa — sem isso, a
-- RLS abaixo (que só valida o lado do campo via join) deixaria vincular um campo de uma
-- empresa a uma coluna de kanban de outra empresa.
CREATE OR REPLACE FUNCTION public.verificar_configuracao_campo_etapa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.configuracoes_campos cc
    JOIN public.kanban_colunas kc ON kc.id = NEW.kanban_coluna_id
    WHERE cc.id = NEW.configuracao_campo_id
      AND cc.entidade = 'pedidos'
      AND cc.empresa_id = kc.empresa_id
  ) THEN
    RAISE EXCEPTION 'Só é possível vincular etapas a campos de Negócios da mesma empresa da coluna do kanban';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_verificar_configuracao_campo_etapa
BEFORE INSERT OR UPDATE ON public.configuracoes_campos_etapas
FOR EACH ROW EXECUTE FUNCTION public.verificar_configuracao_campo_etapa();

ALTER TABLE public.configuracoes_campos_etapas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "configuracoes_campos_etapas_select" ON public.configuracoes_campos_etapas
FOR SELECT TO authenticated
USING (
  is_admin() OR EXISTS (
    SELECT 1 FROM public.configuracoes_campos cc
    WHERE cc.id = configuracoes_campos_etapas.configuracao_campo_id
      AND cc.empresa_id = get_my_empresa_id()
  )
);

CREATE POLICY "configuracoes_campos_etapas_insert" ON public.configuracoes_campos_etapas
FOR INSERT TO authenticated
WITH CHECK (
  is_admin() OR (
    is_gestor() AND EXISTS (
      SELECT 1 FROM public.configuracoes_campos cc
      WHERE cc.id = configuracoes_campos_etapas.configuracao_campo_id
        AND cc.empresa_id = get_my_empresa_id()
    )
  )
);

CREATE POLICY "configuracoes_campos_etapas_delete" ON public.configuracoes_campos_etapas
FOR DELETE TO authenticated
USING (
  is_admin() OR (
    is_gestor() AND EXISTS (
      SELECT 1 FROM public.configuracoes_campos cc
      WHERE cc.id = configuracoes_campos_etapas.configuracao_campo_id
        AND cc.empresa_id = get_my_empresa_id()
    )
  )
);
