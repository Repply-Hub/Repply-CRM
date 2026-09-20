-- ============================================================================
-- A TABELA DO TIME RECEBE QUEM É O DONO E A FOTO DELE
-- ============================================================================
--
-- Pedido do dono do produto em 14/09/2026 (desenho em
-- `docs/superpowers/specs/2026-09-14-hoje-contraste-rostos-e-colunas-design.md`): o rosto do
-- responsável na coluna "Responsável" da tabela do time da tela "Hoje".
--
-- As duas funções passam a devolver duas colunas a mais, NO FIM da lista:
--   · `responsavel_id`     — o `usuarios.id` do dono;
--   · `responsavel_avatar` — o `usuarios.avatar_url` do dono.
-- De brinde, `responsavel_id` resolve o item 69 da dívida técnica: a tela decidia "é meu?"
-- comparando NOMES, e dois homônimos na mesma empresa confundiam a conta.
--
-- NENHUMA REGRA DE QUEM VÊ O QUÊ MUDA. Os corpos abaixo são os que estavam no ar em 14/09/2026,
-- colhidos com `pg_get_functiondef` e conferidos byte a byte pelo md5, com só estas trocas:
--   negocios_em_risco_de — `u.avatar_url AS vendedor_avatar` logo depois de `u.nome AS vendedor_nome`,
--                          em `abertos`; `pagina.usuario_id` e `pagina.vendedor_avatar` no fim do
--                          SELECT final; as duas colunas no fim do RETURNS TABLE.
--   negocios_em_risco    — as duas colunas no fim do RETURNS TABLE e do SELECT.
-- md5(prosrc), antes -> depois:
--   negocios_em_risco_de  dc3e5f918b165fc8c27abfb1bbd40365 (3.149) -> 6bc82788c32cd8f3ee3cc8be39918a9f (3.239)
--   negocios_em_risco     128b6304a969066943f8954776237830 (327)   -> 4068e9627a824d2a2e1233d94ffa3a21 (376)
-- O corpo de `negocios_em_risco_de` no ar tem a mesma lógica do de
-- `20260909130000_negocios_em_risco.sql`, só sem os comentários de dentro do corpo — por isso o md5
-- daquele arquivo não bate com o do banco.
--
-- 🔴 POR QUE `DROP` + `CREATE`, e não `CREATE OR REPLACE`: o Postgres não deixa trocar as colunas
-- de saída de uma função existente. E o `DROP` APAGA A PERMISSÃO EM SILÊNCIO — por isso ela é
-- refeita aqui mesmo, na mesma transação, exatamente como estava (medido em 14/09/2026):
--   negocios_em_risco_de  ->  postgres=X/postgres | service_role=X/postgres
--   negocios_em_risco     ->  postgres=X/postgres | authenticated=X/postgres | service_role=X/postgres
--
-- 🔴 `negocios_em_risco_de` CONTINUA FECHADA PARA O NAVEGADOR. Ela aceita o identificador de
-- QUALQUER pessoa e roda com privilégio, pulando a regra de segurança: aberta a `authenticated`,
-- qualquer um consultaria a carteira de qualquer outro. Só o servidor (o e-mail das 7h) a chama.
-- Função nova nasce executável por PUBLIC e com os privilégios-padrão do projeto (que alcançam
-- `anon` e `authenticated`); o `REVOKE` abaixo tira tudo antes do `GRANT`.
--
-- Compatível com o site no ar: ele chama `negocios_em_risco` com os mesmos parâmetros e ignora as
-- colunas a mais. O e-mail das 7h chama `negocios_em_risco_de` do mesmo jeito.
--
-- `NOTIFY pgrst, 'reload schema'` no fim: a API do banco passa a enxergar as colunas novas na hora.
--
-- PARA VOLTAR ATRÁS: `DROP` das duas e `CREATE` com as definições de antes (a lógica de
-- `20260909130000_negocios_em_risco.sql`), com a MESMA permissão acima. O arquivo de volta, com as
-- definições exatas, é gerado com `pg_get_functiondef` logo antes de aplicar.
-- ============================================================================

BEGIN;

DROP FUNCTION public.negocios_em_risco(uuid[], uuid[], uuid, integer, text[], integer, integer);
DROP FUNCTION public.negocios_em_risco_de(uuid, uuid[], uuid[], uuid, integer, text[], integer, integer);

CREATE FUNCTION public.negocios_em_risco_de(p_usuario_id uuid, p_usuario_ids uuid[] DEFAULT NULL::uuid[], p_fabricante_ids uuid[] DEFAULT NULL::uuid[], p_funil_id uuid DEFAULT NULL::uuid, p_dias_parado integer DEFAULT 7, p_etapas text[] DEFAULT NULL::text[], p_limite integer DEFAULT 10, p_deslocamento integer DEFAULT 0)
 RETURNS TABLE(id uuid, nome text, fabrica text, etapa text, responsavel text, valor numeric, dias_parado integer, total_geral bigint, valor_geral numeric, responsavel_id uuid, responsavel_avatar text)
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
      COALESCE(uh.ultima_atividade, p.created_at) AS ultima_atividade
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
    pagina.total_geral,
    pagina.valor_geral,
    pagina.usuario_id,
    pagina.vendedor_avatar
  FROM (
    SELECT m.*, (count(*) OVER ())::bigint AS total_geral, (sum(m.valor_total) OVER ())::numeric AS valor_geral
    FROM meus m
    ORDER BY m.valor_total DESC NULLS LAST, m.id
    OFFSET greatest(p_deslocamento, 0)
    LIMIT greatest(least(p_limite, 100), 1)
  ) pagina
  LEFT JOIN public.clientes cl ON cl.id = pagina.cliente_id
  ORDER BY pagina.valor_total DESC NULLS LAST, pagina.id;
$function$;

-- 🔴 A permissão de antes, exatamente: só o servidor.
REVOKE ALL ON FUNCTION public.negocios_em_risco_de(uuid, uuid[], uuid[], uuid, integer, text[], integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.negocios_em_risco_de(uuid, uuid[], uuid[], uuid, integer, text[], integer, integer) TO service_role;

CREATE FUNCTION public.negocios_em_risco(p_usuario_ids uuid[] DEFAULT NULL::uuid[], p_fabricante_ids uuid[] DEFAULT NULL::uuid[], p_funil_id uuid DEFAULT NULL::uuid, p_dias_parado integer DEFAULT 7, p_etapas text[] DEFAULT NULL::text[], p_limite integer DEFAULT 10, p_deslocamento integer DEFAULT 0)
 RETURNS TABLE(id uuid, nome text, fabrica text, etapa text, responsavel text, valor numeric, dias_parado integer, total_geral bigint, responsavel_id uuid, responsavel_avatar text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT n.id, n.nome, n.fabrica, n.etapa, n.responsavel, n.valor, n.dias_parado, n.total_geral,
         n.responsavel_id, n.responsavel_avatar
  FROM public.negocios_em_risco_de(
         public.get_my_usuario_id(),
         p_usuario_ids, p_fabricante_ids, p_funil_id, p_dias_parado, p_etapas, p_limite, p_deslocamento
       ) n
  ORDER BY n.valor DESC NULLS LAST, n.id;
$function$;

-- 🔴 A permissão de antes, exatamente: quem está logado e o servidor.
REVOKE ALL ON FUNCTION public.negocios_em_risco(uuid[], uuid[], uuid, integer, text[], integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.negocios_em_risco(uuid[], uuid[], uuid, integer, text[], integer, integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
