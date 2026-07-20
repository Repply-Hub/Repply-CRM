-- Histórico de versões da sidebar padrão da empresa (sidebar_empresa_padrao guarda só a versão
-- atual — empresa_id é UNIQUE — então cada save sobrescreve a linha anterior). Esta tabela é um
-- log append-only: cada vez que um gestor/admin salva um novo padrão, gravamos uma linha aqui,
-- espelhando o padrão de audit log já usado em audit_permissoes (insert feito pelo app junto da
-- mutation, sem trigger).
CREATE TABLE public.sidebar_empresa_padrao_historico (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL,
  items JSONB NOT NULL,
  salvo_por UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_sidebar_empresa_padrao_historico_empresa
ON public.sidebar_empresa_padrao_historico(empresa_id, created_at DESC);

ALTER TABLE public.sidebar_empresa_padrao_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sidebar_empresa_padrao_historico_select"
ON public.sidebar_empresa_padrao_historico FOR SELECT TO authenticated
USING (is_admin() OR empresa_id = get_my_empresa_id());

CREATE POLICY "sidebar_empresa_padrao_historico_insert"
ON public.sidebar_empresa_padrao_historico FOR INSERT TO authenticated
WITH CHECK (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id()));
