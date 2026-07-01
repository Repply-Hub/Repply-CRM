-- Formaliza a tabela wapi_instancia_usuarios, usada pelas Edge Functions
-- (whatsapp-provision, whatsapp-admin-provision, whatsapp-send) desde a
-- migration 20260620000000_wapi_instancia_desacoplada.sql, mas que nunca
-- teve um CREATE TABLE versionado (schema drift: tabela e RLS foram criadas
-- direto em produção). CREATE TABLE IF NOT EXISTS garante idempotência.
--
-- Nota: a policy de SELECT ("wapi_iu_select") já existe em produção
-- (própria linha OU admin OU gestor/empresa da mesma empresa do usuário-alvo)
-- e não é recriada aqui para evitar duplicidade.

CREATE TABLE IF NOT EXISTS public.wapi_instancia_usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instancia_id UUID NOT NULL REFERENCES public.configuracoes_wapi(id) ON DELETE CASCADE,
  usuario_auth_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (instancia_id, usuario_auth_id)
);

ALTER TABLE public.wapi_instancia_usuarios ENABLE ROW LEVEL SECURITY;
