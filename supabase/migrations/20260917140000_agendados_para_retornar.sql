-- ============================================================================
-- FAIXA "AGENDADOS PARA RETORNAR" — funções de leitura + o "trazer de volta"
-- ============================================================================
-- Os negócios adiados por "Retomar depois" (historico_contatos tipo='retorno' com
-- proximo_contato_em >= hoje) ganham uma vitrine própria na tela "Hoje". Três funções novas:
--
--   · negocios_agendados_de / negocios_agendados — a lista paginada, no padrão da tabela do time
--     (negocios_em_risco_de). Traz a data de retorno (max futuro) em vez de "dias parado".
--   · dashboard_agendados — o resumo (quantidade, valor guardado, e o resumo POR VENDEDOR, este
--     só para quem vê a pauta toda — cortado no servidor, como dashboard_negocios_risco faz).
--   · cancelar_retorno — desfaz o "Retomar depois" ATIVO: apaga o(s) registro(s) de retorno com
--     data futura e a tarefa que eles criaram, devolvendo o negócio a "pedem atenção" e a
--     contagem de tentativas ao número anterior. SECURITY DEFINER, com as guardas do
--     registrar_retorno. É a única que apaga dado, e só quando o usuário manda.
--
-- Nenhuma tabela nova. Desenho: docs/superpowers/specs/2026-09-17-agendados-para-retornar-design.md
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. negocios_agendados_de — a lista, para um usuário explícito (fechada)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.negocios_agendados_de(
  p_usuario_id uuid,
  p_usuario_ids uuid[] DEFAULT NULL::uuid[],
  p_fabricante_ids uuid[] DEFAULT NULL::uuid[],
  p_funil_id uuid DEFAULT NULL::uuid,
  p_etapas text[] DEFAULT NULL::text[],
  p_limite integer DEFAULT 10,
  p_deslocamento integer DEFAULT 0,
  p_ordenar_por text DEFAULT 'data_retorno'::text,
  p_ascendente boolean DEFAULT true
)
 RETURNS TABLE(id uuid, nome text, fabrica text, etapa text, responsavel text, valor numeric, data_retorno date, total_geral bigint, valor_geral numeric, responsavel_id uuid, responsavel_avatar text, tentativas integer)
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
      (SELECT count(*)::int FROM public.historico_contatos hc2
        WHERE hc2.pedido_id = p.id AND hc2.tipo = 'retorno') AS tentativas,
      -- proximo_contato_em é timestamptz gravado como meia-noite UTC da data (registrar_retorno
      -- insere um `date`); ler AT TIME ZONE 'UTC' recupera a data pretendida sem recuar um dia (§7.12).
      (SELECT (max(hc.proximo_contato_em) AT TIME ZONE 'UTC')::date FROM public.historico_contatos hc, hoje
        WHERE hc.pedido_id = p.id AND hc.tipo = 'retorno' AND hc.proximo_contato_em >= hoje.d) AS data_retorno
    FROM public.pedidos p
    JOIN gente g ON g.id = p.usuario_id
    LEFT JOIN public.usuarios u ON u.id = p.usuario_id
    LEFT JOIN public.fabricantes f ON f.id = p.fabricante_id
    LEFT JOIN public.kanban_colunas k ON k.slug = p.status AND k.empresa_id = u.empresa_id AND k.funil_id = p.funil_id
    WHERE p.status NOT IN ('fechamento', 'perdido')
      AND (p_usuario_ids    IS NULL OR p.usuario_id    = ANY(p_usuario_ids))
      AND (p_fabricante_ids IS NULL OR p.fabricante_id = ANY(p_fabricante_ids))
      AND (p_funil_id       IS NULL OR p.funil_id      = p_funil_id)
      AND (p_etapas         IS NULL OR p.status        = ANY(p_etapas))
  ),
  meus AS (
    SELECT * FROM abertos a
    WHERE a.data_retorno IS NOT NULL
      AND (
        (SELECT public.ve_pauta_de_todos(p_usuario_id))
        OR a.usuario_id = p_usuario_id
      )
  )
  SELECT
    pagina.id,
    pagina.nome_exibido,
    pagina.fabricante_nome,
    pagina.etapa_label,
    pagina.vendedor_nome,
    pagina.valor_total,
    pagina.data_retorno,
    pagina.total_geral,
    pagina.valor_geral,
    pagina.usuario_id,
    pagina.vendedor_avatar,
    pagina.tentativas
  FROM (
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
    ORDER BY
      (CASE WHEN p_ordenar_por = 'valor'        AND NOT p_ascendente THEN m.valor_total END) DESC NULLS LAST,
      (CASE WHEN p_ordenar_por = 'valor'        AND     p_ascendente THEN m.valor_total END) ASC  NULLS LAST,
      (CASE WHEN p_ordenar_por = 'data_retorno' AND NOT p_ascendente THEN m.data_retorno END) DESC NULLS LAST,
      (CASE WHEN p_ordenar_por = 'data_retorno' AND     p_ascendente THEN m.data_retorno END) ASC  NULLS LAST,
      (CASE WHEN p_ordenar_por = 'negocio'      AND NOT p_ascendente THEN lower(coalesce(nullif(trim(m.nome),''), nullif(trim(m.campos_extras ->> 'Negócio'),''), nullif(trim(cl.empresa),'') || coalesce(' | ' || m.fabricante_nome,''), 'Negócio sem nome')) END) DESC NULLS LAST,
      (CASE WHEN p_ordenar_por = 'negocio'      AND     p_ascendente THEN lower(coalesce(nullif(trim(m.nome),''), nullif(trim(m.campos_extras ->> 'Negócio'),''), nullif(trim(cl.empresa),'') || coalesce(' | ' || m.fabricante_nome,''), 'Negócio sem nome')) END) ASC  NULLS LAST,
      (CASE WHEN p_ordenar_por = 'fabricante'   AND NOT p_ascendente THEN lower(m.fabricante_nome) END) DESC NULLS LAST,
      (CASE WHEN p_ordenar_por = 'fabricante'   AND     p_ascendente THEN lower(m.fabricante_nome) END) ASC  NULLS LAST,
      (CASE WHEN p_ordenar_por = 'etapa'        AND NOT p_ascendente THEN lower(m.etapa_label) END) DESC NULLS LAST,
      (CASE WHEN p_ordenar_por = 'etapa'        AND     p_ascendente THEN lower(m.etapa_label) END) ASC  NULLS LAST,
      (CASE WHEN p_ordenar_por = 'responsavel'  AND NOT p_ascendente THEN lower(m.vendedor_nome) END) DESC NULLS LAST,
      (CASE WHEN p_ordenar_por = 'responsavel'  AND     p_ascendente THEN lower(m.vendedor_nome) END) ASC  NULLS LAST,
      m.data_retorno ASC NULLS LAST,
      m.id
    OFFSET greatest(p_deslocamento, 0)
    LIMIT greatest(least(p_limite, 100), 1)
  ) pagina
  ORDER BY
    (CASE WHEN p_ordenar_por = 'valor'        AND NOT p_ascendente THEN pagina.valor_total END) DESC NULLS LAST,
    (CASE WHEN p_ordenar_por = 'valor'        AND     p_ascendente THEN pagina.valor_total END) ASC  NULLS LAST,
    (CASE WHEN p_ordenar_por = 'data_retorno' AND NOT p_ascendente THEN pagina.data_retorno END) DESC NULLS LAST,
    (CASE WHEN p_ordenar_por = 'data_retorno' AND     p_ascendente THEN pagina.data_retorno END) ASC  NULLS LAST,
    (CASE WHEN p_ordenar_por = 'negocio'      AND NOT p_ascendente THEN lower(pagina.nome_exibido) END) DESC NULLS LAST,
    (CASE WHEN p_ordenar_por = 'negocio'      AND     p_ascendente THEN lower(pagina.nome_exibido) END) ASC  NULLS LAST,
    (CASE WHEN p_ordenar_por = 'fabricante'   AND NOT p_ascendente THEN lower(pagina.fabricante_nome) END) DESC NULLS LAST,
    (CASE WHEN p_ordenar_por = 'fabricante'   AND     p_ascendente THEN lower(pagina.fabricante_nome) END) ASC  NULLS LAST,
    (CASE WHEN p_ordenar_por = 'etapa'        AND NOT p_ascendente THEN lower(pagina.etapa_label) END) DESC NULLS LAST,
    (CASE WHEN p_ordenar_por = 'etapa'        AND     p_ascendente THEN lower(pagina.etapa_label) END) ASC  NULLS LAST,
    (CASE WHEN p_ordenar_por = 'responsavel'  AND NOT p_ascendente THEN lower(pagina.vendedor_nome) END) DESC NULLS LAST,
    (CASE WHEN p_ordenar_por = 'responsavel'  AND     p_ascendente THEN lower(pagina.vendedor_nome) END) ASC  NULLS LAST,
    pagina.data_retorno ASC NULLS LAST,
    pagina.id;
$function$;

REVOKE ALL ON FUNCTION public.negocios_agendados_de(uuid, uuid[], uuid[], uuid, text[], integer, integer, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.negocios_agendados_de(uuid, uuid[], uuid[], uuid, text[], integer, integer, text, boolean) TO service_role;

-- ----------------------------------------------------------------------------
-- 2. negocios_agendados — o invólucro da tela (usa quem está logado)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.negocios_agendados(
  p_usuario_ids uuid[] DEFAULT NULL::uuid[],
  p_fabricante_ids uuid[] DEFAULT NULL::uuid[],
  p_funil_id uuid DEFAULT NULL::uuid,
  p_etapas text[] DEFAULT NULL::text[],
  p_limite integer DEFAULT 10,
  p_deslocamento integer DEFAULT 0,
  p_ordenar_por text DEFAULT 'data_retorno'::text,
  p_ascendente boolean DEFAULT true
)
 RETURNS TABLE(id uuid, nome text, fabrica text, etapa text, responsavel text, valor numeric, data_retorno date, total_geral bigint, valor_geral numeric, responsavel_id uuid, responsavel_avatar text, tentativas integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT n.id, n.nome, n.fabrica, n.etapa, n.responsavel, n.valor, n.data_retorno, n.total_geral,
         n.valor_geral, n.responsavel_id, n.responsavel_avatar, n.tentativas
  FROM public.negocios_agendados_de(
         public.get_my_usuario_id(),
         p_usuario_ids, p_fabricante_ids, p_funil_id, p_etapas, p_limite, p_deslocamento,
         p_ordenar_por, p_ascendente
       ) n
  ORDER BY
    (CASE WHEN p_ordenar_por = 'valor'        AND NOT p_ascendente THEN n.valor END) DESC NULLS LAST,
    (CASE WHEN p_ordenar_por = 'valor'        AND     p_ascendente THEN n.valor END) ASC  NULLS LAST,
    (CASE WHEN p_ordenar_por = 'data_retorno' AND NOT p_ascendente THEN n.data_retorno END) DESC NULLS LAST,
    (CASE WHEN p_ordenar_por = 'data_retorno' AND     p_ascendente THEN n.data_retorno END) ASC  NULLS LAST,
    (CASE WHEN p_ordenar_por = 'negocio'      AND NOT p_ascendente THEN lower(n.nome) END) DESC NULLS LAST,
    (CASE WHEN p_ordenar_por = 'negocio'      AND     p_ascendente THEN lower(n.nome) END) ASC  NULLS LAST,
    (CASE WHEN p_ordenar_por = 'fabricante'   AND NOT p_ascendente THEN lower(n.fabrica) END) DESC NULLS LAST,
    (CASE WHEN p_ordenar_por = 'fabricante'   AND     p_ascendente THEN lower(n.fabrica) END) ASC  NULLS LAST,
    (CASE WHEN p_ordenar_por = 'etapa'        AND NOT p_ascendente THEN lower(n.etapa) END) DESC NULLS LAST,
    (CASE WHEN p_ordenar_por = 'etapa'        AND     p_ascendente THEN lower(n.etapa) END) ASC  NULLS LAST,
    (CASE WHEN p_ordenar_por = 'responsavel'  AND NOT p_ascendente THEN lower(n.responsavel) END) DESC NULLS LAST,
    (CASE WHEN p_ordenar_por = 'responsavel'  AND     p_ascendente THEN lower(n.responsavel) END) ASC  NULLS LAST,
    n.data_retorno ASC NULLS LAST,
    n.id;
$function$;

REVOKE ALL ON FUNCTION public.negocios_agendados(uuid[], uuid[], uuid, text[], integer, integer, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.negocios_agendados(uuid[], uuid[], uuid, text[], integer, integer, text, boolean) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. dashboard_agendados — resumo (linha fechada) + resumo por vendedor (só gestor)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dashboard_agendados(
  p_usuario_ids uuid[] DEFAULT NULL::uuid[],
  p_fabricante_ids uuid[] DEFAULT NULL::uuid[],
  p_funil_id uuid DEFAULT NULL::uuid,
  p_etapas text[] DEFAULT NULL::text[]
)
 RETURNS TABLE(qtd_total bigint, valor_total numeric, agendados_por_vendedor jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH hoje AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d),
  abertos AS (
    SELECT p.id, p.usuario_id, p.valor_total, u.nome AS vendedor_nome
    FROM public.pedidos p
    LEFT JOIN public.usuarios u ON u.id = p.usuario_id
    WHERE p.status NOT IN ('fechamento', 'perdido')
      AND (
        (SELECT public.eu_vejo_pauta_de_todos())
        OR p.usuario_id = (SELECT public.get_my_usuario_id())
      )
      AND (p_usuario_ids    IS NULL OR p.usuario_id    = ANY(p_usuario_ids))
      AND (p_fabricante_ids IS NULL OR p.fabricante_id = ANY(p_fabricante_ids))
      AND (p_funil_id       IS NULL OR p.funil_id      = p_funil_id)
      AND (p_etapas         IS NULL OR p.status        = ANY(p_etapas))
      AND EXISTS (
        SELECT 1 FROM public.historico_contatos hc, hoje
        WHERE hc.pedido_id = p.id AND hc.tipo = 'retorno' AND hc.proximo_contato_em >= hoje.d
      )
  )
  SELECT
    (SELECT count(*) FROM abertos)::bigint,
    (SELECT coalesce(sum(valor_total), 0) FROM abertos)::numeric,
    CASE WHEN public.eu_vejo_pauta_de_todos() THEN (
      SELECT coalesce(jsonb_agg(jsonb_build_object('vendedor', vendedor_nome, 'qtd', qtd, 'valor', total) ORDER BY total DESC), '[]'::jsonb)
      FROM (
        SELECT vendedor_nome, count(*) AS qtd, sum(valor_total) AS total
        FROM abertos WHERE vendedor_nome IS NOT NULL
        GROUP BY vendedor_nome
      ) v
    ) ELSE '[]'::jsonb END;
$function$;

REVOKE ALL ON FUNCTION public.dashboard_agendados(uuid[], uuid[], uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dashboard_agendados(uuid[], uuid[], uuid, text[]) TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. cancelar_retorno — "Trazer de volta agora" (desfaz o "Retomar depois" ativo)
-- ----------------------------------------------------------------------------
-- Apaga o(s) registro(s) de retorno com data FUTURA (o agendamento ativo) e a tarefa que eles
-- criaram (título "Retomar contato %", aberta, prazo na data do retorno removido — para não tocar
-- tarefa manual nem de outro negócio). Não mexe nos retornos passados (as tentativas antigas
-- continuam contando). SECURITY DEFINER com as guardas do registrar_retorno.
CREATE OR REPLACE FUNCTION public.cancelar_retorno(p_pedido_id uuid)
 RETURNS TABLE(retornos_removidos integer, tarefas_removidas integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_r int; v_t int; v_datas date[];
begin
  if not public.empresa_plano_ativo() then
    raise exception 'O acesso da sua empresa está bloqueado, então nada é alterado.'
      using errcode = '42501';
  end if;
  if not public.posso_agir_no_negocio(p_pedido_id) then
    raise exception 'Você não pode alterar este negócio.' using errcode = '42501';
  end if;

  -- As datas dos retornos futuros a desfazer (para casar a tarefa certa). proximo_contato_em é
  -- meia-noite UTC da data; a tarefa guarda prazo às 09:00 de São Paulo — as duas viram a mesma
  -- data quando lidas cada uma no seu fuso de origem.
  select array_agg(distinct (hc.proximo_contato_em at time zone 'UTC')::date)
    into v_datas
    from public.historico_contatos hc
   where hc.pedido_id = p_pedido_id and hc.tipo = 'retorno'
     and hc.proximo_contato_em >= v_hoje;

  delete from public.historico_contatos hc
   where hc.pedido_id = p_pedido_id and hc.tipo = 'retorno'
     and hc.proximo_contato_em >= v_hoje;
  get diagnostics v_r = row_count;

  if v_r = 0 then
    raise exception 'Não havia agendamento futuro para desfazer neste negócio.'
      using errcode = 'P0001';
  end if;

  -- A tarefa que o "Retomar depois" criou.
  delete from public.tarefas t
   where t.pedido_id = p_pedido_id
     and coalesce(t.status,'') <> 'concluida'
     and t.titulo like 'Retomar contato %'
     and (t.prazo_final at time zone 'America/Sao_Paulo')::date = any(v_datas);
  get diagnostics v_t = row_count;

  return query select v_r, v_t;
end;
$function$;

REVOKE ALL ON FUNCTION public.cancelar_retorno(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancelar_retorno(uuid) TO authenticated, service_role;

COMMIT;
