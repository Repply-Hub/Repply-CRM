-- Configuração customizável (nome + foto) do canal "Chat Geral" por empresa. O Chat Geral não é
-- uma linha em chat_grupos (mensagens do canal geral usam grupo_id/recipient_id nulos, filtradas
-- por empresa_id), então precisa de uma tabela própria de 1 linha por empresa para guardar a
-- customização, no mesmo padrão de RLS usado por tarefas_kanban_colunas.
CREATE TABLE public.chat_geral_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL UNIQUE REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL DEFAULT 'Chat Geral',
  foto_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_geral_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_geral_config_select"
ON public.chat_geral_config FOR SELECT TO authenticated
USING (is_admin() OR empresa_id = get_my_empresa_id());

CREATE POLICY "chat_geral_config_insert"
ON public.chat_geral_config FOR INSERT TO authenticated
WITH CHECK (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id()));

CREATE POLICY "chat_geral_config_update"
ON public.chat_geral_config FOR UPDATE TO authenticated
USING (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id()));

CREATE TRIGGER update_chat_geral_config_updated_at
BEFORE UPDATE ON public.chat_geral_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
