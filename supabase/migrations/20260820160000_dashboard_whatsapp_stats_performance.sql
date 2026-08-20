-- Corrige lentidão em dashboard_whatsapp_stats (20260819120000): estourava o
-- limite de tempo da API (8s) mesmo pra uma empresa com só 47 mil mensagens —
-- medido em 15,5s antes desta correção.
--
-- O PROBLEMA: a função é SECURITY INVOKER, então a varredura de
-- whatsapp_mensagens (necessária pro LEAD() calcular "próxima mensagem da
-- mesma conversa") passa pela RLS normal da tabela, que aplica
-- can_access_wa_conversa(conversa_id) LINHA A LINHA. Essa função dispara 3
-- subconsultas (é admin? é dono da empresa/gestor? está entre os
-- responsáveis desta conversa específica?) — certo para o inbox, onde faz
-- sentido checar conversa por conversa, mas catastrófico aqui: pra um
-- gestor (que enxerga a empresa inteira), a mesma pergunta "ele pode ver
-- isso?" é recalculada ~47 mil vezes em vez de respondida uma vez só.
-- EXPLAIN ANALYZE confirmou: Index Scan usando o índice certo (criado na
-- migration anterior), mas com Filter: can_access_wa_conversa(conversa_id)
-- rodando linha a linha — 421 mil buffer hits pra 46 mil linhas.
--
-- A CORREÇÃO: função passa a ser SECURITY DEFINER e decide autorização uma
-- única vez no início (autorizacao CTE) — é admin, ou usuarios.role IN
-- ('empresa','gestor')? Se não for nenhum dos dois, devolve zerado (esta
-- métrica é pensada só pra gestor/admin acompanhar a equipe, igual já era
-- documentado na função original). Sendo SECURITY DEFINER, a função roda
-- como dono da tabela e por isso PULA a RLS normal — o filtro por empresa
-- (m.empresa_id = get_my_empresa_id()) substitui explicitamente o que a RLS
-- faria, e é uma comparação simples de coluna indexada
-- (idx_whatsapp_mensagens_empresa já existe), não uma função opaca por
-- linha — o planner consegue usar o índice pra cortar direto pra empresa
-- certa antes de calcular a janela deslizante.
--
-- Mesmo padrão já usado em wa_buscar_mensagens pro mesmo tipo de problema em
-- busca de texto (ver CLAUDE.md §7.4).

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
