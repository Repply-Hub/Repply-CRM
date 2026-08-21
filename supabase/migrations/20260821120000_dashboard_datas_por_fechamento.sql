-- ============================================================================
-- DASHBOARD: dinheiro passa a ser contado pela DATA DE FECHAMENTO
-- ============================================================================
-- O Dashboard inteiro responde hoje "negócios CRIADOS no período" (data_pedido),
-- inclusive nas métricas de dinheiro. Um negócio criado em 28/junho e fechado em
-- 3/julho entra no faturamento de JUNHO — e some da meta de julho, que é o mês em
-- que a venda realmente aconteceu. Decisão do Lucas: dinheiro conta pelo dia em que
-- o negócio foi ganho, ou seja por `prazo_resposta` (a coluna que a tela mostra como
-- "Data de Fechamento").
--
-- O QUE MUDA DE COLUNA (data_pedido -> prazo_resposta):
--   Faturamento Total, Negócios Fechados (o cartão), Ticket Médio (deriva dos dois),
--   Faturamento por Fábrica, Rendimento por Responsável, Faturamento Mensal e o
--   Plano de Vendas.
--
-- O QUE NÃO MUDA (continua por data_pedido, decisão explícita do Lucas):
--   Taxa de Conversão, Conversão por Vendedor e Segmentação por Ticket. Essas três
--   são contas "de safra": dos negócios CRIADOS no período, quantos foram ganhos.
--   O numerador é subconjunto do denominador, então a conta nunca passa de 100%.
--   Trocar só um dos lados para prazo_resposta faria a taxa estourar (medido: semana
--   de 29/12/2025 daria 157%). Não mexa.
--
-- POR QUE NÃO EXISTE UM PARÂMETRO p_date_field AQUI (leia antes de "melhorar"):
--   Já foi medido nesta base. Predicado que cita DUAS colunas — tanto com CASE quanto
--   com o "OU de blocos" de pedidos_stats — faz o Postgres largar o índice e cair em
--   Seq Scan quando o plano é genérico (e o PostgREST sempre chama RPC por argumento
--   nomeado, que é o caso do plano genérico). Como a política de RLS de `pedidos`
--   chama `usuario_in_my_empresa` uma vez POR LINHA VARRIDA, sair de ~100 linhas para
--   11.9 mil é o que transformou 4ms em segundos no incidente de 20260811140000.
--   A única forma que manteve Index Scan é ter a coluna CRAVADA NO TEXTO de cada
--   recorte — por isso aqui existem duas CTEs separadas em vez de um parâmetro.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- (1) dashboard_stats — duas janelas de tempo dentro da mesma função
-- ----------------------------------------------------------------------------
-- Antes havia UMA CTE `base` recortada por data_pedido alimentando tudo. Trocar a
-- coluna dela quebraria a Segmentação por Ticket em silêncio (é só uma rosca de três
-- fatias, ninguém perceberia). Agora são duas:
--   base_criados  -> recorte por p.data_pedido    (safra: conversão e segmentação)
--   base_fechados -> recorte por p.prazo_resposta (dinheiro: faturamento e rendimentos)
--
-- CONFLITO DE NOMES — a parte mais fácil de alguém quebrar depois:
--   `pedidos_fechados`          = criados no período que JÁ ganharam, em qualquer data.
--                                 É o numerador da Taxa de Conversão. Significado
--                                 ANTIGO, mantido de propósito. NÃO troque a fonte.
--   `pedidos_fechados_periodo`  = fecharam DENTRO do período, tendo sido criados
--                                 quando fosse. É o número do cartão "Negócios
--                                 Fechados" e o divisor do Ticket Médio.
--   Os dois números são diferentes (ago/2026: 62 contra 45) e cada tela lê o seu.
DROP FUNCTION IF EXISTS public.dashboard_stats(uuid[], uuid[], date, date);

CREATE OR REPLACE FUNCTION public.dashboard_stats(
  p_usuario_ids uuid[] DEFAULT NULL,
  p_fabricante_ids uuid[] DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
)
RETURNS TABLE (
  total_pedidos bigint,
  pedidos_fechados bigint,
  pedidos_fechados_periodo bigint,
  total_faturamento numeric,
  segmentacao_alto bigint,
  segmentacao_medio bigint,
  segmentacao_baixo bigint,
  rendimento_fabricante jsonb,
  rendimento_vendedor jsonb
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH base_criados AS (
    -- Janela de CRIAÇÃO. Sem joins de nome: nada aqui é quebrado por fábrica ou por
    -- vendedor, então puxar `fabricantes` e `usuarios` só custava tempo.
    SELECT
      p.status,
      p.valor_total
    FROM public.pedidos p
    WHERE (p_usuario_ids IS NULL OR p.usuario_id = ANY(p_usuario_ids))
      AND (p_fabricante_ids IS NULL OR p.fabricante_id = ANY(p_fabricante_ids))
      AND (p_date_from IS NULL OR p.data_pedido >= p_date_from)
      AND (p_date_to IS NULL OR p.data_pedido <= p_date_to)
  ),
  base_fechados AS (
    -- Janela de FECHAMENTO. Já nasce filtrada por status='fechamento' porque tudo que
    -- sai daqui é dinheiro de venda ganha.
    -- Negócio ganho com prazo_resposta NULL não entra em nenhuma janela com data —
    -- é justamente o buraco que a migration 20260821120100 fecha no gatilho, para
    -- que uma venda não possa mais sumir do faturamento em silêncio.
    SELECT
      p.valor_total,
      f.nome AS fabricante_nome,
      u.nome AS vendedor_nome
    FROM public.pedidos p
    LEFT JOIN public.fabricantes f ON f.id = p.fabricante_id
    LEFT JOIN public.usuarios u ON u.id = p.usuario_id
    WHERE p.status = 'fechamento'
      AND (p_usuario_ids IS NULL OR p.usuario_id = ANY(p_usuario_ids))
      AND (p_fabricante_ids IS NULL OR p.fabricante_id = ANY(p_fabricante_ids))
      AND (p_date_from IS NULL OR p.prazo_resposta >= p_date_from)
      AND (p_date_to IS NULL OR p.prazo_resposta <= p_date_to)
  )
  SELECT
    -- ---- da janela de CRIAÇÃO ----
    (SELECT count(*) FROM base_criados)::bigint AS total_pedidos,
    (SELECT count(*) FILTER (WHERE status = 'fechamento') FROM base_criados)::bigint AS pedidos_fechados,
    -- ---- da janela de FECHAMENTO ----
    (SELECT count(*) FROM base_fechados)::bigint AS pedidos_fechados_periodo,
    (SELECT coalesce(sum(valor_total), 0) FROM base_fechados)::numeric AS total_faturamento,
    -- ---- segmentação: CRIAÇÃO, e de propósito ----
    -- Conta TODOS os status (novo, negociação, perdido, ganho) por faixa de valor:
    -- é "negócios criados no período por tamanho", não "vendas por tamanho".
    (SELECT count(*) FILTER (WHERE coalesce(valor_total, 0) > 100000) FROM base_criados)::bigint AS segmentacao_alto,
    (SELECT count(*) FILTER (WHERE coalesce(valor_total, 0) >= 30000 AND coalesce(valor_total, 0) <= 100000) FROM base_criados)::bigint AS segmentacao_medio,
    (SELECT count(*) FILTER (WHERE coalesce(valor_total, 0) < 30000) FROM base_criados)::bigint AS segmentacao_baixo,
    -- ---- rendimentos: FECHAMENTO ----
    (
      SELECT coalesce(jsonb_agg(jsonb_build_object('fabrica', fabricante_nome, 'valor', total) ORDER BY total DESC), '[]'::jsonb)
      FROM (
        SELECT fabricante_nome, sum(valor_total) AS total
        FROM base_fechados
        WHERE fabricante_nome IS NOT NULL
        GROUP BY fabricante_nome
      ) rf
    ) AS rendimento_fabricante,
    (
      SELECT coalesce(jsonb_agg(jsonb_build_object('vendedor', vendedor_nome, 'valor', total) ORDER BY total DESC), '[]'::jsonb)
      FROM (
        SELECT vendedor_nome, sum(valor_total) AS total
        FROM base_fechados
        WHERE vendedor_nome IS NOT NULL
        GROUP BY vendedor_nome
      ) rv
    ) AS rendimento_vendedor;
$$;


-- ----------------------------------------------------------------------------
-- (2) dashboard_indicadores_vendedor — a lista de vendedores continua completa
-- ----------------------------------------------------------------------------
-- ATENÇÃO: esta função NÃO alimenta o "Rendimento por Responsável" (esse vem de
-- dashboard_stats.rendimento_vendedor, corrigido acima). Ela alimenta:
--   (a) o gráfico "Conversão por Vendedor" — que o Lucas decidiu MANTER por data de
--       criação (conversão de safra), e
--   (b) a lista de responsáveis usada no seletor do topo e no Plano de Vendas.
-- Por isso `total_pedidos` e `qtd_fechado` continuam recortados por data_pedido:
-- trocá-los quebraria justamente a métrica que a decisão congelou.
--
-- O que muda: acrescenta `qtd_fechado_periodo`, contado por prazo_resposta, para quem
-- precisar responder "quantos este vendedor fechou NO período". A lista de vendedores
-- não encolhe por causa disso — o LEFT JOIN parte de `usuarios`, então todo mundo que
-- não está apagado aparece, com zero quando não teve negócio. (A tela hoje esconde
-- quem tem qtd_fechado = 0 do seletor "Responsável"; isso é decisão do frontend, em
-- Dashboard.tsx, não desta função.)
--
-- Não devolvo VALOR fechado por vendedor aqui de propósito: esse número já existe em
-- dashboard_stats.rendimento_vendedor, e ter duas fontes para o mesmo dinheiro é
-- exatamente como a bagunça de datas começou.
DROP FUNCTION IF EXISTS public.dashboard_indicadores_vendedor(uuid[], date, date);

CREATE OR REPLACE FUNCTION public.dashboard_indicadores_vendedor(
  p_fabricante_ids uuid[] DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
)
RETURNS TABLE (
  usuario_id uuid,
  usuario_nome text,
  total_pedidos bigint,
  qtd_fechado bigint,
  qtd_fechado_periodo bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    u.id AS usuario_id,
    u.nome AS usuario_nome,
    count(p.id)::bigint AS total_pedidos,
    count(p.id) FILTER (WHERE p.status = 'fechamento')::bigint AS qtd_fechado,
    (
      -- Subconsulta correlacionada em vez de um segundo LEFT JOIN: juntar `pedidos`
      -- duas vezes na mesma linha multiplicaria os registros e estragaria as duas
      -- contagens de cima. Cada bloco cita UMA coluna de data só — mantém o índice.
      SELECT count(*)::bigint
      FROM public.pedidos pf
      WHERE pf.usuario_id = u.id
        AND pf.status = 'fechamento'
        AND (p_fabricante_ids IS NULL OR pf.fabricante_id = ANY(p_fabricante_ids))
        AND (p_date_from IS NULL OR pf.prazo_resposta >= p_date_from)
        AND (p_date_to IS NULL OR pf.prazo_resposta <= p_date_to)
    ) AS qtd_fechado_periodo
  FROM public.usuarios u
  LEFT JOIN public.pedidos p
    ON p.usuario_id = u.id
    AND (p_fabricante_ids IS NULL OR p.fabricante_id = ANY(p_fabricante_ids))
    AND (p_date_from IS NULL OR p.data_pedido >= p_date_from)
    AND (p_date_to IS NULL OR p.data_pedido <= p_date_to)
  WHERE u.deleted_at IS NULL
  GROUP BY u.id, u.nome
  ORDER BY u.nome;
$$;


-- ----------------------------------------------------------------------------
-- (3) plano_vendas_progresso — por fechamento E somando o período inteiro
-- ----------------------------------------------------------------------------
-- Duas correções na mesma função:
--   (a) a CTE `vendido` passa de p.data_pedido para p.prazo_resposta. Meta é
--       compromisso do mês em que a venda FECHA, não do mês em que o negócio nasceu.
--   (b) a função só sabia olhar UM mês (p_ano/p_mes). A tela manda o mês da data
--       inicial do período, então escolher "01/jan a 31/dez" mostrava só JANEIRO e
--       não avisava. Agora aceita um intervalo e soma as metas de TODOS os meses
--       que ele toca, junto com o vendido do intervalo inteiro.
--
-- Mês tocado = mês do início até mês do fim, inclusive. Um período que pega só
-- metade de agosto soma a meta CHEIA de agosto — meta é valor mensal, não tem como
-- ratear meio mês sem inventar número.
--
-- A assinatura antiga (p_ano, p_mes) continua existindo como atalho que chama a nova.
-- Assim o banco pode subir antes da tela sem quebrar nada; quando a tela passar a
-- mandar o intervalo, o atalho vira só compatibilidade.
--
-- As metas são somadas MÊS A MÊS antes de virar total: a regra de "usa a meta de
-- equipe, e se não houver usa a soma das individuais" (o COALESCE/NULLIF abaixo)
-- vale por mês. Somar tudo primeiro e aplicar a regra depois daria número errado
-- num período em que um mês tem meta de equipe e o outro só tem individuais.
CREATE OR REPLACE FUNCTION public.plano_vendas_progresso(
  p_date_from date,
  p_date_to date,
  p_usuario_ids uuid[] DEFAULT NULL,
  p_fabricante_ids uuid[] DEFAULT NULL,
  p_somente_com_meta boolean DEFAULT false
)
RETURNS TABLE (
  fabricante_id uuid,
  fabricante_nome text,
  meta_valor numeric,
  vendido_valor numeric,
  meta_equipe_valor numeric,
  meta_individual_valor numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH periodo AS (
    -- Um par (ano, mes) por mês tocado pelo intervalo. O COALESCE é só rede de
    -- segurança para chamada com uma das pontas nula.
    SELECT
      EXTRACT(YEAR FROM d)::int AS ano,
      EXTRACT(MONTH FROM d)::int AS mes
    FROM generate_series(
      date_trunc('month', COALESCE(p_date_from, p_date_to)::timestamp),
      date_trunc('month', COALESCE(p_date_to, p_date_from)::timestamp),
      INTERVAL '1 month'
    ) AS gs(d)
  ),
  metas_mes AS (
    SELECT
      m.fabricante_id,
      m.ano,
      m.mes,
      SUM(m.meta_valor) FILTER (WHERE m.usuario_id IS NULL) AS meta_equipe_valor,
      CASE WHEN p_usuario_ids IS NOT NULL AND array_length(p_usuario_ids, 1) = 1
        THEN SUM(m.meta_valor) FILTER (WHERE m.usuario_id = ANY(p_usuario_ids))
        ELSE NULL
      END AS meta_individual_valor,
      CASE
        WHEN p_usuario_ids IS NULL OR array_length(p_usuario_ids, 1) = 1 THEN COALESCE(
          NULLIF(SUM(m.meta_valor) FILTER (WHERE m.usuario_id IS NULL), 0),
          SUM(m.meta_valor) FILTER (WHERE m.usuario_id IS NOT NULL)
        )
        ELSE SUM(m.meta_valor)
      END AS meta_valor
    FROM public.metas_vendas m
    JOIN periodo pr ON pr.ano = m.ano AND pr.mes = m.mes
    WHERE (
        p_usuario_ids IS NULL
        OR m.usuario_id = ANY(p_usuario_ids)
        OR (array_length(p_usuario_ids, 1) = 1 AND m.usuario_id IS NULL)
      )
      AND (p_fabricante_ids IS NULL OR m.fabricante_id = ANY(p_fabricante_ids))
    GROUP BY m.fabricante_id, m.ano, m.mes
  ),
  metas AS (
    SELECT
      mm.fabricante_id,
      SUM(mm.meta_equipe_valor) AS meta_equipe_valor,
      SUM(mm.meta_individual_valor) AS meta_individual_valor,
      SUM(mm.meta_valor) AS meta_valor
    FROM metas_mes mm
    GROUP BY mm.fabricante_id
  ),
  vendido AS (
    SELECT p.fabricante_id, SUM(p.valor_total) AS vendido_valor
    FROM public.pedidos p
    WHERE p.status = 'fechamento'
      AND p.prazo_resposta >= COALESCE(p_date_from, p_date_to)
      AND p.prazo_resposta <= COALESCE(p_date_to, p_date_from)
      AND (p_usuario_ids IS NULL OR p.usuario_id = ANY(p_usuario_ids))
      AND (p_fabricante_ids IS NULL OR p.fabricante_id = ANY(p_fabricante_ids))
    GROUP BY p.fabricante_id
  )
  SELECT
    f.id AS fabricante_id,
    f.nome AS fabricante_nome,
    COALESCE(metas.meta_valor, 0) AS meta_valor,
    COALESCE(vendido.vendido_valor, 0) AS vendido_valor,
    COALESCE(metas.meta_equipe_valor, 0) AS meta_equipe_valor,
    COALESCE(metas.meta_individual_valor, 0) AS meta_individual_valor
  FROM metas
  -- FULL OUTER: fábrica com venda e sem meta precisa aparecer (senão some dinheiro
  -- da tela), e fábrica com meta e sem venda também (senão some a cobrança).
  FULL OUTER JOIN vendido ON vendido.fabricante_id = metas.fabricante_id
  JOIN public.fabricantes f ON f.id = COALESCE(metas.fabricante_id, vendido.fabricante_id)
  WHERE NOT p_somente_com_meta OR COALESCE(metas.meta_valor, 0) > 0
  ORDER BY COALESCE(metas.meta_valor, 0) DESC, COALESCE(vendido.vendido_valor, 0) DESC;
$$;

-- Atalho de compatibilidade: a tela ainda manda ano/mês. Mesmo recorte de antes
-- (dia 1 até o último dia do mês), agora resolvido pela função de intervalo.
CREATE OR REPLACE FUNCTION public.plano_vendas_progresso(
  p_ano integer,
  p_mes integer,
  p_usuario_ids uuid[] DEFAULT NULL,
  p_fabricante_ids uuid[] DEFAULT NULL,
  p_somente_com_meta boolean DEFAULT false
)
RETURNS TABLE (
  fabricante_id uuid,
  fabricante_nome text,
  meta_valor numeric,
  vendido_valor numeric,
  meta_equipe_valor numeric,
  meta_individual_valor numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT *
  FROM public.plano_vendas_progresso(
    make_date(p_ano, p_mes, 1),
    (make_date(p_ano, p_mes, 1) + INTERVAL '1 month' - INTERVAL '1 day')::date,
    p_usuario_ids,
    p_fabricante_ids,
    p_somente_com_meta
  );
$$;


-- ----------------------------------------------------------------------------
-- (4) plano_vendas_progresso_por_vendedor — tem que mudar JUNTO com a de cima
-- ----------------------------------------------------------------------------
-- As duas mostram o mesmo plano por ângulos diferentes: a agregada usa FULL OUTER
-- JOIN (mostra fábrica com venda e sem meta) e esta parte das metas individuais.
-- Se só uma trocar de coluna de data, o total da seção e a quebra "Por vendedor"
-- passam a discordar na tela, e ninguém consegue dizer qual das duas está certa.
CREATE OR REPLACE FUNCTION public.plano_vendas_progresso_por_vendedor(
  p_date_from date,
  p_date_to date,
  p_usuario_ids uuid[] DEFAULT NULL,
  p_fabricante_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  usuario_id uuid,
  usuario_nome text,
  fabricante_id uuid,
  fabricante_nome text,
  meta_valor numeric,
  vendido_valor numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH periodo AS (
    SELECT
      EXTRACT(YEAR FROM d)::int AS ano,
      EXTRACT(MONTH FROM d)::int AS mes
    FROM generate_series(
      date_trunc('month', COALESCE(p_date_from, p_date_to)::timestamp),
      date_trunc('month', COALESCE(p_date_to, p_date_from)::timestamp),
      INTERVAL '1 month'
    ) AS gs(d)
  ),
  metas AS (
    -- Aqui a soma entre meses é direta: só existe meta individual, sem a regra de
    -- "cai para a meta de equipe" que a função agregada precisa aplicar por mês.
    SELECT m.usuario_id, m.fabricante_id, SUM(m.meta_valor) AS meta_valor
    FROM public.metas_vendas m
    JOIN periodo pr ON pr.ano = m.ano AND pr.mes = m.mes
    WHERE m.usuario_id IS NOT NULL
      AND (p_usuario_ids IS NULL OR m.usuario_id = ANY(p_usuario_ids))
      AND (p_fabricante_ids IS NULL OR m.fabricante_id = ANY(p_fabricante_ids))
    GROUP BY m.usuario_id, m.fabricante_id
    HAVING SUM(m.meta_valor) > 0
  ),
  vendido AS (
    SELECT p.usuario_id, p.fabricante_id, SUM(p.valor_total) AS vendido_valor
    FROM public.pedidos p
    WHERE p.status = 'fechamento'
      AND p.prazo_resposta >= COALESCE(p_date_from, p_date_to)
      AND p.prazo_resposta <= COALESCE(p_date_to, p_date_from)
      AND (p_usuario_ids IS NULL OR p.usuario_id = ANY(p_usuario_ids))
      AND (p_fabricante_ids IS NULL OR p.fabricante_id = ANY(p_fabricante_ids))
    GROUP BY p.usuario_id, p.fabricante_id
  )
  SELECT
    u.id AS usuario_id,
    u.nome AS usuario_nome,
    f.id AS fabricante_id,
    f.nome AS fabricante_nome,
    metas.meta_valor AS meta_valor,
    COALESCE(vendido.vendido_valor, 0) AS vendido_valor
  FROM metas
  JOIN public.usuarios u ON u.id = metas.usuario_id
  JOIN public.fabricantes f ON f.id = metas.fabricante_id
  LEFT JOIN vendido ON vendido.usuario_id = metas.usuario_id AND vendido.fabricante_id = metas.fabricante_id
  LEFT JOIN public.plano_vendas_fabricante_ordem fo
    ON fo.fabricante_id = f.id AND fo.empresa_id = get_my_empresa_id()
  ORDER BY u.nome, COALESCE(fo.ordem, 2147483647), metas.meta_valor DESC;
$$;

-- Atalho de compatibilidade, mesmo motivo da função agregada.
CREATE OR REPLACE FUNCTION public.plano_vendas_progresso_por_vendedor(
  p_ano integer,
  p_mes integer,
  p_usuario_ids uuid[] DEFAULT NULL,
  p_fabricante_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  usuario_id uuid,
  usuario_nome text,
  fabricante_id uuid,
  fabricante_nome text,
  meta_valor numeric,
  vendido_valor numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT *
  FROM public.plano_vendas_progresso_por_vendedor(
    make_date(p_ano, p_mes, 1),
    (make_date(p_ano, p_mes, 1) + INTERVAL '1 month' - INTERVAL '1 day')::date,
    p_usuario_ids,
    p_fabricante_ids
  );
$$;


-- ----------------------------------------------------------------------------
-- (5) vw_faturamento_mensal — agrupa por mês de FECHAMENTO
-- ----------------------------------------------------------------------------
-- Alimenta o gráfico "Faturamento Mensal" e o selo "+X% últ. mês" do cartão de
-- Faturamento Total. Agrupava por mês de criação; passa a agrupar pelo mês em que
-- a venda fechou, para bater com o cartão logo acima dela.
--
-- Mantido: WHERE status='fechamento' e security_invoker=on (é assim que a visão
-- respeita a empresa — `pedidos` não tem empresa_id, o inquilino sai do JOIN com
-- `usuarios` e da RLS de quem consulta).
-- Acrescentado: prazo_resposta IS NOT NULL, senão uma venda sem data de fechamento
-- viraria um grupo de mês vazio no gráfico.
--
-- NÃO conserta o selo "+0% últ. mês": esse defeito é do recorte feito no navegador
-- (Dashboard.tsx), que com o período padrão deixa um único mês na lista e não tem
-- mês anterior para comparar. É outro conserto, em outro arquivo.
CREATE OR REPLACE VIEW public.vw_faturamento_mensal
WITH (security_invoker = on) AS
SELECT
  u.empresa_id,
  to_char(date_trunc('month', p.prazo_resposta::timestamp), 'YYYY-MM') AS mes_ano,
  to_char(date_trunc('month', p.prazo_resposta::timestamp), 'Mon/YY') AS mes,
  COALESCE(sum(p.valor_total), 0::numeric) AS faturamento_total,
  count(p.id) AS qtd_pedidos_fechados,
  CASE
    WHEN count(p.id) > 0 THEN COALESCE(sum(p.valor_total), 0::numeric) / count(p.id)::numeric
    ELSE 0::numeric
  END AS ticket_medio
FROM public.pedidos p
JOIN public.usuarios u ON p.usuario_id = u.id
WHERE p.status = 'fechamento'
  AND p.prazo_resposta IS NOT NULL
GROUP BY u.empresa_id, date_trunc('month', p.prazo_resposta::timestamp)
ORDER BY date_trunc('month', p.prazo_resposta::timestamp);


-- ----------------------------------------------------------------------------
-- (6) Índices
-- ----------------------------------------------------------------------------
-- idx_pedidos_prazo_resposta já existe (btree em prazo_resposta) — o IF NOT EXISTS
-- abaixo é só para o caso de alguém subir este projeto num banco novo.
CREATE INDEX IF NOT EXISTS idx_pedidos_prazo_resposta
  ON public.pedidos USING btree (prazo_resposta);

-- Novo: todos os recortes de dinheiro criados nesta migration são
-- "status='fechamento' E prazo_resposta entre X e Y". Com o composto o Postgres
-- resolve os dois de uma vez, em vez de cruzar dois índices separados.
-- Sem CONCURRENTLY de propósito: migration roda dentro de transação, e nesta base
-- (11,9 mil linhas) o índice sai em milissegundos.
CREATE INDEX IF NOT EXISTS idx_pedidos_status_prazo_resposta
  ON public.pedidos USING btree (status, prazo_resposta);
