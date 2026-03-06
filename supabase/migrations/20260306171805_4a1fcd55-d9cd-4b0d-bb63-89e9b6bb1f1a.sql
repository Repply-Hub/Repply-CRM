
-- 1. Tabela de configurações de automação (persistir alertDays e toggles)
CREATE TABLE public.configuracoes_automacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave text NOT NULL UNIQUE,
  valor jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.configuracoes_automacao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "automacao_config_select" ON public.configuracoes_automacao
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "automacao_config_upsert" ON public.configuracoes_automacao
  FOR INSERT TO authenticated WITH CHECK (is_gestor());

CREATE POLICY "automacao_config_update" ON public.configuracoes_automacao
  FOR UPDATE TO authenticated USING (is_gestor());

-- Seed default config
INSERT INTO public.configuracoes_automacao (chave, valor)
VALUES ('alerta_inatividade', '{"dias": 5, "notificacao_email": false, "notificacao_sistema": true}'::jsonb);

-- 2. Tabela de notificações
CREATE TABLE public.notificacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id uuid NOT NULL REFERENCES public.vendedores(id) ON DELETE CASCADE,
  pedido_id uuid REFERENCES public.pedidos(id) ON DELETE CASCADE,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  tipo text NOT NULL DEFAULT 'inatividade',
  titulo text NOT NULL,
  mensagem text,
  lida boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notificacoes_select" ON public.notificacoes
  FOR SELECT TO authenticated
  USING (vendedor_id = get_my_vendedor_id() OR is_gestor());

CREATE POLICY "notificacoes_update" ON public.notificacoes
  FOR UPDATE TO authenticated
  USING (vendedor_id = get_my_vendedor_id() OR is_gestor());

CREATE POLICY "notificacoes_insert" ON public.notificacoes
  FOR INSERT TO authenticated
  WITH CHECK (is_gestor());

CREATE POLICY "notificacoes_delete" ON public.notificacoes
  FOR DELETE TO authenticated
  USING (vendedor_id = get_my_vendedor_id() OR is_gestor());

-- 3. View de pedidos inativos
CREATE OR REPLACE VIEW public.vw_pedidos_inativos AS
SELECT
  p.id AS pedido_id,
  p.vendedor_id,
  p.cliente_id,
  p.status,
  p.updated_at AS ultima_atualizacao,
  EXTRACT(DAY FROM (now() - p.updated_at))::int AS dias_parado,
  c.empresa AS cliente_nome,
  v.nome AS vendedor_nome,
  ca.valor->>'dias' AS dias_limite
FROM public.pedidos p
JOIN public.clientes c ON c.id = p.cliente_id
JOIN public.vendedores v ON v.id = p.vendedor_id
CROSS JOIN public.configuracoes_automacao ca
WHERE ca.chave = 'alerta_inatividade'
  AND p.status NOT IN ('fechado', 'perdido')
  AND EXTRACT(DAY FROM (now() - p.updated_at)) >= COALESCE((ca.valor->>'dias')::int, 5);
