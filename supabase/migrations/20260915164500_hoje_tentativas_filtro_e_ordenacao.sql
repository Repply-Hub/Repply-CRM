-- ============================================================================
-- HOJE: TENTATIVAS (PRIORIDADE + ETIQUETA), FILTRO DE DATA E ORDENAÇÃO
-- ============================================================================
--
-- Pedido do dono do produto em 15/09/2026 (desenho em
-- `docs/superpowers/specs/2026-09-15-hoje-tentativas-filtro-email-e-ordenacao-design.md`).
--
-- "Tentativa" = nº de "Retomar depois" já registrados no negócio, isto é
-- `count(*) de historico_contatos where pedido_id = X and tipo = 'retorno'`. A tela mostra
-- `tentativas + 1` (o envio é a 1ª). Contagem barata: SECURITY DEFINER (sem RLS por linha) e há
-- índice em `historico_contatos(pedido_id, ...)`.
--
-- Cinco mudanças:
--   1. `pauta_do_dia_de` (+ `pauta_do_dia`, o invólucro): devolve a coluna `tentativas` e coloca a
--      tentativa como PRIMEIRA chave da ordem — os perseguidos entram na pauta primeiro, DENTRO do
--      teto. O selo continua "Orçamento parado" (a tela troca por "Nª tentativa" quando > 0).
--   2. `negocios_em_risco` / `_de`: coluna `tentativas`; período opcional por DATA DE CRIAÇÃO
--      (`p_data_de`/`p_data_ate`, sobre `pedidos.data_pedido`); e ordenação por coluna no servidor
--      (`p_ordenar_por`/`p_ascendente`) por LISTA BRANCA de `CASE` — segura aqui pelo teto de 100
--      linhas (§7.9 não morde). O nome exibido passa a ser calculado DENTRO da página, para a
--      ordenação por "negócio" recortar antes do LIMIT.
--   3. `dashboard_negocios_risco`: o mesmo período opcional.
--   4. `pauta_resumo_destinatarios`: exclui quem o gestor tirou (`pauta_resumo_excluidos`).
--
-- 🔴 POR QUE `DROP` + `CREATE` (todas menos a última): muda a lista de colunas de saída e/ou a
-- assinatura, e o Postgres não deixa trocar isso em função existente. O `DROP` APAGA A PERMISSÃO em
-- silêncio — por isso ela é refeita aqui, na mesma transação, EXATAMENTE como estava (medido em
-- 15/09/2026):
--   pauta_do_dia_de          -> postgres, service_role
--   pauta_do_dia             -> PUBLIC, anon, authenticated, service_role
--   negocios_em_risco_de     -> postgres, service_role                 (FECHADA ao navegador)
--   negocios_em_risco        -> authenticated, service_role            (sem PUBLIC, sem anon)
--   dashboard_negocios_risco -> PUBLIC, anon, authenticated, service_role
--   pauta_resumo_destinatarios-> inalterada (CREATE OR REPLACE, mesma assinatura)
--
-- 🔴 `negocios_em_risco_de` e `pauta_do_dia_de` CONTINUAM FECHADAS PARA O NAVEGADOR. Aceitam o
-- identificador de QUALQUER pessoa e rodam com privilégio; abertas a `authenticated`, qualquer um
-- consultaria a carteira e a pauta de qualquer outro.
--
-- Compatível com o site no ar: ele chama estas funções com os PARÂMETROS DE HOJE (os novos têm
-- DEFAULT) e ignora a coluna `tentativas` a mais.
--
-- `NOTIFY pgrst, 'reload schema'` no fim: a API do banco enxerga as colunas/params novos na hora.
--
-- PARA VOLTAR ATRÁS: recriar as seis funções nas definições anteriores (colhidas com
-- `pg_get_functiondef` em 15/09/2026, guardadas no scratchpad da sessão), com a MESMA permissão
-- acima. md5(prosrc) de antes: pauta_do_dia_de 983af134…, pauta_do_dia 2a2ef481…,
-- negocios_em_risco 4068e962…, negocios_em_risco_de 6bc82788…, dashboard_negocios_risco fdc67428…,
-- pauta_resumo_destinatarios e5ea5e3c….
-- ============================================================================

BEGIN;

-- Os invólucros primeiro (dependem dos miolos), depois os miolos.
DROP FUNCTION public.pauta_do_dia();
DROP FUNCTION public.negocios_em_risco(uuid[], uuid[], uuid, integer, text[], integer, integer);
DROP FUNCTION public.dashboard_negocios_risco(uuid[], uuid[], uuid, integer, text[]);
DROP FUNCTION public.pauta_do_dia_de(uuid);
DROP FUNCTION public.negocios_em_risco_de(uuid, uuid[], uuid[], uuid, integer, text[], integer, integer);

-- ----------------------------------------------------------------------------
-- pauta_do_dia_de — a fila. Ganha `tentativas` e prioriza os perseguidos, dentro do teto.
-- ----------------------------------------------------------------------------
CREATE FUNCTION public.pauta_do_dia_de(p_usuario_id uuid)
 RETURNS TABLE(tipo text, referencia_id uuid, selo text, titulo text, detalhe text, valor numeric, quando timestamp with time zone, dias_parado integer, ordem integer, responsavel text, tentativas integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_empresa uuid; v_auth uuid; v_dias int; v_max int;
  v_hoje date; v_inicio timestamptz; v_compromissos int; v_vagas int; v_ve_todos boolean;
begin
  select u.empresa_id, u.user_id into v_empresa, v_auth
  from usuarios u where u.id = p_usuario_id and u.deleted_at is null;
  if v_empresa is null then return; end if;
  if not empresa_tem_secao_de(v_empresa, 'hoje') then return; end if;

  v_ve_todos := public.ve_pauta_de_todos(p_usuario_id);

  select coalesce((select (c.valor #>> '{}')::int from configuracoes_automacao c
                    where c.empresa_id = v_empresa and c.chave = 'pauta_dias_parado'), 3),
         coalesce((select (c.valor #>> '{}')::int from configuracoes_automacao c
                    where c.empresa_id = v_empresa and c.chave = 'pauta_max_itens'), 7)
    into v_dias, v_max;

  v_hoje := (now() at time zone 'America/Sao_Paulo')::date;
  v_inicio := (v_hoje::timestamp at time zone 'America/Sao_Paulo');

  select count(*) into v_compromissos
  from (
    select 1 from eventos e
     where e.user_id = v_auth and (e.inicio at time zone 'America/Sao_Paulo')::date = v_hoje
       and e.created_at < v_inicio
    union all
    select 1 from tarefas t
     where t.usuario_id = p_usuario_id and t.prazo_final is not null
       and (t.prazo_final at time zone 'America/Sao_Paulo')::date = v_hoje
       and t.created_at < v_inicio
       and not (coalesce(t.status,'') = 'concluida' and t.updated_at < v_inicio)
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
       and h.created_at < v_inicio
       and h.pedido_id in (select p2.id from pedidos p2 where p2.usuario_id in (select id from gente))
     group by h.pedido_id
  ),
  retorno_marcado as (
    select hc.pedido_id, max(hc.proximo_contato_em) as ate
      from historico_contatos hc
     where hc.proximo_contato_em is not null
       and (hc.data_contato at time zone 'UTC')::date < v_hoje
     group by hc.pedido_id
  ),
  agidos_hoje as (
    select distinct x.pedido_id from (
      select h.pedido_id from pedidos_historico_status h
       where h.created_at >= v_inicio
         and h.tipo = 'status'
         and h.status_anterior is not null
      union all
      select hc.pedido_id from historico_contatos hc
       where (hc.data_contato at time zone 'UTC')::date = v_hoje
      union all
      select t.pedido_id from tarefas t
       where t.pedido_id is not null
         and (t.created_at >= v_inicio
              or (coalesce(t.status,'') = 'concluida' and t.updated_at >= v_inicio))
    ) x
  ),
  etapa_na_virada as (
    select distinct on (h.pedido_id) h.pedido_id, h.status_anterior as status
      from pedidos_historico_status h
     where h.tipo = 'status'
       and h.created_at >= v_inicio
       and h.status_anterior is not null
     order by h.pedido_id, h.created_at asc
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
      (p.usuario_id = p_usuario_id)                             as e_meu,
      (ah.pedido_id is not null)                                as feito_hoje,
      -- 🔴 NOVO (15/09/2026): quantas retomadas o negócio já teve. É a contagem de
      -- historico_contatos do tipo 'retorno' — o mesmo evento que "Retomar depois" grava. A tela
      -- mostra `tentativas + 1` (o envio é a 1ª) e usa isto para priorizar.
      (select count(*)::int from historico_contatos hc2
        where hc2.pedido_id = p.id and hc2.tipo = 'retorno')    as tentativas
    from pedidos p
    join ultima_etapa ue        on ue.pedido_id = p.id
    join gente g                on g.id = p.usuario_id
    left join usuarios du       on du.id = p.usuario_id
    left join clientes cl       on cl.id = p.cliente_id
    left join fabricantes fa    on fa.id = p.fabricante_id
    left join kanban_colunas k  on k.empresa_id = v_empresa and k.funil_id = p.funil_id and k.slug = p.status
    left join retorno_marcado r on r.pedido_id = p.id
    left join agidos_hoje ah    on ah.pedido_id = p.id
    left join etapa_na_virada ev on ev.pedido_id = p.id
    where coalesce(ev.status, p.status) in (select slug from etapas_abertas)
      and (r.ate is null or r.ate <= v_hoje)
      and not exists (
        select 1 from tarefas t
         where t.pedido_id = p.id
           and t.created_at < v_inicio
           and not (coalesce(t.status,'') = 'concluida' and t.updated_at < v_inicio)
           and (t.prazo_final is null
                or (t.prazo_final at time zone 'America/Sao_Paulo')::date >= v_hoje)
      )
  ),
  do_dia as (
    -- 🔴 MUDOU (15/09/2026): a TENTATIVA vai na frente. Os perseguidos entram na pauta primeiro,
    -- DENTRO do teto (decisão do dono do produto). Depois seguem as chaves de antes: os do dono,
    -- o maior valor, os mais dias, e o id só desempata.
    select c.* from candidatos c
    where c.dias_parado >= v_dias
    order by c.tentativas desc, c.e_meu desc, c.valor desc, c.dias_parado desc, c.id
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
         (row_number() over (order by cp.quando))::integer, null::text,
         0::integer
  from compromissos cp
  union all
  select 'negocio_parado'::text, n.id, 'Orçamento parado'::text, n.titulo,
         'Em ' || n.etapa_label || ' desde ' || to_char(n.data_pedido,'DD/MM/YYYY'),
         n.valor, null::timestamptz, n.dias_parado,
         -- 🔴 MUDOU (15/09/2026): a tentativa manda também na ordem da tela; o resto desempata.
         (1000 + row_number() over (order by n.tentativas desc, n.e_meu desc, n.valor desc, n.dias_parado desc, n.id))::integer,
         case when n.e_meu then null else n.dono end,
         n.tentativas
  from do_dia n where not n.feito_hoje
  union all
  select 'negocio_feito'::text, n.id, 'Feito hoje'::text, n.titulo,
         'Em ' || n.etapa_label || ' desde ' || to_char(n.data_pedido,'DD/MM/YYYY'),
         n.valor, null::timestamptz, n.dias_parado,
         (2000 + row_number() over (order by n.valor desc, n.id))::integer,
         case when n.e_meu then null else n.dono end,
         n.tentativas
  from do_dia n where n.feito_hoje
  order by 9;
end;
$function$;

REVOKE ALL ON FUNCTION public.pauta_do_dia_de(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pauta_do_dia_de(uuid) TO service_role;

-- ----------------------------------------------------------------------------
-- pauta_do_dia — o invólucro. Só herda a forma nova.
-- ----------------------------------------------------------------------------
CREATE FUNCTION public.pauta_do_dia()
 RETURNS TABLE(tipo text, referencia_id uuid, selo text, titulo text, detalhe text, valor numeric, quando timestamp with time zone, dias_parado integer, ordem integer, responsavel text, tentativas integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select * from public.pauta_do_dia_de(get_my_usuario_id());
$function$;

GRANT EXECUTE ON FUNCTION public.pauta_do_dia() TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- negocios_em_risco_de — o miolo da tabela do time. Ganha tentativas, período e ordenação.
-- ----------------------------------------------------------------------------
CREATE FUNCTION public.negocios_em_risco_de(p_usuario_id uuid, p_usuario_ids uuid[] DEFAULT NULL::uuid[], p_fabricante_ids uuid[] DEFAULT NULL::uuid[], p_funil_id uuid DEFAULT NULL::uuid, p_dias_parado integer DEFAULT 7, p_etapas text[] DEFAULT NULL::text[], p_limite integer DEFAULT 10, p_deslocamento integer DEFAULT 0, p_data_de date DEFAULT NULL::date, p_data_ate date DEFAULT NULL::date, p_ordenar_por text DEFAULT 'valor'::text, p_ascendente boolean DEFAULT false)
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
$function$;

REVOKE ALL ON FUNCTION public.negocios_em_risco_de(uuid, uuid[], uuid[], uuid, integer, text[], integer, integer, date, date, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.negocios_em_risco_de(uuid, uuid[], uuid[], uuid, integer, text[], integer, integer, date, date, text, boolean) TO service_role;

-- ----------------------------------------------------------------------------
-- negocios_em_risco — o invólucro da tela. Repassa os params novos e reordena a página.
-- ----------------------------------------------------------------------------
CREATE FUNCTION public.negocios_em_risco(p_usuario_ids uuid[] DEFAULT NULL::uuid[], p_fabricante_ids uuid[] DEFAULT NULL::uuid[], p_funil_id uuid DEFAULT NULL::uuid, p_dias_parado integer DEFAULT 7, p_etapas text[] DEFAULT NULL::text[], p_limite integer DEFAULT 10, p_deslocamento integer DEFAULT 0, p_data_de date DEFAULT NULL::date, p_data_ate date DEFAULT NULL::date, p_ordenar_por text DEFAULT 'valor'::text, p_ascendente boolean DEFAULT false)
 RETURNS TABLE(id uuid, nome text, fabrica text, etapa text, responsavel text, valor numeric, dias_parado integer, total_geral bigint, responsavel_id uuid, responsavel_avatar text, tentativas integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT n.id, n.nome, n.fabrica, n.etapa, n.responsavel, n.valor, n.dias_parado, n.total_geral,
         n.responsavel_id, n.responsavel_avatar, n.tentativas
  FROM public.negocios_em_risco_de(
         public.get_my_usuario_id(),
         p_usuario_ids, p_fabricante_ids, p_funil_id, p_dias_parado, p_etapas, p_limite, p_deslocamento,
         p_data_de, p_data_ate, p_ordenar_por, p_ascendente
       ) n
  -- A mesma lista branca do miolo, agora sobre as colunas de saída. Sem ela, a página voltaria
  -- reordenada por valor e desfaria a ordenação escolhida.
  ORDER BY
    (CASE WHEN p_ordenar_por = 'valor'       AND NOT p_ascendente THEN n.valor END) DESC NULLS LAST,
    (CASE WHEN p_ordenar_por = 'valor'       AND     p_ascendente THEN n.valor END) ASC  NULLS LAST,
    (CASE WHEN p_ordenar_por = 'dias'        AND NOT p_ascendente THEN n.dias_parado END) DESC NULLS LAST,
    (CASE WHEN p_ordenar_por = 'dias'        AND     p_ascendente THEN n.dias_parado END) ASC  NULLS LAST,
    (CASE WHEN p_ordenar_por = 'negocio'     AND NOT p_ascendente THEN lower(n.nome) END) DESC NULLS LAST,
    (CASE WHEN p_ordenar_por = 'negocio'     AND     p_ascendente THEN lower(n.nome) END) ASC  NULLS LAST,
    (CASE WHEN p_ordenar_por = 'fabricante'  AND NOT p_ascendente THEN lower(n.fabrica) END) DESC NULLS LAST,
    (CASE WHEN p_ordenar_por = 'fabricante'  AND     p_ascendente THEN lower(n.fabrica) END) ASC  NULLS LAST,
    (CASE WHEN p_ordenar_por = 'etapa'       AND NOT p_ascendente THEN lower(n.etapa) END) DESC NULLS LAST,
    (CASE WHEN p_ordenar_por = 'etapa'       AND     p_ascendente THEN lower(n.etapa) END) ASC  NULLS LAST,
    (CASE WHEN p_ordenar_por = 'responsavel' AND NOT p_ascendente THEN lower(n.responsavel) END) DESC NULLS LAST,
    (CASE WHEN p_ordenar_por = 'responsavel' AND     p_ascendente THEN lower(n.responsavel) END) ASC  NULLS LAST,
    n.valor DESC NULLS LAST,
    n.id;
$function$;

REVOKE ALL ON FUNCTION public.negocios_em_risco(uuid[], uuid[], uuid, integer, text[], integer, integer, date, date, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.negocios_em_risco(uuid[], uuid[], uuid, integer, text[], integer, integer, date, date, text, boolean) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- dashboard_negocios_risco — os três cartões e os resumos. Ganha o período opcional.
-- ----------------------------------------------------------------------------
CREATE FUNCTION public.dashboard_negocios_risco(p_usuario_ids uuid[] DEFAULT NULL::uuid[], p_fabricante_ids uuid[] DEFAULT NULL::uuid[], p_funil_id uuid DEFAULT NULL::uuid, p_dias_parado integer DEFAULT 7, p_etapas text[] DEFAULT NULL::text[], p_data_de date DEFAULT NULL::date, p_data_ate date DEFAULT NULL::date)
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

GRANT EXECUTE ON FUNCTION public.dashboard_negocios_risco(uuid[], uuid[], uuid, integer, text[], date, date) TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- pauta_resumo_destinatarios — exclui quem o gestor tirou. Mesma assinatura -> CREATE OR REPLACE.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pauta_resumo_destinatarios()
 RETURNS TABLE(usuario_id uuid, nome text, email text, empresa_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_dow integer;
begin
  v_dow := extract(dow from (now() at time zone 'America/Sao_Paulo'))::integer;

  return query
  select u.id, u.nome, a.email::text, u.empresa_id
  from usuarios u
  join auth.users a on a.id = u.user_id
  where u.deleted_at is null
    and a.email is not null
    and empresa_tem_secao_de(u.empresa_id, 'hoje')
    and coalesce(
      (select (c.valor #>> '{}')::boolean from configuracoes_automacao c
        where c.empresa_id = u.empresa_id and c.chave = 'pauta_resumo_email'),
      false)
    and v_dow = any(
      coalesce(
        (select array(select jsonb_array_elements_text(c.valor)::integer)
           from configuracoes_automacao c
          where c.empresa_id = u.empresa_id and c.chave = 'pauta_dias_da_semana'),
        array[1, 2, 3, 4, 5])
    )
    -- 🔴 NOVO (15/09/2026): o gestor pode tirar pessoas do e-mail. `pauta_resumo_excluidos` é uma
    -- lista de `usuarios.id` por empresa; ausência/vazia = todos recebem (o padrão), inclusive quem
    -- entra na equipe depois. A regra vive AQUI, no servidor — esconder na tela não bastaria (§6.1).
    and u.id <> all(
      coalesce(
        (select array(select jsonb_array_elements_text(c.valor)::uuid)
           from configuracoes_automacao c
          where c.empresa_id = u.empresa_id and c.chave = 'pauta_resumo_excluidos'),
        '{}'::uuid[])
    );
end;
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;
