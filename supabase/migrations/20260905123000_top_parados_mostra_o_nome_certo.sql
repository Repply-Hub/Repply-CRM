-- ============================================================================
-- "OS 10 MAIORES PARADOS" MOSTRA O NOME CERTO, NÃO "NEGÓCIO SEM NOME" NAS DEZ LINHAS
-- ============================================================================
--
-- Medido em produção contra a MD Representações logo depois de aplicar a migration
-- 20260905120000 (commit 2b205b37), que criou o conjunto `top_parados`:
--
--   146 de 146 negócios abertos da MD têm `pedidos.nome` VAZIO
--   131 desses 146 têm o nome em `campos_extras ->> 'Negócio'`
--    15 só se resolvem pelo nome do cliente (`clientes.empresa`)
--
-- Com a cadeia antiga (`coalesce(nullif(trim(nome), ''), 'Negócio sem nome')`), a tabela
-- "Os 10 maiores parados" saía com "Negócio sem nome" nas dez linhas — o bloco que existe
-- justamente para a pessoa saber em que clicar ficava mudo.
--
-- A cadeia certa já existe no projeto, dentro de `pauta_do_dia_de`
-- (migration 20260824290000): nome próprio, senão `campos_extras->>'Negócio'`, senão
-- "empresa do cliente | fabricante", senão "Negócio sem nome". Esta migration traz essa
-- mesma cadeia para `top_parados`, sem tocar em mais nada da função.
--
-- 🔴 A cadeia PRECISA de `clientes`, e juntar `clientes` na CTE larga `abertos` seria a
-- armadilha do CLAUDE.md §7.16: a política de segurança de `clientes` chama
-- `get_my_usuario_id()` e `usuario_in_my_empresa()` UMA VEZ POR LINHA, e `abertos` varre a
-- carteira inteira (12 mil+ negócios nesta base). Foi exatamente esse padrão — junção que só
-- uma parte do resultado usa, colocada no `FROM` de uma CTE larga — que transformou 11 ms em
-- 11 segundos em `pedidos_stats` (mesmo capítulo do CLAUDE.md, medido em 01/09/2026). Repetir
-- o erro aqui pagaria a regra de segurança de `clientes` em toda chamada de
-- `dashboard_negocios_risco`, mesmo para os 9 conjuntos do retorno que não usam nome nenhum.
--
-- O conserto: `clientes` entra só na subconsulta que já tem `LIMIT 10`, e o `LEFT JOIN`
-- acontece DEPOIS do `LIMIT` — a política de segurança roda no máximo 10 vezes por chamada,
-- não 12 mil. Para isso, `abertos` ganha duas colunas a mais de `pedidos` (`cliente_id` e
-- `campos_extras`): são colunas da própria linha que a CTE já lê, não uma junção nova, então
-- não custam nada. `fabricante_nome` não precisa de junção nenhuma: já está disponível em
-- `marcado`, herdado de `abertos`.
--
-- Assinatura da função NÃO muda (mesmos 5 parâmetros) — por isso `CREATE OR REPLACE`, sem
-- `DROP`: não há sobrecarga a limpar e nenhuma permissão (GRANT) se perde no caminho.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.dashboard_negocios_risco(
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
      p.cliente_id,
      p.campos_extras,
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
    -- 🔴 `clientes` só entra AQUI, depois do `LIMIT 10` da subconsulta `tp` — nunca na CTE
    -- `abertos`. Ver o cabeçalho deste arquivo: juntar `clientes` na CTE larga pagaria a
    -- política de segurança dela (uma checagem de empresa por linha) sobre a carteira
    -- inteira em toda chamada, em vez de sobre no máximo 10 linhas.
    (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', tp.id,
               'nome', coalesce(
                         nullif(trim(tp.nome), ''),
                         nullif(trim(tp.campos_extras ->> 'Negócio'), ''),
                         nullif(trim(cl.empresa), '') || coalesce(' | ' || tp.fabricante_nome, ''),
                         'Negócio sem nome'
                       ),
               'fabrica', tp.fabricante_nome, 'etapa', tp.etapa_label,
               'responsavel', tp.vendedor_nome, 'valor', tp.valor_total,
               'dias_parado', (SELECT d FROM hoje) - tp.parado_desde
             ) ORDER BY tp.valor_total DESC), '[]'::jsonb)
      FROM (
        SELECT * FROM marcado WHERE parado OR sem_proxima_acao
        ORDER BY valor_total DESC NULLS LAST LIMIT 10
      ) tp
      LEFT JOIN public.clientes cl ON cl.id = tp.cliente_id
    );
$function$;

COMMIT;

-- Confira depois de aplicar. A primeira devolve UMA linha (nunca duas — duas seria sobrecarga
-- não removida); a segunda mostra o nome de verdade nas dez linhas do top (nenhuma delas deve
-- ser "Negócio sem nome" para a MD, já que os 146 negócios abertos têm nome em `campos_extras`
-- ou em `clientes.empresa`):
--
--   select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.proname='dashboard_negocios_risco';
--
--   select jsonb_pretty(top_parados) from public.dashboard_negocios_risco();
