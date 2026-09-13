-- ============================================================================
-- OS CARTÕES DE RISCO E O RESUMO POR FABRICANTE SEGUEM A CHAVE DA PAUTA
-- ============================================================================
--
-- Decisão do dono do produto em 12/09/2026. Medido no mesmo dia: os três cartões de risco e o
-- "Resumo por fabricante" mostravam o número da EMPRESA INTEIRA para todo mundo — uma vendedora
-- e uma gestora da mesma empresa recebiam exatamente o mesmo valor em risco. Isso nunca foi
-- decisão: é a regra de leitura de `pedidos`, que é da empresa inteira, aparecendo sem portão.
--
-- Passam a seguir a MESMA chave que decide a pauta logo acima, na mesma tela
-- (`pauta_de_todos`, lida por `public.eu_vejo_pauta_de_todos()`). O gráfico por vendedor já
-- seguia desde 07/09, e a tabela do time segue pela própria função (`negocios_em_risco_de`).
--
-- ⚠️ ISTO MUDA NÚMEROS QUE AS PESSOAS VEEM TODO DIA. Para quem não tem a chave, o valor em
-- risco vai CAIR — não porque algo sumiu, mas porque ele passa a ser o valor em risco DELA.
--
-- 🔴 O corte é UM SÓ, na origem dos negócios (`abertos`), e não um portão por campo: assim os
-- cinco agregados, o resumo por fabricante e qualquer campo futuro nascem já recortados.
--
-- 🔴 A função NÃO é `SECURITY DEFINER` (`prosecdef = false`) e continua assim: quem recorta por
-- empresa é a regra de segurança de `pedidos`, avaliada com o privilégio de quem chama. Mexer
-- nisso é o que a tornaria capaz de mostrar negócio de outra empresa.
--
-- 🔴 AS DUAS CHAMADAS SÃO `(SELECT ...)` SEM CORRELAÇÃO, de propósito: assim o planejador as
-- resolve UMA VEZ (`InitPlan`) em vez de por linha. É o mesmo motivo do §7.16 do CLAUDE.md, onde
-- a RLS de `pedidos` cobrando função por linha matou uma função desta base.
--
-- 🔴 `CASE WHEN public.eu_vejo_pauta_de_todos()` em `risco_por_vendedor` FICA, mesmo virando
-- redundante: sem a chave, `abertos` já só tem os negócios da pessoa, e sem o `CASE` o gráfico
-- passaria a desenhar uma barra só, com o nome de quem está olhando. Hoje ele vem vazio, e
-- mudar isso é decisão de tela, não deste arquivo.
--
-- 🔴 O corpo foi COLHIDO com `pg_get_functiondef` em 12/09/2026.
-- `md5(prosrc)` do texto colhido: 3e40ace58fa8b109c44710db2b8415da (3.071 caracteres). Fora da
-- troca marcada com 🔴, o texto é o mesmo caractere por caractere.
--
-- PARA VOLTAR ATRÁS: reemitir a função sem a linha marcada. `CREATE OR REPLACE`, sempre.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.dashboard_negocios_risco(p_usuario_ids uuid[] DEFAULT NULL::uuid[], p_fabricante_ids uuid[] DEFAULT NULL::uuid[], p_funil_id uuid DEFAULT NULL::uuid, p_dias_parado integer DEFAULT 7, p_etapas text[] DEFAULT NULL::text[])
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
      -- 🔴 NOVO: o portão. Ver o cabeçalho.
      AND (
        (SELECT public.eu_vejo_pauta_de_todos())
        OR p.usuario_id = (SELECT public.get_my_usuario_id())
      )
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
    CASE WHEN public.eu_vejo_pauta_de_todos() THEN (
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
    );
$function$;

COMMIT;
