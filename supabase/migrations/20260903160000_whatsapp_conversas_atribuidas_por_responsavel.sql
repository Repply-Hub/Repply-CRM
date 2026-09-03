-- ============================================================================
-- CONVERSAS ATRIBUÍDAS POR RESPONSÁVEL — gráfico novo no Dashboard, ao lado de
-- "Rendimento por Responsável".
-- ============================================================================
--
-- O QUE O GRÁFICO RESPONDE: dentro do período escolhido no topo do Dashboard,
-- quantas conversas de WhatsApp caíram no colo de cada vendedor. Conta pela DATA
-- DA ATRIBUIÇÃO (quando a conversa passou a ser daquele vendedor), não pela data
-- em que a conversa nasceu — decisão do dono do produto.
--
-- POR QUE UMA TABELA NOVA, E NÃO whatsapp_conversa_responsaveis:
-- aquela tabela é o estado ATUAL de "quem responde por esta conversa", e o
-- trigger trg_wa_conversa_remove_responsaveis_ao_fechar (20260721140000) APAGA
-- todas as linhas dela quando a conversa é fechada/arquivada. Uma conversa
-- atribuída e fechada dentro do mesmo mês sumiria da contagem. Esta tabela é um
-- LOG só-de-acréscimo: cada atribuição vira uma linha que fica, mesmo depois que
-- a conversa fecha.
--
-- LIMITE CONHECIDO: atribuições que já tinham sido apagadas antes desta migration
-- estão perdidas (não há como reconstruí-las). O backfill abaixo só alcança as
-- que ainda existem em whatsapp_conversa_responsaveis. A partir daqui o registro
-- é completo.

-- ----------------------------------------------------------------------------
-- 1. A tabela-log
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_conversa_atribuicoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id uuid NOT NULL REFERENCES public.whatsapp_conversas(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  -- Redundante com whatsapp_conversas.empresa_id de propósito: o gráfico varre
  -- esta tabela por empresa + faixa de data, e um filtro por coluna indexada aqui
  -- evita o join com whatsapp_conversas em toda chamada da RPC (mesmo motivo de
  -- CLAUDE.md §7.16). O trigger abaixo copia o valor no INSERT.
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  atribuido_em timestamptz NOT NULL DEFAULT now()
);

-- A RPC lê "linhas desta empresa dentro da faixa de data" — este índice corta
-- direto pra empresa e período certos antes de agrupar por vendedor.
CREATE INDEX IF NOT EXISTS idx_wa_conversa_atribuicoes_empresa_data
  ON public.whatsapp_conversa_atribuicoes (empresa_id, atribuido_em);

-- Sustenta o GROUP BY usuario_id da RPC e o recorte "só as minhas" da política
-- de RLS abaixo (vendedor comum).
CREATE INDEX IF NOT EXISTS idx_wa_conversa_atribuicoes_usuario
  ON public.whatsapp_conversa_atribuicoes (usuario_id);

ALTER TABLE public.whatsapp_conversa_atribuicoes ENABLE ROW LEVEL SECURITY;

-- Leitura: admin global e admin/gestor da empresa veem a empresa inteira;
-- qualquer outro usuário vê só as próprias atribuições. Mesmo desenho de escopo
-- de dashboard_whatsapp_stats. Não há política de INSERT/UPDATE/DELETE: só o
-- trigger (SECURITY DEFINER) grava, e a RPC do gráfico é SECURITY DEFINER (passa
-- por cima da RLS) — esta política é a rede de proteção pra quem consultar a
-- tabela direto.
DROP POLICY IF EXISTS "wa_conversa_atribuicoes_select" ON public.whatsapp_conversa_atribuicoes;
CREATE POLICY "wa_conversa_atribuicoes_select" ON public.whatsapp_conversa_atribuicoes
  FOR SELECT
  USING (
    empresa_id = public.get_my_empresa_id()
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.usuarios
        WHERE user_id = auth.uid() AND role IN ('empresa', 'gestor')
      )
      OR usuario_id = public.get_my_usuario_id()
    )
  );

-- ----------------------------------------------------------------------------
-- 2. Trigger: toda atribuição nova vira uma linha no log
-- ----------------------------------------------------------------------------
-- AFTER INSERT em whatsapp_conversa_responsaveis. Os INSERT com
-- "ON CONFLICT (conversa_id, usuario_id) DO NOTHING" espalhados pelo código
-- (auto-responsável, webhook, envio) NÃO disparam este trigger quando o par já
-- existe — o Postgres não roda AFTER INSERT pra linha que o ON CONFLICT pulou —,
-- então reatribuir alguém que já está na conversa não gera linha repetida.
-- Conversa que fecha e reabre e é reatribuída gera, sim, uma linha nova: é uma
-- atribuição de verdade acontecendo de novo.
CREATE OR REPLACE FUNCTION public.wa_registra_atribuicao_historico()
 RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.whatsapp_conversa_atribuicoes (conversa_id, usuario_id, empresa_id, atribuido_em)
  SELECT NEW.conversa_id, NEW.usuario_id, c.empresa_id, COALESCE(NEW.created_at, now())
  FROM public.whatsapp_conversas c
  WHERE c.id = NEW.conversa_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wa_registra_atribuicao_historico ON public.whatsapp_conversa_responsaveis;
CREATE TRIGGER trg_wa_registra_atribuicao_historico
  AFTER INSERT ON public.whatsapp_conversa_responsaveis
  FOR EACH ROW EXECUTE FUNCTION public.wa_registra_atribuicao_historico();

-- ----------------------------------------------------------------------------
-- 3. Backfill: as atribuições que ainda existem hoje
-- ----------------------------------------------------------------------------
-- Usa o created_at da linha atual como data da atribuição. Só roda se o log
-- estiver vazio, pra reaplicar a migration não duplicar.
INSERT INTO public.whatsapp_conversa_atribuicoes (conversa_id, usuario_id, empresa_id, atribuido_em)
SELECT r.conversa_id, r.usuario_id, c.empresa_id, r.created_at
FROM public.whatsapp_conversa_responsaveis r
JOIN public.whatsapp_conversas c ON c.id = r.conversa_id
WHERE NOT EXISTS (SELECT 1 FROM public.whatsapp_conversa_atribuicoes);

-- ----------------------------------------------------------------------------
-- 4. RPC: dashboard_whatsapp_stats ganha o array de conversas atribuídas
-- ----------------------------------------------------------------------------
-- Mudou o RETURNS TABLE (coluna nova), então precisa de DROP antes do CREATE —
-- o Postgres não deixa CREATE OR REPLACE mexer no tipo de retorno.
DROP FUNCTION IF EXISTS public.dashboard_whatsapp_stats(date, date);

CREATE FUNCTION public.dashboard_whatsapp_stats(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
)
RETURNS TABLE (
  conversas_abertas bigint,
  conversas_fechadas bigint,
  tempo_resposta_atendente jsonb,
  conversas_atribuidas_atendente jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH autorizacao AS (
    SELECT (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.usuarios
        WHERE user_id = auth.uid() AND role IN ('empresa', 'gestor')
      )
    ) AS autorizado
  ),
  conversas AS (
    SELECT c.arquivada
    FROM public.whatsapp_conversas c, autorizacao a
    WHERE a.autorizado
      AND c.empresa_id = public.get_my_empresa_id()
      AND (p_date_from IS NULL OR c.created_at::date >= p_date_from)
      AND (p_date_to IS NULL OR c.created_at::date <= p_date_to)
  ),
  pares AS (
    SELECT
      m.direcao,
      m.created_at,
      LEAD(m.direcao) OVER w AS proxima_direcao,
      LEAD(m.created_at) OVER w AS proximo_created_at,
      LEAD(m.usuario_id) OVER w AS proximo_usuario_id
    FROM public.whatsapp_mensagens m, autorizacao a
    WHERE a.autorizado
      AND m.empresa_id = public.get_my_empresa_id()
    WINDOW w AS (PARTITION BY m.conversa_id ORDER BY m.created_at)
  ),
  respostas AS (
    SELECT
      proximo_usuario_id AS usuario_id,
      EXTRACT(EPOCH FROM (proximo_created_at - created_at)) / 60 AS minutos
    FROM pares
    WHERE direcao = 'entrada'
      AND proxima_direcao = 'saida'
      AND proximo_usuario_id IS NOT NULL
      AND (p_date_from IS NULL OR created_at::date >= p_date_from)
      AND (p_date_to IS NULL OR created_at::date <= p_date_to)
  ),
  atribuicoes AS (
    SELECT h.usuario_id, count(*) AS qtd
    FROM public.whatsapp_conversa_atribuicoes h, autorizacao a
    WHERE a.autorizado
      AND h.empresa_id = public.get_my_empresa_id()
      AND (p_date_from IS NULL OR h.atribuido_em::date >= p_date_from)
      AND (p_date_to IS NULL OR h.atribuido_em::date <= p_date_to)
    GROUP BY h.usuario_id
  )
  SELECT
    (SELECT count(*) FROM conversas WHERE NOT arquivada)::bigint AS conversas_abertas,
    (SELECT count(*) FROM conversas WHERE arquivada)::bigint AS conversas_fechadas,
    (
      SELECT coalesce(
        jsonb_agg(
          jsonb_build_object('atendente', u.nome, 'minutos', ROUND(r.avg_minutos, 1))
          ORDER BY r.avg_minutos DESC
        ),
        '[]'::jsonb
      )
      FROM (
        SELECT usuario_id, AVG(minutos) AS avg_minutos
        FROM respostas
        GROUP BY usuario_id
      ) r
      JOIN public.usuarios u ON u.id = r.usuario_id
    ) AS tempo_resposta_atendente,
    (
      SELECT coalesce(
        jsonb_agg(
          jsonb_build_object('atendente', u.nome, 'quantidade', at.qtd)
          ORDER BY at.qtd DESC
        ),
        '[]'::jsonb
      )
      FROM atribuicoes at
      JOIN public.usuarios u ON u.id = at.usuario_id
    ) AS conversas_atribuidas_atendente;
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_whatsapp_stats(date, date) TO authenticated;
