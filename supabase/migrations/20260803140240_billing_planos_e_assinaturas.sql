-- COBRANÇA POR EMPRESA — catálogo de planos, assinatura e deduplicação de eventos.
--
-- Por que a assinatura NÃO mora em colunas de `empresas`:
-- a policy empresas_update (20260722130000_gestores_atualizam_codigo_acesso.sql)
-- permite que o dono e qualquer gestor deem UPDATE em QUALQUER coluna da própria
-- empresa. Se plan_status ficasse lá, um PATCH no PostgREST bastaria para a
-- própria pessoa se declarar em dia. Numa tabela separada e sem policy de
-- escrita, o RLS nega por padrão — é uma permissão que ninguém precisa lembrar
-- de revogar quando uma coluna nova aparecer.

-- ---------------------------------------------------------------------------
-- 1. Catálogo de planos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.planos (
  slug TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  descricao TEXT,
  -- Em centavos para não depender de ponto flutuante em dinheiro.
  preco_centavos INTEGER NOT NULL,
  moeda TEXT NOT NULL DEFAULT 'BRL',
  intervalo TEXT NOT NULL DEFAULT 'month',
  -- Preenchido à mão depois de criar o preço no painel do Stripe.
  stripe_price_id TEXT UNIQUE,
  beneficios JSONB NOT NULL DEFAULT '[]'::jsonb,
  selo TEXT,
  visivel BOOLEAN NOT NULL DEFAULT true,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.planos ENABLE ROW LEVEL SECURITY;

-- Leitura liberada inclusive para quem não está logado: a página pública de
-- preços precisa do catálogo. Não há policy de escrita — preço só muda por
-- migration ou pelo painel do Supabase.
DROP POLICY IF EXISTS planos_select ON public.planos;
CREATE POLICY planos_select ON public.planos
FOR SELECT TO anon, authenticated
USING (visivel);

INSERT INTO public.planos (slug, nome, descricao, preco_centavos, beneficios, selo, ordem)
VALUES (
  'lancamento',
  'Plano de Lançamento',
  'Acesso completo ao Repply para toda a sua equipe comercial.',
  299700,
  '["Usuários ilimitados","Todos os módulos","WhatsApp e e-mail","Importação da sua base","Suporte direto com o time"]'::jsonb,
  'Condição de lançamento',
  0
)
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Assinatura da empresa
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.empresa_assinaturas (
  -- PK igual à FK: uma assinatura por empresa. É isso que faz o PostgREST
  -- devolver OBJETO (e não array) no embed empresas(*, empresa_assinaturas(*)).
  empresa_id UUID PRIMARY KEY REFERENCES public.empresas(id) ON DELETE CASCADE,

  -- Resumo binário que o app consulta. Os detalhes do provedor ficam nas
  -- colunas abaixo; esta é a única que decide acesso.
  plan_status TEXT NOT NULL DEFAULT 'inactive',
  plano_slug TEXT REFERENCES public.planos(slug),

  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  -- Status cru do provedor: active, trialing, past_due, canceled, unpaid...
  subscription_status TEXT,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,

  -- 'stripe' para quem assinou de fato; 'legacy' para as empresas que já usavam
  -- o sistema antes da cobrança existir.
  origem TEXT NOT NULL DEFAULT 'stripe',
  ativado_em TIMESTAMPTZ,
  -- Marca d'água temporal do provedor: eventos do Stripe podem chegar fora de
  -- ordem, e sem isto um evento antigo reprocessado sobrescreveria um estado
  -- mais novo (ex.: reverter para 'canceled' depois de uma reativação).
  ultimo_evento_em TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.empresa_assinaturas
  DROP CONSTRAINT IF EXISTS empresa_assinaturas_plan_status_check;
ALTER TABLE public.empresa_assinaturas
  ADD CONSTRAINT empresa_assinaturas_plan_status_check
  CHECK (plan_status IN ('active', 'inactive', 'past_due', 'canceled', 'unpaid', 'trialing'));

CREATE INDEX IF NOT EXISTS idx_empresa_assinaturas_customer
  ON public.empresa_assinaturas(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_empresa_assinaturas_subscription
  ON public.empresa_assinaturas(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

ALTER TABLE public.empresa_assinaturas ENABLE ROW LEVEL SECURITY;

-- ÚNICA policy: leitura pelos membros da empresa. Sem INSERT, UPDATE ou DELETE
-- para authenticated — quem escreve é o webhook, com service_role, que passa por
-- cima do RLS. Ausência de policy é negação por padrão.
DROP POLICY IF EXISTS empresa_assinaturas_select ON public.empresa_assinaturas;
CREATE POLICY empresa_assinaturas_select ON public.empresa_assinaturas
FOR SELECT TO authenticated
USING (is_admin() OR empresa_id = get_my_empresa_id());

-- Defesa extra: o Supabase concede privilégios de tabela a authenticated por
-- padrão (ALTER DEFAULT PRIVILEGES), então sem este REVOKE a tabela dependeria
-- exclusivamente do RLS continuar ligado.
REVOKE INSERT, UPDATE, DELETE ON public.empresa_assinaturas FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Eventos já processados (idempotência do webhook)
-- ---------------------------------------------------------------------------
-- O Stripe reenvia eventos quando não recebe 2xx, e pode entregar o mesmo evento
-- mais de uma vez. A PK no id do evento transforma reprocessamento em conflito
-- barato de detectar.
CREATE TABLE IF NOT EXISTS public.stripe_eventos (
  id TEXT PRIMARY KEY,
  tipo TEXT,
  empresa_id UUID REFERENCES public.empresas(id) ON DELETE SET NULL,
  processado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.stripe_eventos ENABLE ROW LEVEL SECURITY;
-- Nenhuma policy: só service_role enxerga.
REVOKE ALL ON public.stripe_eventos FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Toda empresa tem uma linha de assinatura
-- ---------------------------------------------------------------------------
-- GRANDFATHERING: quem já usa o sistema não pode ser trancado do lado de fora
-- no instante em que esta migration rodar. As empresas existentes entram como
-- ativas e marcadas como 'legacy', para dar para distinguir depois quem nunca
-- passou pelo checkout.
INSERT INTO public.empresa_assinaturas (empresa_id, plan_status, origem, ativado_em)
SELECT e.id, 'active', 'legacy', now()
FROM public.empresas e
ON CONFLICT (empresa_id) DO NOTHING;

-- Empresas novas nascem inativas e liberam ao confirmar o pagamento.
-- O trigger fica na tabela (e não dentro do handle_new_user) porque a policy
-- empresas_insert também permite criar empresa direto pelo cliente.
CREATE OR REPLACE FUNCTION public.criar_assinatura_inicial_empresa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.empresa_assinaturas (empresa_id, plan_status, origem)
  VALUES (NEW.id, 'inactive', 'stripe')
  ON CONFLICT (empresa_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_criar_assinatura_inicial_empresa ON public.empresas;
CREATE TRIGGER trg_criar_assinatura_inicial_empresa
AFTER INSERT ON public.empresas
FOR EACH ROW EXECUTE FUNCTION public.criar_assinatura_inicial_empresa();

-- ---------------------------------------------------------------------------
-- 5. Helper consultado pelas policies de escrita
-- ---------------------------------------------------------------------------
-- STABLE e SECURITY DEFINER: precisa ler empresa_assinaturas, que não tem policy
-- de leitura para o papel que está executando a escrita em outras tabelas.
--
-- Empresa sem linha de assinatura é tratada como ATIVA de propósito. É o mesmo
-- princípio do gate do front: na dúvida, liberar. Um erro que tranca o cliente
-- pagante é muito mais caro que um que libera alguém a mais por algumas horas.
CREATE OR REPLACE FUNCTION public.empresa_plano_ativo()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT a.plan_status NOT IN ('inactive', 'canceled', 'unpaid')
      FROM public.empresa_assinaturas a
      WHERE a.empresa_id = public.get_my_empresa_id()
    ),
    true
  ) OR public.is_admin();
$$;

GRANT EXECUTE ON FUNCTION public.empresa_plano_ativo() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_updated_at_empresa_assinaturas()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_empresa_assinaturas_updated_at ON public.empresa_assinaturas;
CREATE TRIGGER trg_empresa_assinaturas_updated_at
BEFORE UPDATE ON public.empresa_assinaturas
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_empresa_assinaturas();
