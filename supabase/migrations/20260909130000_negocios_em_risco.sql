-- ============================================================================
-- A TABELA DO TIME GANHA FUNÇÃO PRÓPRIA, PAGINADA: negocios_em_risco
-- ============================================================================
--
-- A migration anterior (20260909120000) fez a fila da tela "Hoje" voltar a ser sempre pessoal.
-- Com isso a chave `pauta_de_todos` ficou sem emprego na fila — e o emprego novo dela é este:
-- liberar a TABELA DO TIME, a lista dos negócios da equipe que pedem atenção. Esta migration
-- constrói a peça de banco dessa tabela; a tela vem na tarefa seguinte.
--
-- Em uma frase: os "10 maiores parados" saem de dentro do painel de números
-- (`dashboard_negocios_risco`) e viram função própria, paginada, que devolve o total do recorte
-- na própria linha.
--
-- Por que paginada, e por que o total vem junto de cada linha:
--   · A lista de hoje é fixa em 10. Quem enxerga a equipe inteira tem 157 negócios pedindo
--     atenção (medido na MD em 09/09/2026) e vê 10 deles, sem jeito nenhum de ver o resto.
--   · `total_geral` repete em toda linha o total do recorte inteiro, não o da página. É assim
--     que o "Ver mais" sabe quando parar, sem uma segunda chamada ao banco só para contar.
--     Quem faz isso é o `count(*) OVER ()`, que roda ANTES do `LIMIT` — medido: com
--     `p_limite := 10` as 10 linhas voltam com `total_geral = 157`, e um `count(*)` da mesma
--     condição sem paginação também dá 157.
--   · 🔴 O teto de 100 em `p_limite` não é decoração. Sem ele, um "Ver mais" pedindo um número
--     grande varreria a base inteira debaixo da regra de segurança e estouraria o limite de 8
--     segundos do papel `authenticated` (CLAUDE.md §7.15) — e a tela giraria para sempre em vez
--     de dar erro. `least(p_limite, 100)` corta por cima; `greatest(…, 1)` corta por baixo, para
--     que `p_limite := 0` (ou negativo) não devolva a lista vazia sem explicação.
--
-- O PORTÃO É O MESMO DA LISTA DE HOJE, e continua sendo o da chave, não o do papel:
-- quem tem `pauta_de_todos` vê a empresa; quem não tem vê os seus. Não é uma decisão nova —
-- é o mesmo `CASE` que o `top_parados` já usava desde 07/09/2026, copiado sem mudança.
--
-- ----------------------------------------------------------------------------
-- O QUE FOI CONFERIDO NO BANCO ANTES DE ESCREVER (09/09/2026, só SELECT)
-- ----------------------------------------------------------------------------
--   · O texto de `dashboard_negocios_risco` foi COLHIDO com `pg_get_functiondef` e editado a
--     partir do que está vivo, não reescrito de memória.
--       corpo vigente  → md5 590e971f0f7a00a1daabcfcee16a95a4 · 4.122 caracteres
--       corpo reemitido→ md5 3e40ace58fa8b109c44710db2b8415da · 3.071 caracteres
--     O segundo é o primeiro cortado no ponto exato onde começa a última coluna do SELECT.
--     Contagem de ocorrências, para provar que o corte não pegou demais: `tp.` 11 → 0 e
--     `public.clientes` 1 → 0 (as duas só existiam dentro do bloco removido).
--
--   · As CTEs `hoje`, `abertos` e `marcado` de `negocios_em_risco` são o MESMO texto, caractere
--     por caractere, das de `dashboard_negocios_risco`: md5 663def4a3bf932088ca8540c4e4924e1
--     (1.859 caracteres). Isso inclui a junção de `kanban_colunas` pelas TRÊS colunas
--     (`slug`, `empresa_id`, `funil_id`) — sem `funil_id`, empresa com dois funis dobra cada
--     negócio (conserto de 20260905140000) — e o `LEFT JOIN LATERAL` da última atividade.
--
--   · `proacl` de `dashboard_negocios_risco` medida ANTES desta migration:
--         =X/postgres | postgres=X/postgres | anon=X/postgres | authenticated=X/postgres | service_role=X/postgres
--     Dono: `postgres`. Confira antes e depois — tem de dar o mesmo texto nas duas medições:
--
--       select p.oid::regprocedure, coalesce(array_to_string(p.proacl,' | '),'(padrao)')
--         from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--        where n.nspname='public' and p.proname in ('dashboard_negocios_risco','negocios_em_risco');
--
-- ----------------------------------------------------------------------------
-- 🔴 AQUI TEM UM `DROP`, E ELE APAGA AS CONCESSÕES
-- ----------------------------------------------------------------------------
-- `dashboard_negocios_risco` perde uma coluna do `RETURNS TABLE` (`top_parados`), e mudar a
-- lista de colunas do retorno NÃO cabe em `CREATE OR REPLACE`: o Postgres recusa com
-- "cannot change return type of existing function ... Use DROP FUNCTION ... first". Então o
-- caminho é `DROP` + `CREATE`, e o `DROP` leva junto todo `GRANT` que existia.
--
-- Por isso o `GRANT` abaixo repõe os três papéis que estavam lá. Conferido em `pg_default_acl`
-- antes de escrever: neste banco, função nova criada por `postgres` no esquema `public` já nasce
-- alcançável por PUBLIC, `postgres`, `anon`, `authenticated` e `service_role` — que é exatamente
-- a `proacl` medida antes. Ou seja, o `GRANT` abaixo é redundante de propósito: ele declara a
-- intenção por escrito, para o dia em que a concessão padrão do esquema mudar. O resultado
-- esperado é a linha idêntica à de antes, PUBLIC inclusive.
--
-- `negocios_em_risco` é função NOVA. Ela leva `REVOKE` de PUBLIC e de `anon` — lê carteira de
-- cliente e não tem por que ser alcançável sem login —, e o `GRANT` deixa `authenticated`. O
-- `service_role` fica de pé pela concessão padrão do esquema, sem `GRANT` explícito. A `proacl`
-- esperada depois de aplicar é a mesma forma de `eu_vejo_pauta_de_todos()`:
--     postgres=X/postgres | authenticated=X/postgres | service_role=X/postgres
--
-- Isso não é dedução: `eu_vejo_pauta_de_todos()` nasceu em 20260907150000 com este mesmo par de
-- linhas (`REVOKE ALL … FROM PUBLIC, anon` seguido de `GRANT EXECUTE … TO authenticated`), e a
-- `proacl` dela medida hoje é exatamente a linha acima. A linha de `pg_default_acl` que produz
-- isso é `defaclobjtype = 'f'`, esquema `public`, dono `postgres`:
--     postgres=X/postgres | anon=X/postgres | authenticated=X/postgres | service_role=X/postgres
-- somada à concessão embutida do Postgres, que acrescenta PUBLIC. É de lá que vêm os cinco
-- papéis da `proacl` medida em `dashboard_negocios_risco`, e é por isso que o `DROP` + `CREATE`
-- dela devolve a MESMA lista mesmo sem o `GRANT` — que fica escrito assim mesmo, de propósito.
--
-- ----------------------------------------------------------------------------
-- 🔴 NÃO APLIQUE ESTA MIGRATION SEM PUBLICAR A TELA DA TAREFA 3 JUNTO
-- ----------------------------------------------------------------------------
-- Enquanto a tela não trocar de fonte, `RadarDeRisco.tsx` continua lendo `top_parados` do
-- resultado de `dashboard_negocios_risco`. Sem a coluna, `bruto?.top_parados ?? []` devolve
-- lista vazia e a tabela de risco mostra o estado "nada aqui" — sem erro na tela, sem aviso
-- nenhum. Ou seja: aplicar isto sozinho não quebra a página, mas faz ela MENTIR, dizendo que
-- não há negócio parado num dia em que há 157. Aplique junto com o deploy da tela.
--
-- ----------------------------------------------------------------------------
-- DUAS COISAS QUE SAÍRAM DIFERENTES DO PLANO, E O QUE FOI MEDIDO PARA DECIDIR
-- ----------------------------------------------------------------------------
-- 1. A ORDENAÇÃO GANHOU DESEMPATE POR `id`. O plano pedia `ORDER BY valor_total DESC NULLS
--    LAST` e nada mais. Com paginação por deslocamento, empate de valor é bug de verdade: a
--    ordem entre linhas empatadas não é garantida, e nada obriga duas chamadas seguidas a
--    resolvê-lo do mesmo jeito. Medido hoje, com os dados de produção da MD: existem dois
--    valores repetidos no recorte, nas posições 70–71 e 138–139 — e 70/71 cai EXATAMENTE na
--    virada de página de um "Ver mais" de 10 em 10.
--
--      páginas 7 e 8 (deslocamento 60 e 70), sem desempate → 19 negócios distintos em 20 linhas
--                                                            (um aparece duas vezes, outro some)
--      as mesmas duas páginas, com `, id` no fim            → 20 distintos, nenhum repetido
--
--    O desempate por `id` não muda a primeira página: entre as 15 primeiras posições não há
--    empate nenhum.
--
--    Conferido de novo em 10/09/2026, com o recorte já em 159: os empates mudaram de lugar
--    (posições 69–70 e 140–141) e 140/141 é que caiu na virada agora. Ou seja, não é um azar de
--    um dia — enquanto houver valor repetido, sempre existe um deslocamento que o parte ao meio,
--    e ele anda sozinho conforme a carteira muda. É por isso que o desempate fica no texto e não
--    vira "não precisa hoje".
--
-- 2. A JUNÇÃO COM `clientes` FICOU DEPOIS DO RECORTE, dentro de uma subconsulta com o `LIMIT`.
--    Escrita no mesmo nível de `meus`, ela seria aplicada a TODAS as linhas do recorte antes do
--    `LIMIT`, porque `LIMIT` é o último passo da consulta. E a política de `clientes` chama
--    `get_my_usuario_id()` e `usuario_in_my_empresa()` UMA VEZ POR LINHA — é o mesmo custo que
--    matou `pedidos_stats` (CLAUDE.md §7.16) e que a Etapa 2 já tinha consertado aqui
--    (20260905123000). Medido como usuário logado, mesmo recorte, mesmas opções de EXPLAIN:
--
--      junção no mesmo nível (antes do corte)  → `clientes` varrida com loops=157 · 34,2 ms
--      junção depois do corte (é o que está aí)→ `clientes` varrida com loops=9   · 28,8 ms
--
--    A diferença cresce com a empresa: o recorte cresce, a página continua no teto de 100.
--
-- ----------------------------------------------------------------------------
-- DESEMPENHO, MEDIDO COMO USUÁRIO LOGADO (CLAUDE.md §7.15), NÃO PELO PAINEL
-- ----------------------------------------------------------------------------
--   select set_config('request.jwt.claims','{"sub":"<login>","role":"authenticated"}',true),
--          set_config('role','authenticated',true),
--          set_config('statement_timeout','8s',true);
--   explain (analyze, buffers) <consulta>;
--
-- 🔴 COMO A FUNÇÃO NOVA FOI MEDIDA SEM EXISTIR NO BANCO: esta migration não foi aplicada, então
-- `select * from public.negocios_em_risco(...)` não tinha o que chamar. O que se mede é o CORPO
-- da função colado direto na consulta, com os valores padrão dos sete parâmetros escritos no
-- lugar deles (`null,null,null,7,null,10,0`), debaixo do mesmo login e do mesmo tempo limite. O
-- painel de comparação, esse sim, é chamada de verdade — ele já existe. Quando a migration for
-- aplicada junto com a tela (Tarefa 3), refaça a medida chamando a função e confira que continua
-- na mesma casa; se passar de ~50 ms quente, pare e avise antes de publicar.
--
--   09/09/2026, recorte de 157 negócios:
--     painel de hoje (`dashboard_negocios_risco`, com `top_parados` dentro) → 29,3 ms
--     `negocios_em_risco`, página de 10, gestora que vê a empresa inteira   → 28,8 ms
--   10/09/2026, refeito na conferência final, recorte de 159 negócios:
--     painel de hoje                                                       → 29,6 ms
--     corpo de `negocios_em_risco`, mesma página, mesma gestora            → 29,1 ms
--   O recorte muda de um dia para o outro porque ele é o estado de hoje da carteira, não um
--   número fixo — o que se compara é o custo, e ele não se mexeu.
--
-- 🔴 E o portão aparece no plano como `InitPlan … rows=1 loops=1`, avaliado UMA vez, não uma vez
-- por linha varrida:
--     InitPlan 15 -> Result (actual rows=1 loops=1)      ← eu_vejo_pauta_de_todos()
--     InitPlan 16 -> Result (never executed)             ← get_my_usuario_id(), curto-circuitado
--     Seq Scan on pedidos … Filter: … ((InitPlan 15).col1 OR (usuario_id = (InitPlan 16).col1))
-- É para isso que os dois portões estão escritos como `(SELECT funcao())` e não como `funcao()`.
--
-- ----------------------------------------------------------------------------
-- QUEM FOR CHAMAR ISTO DA TELA
-- ----------------------------------------------------------------------------
-- 🔴 Array vazio em filtro de RPC filtra tudo fora (CLAUDE.md §7.8): `= ANY('{}')` não casa com
-- nada. Mande `null` quando não houver filtro, nunca `[]` — é o que `useDashboardNegociosRisco`
-- já faz para os quatro filtros, e a conversão tem de ser repetida aqui.
--
-- Deslocamento além do fim devolve ZERO linha — e, com zero linha, não há `total_geral` para
-- ler. É o comportamento certo para o "Ver mais" (ele para antes de chegar lá), mas a tela não
-- pode concluir "o total é zero" de uma página vazia.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.negocios_em_risco(p_usuario_ids uuid[] DEFAULT NULL::uuid[], p_fabricante_ids uuid[] DEFAULT NULL::uuid[], p_funil_id uuid DEFAULT NULL::uuid, p_dias_parado integer DEFAULT 7, p_etapas text[] DEFAULT NULL::text[], p_limite integer DEFAULT 10, p_deslocamento integer DEFAULT 0)
 RETURNS TABLE(id uuid, nome text, fabrica text, etapa text, responsavel text, valor numeric, dias_parado integer, total_geral bigint)
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
  ),
  meus AS (
    SELECT * FROM marcado
    WHERE (parado OR sem_proxima_acao)
      AND (
        (SELECT public.eu_vejo_pauta_de_todos())
        OR usuario_id = (SELECT public.get_my_usuario_id())
      )
  )
  SELECT
    pagina.id,
    coalesce(
      nullif(trim(pagina.nome), ''),
      nullif(trim(pagina.campos_extras ->> 'Negócio'), ''),
      nullif(trim(cl.empresa), '') || coalesce(' | ' || pagina.fabricante_nome, ''),
      'Negócio sem nome'
    ),
    pagina.fabricante_nome,
    pagina.etapa_label,
    pagina.vendedor_nome,
    pagina.valor_total,
    ((SELECT d FROM hoje) - pagina.parado_desde)::integer,
    pagina.total_geral
  FROM (
    SELECT m.*, (count(*) OVER ())::bigint AS total_geral
    FROM meus m
    ORDER BY m.valor_total DESC NULLS LAST, m.id
    OFFSET greatest(p_deslocamento, 0)
    LIMIT greatest(least(p_limite, 100), 1)
  ) pagina
  LEFT JOIN public.clientes cl ON cl.id = pagina.cliente_id
  ORDER BY pagina.valor_total DESC NULLS LAST, pagina.id;
$function$;

REVOKE ALL ON FUNCTION public.negocios_em_risco(uuid[],uuid[],uuid,integer,text[],integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.negocios_em_risco(uuid[],uuid[],uuid,integer,text[],integer,integer) TO authenticated;

-- ----------------------------------------------------------------------------
-- `dashboard_negocios_risco` reemitida sem `top_parados`
-- ----------------------------------------------------------------------------
-- É o texto de hoje com a ÚLTIMA coluna do SELECT removida e `top_parados jsonb` fora do
-- `RETURNS TABLE`. Nada mais mudou: os cinco números, `risco_por_vendedor` (com o mesmo `CASE`
-- da chave) e `risco_por_fabricante` estão idênticos, caractere por caractere.
--
-- Por que não tem comentário nenhum dentro do corpo, se a migration 20260907150000 tem 38 linhas
-- deles: o que está VIVO no banco não os tem. Quem aplicou aquela migration mandou o corpo sem os
-- comentários, e como este texto foi colhido do que está rodando (e não copiado do arquivo), ele
-- veio sem eles. Conferido linha a linha: fora essas 38 linhas de comentário, o corpo vivo e o da
-- 20260907150000 são iguais — nenhuma diferença de SQL. Os comentários continuam onde sempre
-- estiveram, naquela migration; o histórico não perde nada.
DROP FUNCTION IF EXISTS public.dashboard_negocios_risco(uuid[],uuid[],uuid,integer,text[]);

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

GRANT EXECUTE ON FUNCTION public.dashboard_negocios_risco(uuid[],uuid[],uuid,integer,text[]) TO anon, authenticated, service_role;
