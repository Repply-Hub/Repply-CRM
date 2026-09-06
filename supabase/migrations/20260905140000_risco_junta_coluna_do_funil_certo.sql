-- ============================================================================
-- O PAINEL DE RISCO JUNTA A COLUNA DO FUNIL CERTO — SEM ISSO, DOIS FUNIS DOBRAM TUDO
-- ============================================================================
--
-- Achado da revisão final da Etapa 2 (05/09/2026), nas migrations 20260905120000 e
-- 20260905123000: a CTE `abertos` de `dashboard_negocios_risco` junta `kanban_colunas`
-- só por `slug` e `empresa_id`:
--
--   LEFT JOIN public.kanban_colunas k ON k.slug = p.status AND k.empresa_id = u.empresa_id
--
-- A chave única de `kanban_colunas` é `(empresa_id, funil_id, slug)` — três colunas, não
-- duas (migration 20260722140000, constraint `kanban_colunas_empresa_funil_slug_key`).
-- Numa empresa com UM funil só, cada slug existe numa linha só de `kanban_colunas` e a
-- junção por duas colunas casa certo por acidente. Numa empresa com DOIS funis, o mesmo
-- slug (os seis funis nascem com os mesmos seis slugs — `KanbanColunasDialog.tsx`, botão
-- "Novo funil") existe em DUAS linhas de `kanban_colunas`, uma por funil. O `LEFT JOIN`
-- então devolve DUAS linhas por negócio na CTE `abertos`, e a duplicação escorre para
-- TODA a função: quantidade e valor de parados, de sem-próxima-ação, o valor de risco
-- total, o resumo por fabricante e a lista dos 10 maiores (com o mesmo negócio repetido
-- duas vezes, cada linha com metade do lugar que devia ter).
--
-- POR QUE NINGUÉM SENTE HOJE: medido em produção em 05/09/2026, as 10 empresas cadastradas
-- têm exatamente 1 funil cada. Com um funil só, `k.slug = p.status AND k.empresa_id =
-- u.empresa_id` e `k.slug = p.status AND k.empresa_id = u.empresa_id AND k.funil_id =
-- p.funil_id` devolvem o mesmo resultado — a coluna que falta não muda nada porque não há
-- ambiguidade para ela desfazer. Isto é defeito LATENTE, não confirmado por nenhuma
-- medição de número errado.
--
-- O QUE DISPARA: o botão "Novo funil" existe em `KanbanColunasDialog.tsx` para qualquer
-- gestor, sem aviso nenhum sobre este painel. A função que cria funil semeia os MESMOS
-- seis slugs do funil padrão. Basta uma empresa clicar nele uma vez: no minuto seguinte,
-- "Negócios Parados", "Valor em Risco" e todo o resto deste painel passam a mostrar o
-- dobro do dinheiro e do volume reais, sem nenhum erro na tela — só o número errado.
--
-- O CONSERTO: `pedidos.funil_id` é `NOT NULL` (migration 20260722140000) e é exatamente a
-- coluna que falta na junção. Bastam três palavras: `AND k.funil_id = p.funil_id`.
--
-- Parte do corpo VIGENTE em produção (migration 20260905123000_top_parados_mostra_o_nome_
-- certo.sql — a nome-certo do negócio no top 10). Muda SÓ a linha da junção de
-- `kanban_colunas`; nenhuma outra linha do corpo foi tocada.
--
-- Assinatura da função NÃO muda (mesmos 5 parâmetros) — por isso `CREATE OR REPLACE`, sem
-- `DROP`: não há sobrecarga a limpar e nenhuma permissão (GRANT) se perde no caminho.
-- 🔴 Migration NOVA, não edição — 20260905120000 e 20260905123000 já estão aplicadas em
-- produção e nunca se editam (CLAUDE.md §6.3).
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
    -- 🔴 As três colunas da chave única de kanban_colunas, não duas: sem `funil_id`, uma
    -- empresa com dois funis casa o mesmo slug em duas linhas e dobra o negócio na CTE
    -- inteira. Ver o cabeçalho desta migration.
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
    -- `abertos`. Ver o cabeçalho da migration 20260905123000: juntar `clientes` na CTE
    -- larga pagaria a política de segurança dela (uma checagem de empresa por linha) sobre
    -- a carteira inteira em toda chamada, em vez de sobre no máximo 10 linhas.
    --
    -- E por que `responsavel` sai aqui SEM o portão `is_gestor()` que a linha de
    -- `risco_por_vendedor` acima aplica: a regra de segurança de `pedidos` já é da empresa
    -- inteira (não por dono do negócio), e a tela de Negócios já mostra o responsável de
    -- cada negócio para qualquer usuário da empresa — não há informação nova vazando aqui.
    -- O portão do outro campo existe porque ALI é um RANKING nominal por vendedor (quem
    -- está pior), que é outra coisa: lista de 10 negócios com dono não é ranking de gente.
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

-- Confira depois de aplicar. A primeira devolve UMA linha (nunca duas — duas seria
-- sobrecarga não removida); a segunda confirma que o total não muda para quem já tinha
-- só 1 funil (nenhuma empresa hoje tem mais de um, então este número é o mesmo de antes
-- desta migration):
--
--   select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.proname='dashboard_negocios_risco';
--
--   select qtd_parados, qtd_sem_proxima_acao, jsonb_array_length(top_parados)
--     from public.dashboard_negocios_risco();
--
-- Para provar o defeito que este arquivo fecha, ANTES de aplicar, numa empresa de teste
-- com dois funis (ex.: crie um segundo funil na empresa "Repply", de demonstração):
-- `qtd_parados` deve DOBRAR contra o valor com um funil só, e voltar ao valor certo depois
-- de aplicar esta migration.
