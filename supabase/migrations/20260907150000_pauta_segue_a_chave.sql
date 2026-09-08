-- ============================================================================
-- A PAUTA E O PAINEL DE RISCO SEGUEM A CHAVE, E O NEGÓCIO VOLTA NO DIA CERTO
-- ============================================================================
--
-- Três trabalhos num arquivo só, porque os três reemitem função e o custo de separar seria
-- três migrations que precisam ser aplicadas juntas de qualquer jeito:
--
--   (a) `dashboard_negocios_risco` — o portão da lista nominal por responsável era
--       `is_gestor()`, ou seja, o PAPEL. A pauta logo acima, na mesma tela, decide pela CHAVE
--       `pauta_de_todos` desde a Tarefa 4. Hoje um gestor com o interruptor "Ver a pauta de
--       toda a equipe" desligado à mão vê só os próprios negócios na fila e, dois centímetros
--       abaixo, o gráfico com o nome e o valor em risco de cada colega. Passa a decidir pela
--       mesma leitura.
--
--   (b) `pauta_do_dia_de` — o bloco que lê a chave estava copiado dentro dela. Passa a chamar
--       `public.ve_pauta_de_todos(uuid)`, criada na migration `20260907140000`. Uma leitura só.
--
--   (c) O "volta um dia depois" — a cláusula que tira da pauta o negócio com retorno marcado
--       comparava com `<`, e por isso o negócio só voltava no dia SEGUINTE ao escolhido.
--
-- 🔴 `CREATE OR REPLACE`, NUNCA `DROP` + `CREATE`. `pauta_do_dia_de(uuid)` teve `authenticated`
-- revogado de propósito na Tarefa 4 — ela é só do servidor, alimenta o e-mail das 7h. Medido
-- hoje, 07/09/2026, em `pg_proc.proacl`:
--
--     pauta_do_dia_de(uuid)  ->  postgres=X/postgres | service_role=X/postgres
--
-- Nem `anon`, nem `authenticated`, nem PUBLIC. Um `DROP` apagaria isso em silêncio e devolveria
-- a pauta de qualquer colega a qualquer pessoa logada. Como nenhuma assinatura muda aqui, o
-- `CREATE OR REPLACE` preserva a `proacl` inteira. Confira antes e depois:
--
--   select p.oid::regprocedure, coalesce(array_to_string(p.proacl,' | '),'(padrao)')
--     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.proname like 'pauta_do_dia%';
--
-- 🔴 DEPENDE DE `20260907140000_adiar_negocio_de_colega.sql`, que cria `ve_pauta_de_todos`.
-- Aplique as duas na ordem do nome do arquivo. Se esta rodar antes, ela falha alto
-- ("function public.ve_pauta_de_todos(uuid) does not exist") e nada fica pela metade.
--
-- ----------------------------------------------------------------------------
-- 🔴 O QUE FOI CONFERIDO NO BANCO ANTES DE ESCREVER (07/09/2026, só SELECT)
-- ----------------------------------------------------------------------------
--   · Os corpos das duas funções foram COLHIDOS com `pg_get_functiondef` e editados a partir do
--     texto vigente, não reescritos de memória. Fora das três trocas descritas acima, o texto é
--     o mesmo caractere por caractere.
--
--   · `pauta_do_dia()` NÃO tem cópia nenhuma da leitura da chave: o corpo dela inteiro é
--     `select * from public.pauta_do_dia_de(get_my_usuario_id());`. Por isso ela não é tocada —
--     herda tudo da irmã. (O brief desta tarefa dizia que eram "duas cópias idênticas"; não são.)
--
--   · `is_gestor()` aparece UMA vez em `dashboard_negocios_risco`, no `CASE` de
--     `risco_por_vendedor`. O campo `responsavel` da lista dos 10 maiores continua sem portão,
--     como já estava — o comentário original explica por quê, e ele segue valendo.
--
--   · 🔴 `dashboard_negocios_risco` **NÃO é `SECURITY DEFINER`** (`pg_proc.prosecdef = false`).
--     Ela roda como quem chama, então cada função de dentro dela é conferida contra o
--     privilégio de `authenticated`. `is_gestor()` tem `authenticated=X`; `ve_pauta_de_todos`
--     foi REVOGADA de `authenticated` pela Tarefa 4. Trocar uma pela outra direto faria o
--     painel inteiro morrer com "permission denied for function ve_pauta_de_todos" para todo
--     mundo. Daí a função-embrulho abaixo — e não um GRANT na versão com `uuid`, que abriria
--     uma consulta onde qualquer pessoa logada pergunta pelo identificador de QUALQUER outra,
--     inclusive de outra empresa (a função pula a RLS).
--
--   · O comparativo do item (c), medido no próprio banco:
--       select '2026-09-20 00:00:00+00'::timestamptz <  '2026-09-20'::date;  -->  false
--       select '2026-09-20 00:00:00+00'::timestamptz <= '2026-09-20'::date;  -->  true
--     `current_setting('TimeZone')` = `UTC`, e a data do retorno é gravada como meia-noite UTC.
--     Ou seja: com `<`, no dia escolhido a comparação dá falso e o negócio só volta no dia
--     seguinte — enquanto a tela promete "volta para a sua pauta nesse dia".
--
--   · Tamanho do estrago hoje: 16 linhas de `historico_contatos` têm `proximo_contato_em`, e só
--     **1** está em data futura (08/09/2026). O conserto não muda nenhum número de hoje; ele
--     vale para todo adiamento feito a partir de agora.
--
-- ----------------------------------------------------------------------------
-- ⚠️ ESCOLHA CONSCIENTE, não acidente: no DIA do retorno o negócio fica ao mesmo tempo NA pauta
-- e contado como "tem próxima ação" pelo cartão "Sem Próxima Ação" logo abaixo, na mesma tela
-- (ele usa `proximo_contato_em >= hoje`, que no dia D é verdadeiro). É o comportamento certo:
-- o dia do retorno é o dia de agir, e a data marcada continua sendo uma próxima ação marcada.
-- Antes deste arquivo os dois discordavam pelo lado ruim — o negócio não estava na pauta E já
-- contava como resolvido.
--
-- ----------------------------------------------------------------------------
-- 🔴 PARA VOLTAR ATRÁS: reemitir as duas funções com o texto anterior (trocando
-- `public.ve_pauta_de_todos(p_usuario_id)` pelo bloco `coalesce(...)` de novo, `<=` por `<`, e
-- `public.eu_vejo_pauta_de_todos()` por `is_gestor()`), e `DROP FUNCTION IF EXISTS
-- public.eu_vejo_pauta_de_todos();`. Sempre com `CREATE OR REPLACE` — ver o aviso lá em cima.
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- (0) A MESMA PERGUNTA, MAS SOBRE QUEM ESTÁ PERGUNTANDO.
--
-- `ve_pauta_de_todos(uuid)` responde sobre uma pessoa qualquer, e por isso a Tarefa 4 a fechou
-- para o navegador: com ela aberta, qualquer pessoa logada perguntaria pelo identificador de
-- qualquer outra — de qualquer empresa —, porque a função roda com privilégio e pula a RLS.
--
-- Esta aqui não aceita identificador nenhum: ela resolve `get_my_usuario_id()` por dentro, então
-- só sabe responder sobre QUEM PERGUNTOU. É a única que `dashboard_negocios_risco` (que roda com
-- o privilégio de quem chama, ver o cabeçalho) precisa poder executar.
--
-- É o mesmo formato de `is_gestor()`, que ela substitui ali: sem argumento, com privilégio, e
-- executável por `authenticated`.
CREATE OR REPLACE FUNCTION public.eu_vejo_pauta_de_todos()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
  select public.ve_pauta_de_todos(public.get_my_usuario_id());
$function$;

-- Sessão sem login devolve nulo (`get_my_usuario_id()` é nulo), mas nem chega lá: `anon` fica de
-- fora. A consequência é pequena e vale registrar — uma chamada anônima a
-- `dashboard_negocios_risco` passa a dar erro de permissão em vez de devolver zeros. O site
-- nunca faz isso: a tela "Hoje" vive atrás do `ProtectedRoute`.
REVOKE ALL ON FUNCTION public.eu_vejo_pauta_de_todos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eu_vejo_pauta_de_todos() TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- (b) e (c) — A PAUTA
--
-- Texto colhido de `pg_get_functiondef('public.pauta_do_dia_de(uuid)')` em 07/09/2026. Só duas
-- linhas mudam, e estão marcadas com 🔴 no corpo.
CREATE OR REPLACE FUNCTION public.pauta_do_dia_de(p_usuario_id uuid)
 RETURNS TABLE(tipo text, referencia_id uuid, selo text, titulo text, detalhe text, valor numeric, quando timestamp with time zone, dias_parado integer, ordem integer, responsavel text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_empresa uuid; v_auth uuid; v_dias int; v_min int; v_max int;
  v_hoje date; v_compromissos int; v_vagas int; v_ve_todos boolean;
begin
  select u.empresa_id, u.user_id into v_empresa, v_auth
  from usuarios u where u.id = p_usuario_id and u.deleted_at is null;
  if v_empresa is null then return; end if;

  if not empresa_tem_secao_de(v_empresa, 'hoje') then return; end if;

  -- 🔴 MUDOU (b): era um `coalesce(chave, papel)` escrito aqui dentro. A mesma leitura existia
  -- copiada em outros lugares, e duas cópias divergem em silêncio. Agora é uma função só —
  -- `public.ve_pauta_de_todos`, criada na migration `20260907140000`, cujo corpo é cópia
  -- literal do bloco que estava aqui. Comportamento idêntico, um lugar só para consertar.
  v_ve_todos := public.ve_pauta_de_todos(p_usuario_id);

  select coalesce((select (c.valor #>> '{}')::int from configuracoes_automacao c
                    where c.empresa_id = v_empresa and c.chave = 'pauta_dias_parado'), 3),
         coalesce((select (c.valor #>> '{}')::int from configuracoes_automacao c
                    where c.empresa_id = v_empresa and c.chave = 'pauta_min_itens'), 3),
         coalesce((select (c.valor #>> '{}')::int from configuracoes_automacao c
                    where c.empresa_id = v_empresa and c.chave = 'pauta_max_itens'), 7)
    into v_dias, v_min, v_max;

  v_hoje := (now() at time zone 'America/Sao_Paulo')::date;

  select count(*) into v_compromissos
  from (
    select 1 from eventos e
     where e.user_id = v_auth and (e.inicio at time zone 'America/Sao_Paulo')::date = v_hoje
    union all
    select 1 from tarefas t
     where t.usuario_id = p_usuario_id and t.prazo_final is not null
       and (t.prazo_final at time zone 'America/Sao_Paulo')::date = v_hoje
       and coalesce(t.status,'') <> 'concluida'
  ) q;

  v_vagas := greatest(v_max - v_compromissos, 0);

  return query
  with
  gente as (
    select u.id from usuarios u
     where u.empresa_id = v_empresa and u.deleted_at is null
       and (v_ve_todos or u.id = p_usuario_id)
  ),
  etapas_abertas as (
    select distinct k.slug from kanban_colunas k
     where k.empresa_id = v_empresa and k.slug not in ('fechamento','perdido')
  ),
  ultima_etapa as (
    select h.pedido_id, max(h.created_at) as em
      from pedidos_historico_status h
     where h.tipo = 'status'
       and h.pedido_id in (select p2.id from pedidos p2 where p2.usuario_id in (select id from gente))
     group by h.pedido_id
  ),
  retorno_marcado as (
    select hc.pedido_id, max(hc.proximo_contato_em) as ate
      from historico_contatos hc
     where hc.proximo_contato_em is not null
     group by hc.pedido_id
  ),
  candidatos as (
    select p.id,
      coalesce(nullif(trim(p.nome),''),
               nullif(trim(p.campos_extras ->> 'Negócio'),''),
               nullif(trim(cl.empresa),'') || coalesce(' | ' || fa.nome,''),
               'Negócio sem nome')                              as titulo,
      coalesce(k.nome, p.status)                                as etapa_label,
      p.data_pedido,
      coalesce(p.valor_total,0)                                 as valor,
      (v_hoje - (ue.em at time zone 'America/Sao_Paulo')::date) as dias_parado,
      du.nome                                                   as dono,
      (p.usuario_id = p_usuario_id)                             as e_meu
    from pedidos p
    join ultima_etapa ue        on ue.pedido_id = p.id
    join gente g                on g.id = p.usuario_id
    left join usuarios du       on du.id = p.usuario_id
    left join clientes cl       on cl.id = p.cliente_id
    left join fabricantes fa    on fa.id = p.fabricante_id
    left join kanban_colunas k  on k.empresa_id = v_empresa and k.funil_id = p.funil_id and k.slug = p.status
    left join retorno_marcado r on r.pedido_id = p.id
    where p.status in (select slug from etapas_abertas)
      -- 🔴 MUDOU (c): era `r.ate < v_hoje`, e por isso o negócio voltava um dia DEPOIS da data
      -- escolhida. `proximo_contato_em` é `timestamptz` e a data entra como meia-noite UTC:
      -- '2026-09-20 00:00+00' < '2026-09-20'::date é FALSO, então no dia 20 o negócio ainda
      -- estava fora e só reaparecia no dia 21 — enquanto o `DialogoRetorno` promete "volta para
      -- a sua pauta nesse dia". Um caractere: `<` virou `<=`.
      and (r.ate is null or r.ate <= v_hoje)
  ),
  ranqueados as (
    select c.*, row_number() over (order by c.dias_parado desc, c.valor desc) as posicao
    from candidatos c
  ),
  negocios as (
    select r.* from ranqueados r
    where r.dias_parado >= v_dias or r.posicao <= greatest(v_min - v_compromissos, 0)
    order by r.valor desc, r.dias_parado desc
    limit v_vagas
  ),
  compromissos as (
    select e.id, e.titulo,
           coalesce(nullif(trim(e.descricao),''),'Compromisso na agenda') as detalhe,
           e.inicio as quando
      from eventos e
     where e.user_id = v_auth and (e.inicio at time zone 'America/Sao_Paulo')::date = v_hoje
    union all
    select t.id, t.titulo,
           coalesce(nullif(trim(t.descricao),''),'Tarefa com prazo hoje') as detalhe,
           t.prazo_final as quando
      from tarefas t
     where t.usuario_id = p_usuario_id and t.prazo_final is not null
       and (t.prazo_final at time zone 'America/Sao_Paulo')::date = v_hoje
       and coalesce(t.status,'') <> 'concluida'
  )
  select 'compromisso'::text, cp.id, 'Hoje'::text, cp.titulo, cp.detalhe,
         null::numeric, cp.quando, null::integer,
         (row_number() over (order by cp.quando))::integer, null::text
  from compromissos cp
  union all
  select 'negocio_parado'::text, n.id, 'Orçamento parado'::text, n.titulo,
         'Em ' || n.etapa_label || ' desde ' || to_char(n.data_pedido,'DD/MM/YYYY'),
         n.valor, null::timestamptz, n.dias_parado,
         (1000 + row_number() over (order by n.valor desc))::integer,
         case when n.e_meu then null else n.dono end
  from negocios n
  order by 9;
end;
$function$;

-- ────────────────────────────────────────────────────────────────────────────
-- (a) — O PAINEL "NO GERAL"
--
-- Texto colhido de `pg_get_functiondef` em 07/09/2026. Uma linha muda, marcada com 🔴.
-- A função continua SEM `SECURITY DEFINER`: quem recorta os negócios é a regra de segurança de
-- `pedidos`, avaliada com o privilégio de quem chama. Não mexer nisso é o que mantém o painel
-- incapaz de mostrar negócio de outra empresa.
CREATE OR REPLACE FUNCTION public.dashboard_negocios_risco(p_usuario_ids uuid[] DEFAULT NULL::uuid[], p_fabricante_ids uuid[] DEFAULT NULL::uuid[], p_funil_id uuid DEFAULT NULL::uuid, p_dias_parado integer DEFAULT 7, p_etapas text[] DEFAULT NULL::text[])
 RETURNS TABLE(qtd_parados bigint, valor_parados numeric, qtd_sem_proxima_acao bigint, valor_sem_proxima_acao numeric, valor_risco_total numeric, risco_por_vendedor jsonb, risco_por_fabricante jsonb, top_parados jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
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
      COALESCE(uh.ultima_atividade, p.created_at) AS ultima_atividade
    FROM public.pedidos p
    LEFT JOIN public.usuarios u ON u.id = p.usuario_id
    LEFT JOIN public.fabricantes f ON f.id = p.fabricante_id
    -- 🔴 As três colunas da chave única de kanban_colunas, não duas: sem `funil_id`, uma
    -- empresa com dois funis casa o mesmo slug em duas linhas e dobra o negócio na CTE inteira.
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
    -- 🔴 MUDOU (a): era `CASE WHEN is_gestor() THEN`, ou seja, o PAPEL. Agora é a mesma chave
    -- que decide a pauta logo acima, na mesma tela. O que muda na prática, nos dois sentidos:
    --   · gestor com "Ver a pauta de toda a equipe" DESLIGADO à mão deixa de receber a lista
    --     nominal por responsável — antes ele via só os próprios negócios na fila e o gráfico
    --     com o nome de todo mundo dois centímetros abaixo;
    --   · vendedor com a chave LIGADA passa a receber a lista, que é o que o rótulo do
    --     interruptor promete ("ver e agir sobre os negócios dos colegas").
    -- O corte continua AQUI, no servidor. Levar a decisão para o navegador mandaria a lista
    -- nominal inteira para quem não pode vê-la, e esconder na tela não esconde nada.
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
    ),
    -- 🔴 `clientes` só entra AQUI, depois do `LIMIT 10`, nunca na CTE `abertos`.
    -- E `responsavel` sai sem o portão de propósito: a regra de segurança de
    -- `pedidos` já é da empresa inteira, e a tela de Negócios já mostra o responsável de
    -- cada negócio. O portão do outro campo existe porque ALI é um RANKING nominal.
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
