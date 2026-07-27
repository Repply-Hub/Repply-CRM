-- Configuração de campos por empresa: gestor pode tornar campos padrão obrigatórios/opcionais
-- e adicionar/remover campos de texto customizados para Negócios, Empresas e Contatos.

CREATE TABLE public.configuracoes_campos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id),
  entidade TEXT NOT NULL,              -- 'pedidos' | 'clientes' | 'contatos'
  origem TEXT NOT NULL,                -- 'padrao' | 'customizado'
  campo_key TEXT NOT NULL,             -- padrao: nome fixo do campo; customizado: slug do label
  label TEXT,                          -- só relevante para origem='customizado'
  tipo TEXT NOT NULL DEFAULT 'texto',
  obrigatorio BOOLEAN NOT NULL DEFAULT false,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.usuarios(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, entidade, campo_key)
);

CREATE INDEX idx_configuracoes_campos_empresa_entidade
  ON public.configuracoes_campos(empresa_id, entidade, ordem);

ALTER TABLE public.configuracoes_campos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "configuracoes_campos_select" ON public.configuracoes_campos
FOR SELECT TO authenticated
USING (is_admin() OR empresa_id = get_my_empresa_id());

CREATE POLICY "configuracoes_campos_insert" ON public.configuracoes_campos
FOR INSERT TO authenticated
WITH CHECK (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id()));

CREATE POLICY "configuracoes_campos_update" ON public.configuracoes_campos
FOR UPDATE TO authenticated
USING (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id()));

-- DELETE: apenas quem criou o campo customizado (created_by), ou admin. Linhas 'padrao'
-- têm created_by NULL, então nunca são elegíveis para exclusão por essa policy.
CREATE POLICY "configuracoes_campos_delete" ON public.configuracoes_campos
FOR DELETE TO authenticated
USING (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id() AND created_by = get_my_usuario_id()));

CREATE TRIGGER update_configuracoes_campos_updated_at
BEFORE UPDATE ON public.configuracoes_campos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed dos campos padrão configuráveis para empresas já existentes.
INSERT INTO public.configuracoes_campos (empresa_id, entidade, origem, campo_key, obrigatorio, ordem)
SELECT e.id, v.entidade, 'padrao', v.campo_key, v.obrigatorio, v.ordem
FROM public.empresas e
CROSS JOIN (VALUES
  ('pedidos',  'obra_id',            false, 0),
  ('pedidos',  'origem_lead',        false, 1),
  ('pedidos',  'endereco_entrega',   false, 2),
  ('pedidos',  'prazo_resposta',     false, 3),
  ('pedidos',  'observacoes',        false, 4),
  ('clientes', 'razao_social',       false, 0),
  ('clientes', 'email',              true,  1),
  ('clientes', 'telefone',           true,  2),
  ('clientes', 'endereco',           false, 3),
  ('contatos', 'email',              true,  0),
  ('contatos', 'telefone',           true,  1),
  ('contatos', 'cargo',              false, 2)
) AS v(entidade, campo_key, obrigatorio, ordem)
ON CONFLICT (empresa_id, entidade, campo_key) DO NOTHING;

-- Semeia os mesmos campos padrão para empresas novas.
CREATE OR REPLACE FUNCTION public.criar_configuracoes_campos_padrao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.configuracoes_campos (empresa_id, entidade, origem, campo_key, obrigatorio, ordem) VALUES
    (NEW.id, 'pedidos',  'padrao', 'obra_id',          false, 0),
    (NEW.id, 'pedidos',  'padrao', 'origem_lead',      false, 1),
    (NEW.id, 'pedidos',  'padrao', 'endereco_entrega', false, 2),
    (NEW.id, 'pedidos',  'padrao', 'prazo_resposta',   false, 3),
    (NEW.id, 'pedidos',  'padrao', 'observacoes',      false, 4),
    (NEW.id, 'clientes', 'padrao', 'razao_social',     false, 0),
    (NEW.id, 'clientes', 'padrao', 'email',            true,  1),
    (NEW.id, 'clientes', 'padrao', 'telefone',         true,  2),
    (NEW.id, 'clientes', 'padrao', 'endereco',         false, 3),
    (NEW.id, 'contatos', 'padrao', 'email',            true,  0),
    (NEW.id, 'contatos', 'padrao', 'telefone',         true,  1),
    (NEW.id, 'contatos', 'padrao', 'cargo',            false, 2)
  ON CONFLICT (empresa_id, entidade, campo_key) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_criar_configuracoes_campos_padrao
AFTER INSERT ON public.empresas
FOR EACH ROW EXECUTE FUNCTION public.criar_configuracoes_campos_padrao();
