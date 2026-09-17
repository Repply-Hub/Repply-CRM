-- ============================================================================
-- "PEDE ATENCAO" PASSA A SIGNIFICAR "SEM PROXIMA ACAO"
-- ============================================================================
-- O painel "No geral" e a tabela do time contavam negocio 'parado OR sem_proxima_acao'. O ramo
-- 'parado' entrava sozinho (contava ate quem ja foi adiado com "Retomar depois"), e qualquer
-- tarefa aberta contava como acao, ate a vencida. Passa a contar so 'sem_proxima_acao', e
-- "proxima acao" passa a olhar o PRAZO: retorno agendado pra frente OU tarefa com prazo ainda
-- nao vencido. Tarefa vencida (ou sem prazo) volta a pedir atencao. E a mesma regra da pauta.
--
-- So muda WHERE/count/sum e a checagem da tarefa em sem_proxima_acao. Mesma assinatura ->
-- CREATE OR REPLACE preserva as concessoes (dashboard aberta a authenticated; _de fechada). Sem
-- DROP. Desenho: docs/superpowers/specs/2026-09-16-pede-atencao-respeita-agendado-design.md
-- Rollback: reaplicar as defs anteriores (so os WHERE/count/sum e a tarefa mudaram).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.dashboard_negocios_risco(p_usuario_ids uuid[] DEFAULT NULL::uuid[], p_fabricante_ids uuid[] DEFAULT NULL::uuid[], p_funil_id uuid DEFAULT NULL::uuid, p_dias_parado integer DEFAULT 7, p_etapas text[] DEFAULT NULL::text[], p_data_de date DEFAULT NULL::date, p_data_ate date DEFAULT NULL::date)
 RETURNS TABLE(qtd_parados bigint, valor_parados numeric, qtd_sem_proxima_acao bigint, valor_sem_proxima_acao numeric, valor_risco_total numeric, risco_por_vendedor jsonb, risco_por_fabricante jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH hoje AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d),
  abertos AS (
    SELECT
      p.id,
      p.usuario_id,
      p.nome,
      p.cliente_id,
      p.campos_extras,
      p.valor_total,
      u.nome AS vendedor_nome,
      f.nome AS fabricante_nome,
      COALESCE(k.nome, p.status) AS etapa_label,
      COALESCE(uh.ultima_atividade, p.created_at) AS ultima_atividade
    FROM public.pedidos p
    LEFT JOIN public.usuarios u ON u.id = p.usuario_id
    LEFT JOIN public.fabricantes f ON f.id = p.fabricante_id
    LEFT JOIN public.kanban_colunas k ON k.slug = p.status AND k.empresa_id = u.empresa_id AND k.funil_id = p.funil_id
    LEFT JOIN LATERAL (
      SELECT h.created_at AS ultima_atividade
      FROM public.pedidos_historico_status h
      WHERE h.pedido_id = p.id
      ORDER BY h.created_at DESC
      LIMIT 1
    ) uh ON true
    WHERE p.status NOT IN ('fechamento', 'perdido')
      AND (
        (SELECT public.eu_vejo_pauta_de_todos())
        OR p.usuario_id = (SELECT public.get_my_usuario_id())
      )
      AND (p_usuario_ids    IS NULL OR p.usuario_id    = ANY(p_usuario_ids))
      AND (p_fabricante_ids IS NULL OR p.fabricante_id = ANY(p_fabricante_ids))
      AND (p_funil_id       IS NULL OR p.funil_id      = p_funil_id)
      AND (p_etapas         IS NULL OR p.status        = ANY(p_etapas))
      -- 🔴 NOVO (15/09/2026): o mesmo período opcional por DATA DE CRIAÇÃO da tabela.
      AND (p_data_de  IS NULL OR p.data_pedido >= p_data_de)
      AND (p_data_ate IS NULL OR p.data_pedido <= p_data_ate)
  ),
  marcado AS (
    SELECT
      a.*,
      a.ultima_atividade <= (now() - (p_dias_parado || ' days')::interval) AS parado,
      (a.ultima_atividade AT TIME ZONE 'America/Sao_Paulo')::date          AS parado_desde,
      (
        NOT EXISTS (
          SELECT 1 FROM public.tarefas t, hoje
          WHERE t.pedido_id = a.id AND t.status <> 'concluida'
            AND t.prazo_final IS NOT NULL
            AND (t.prazo_final AT TIME ZONE 'America/Sao_Paulo')::date >= hoje.d
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
    (SELECT count(*) FROM marcado WHERE parado AND sem_proxima_acao)::bigint,
    (SELECT coalesce(sum(valor_total), 0) FROM marcado WHERE parado AND sem_proxima_acao)::numeric,
    (SELECT count(*) FROM marcado WHERE sem_proxima_acao)::bigint,
    (SELECT coalesce(sum(valor_total), 0) FROM marcado WHERE sem_proxima_acao)::numeric,
    (SELECT coalesce(sum(valor_total), 0) FROM marcado WHERE sem_proxima_acao)::numeric,
    CASE WHEN public.eu_vejo_pauta_de_todos() THEN (
      SELECT coalesce(jsonb_agg(jsonb_build_object('vendedor', vendedor_nome, 'qtd', qtd, 'valor', total) ORDER BY total DESC), '[]'::jsonb)
      FROM (
        SELECT vendedor_nome, count(*) AS qtd, sum(valor_total) AS total
        FROM marcado WHERE sem_proxima_acao AND vendedor_nome IS NOT NULL
        GROUP BY vendedor_nome
      ) rv
    ) ELSE '[]'::jsonb END,
    (
      SELECT coalesce(jsonb_agg(jsonb_build_object('fabrica', fabricante_nome, 'qtd', qtd, 'valor', total) ORDER BY total DESC), '[]'::jsonb)
      FROM (
        SELECT fabricante_nome, count(*) AS qtd, sum(valor_total) AS total
        FROM marcado WHERE sem_proxima_acao AND fabricante_nome IS NOT NULL
        GROUP BY fabricante_nome
      ) rf
    );
$function$
;

CREATE OR REPLACE FUNCTION public.negocios_em_risco_de(p_usuario_id uuid, p_usuario_ids uuid[] DEFAULT NULL::uuid[], p_fabricante_ids uuid[] DEFAULT NULL::uuid[], p_funil_id uuid DEFAULT NULL::uuid, p_dias_parado integer DEFAULT 7, p_etapas text[] DEFAULT NULL::text[], p_limite integer DEFAULT 10, p_deslocamento integer DEFAULT 0, p_data_de date DEFAULT NULL::date, p_data_ate date DEFAULT NULL::date, p_ordenar_por text DEFAULT 'valor'::text, p_ascendente boolean DEFAULT false)
 RETURNS TABLE(id uuid, nome text, fabrica text, etapa text, responsavel text, valor numeric, dias_parado integer, total_geral bigint, valor_geral numeric, responsavel_id uuid, responsavel_avatar text, tentativas integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH gente AS (
    SELECT u.id
    FROM public.usuarios u
    WHERE u.empresa_id = (SELECT dono.empresa_id FROM public.usuarios dono WHERE dono.id = p_usuario_id)
       OR u.id = p_usuario_id
  ),
  hoje AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d),
  abertos AS (
    SELECT
      p.id,
      p.usuario_id,
      p.nome,
      p.cliente_id,
      p.campos_extras,
      p.valor_total,
      u.nome AS vendedor_nome,
      u.avatar_url AS vendedor_avatar,
      f.nome AS fabricante_nome,
      COALESCE(k.nome, p.status) AS etapa_label,
      COALESCE(uh.ultima_atividade, p.created_at) AS ultima_atividade,
      -- 🔴 NOVO (15/09/2026): as retomadas ("Retomar depois") já registradas.
      (SELECT count(*)::int FROM public.historico_contatos hc2
        WHERE hc2.pedido_id = p.id AND hc2.tipo = 'retorno') AS tentativas
    FROM public.pedidos p
    JOIN gente g ON g.id = p.usuario_id
    LEFT JOIN public.usuarios u ON u.id = p.usuario_id
    LEFT JOIN public.fabricantes f ON f.id = p.fabricante_id
    LEFT JOIN public.kanban_colunas k ON k.slug = p.status AND k.empresa_id = u.empresa_id AND k.funil_id = p.funil_id
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
      -- 🔴 NOVO (15/09/2026): período opcional por DATA DE CRIAÇÃO (`data_pedido` é `date`).
      -- Uma coluna só, sem escolher entre duas colunas de data (§7.9). NULL = sem recorte.
      AND (p_data_de  IS NULL OR p.data_pedido >= p_data_de)
      AND (p_data_ate IS NULL OR p.data_pedido <= p_data_ate)
  ),
  marcado AS (
    SELECT
      a.*,
      a.ultima_atividade <= (now() - (p_dias_parado || ' days')::interval) AS parado,
      (a.ultima_atividade AT TIME ZONE 'America/Sao_Paulo')::date          AS parado_desde,
      (
        NOT EXISTS (
          SELECT 1 FROM public.tarefas t, hoje
          WHERE t.pedido_id = a.id AND t.status <> 'concluida'
            AND t.prazo_final IS NOT NULL
            AND (t.prazo_final AT TIME ZONE 'America/Sao_Paulo')::date >= hoje.d
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.historico_contatos hc, hoje
          WHERE hc.pedido_id = a.id
            AND hc.proximo_contato_em IS NOT NULL
            AND hc.proximo_contato_em >= hoje.d
        )
      ) AS sem_proxima_acao
    FROM abertos a
  ),
  meus AS (
    SELECT * FROM marcado
    WHERE sem_proxima_acao
      AND (
        (SELECT public.ve_pauta_de_todos(p_usuario_id))
        OR usuario_id = p_usuario_id
      )
  )
  SELECT
    pagina.id,
    pagina.nome_exibido,
    pagina.fabricante_nome,
    pagina.etapa_label,
    pagina.vendedor_nome,
    pagina.valor_total,
    ((SELECT d FROM hoje) - pagina.parado_desde)::integer,
    pagina.total_geral,
    pagina.valor_geral,
    pagina.usuario_id,
    pagina.vendedor_avatar,
    pagina.tentativas
  FROM (
    -- 🔴 O NOME EXIBIDO É CALCULADO AQUI DENTRO (não mais no SELECT de fora): a ordenação por
    -- "negócio" tem de recortar a lista ANTES do LIMIT, e o nome depende do `clientes`.
    SELECT m.*,
           coalesce(
             nullif(trim(m.nome), ''),
             nullif(trim(m.campos_extras ->> 'Negócio'), ''),
             nullif(trim(cl.empresa), '') || coalesce(' | ' || m.fabricante_nome, ''),
             'Negócio sem nome'
           ) AS nome_exibido,
           (count(*) OVER ())::bigint AS total_geral,
           (sum(m.valor_total) OVER ())::numeric AS valor_geral
    FROM meus m
    LEFT JOIN public.clientes cl ON cl.id = m.cliente_id
    -- 🔴 ORDENAÇÃO POR LISTA BRANCA (15/09/2026). Um par de linhas por coluna permitida: só a linha
    -- da coluna+direção escolhida fica não-nula e manda; as outras são constantes nulas. Coluna
    -- desconhecida cai no padrão (valor desc). `m.id` no fim garante ordem estável para a paginação.
    -- Seguro apesar do §7.9 porque a função tem teto de 100 linhas.
    ORDER BY
      (CASE WHEN p_ordenar_por = 'valor'       AND NOT p_ascendente THEN m.valor_total END) DESC NULLS LAST,
      (CASE WHEN p_ordenar_por = 'valor'       AND     p_ascendente THEN m.valor_total END) ASC  NULLS LAST,
      (CASE WHEN p_ordenar_por = 'dias'        AND NOT p_ascendente THEN ((SELECT d FROM hoje) - m.parado_desde) END) DESC NULLS LAST,
      (CASE WHEN p_ordenar_por = 'dias'        AND     p_ascendente THEN ((SELECT d FROM hoje) - m.parado_desde) END) ASC  NULLS LAST,
      (CASE WHEN p_ordenar_por = 'negocio'     AND NOT p_ascendente THEN lower(coalesce(nullif(trim(m.nome),''), nullif(trim(m.campos_extras ->> 'Negócio'),''), nullif(trim(cl.empresa),'') || coalesce(' | ' || m.fabricante_nome,''), 'Negócio sem nome')) END) DESC NULLS LAST,
      (CASE WHEN p_ordenar_por = 'negocio'     AND     p_ascendente THEN lower(coalesce(nullif(trim(m.nome),''), nullif(trim(m.campos_extras ->> 'Negócio'),''), nullif(trim(cl.empresa),'') || coalesce(' | ' || m.fabricante_nome,''), 'Negócio sem nome')) END) ASC  NULLS LAST,
      (CASE WHEN p_ordenar_por = 'fabricante'  AND NOT p_ascendente THEN lower(m.fabricante_nome) END) DESC NULLS LAST,
      (CASE WHEN p_ordenar_por = 'fabricante'  AND     p_ascendente THEN lower(m.fabricante_nome) END) ASC  NULLS LAST,
      (CASE WHEN p_ordenar_por = 'etapa'       AND NOT p_ascendente THEN lower(m.etapa_label) END) DESC NULLS LAST,
      (CASE WHEN p_ordenar_por = 'etapa'       AND     p_ascendente THEN lower(m.etapa_label) END) ASC  NULLS LAST,
      (CASE WHEN p_ordenar_por = 'responsavel' AND NOT p_ascendente THEN lower(m.vendedor_nome) END) DESC NULLS LAST,
      (CASE WHEN p_ordenar_por = 'responsavel' AND     p_ascendente THEN lower(m.vendedor_nome) END) ASC  NULLS LAST,
      m.valor_total DESC NULLS LAST,
      m.id
    OFFSET greatest(p_deslocamento, 0)
    LIMIT greatest(least(p_limite, 100), 1)
  ) pagina
  ORDER BY
    (CASE WHEN p_ordenar_por = 'valor'       AND NOT p_ascendente THEN pagina.valor_total END) DESC NULLS LAST,
    (CASE WHEN p_ordenar_por = 'valor'       AND     p_ascendente THEN pagina.valor_total END) ASC  NULLS LAST,
    (CASE WHEN p_ordenar_por = 'dias'        AND NOT p_ascendente THEN ((SELECT d FROM hoje) - pagina.parado_desde) END) DESC NULLS LAST,
    (CASE WHEN p_ordenar_por = 'dias'        AND     p_ascendente THEN ((SELECT d FROM hoje) - pagina.parado_desde) END) ASC  NULLS LAST,
    (CASE WHEN p_ordenar_por = 'negocio'     AND NOT p_ascendente THEN lower(pagina.nome_exibido) END) DESC NULLS LAST,
    (CASE WHEN p_ordenar_por = 'negocio'     AND     p_ascendente THEN lower(pagina.nome_exibido) END) ASC  NULLS LAST,
    (CASE WHEN p_ordenar_por = 'fabricante'  AND NOT p_ascendente THEN lower(pagina.fabricante_nome) END) DESC NULLS LAST,
    (CASE WHEN p_ordenar_por = 'fabricante'  AND     p_ascendente THEN lower(pagina.fabricante_nome) END) ASC  NULLS LAST,
    (CASE WHEN p_ordenar_por = 'etapa'       AND NOT p_ascendente THEN lower(pagina.etapa_label) END) DESC NULLS LAST,
    (CASE WHEN p_ordenar_por = 'etapa'       AND     p_ascendente THEN lower(pagina.etapa_label) END) ASC  NULLS LAST,
    (CASE WHEN p_ordenar_por = 'responsavel' AND NOT p_ascendente THEN lower(pagina.vendedor_nome) END) DESC NULLS LAST,
    (CASE WHEN p_ordenar_por = 'responsavel' AND     p_ascendente THEN lower(pagina.vendedor_nome) END) ASC  NULLS LAST,
    pagina.valor_total DESC NULLS LAST,
    pagina.id;
$function$
;

COMMIT;
