-- Histórico de alterações: registro genérico de auditoria para as principais
-- entidades de negócio, alimentado em duas frentes:
--   1) Triggers no Postgres (fonte de verdade, cobre qualquer via de escrita —
--      app, edge functions, admin — mesmo que o front esqueça de instrumentar).
--   2) Inserts manuais feitos pelo front (origem = 'frontend'), usados para
--      anexar uma descrição legível a ações que não mapeiam bem para um único
--      diff de linha (ex.: exclusão em massa).

CREATE TABLE public.historico_alteracoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES public.empresas(id),
  usuario_id UUID REFERENCES public.usuarios(id),
  tabela TEXT NOT NULL,
  registro_id UUID,
  acao TEXT NOT NULL CHECK (acao IN ('INSERT', 'UPDATE', 'DELETE')),
  dados_antes JSONB,
  dados_depois JSONB,
  descricao TEXT,
  origem TEXT NOT NULL DEFAULT 'trigger' CHECK (origem IN ('trigger', 'frontend')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_historico_alteracoes_empresa_created ON public.historico_alteracoes(empresa_id, created_at DESC);
CREATE INDEX idx_historico_alteracoes_tabela_registro ON public.historico_alteracoes(tabela, registro_id);
CREATE INDEX idx_historico_alteracoes_usuario ON public.historico_alteracoes(usuario_id);

ALTER TABLE public.historico_alteracoes ENABLE ROW LEVEL SECURITY;

-- Somente gestores/admin enxergam o histórico da própria empresa.
CREATE POLICY "historico_alteracoes_select" ON public.historico_alteracoes
FOR SELECT TO authenticated
USING (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id()));

-- Qualquer usuário autenticado pode registrar uma entrada descritiva da
-- própria ação (origem = 'frontend'); os triggers inserem via SECURITY DEFINER
-- e não passam por esta policy.
CREATE POLICY "historico_alteracoes_insert" ON public.historico_alteracoes
FOR INSERT TO authenticated
WITH CHECK (is_admin() OR (usuario_id = get_my_usuario_id() AND empresa_id = get_my_empresa_id()));

-- Log é append-only: sem UPDATE/DELETE para authenticated (nenhuma policy = bloqueado).

-- Função de trigger genérica: resolve quem fez (usuário autenticado atual) e,
-- na ausência de contexto de auth (ex.: edge function rodando com service role,
-- como a importação em lote), tenta resolver a empresa a partir do próprio
-- registro alterado, para que a ação ainda apareça no histórico da empresa dona.
CREATE OR REPLACE FUNCTION public.fn_log_historico_alteracao()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_usuario_id UUID;
  v_empresa_id UUID;
  v_row JSONB;
BEGIN
  v_usuario_id := public.get_my_usuario_id();
  v_row := to_jsonb(COALESCE(NEW, OLD));

  IF v_usuario_id IS NOT NULL THEN
    SELECT empresa_id INTO v_empresa_id FROM public.usuarios WHERE id = v_usuario_id;
  END IF;

  IF v_empresa_id IS NULL THEN
    IF TG_TABLE_NAME IN ('clientes', 'kanban_colunas', 'funis', 'usuarios') THEN
      v_empresa_id := (v_row->>'empresa_id')::uuid;
    ELSIF TG_TABLE_NAME IN ('pedidos', 'contatos', 'tarefas', 'permissoes_usuario') THEN
      SELECT empresa_id INTO v_empresa_id FROM public.usuarios WHERE id = (v_row->>'usuario_id')::uuid;
    ELSIF TG_TABLE_NAME = 'obras' THEN
      SELECT c.empresa_id INTO v_empresa_id FROM public.clientes c WHERE c.id = (v_row->>'cliente_id')::uuid;
    END IF;
  END IF;

  INSERT INTO public.historico_alteracoes (
    empresa_id, usuario_id, tabela, registro_id, acao, dados_antes, dados_depois, origem
  ) VALUES (
    v_empresa_id,
    v_usuario_id,
    TG_TABLE_NAME,
    (v_row->>'id')::uuid,
    TG_OP,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('UPDATE', 'INSERT') THEN to_jsonb(NEW) ELSE NULL END,
    'trigger'
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_historico_pedidos AFTER INSERT OR UPDATE OR DELETE ON public.pedidos FOR EACH ROW EXECUTE FUNCTION public.fn_log_historico_alteracao();
CREATE TRIGGER trg_historico_clientes AFTER INSERT OR UPDATE OR DELETE ON public.clientes FOR EACH ROW EXECUTE FUNCTION public.fn_log_historico_alteracao();
CREATE TRIGGER trg_historico_obras AFTER INSERT OR UPDATE OR DELETE ON public.obras FOR EACH ROW EXECUTE FUNCTION public.fn_log_historico_alteracao();
CREATE TRIGGER trg_historico_fabricantes AFTER INSERT OR UPDATE OR DELETE ON public.fabricantes FOR EACH ROW EXECUTE FUNCTION public.fn_log_historico_alteracao();
CREATE TRIGGER trg_historico_usuarios AFTER INSERT OR UPDATE OR DELETE ON public.usuarios FOR EACH ROW EXECUTE FUNCTION public.fn_log_historico_alteracao();
CREATE TRIGGER trg_historico_contatos AFTER INSERT OR UPDATE OR DELETE ON public.contatos FOR EACH ROW EXECUTE FUNCTION public.fn_log_historico_alteracao();
CREATE TRIGGER trg_historico_tarefas AFTER INSERT OR UPDATE OR DELETE ON public.tarefas FOR EACH ROW EXECUTE FUNCTION public.fn_log_historico_alteracao();
CREATE TRIGGER trg_historico_permissoes_usuario AFTER INSERT OR UPDATE OR DELETE ON public.permissoes_usuario FOR EACH ROW EXECUTE FUNCTION public.fn_log_historico_alteracao();
CREATE TRIGGER trg_historico_kanban_colunas AFTER INSERT OR UPDATE OR DELETE ON public.kanban_colunas FOR EACH ROW EXECUTE FUNCTION public.fn_log_historico_alteracao();
CREATE TRIGGER trg_historico_funis AFTER INSERT OR UPDATE OR DELETE ON public.funis FOR EACH ROW EXECUTE FUNCTION public.fn_log_historico_alteracao();
