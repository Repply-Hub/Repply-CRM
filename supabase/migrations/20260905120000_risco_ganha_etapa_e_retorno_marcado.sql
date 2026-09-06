-- ============================================================================
-- O PAINEL DE RISCO GANHA ETAPA, CONTA O RETORNO MARCADO E DEVOLVE OS 10 MAIORES
-- ============================================================================
--
-- Três mudanças, todas medidas antes na MD Representações (05/09/2026):
--
-- 1. FILTRO POR ETAPA. A barra de filtros da tela "Hoje" precisa dele. Compara contra
--    `pedidos.status`, que JÁ é o slug da coluna do funil — juntar `kanban_colunas` só por causa
--    de um filtro opcional é a armadilha do CLAUDE.md §7.16, que já custou 11 segundos numa
--    função de agregação desta base.
--
-- 2. "SEM PRÓXIMA AÇÃO" PASSA A CONTAR O RETORNO MARCADO. Hoje o cartão significa "não existe
--    tarefa aberta ligada a este negócio", e NENHUM dos 146 negócios abertos da MD tem tarefa —
--    ele marca 146 de 146 e nunca vai sair de 100%. Ele não mede risco: mede um hábito que a
--    equipe não tem. Agora um negócio adiado pelo botão "Retomar depois" deixa de contar, e o
--    cartão vira o placar do hábito que se quer criar.
--
--    🔴 A comparação de data copia LITERALMENTE a de `pauta_do_dia_de` (`r.ate < v_hoje`, com
--    `v_hoje` sendo a data em São Paulo). Se as duas divergirem, a fila de cima e o cartão de
--    baixo discordam sobre o mesmo negócio no mesmo dia — e `proximo_contato_em` é gravado como
--    meia-noite, que em UTC é 21h do dia anterior em Natal.
--
-- 3. DOIS CONJUNTOS NOVOS no retorno: `qtd` ao lado do valor no resumo por fabricante (valor sem
--    contagem não diz se é um problema grande ou um negócio grande), e `top_parados`, a lista
--    dos 10 maiores parados — a única parte do painel interno da MD que gera ação direta.
--
-- 🔴 DROP + CREATE, e não `create or replace`: um parâmetro a mais cria SOBRECARGA, e o
-- PostgREST recusa a chamada por ambiguidade quando existem duas com o mesmo nome.
--
-- A função continua SEM `security definer` — ela respeita a regra de segurança de `pedidos`,
-- que já limita a leitura à empresa de quem chama. Não trocar isso por desempenho: medido, o
-- custo da regra é aceitável, e trocar tiraria a única cerca entre empresas desta consulta.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.dashboard_negocios_risco(uuid[], uuid[], uuid, integer);

CREATE FUNCTION public.dashboard_negocios_risco(
  p_usuario_ids    uuid[]  DEFAULT NULL,
  p_fabricante_ids uuid[]  DEFAULT NULL,
  p_funil_id       uuid    DEFAULT NULL,
  p_dias_parado    integer DEFAULT 7,
  p_etapas         text[]  DEFAULT NULL
)
RETURNS TABLE(
  qtd_parados bigint, valor_parados numeric,
  qtd_sem_proxima_acao bigint, valor_sem_proxima_acao numeric,
  valor_risco_total numeric,
  risco_por_vendedor jsonb, risco_por_fabricante jsonb,
  top_parados jsonb
)
LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  WITH hoje AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d),
  abertos AS (
    SELECT
      p.id,
      p.nome,
      p.valor_total,
      u.nome AS vendedor_nome,
      f.nome AS fabricante_nome,
      COALESCE(k.nome, p.status) AS etapa_label,
      -- LATERAL com ORDER BY created_at DESC LIMIT 1 casa direto com o índice
      -- idx_pedidos_historico_status_pedido_created (pedido_id, created_at DESC).
      COALESCE(uh.ultima_atividade, p.created_at) AS ultima_atividade
    FROM public.pedidos p
    LEFT JOIN public.usuarios u ON u.id = p.usuario_id
    LEFT JOIN public.fabricantes f ON f.id = p.fabricante_id
    LEFT JOIN public.kanban_colunas k ON k.slug = p.status AND k.empresa_id = u.empresa_id
    LEFT JOIN LATERAL (
      SELECT h.created_at AS ultima_atividade
      FROM public.pedidos_historico_status h
      WHERE h.pedido_id = p.id
      ORDER BY h.created_at DESC
      LIMIT 1
    ) uh ON true
    WHERE p.status NOT IN ('fechamento', 'perdido')
      AND (p_usuario_ids    IS NULL OR p.usuario_id    = ANY(p_usuario_ids))
      AND (p_fabricante_ids IS NULL OR p.fabricante_id = ANY(p_fabricante_ids))
      AND (p_funil_id       IS NULL OR p.funil_id      = p_funil_id)
      AND (p_etapas         IS NULL OR p.status        = ANY(p_etapas))
  ),
  marcado AS (
    SELECT
      a.*,
      a.ultima_atividade <= (now() - (p_dias_parado || ' days')::interval) AS parado,
      (a.ultima_atividade AT TIME ZONE 'America/Sao_Paulo')::date          AS parado_desde,
      -- Sem tarefa aberta E sem retorno marcado para hoje ou depois.
      (
        NOT EXISTS (
          SELECT 1 FROM public.tarefas t
          WHERE t.pedido_id = a.id AND t.status <> 'concluida'
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.historico_contatos hc, hoje
          WHERE hc.pedido_id = a.id
            AND hc.proximo_contato_em IS NOT NULL
            AND hc.proximo_contato_em >= hoje.d
        )
      ) AS sem_proxima_acao
    FROM abertos a
  )
  SELECT
    (SELECT count(*) FROM marcado WHERE parado)::bigint,
    (SELECT coalesce(sum(valor_total), 0) FROM marcado WHERE parado)::numeric,
    (SELECT count(*) FROM marcado WHERE sem_proxima_acao)::bigint,
    (SELECT coalesce(sum(valor_total), 0) FROM marcado WHERE sem_proxima_acao)::numeric,
    (SELECT coalesce(sum(valor_total), 0) FROM marcado WHERE parado OR sem_proxima_acao)::numeric,
    -- A lista NOMINAL por responsável continua decidida no servidor. Na Etapa 3 o portão passa
    -- de papel para a chave de permissão; até lá, `is_gestor()` como sempre foi.
    CASE WHEN is_gestor() THEN (
      SELECT coalesce(jsonb_agg(jsonb_build_object('vendedor', vendedor_nome, 'qtd', qtd, 'valor', total) ORDER BY total DESC), '[]'::jsonb)
      FROM (
        SELECT vendedor_nome, count(*) AS qtd, sum(valor_total) AS total
        FROM marcado WHERE (parado OR sem_proxima_acao) AND vendedor_nome IS NOT NULL
        GROUP BY vendedor_nome
      ) rv
    ) ELSE '[]'::jsonb END,
    (
      SELECT coalesce(jsonb_agg(jsonb_build_object('fabrica', fabricante_nome, 'qtd', qtd, 'valor', total) ORDER BY total DESC), '[]'::jsonb)
      FROM (
        SELECT fabricante_nome, count(*) AS qtd, sum(valor_total) AS total
        FROM marcado WHERE (parado OR sem_proxima_acao) AND fabricante_nome IS NOT NULL
        GROUP BY fabricante_nome
      ) rf
    ),
    (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', id, 'nome', coalesce(nullif(trim(nome), ''), 'Negócio sem nome'),
               'fabrica', fabricante_nome, 'etapa', etapa_label,
               'responsavel', vendedor_nome, 'valor', valor_total,
               'dias_parado', (SELECT d FROM hoje) - parado_desde
             ) ORDER BY valor_total DESC), '[]'::jsonb)
      FROM (
        SELECT * FROM marcado WHERE parado OR sem_proxima_acao
        ORDER BY valor_total DESC NULLS LAST LIMIT 10
      ) tp
    );
$function$;

COMMIT;

-- Confira depois de aplicar. A primeira devolve UMA linha (nunca duas — duas seria sobrecarga
-- não removida); a segunda mostra que o filtro de etapa recorta:
--
--   select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.proname='dashboard_negocios_risco';
--
--   select qtd_parados, qtd_sem_proxima_acao, jsonb_array_length(top_parados)
--     from public.dashboard_negocios_risco(null, null, null, 7, array['negociacao']);
