-- RPC de suporte aos 2 novos gráficos do Dashboard sobre atendimento via WhatsApp
-- (conversas abertas x fechadas, e tempo médio de resposta por atendente) — pedidos
-- pelo gestor/admin da empresa para acompanhar a equipe de atendimento.
--
-- SECURITY INVOKER, sem parâmetro de empresa/usuário: a RLS de whatsapp_conversas/
-- whatsapp_mensagens (ver 20260709190000/20260715130000) já resolve o escopo sozinha
-- — admin global, usuarios.role IN ('empresa','gestor') veem a empresa inteira, e
-- qualquer outro usuário só as conversas em que é responsável (whatsapp_conversa_responsaveis).
-- Mesmo padrão de dashboard_stats/dashboard_indicadores_vendedor.
--
-- "Tempo de resposta" pareia cada mensagem de entrada com a mensagem de saída
-- imediatamente seguinte na mesma conversa (LEAD() particionado por conversa_id,
-- ordenado por created_at) — não existe coluna dedicada pra isso hoje. O LEAD roda
-- sobre whatsapp_mensagens sem filtro de data (filtrar antes quebraria a adjacência:
-- a "próxima" mensagem certa pode cair fora do período, ex. pergunta às 23:59 e
-- resposta logo após a virada do dia) — o filtro de período é aplicado só depois,
-- na mensagem de entrada que dispara a contagem, mesmo padrão de "não filtrar o
-- evento de resposta, só o evento base" usado em dashboard_velocidade_fabricante
-- (removida em 20260811160000, mas a técnica segue válida).
CREATE OR REPLACE FUNCTION public.dashboard_whatsapp_stats(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
)
RETURNS TABLE (
  conversas_abertas bigint,
  conversas_fechadas bigint,
  tempo_resposta_atendente jsonb
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH conversas AS (
    SELECT c.arquivada
    FROM public.whatsapp_conversas c
    WHERE (p_date_from IS NULL OR c.created_at::date >= p_date_from)
      AND (p_date_to IS NULL OR c.created_at::date <= p_date_to)
  ),
  pares AS (
    SELECT
      m.direcao,
      m.created_at,
      LEAD(m.direcao) OVER w AS proxima_direcao,
      LEAD(m.created_at) OVER w AS proximo_created_at,
      LEAD(m.usuario_id) OVER w AS proximo_usuario_id
    FROM public.whatsapp_mensagens m
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
    ) AS tempo_resposta_atendente;
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_whatsapp_stats(date, date) TO authenticated;

-- Sustenta o LEAD() OVER (PARTITION BY conversa_id ORDER BY created_at) acima sem
-- sort explícito por conversa — os índices existentes (conversa_id) e (created_at)
-- separados não servem pra isso.
CREATE INDEX IF NOT EXISTS idx_whatsapp_mensagens_conversa_created
  ON public.whatsapp_mensagens (conversa_id, created_at);
