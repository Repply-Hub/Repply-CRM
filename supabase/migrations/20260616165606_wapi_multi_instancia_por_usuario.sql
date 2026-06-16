-- configuracoes_wapi: suportar múltiplas instâncias uazapi por empresa (1 por usuário)

-- 1. Coluna usuario_id (dono da instância)
ALTER TABLE public.configuracoes_wapi
  ADD COLUMN IF NOT EXISTS usuario_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Remove a constraint UNIQUE em empresa_id (1 instância por empresa deixa de valer)
ALTER TABLE public.configuracoes_wapi
  DROP CONSTRAINT IF EXISTS configuracoes_wapi_empresa_id_key;

-- 3. Constraint UNIQUE em usuario_id (1 instância por usuário)
ALTER TABLE public.configuracoes_wapi
  ADD CONSTRAINT configuracoes_wapi_usuario_id_key UNIQUE (usuario_id);

-- 4. empresa_id é mantida (não removida) — usada para RLS e contexto multi-tenant

-- 5. Flag de provisionamento automático
ALTER TABLE public.configuracoes_wapi
  ADD COLUMN IF NOT EXISTS provisionada boolean NOT NULL DEFAULT false;

-- RLS: substitui a policy única "FOR ALL" por policies por operação, filtrando por usuario_id
DROP POLICY IF EXISTS "empresa_own_wapi_config" ON public.configuracoes_wapi;

CREATE POLICY "usuario_own_wapi_config_select" ON public.configuracoes_wapi
  FOR SELECT USING (usuario_id = auth.uid());

CREATE POLICY "usuario_own_wapi_config_insert" ON public.configuracoes_wapi
  FOR INSERT WITH CHECK (usuario_id = auth.uid());

CREATE POLICY "usuario_own_wapi_config_update" ON public.configuracoes_wapi
  FOR UPDATE USING (usuario_id = auth.uid()) WITH CHECK (usuario_id = auth.uid());

CREATE POLICY "usuario_own_wapi_config_delete" ON public.configuracoes_wapi
  FOR DELETE USING (usuario_id = auth.uid());

-- empresa_id permanece como coluna normal da tabela: funções SECURITY DEFINER (rodando
-- como owner, que ignora RLS) continuam podendo ler/agrupar configuracoes_wapi por
-- empresa_id sem necessidade de policy adicional.
