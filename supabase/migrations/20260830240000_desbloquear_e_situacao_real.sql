-- ============================================================================
-- Reverter o bloqueio, e dizer no painel o estado de verdade de cada empresa.
--
-- 🔴 DOIS DEFEITOS RELATADOS PELO LUCAS EM 30/08/2026, com a mesma raiz:
--
--   "lá do painel do admin não tem opção de estar revertendo essa exclusão. o mesmo vale
--    para o bloqueio, não existe a opção de estar revertendo esse bloqueio"
--
--   "em ambas as situações lá na direita ainda continua com avisos como 'cadastrou, não
--    pagou', 'cortesia', etc, não falava sobre o real estado atual do cliente"
--
-- A raiz é que BLOQUEAR NÃO DEIXAVA RASTRO. `admin_definir_plano('bloquear')` só gravava
-- `plan_status = 'inactive'` — o MESMO estado de quem se cadastrou e nunca pagou. Depois do
-- clique, banco e tela ficavam sem como distinguir as duas coisas:
--
--   · o painel classificava a empresa bloqueada como "Cadastrou, não pagou" (era o que os
--     dados diziam), e a empresa de cortesia bloqueada seguia escrita "Cortesia", porque
--     `origem` continuava valendo;
--   · e desbloquear era impossível de fazer certo, porque ninguém sabia para onde voltar.
--     Dar cortesia a um cliente PAGANTE bloqueado por engano o transformaria em cliente de
--     graça, em silêncio.
--
-- A correção é guardar o estado anterior no momento do bloqueio — exatamente o desenho que
-- `empresa_exclusoes` já usa para o excluir/restaurar, aprovado em 30/08.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. O rastro do bloqueio
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.empresa_bloqueios (
  empresa_id    uuid primary key references public.empresas(id) on delete cascade,
  bloqueada_em  timestamptz not null default now(),
  bloqueada_por uuid references auth.users(id) on delete set null,
  motivo        text,
  -- O que a assinatura era ANTES do bloqueio. É o que o desbloquear devolve.
  estado_anterior jsonb not null
);

comment on table public.empresa_bloqueios is
  'Bloqueio vigente de uma empresa, com o estado da assinatura antes dele. A linha some no '
  'desbloqueio. Sem ela, bloquear e "nunca pagou" seriam o mesmo estado no banco.';

alter table public.empresa_bloqueios enable row level security;

-- Só o admin global. A empresa bloqueada não precisa ler isto — o que ela vê vem de
-- `meu_estado_de_cobranca()`, e o motivo interno do bloqueio é conversa de vocês.
drop policy if exists empresa_bloqueios_admin on public.empresa_bloqueios;
create policy empresa_bloqueios_admin on public.empresa_bloqueios
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Bloquear passa a guardar o estado, e nasce o desbloquear
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.admin_definir_plano(
  p_empresa_id uuid, p_acao text, p_dias integer default 7
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_status TEXT; v_origem TEXT; v_fim TIMESTAMPTZ;
  v_estado jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas o administrador global pode alterar o plano de uma empresa.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.empresas WHERE id = p_empresa_id) THEN
    RAISE EXCEPTION 'Empresa nao encontrada.' USING ERRCODE = '42704';
  END IF;

  -- ── Desbloquear: devolve o que estava antes, e nao inventa nada ──────────
  IF p_acao = 'desbloquear' THEN
    SELECT estado_anterior INTO v_estado
    FROM public.empresa_bloqueios WHERE empresa_id = p_empresa_id;

    IF v_estado IS NULL THEN
      -- 🔴 BLOQUEIO ANTIGO, SEM RASTRO. Todo bloqueio feito antes desta mudanca cai aqui.
      -- Nao da para "voltar ao que era" porque ninguem gravou o que era — entao a funcao
      -- segue a UNICA evidencia que sobrou, e recusa quando nem essa existe. Adivinhar aqui
      -- seria transformar um pagante em cortesia (ou o contrario) sem ninguem perceber.
      SELECT jsonb_build_object(
               'plan_status', 'active',
               'origem', a.origem,
               'current_period_end', NULL,
               'inadimplente_desde', NULL,
               'deduzido', true)
        INTO v_estado
      FROM public.empresa_assinaturas a
      WHERE a.empresa_id = p_empresa_id
        AND (a.stripe_subscription_id IS NOT NULL
             OR lower(coalesce(a.origem, '')) IN ('cortesia', 'legacy'));

      IF v_estado IS NULL THEN
        RAISE EXCEPTION
          'Nao ha estado anterior gravado para esta empresa, e ela nunca teve assinatura nem cortesia. Use "Liberar 7 dias" ou "Cortesia" para definir o acesso.'
          USING ERRCODE = '42704';
      END IF;
    END IF;

    UPDATE public.empresa_assinaturas a
       SET plan_status        = coalesce(v_estado->>'plan_status', 'active'),
           origem             = coalesce(v_estado->>'origem', a.origem),
           current_period_end = nullif(v_estado->>'current_period_end', 'null')::timestamptz,
           inadimplente_desde = nullif(v_estado->>'inadimplente_desde', 'null')::timestamptz,
           plano_slug         = coalesce(nullif(v_estado->>'plano_slug', 'null'), a.plano_slug),
           ativado_em         = coalesce(a.ativado_em, now())
     WHERE a.empresa_id = p_empresa_id;

    DELETE FROM public.empresa_bloqueios WHERE empresa_id = p_empresa_id;

    RETURN jsonb_build_object(
      'empresa_id', p_empresa_id,
      'plan_status', coalesce(v_estado->>'plan_status', 'active'),
      'origem', coalesce(v_estado->>'origem', 'mantida'),
      'estado_deduzido', coalesce((v_estado->>'deduzido')::boolean, false));
  END IF;

  CASE p_acao
    WHEN 'trial' THEN
      IF p_dias IS NULL OR p_dias < 1 OR p_dias > 90 THEN
        RAISE EXCEPTION 'O teste precisa ser de 1 a 90 dias.' USING ERRCODE = '22023';
      END IF;
      v_status := 'trialing'; v_origem := 'trial';
      v_fim := now() + make_interval(days => p_dias);
    WHEN 'cortesia' THEN
      v_status := 'active'; v_origem := 'cortesia'; v_fim := NULL;
    WHEN 'bloquear' THEN
      v_status := 'inactive'; v_origem := NULL; v_fim := NULL;

      -- 🔴 GUARDA O ESTADO ANTES DE SOBRESCREVER. O `on conflict do nothing` importa:
      -- bloquear duas vezes seguidas nao pode gravar "inactive" como estado anterior — isso
      -- apagaria o unico registro de que a empresa era pagante.
      INSERT INTO public.empresa_bloqueios (empresa_id, bloqueada_por, estado_anterior)
      SELECT p_empresa_id, auth.uid(),
             jsonb_build_object(
               'plan_status', a.plan_status, 'origem', a.origem,
               'plano_slug', a.plano_slug,
               'current_period_end', a.current_period_end,
               'inadimplente_desde', a.inadimplente_desde)
      FROM public.empresa_assinaturas a WHERE a.empresa_id = p_empresa_id
      ON CONFLICT (empresa_id) DO NOTHING;
    ELSE
      RAISE EXCEPTION 'Acao invalida: %', p_acao USING ERRCODE = '22023';
  END CASE;

  -- Liberar teste ou cortesia TAMBEM desbloqueia. Sem apagar o rastro, o painel continuaria
  -- escrevendo "Bloqueada" em cima de uma empresa que voltou a funcionar.
  IF p_acao IN ('trial', 'cortesia') THEN
    DELETE FROM public.empresa_bloqueios WHERE empresa_id = p_empresa_id;
  END IF;

  INSERT INTO public.empresa_assinaturas (empresa_id, plan_status, origem, current_period_end, ativado_em)
  VALUES (p_empresa_id, v_status, COALESCE(v_origem, 'stripe'), v_fim,
          CASE WHEN v_status IN ('active', 'trialing') THEN now() ELSE NULL END)
  ON CONFLICT (empresa_id) DO UPDATE SET
    plan_status = EXCLUDED.plan_status,
    origem = COALESCE(v_origem, public.empresa_assinaturas.origem),
    current_period_end = v_fim,
    ativado_em = CASE
      WHEN v_status IN ('active', 'trialing')
        THEN COALESCE(public.empresa_assinaturas.ativado_em, now())
      ELSE public.empresa_assinaturas.ativado_em END;

  RETURN jsonb_build_object('empresa_id', p_empresa_id, 'plan_status', v_status,
                            'origem', COALESCE(v_origem, 'mantida'), 'current_period_end', v_fim);
END;
$function$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. O painel passa a receber o estado real
-- ────────────────────────────────────────────────────────────────────────────

-- 🔴 DROP ANTES DO CREATE, e nao e escolha de estilo: o Postgres RECUSA um
-- `create or replace` que mude a lista de colunas devolvidas ("cannot change return type of
-- existing function"). Como aqui entram tres colunas novas, sem o drop a migration falha.
drop function if exists public.admin_empresas_cs();

create function public.admin_empresas_cs()
returns table(
  empresa_id uuid, nome text, codigo_acesso text, criada_em timestamptz,
  plan_status text, origem text, plano_slug text,
  current_period_end timestamptz, cancel_at_period_end boolean,
  tem_customer_stripe boolean, tem_assinatura_stripe boolean, ativado_em timestamptz,
  usuarios bigint, usuarios_ativos_7d bigint, ultimo_acesso timestamptz,
  negocios_30d bigint, wa_msgs_30d bigint, emails_30d bigint,
  -- As tres colunas novas. Sem elas o painel classificava so pelo status da assinatura, e
  -- ficava sem saber que a empresa tinha sido excluida ou bloqueada de proposito.
  excluida_em timestamptz, bloqueada_em timestamptz, inadimplente_desde timestamptz
)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas o administrador global pode consultar as empresas.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH acesso AS (
    SELECT u.empresa_id AS eid, count(*) AS total,
           count(*) FILTER (WHERE au.last_sign_in_at > now() - interval '7 days') AS ativos,
           max(au.last_sign_in_at) AS ultimo
    FROM public.usuarios u JOIN auth.users au ON au.id = u.user_id
    WHERE u.deleted_at IS NULL AND u.empresa_id IS NOT NULL
    GROUP BY u.empresa_id
  ),
  negocios AS (
    SELECT u.empresa_id AS eid, count(*) AS n
    FROM public.pedidos p JOIN public.usuarios u ON u.id = p.usuario_id
    WHERE p.created_at > now() - interval '30 days'
    GROUP BY u.empresa_id
  ),
  wamsg AS (
    SELECT w.empresa_id AS eid, count(*) AS n FROM public.whatsapp_mensagens w
    WHERE w.created_at > now() - interval '30 days' GROUP BY w.empresa_id
  ),
  emmsg AS (
    SELECT m.empresa_id AS eid, count(*) AS n FROM public.email_mensagens m
    WHERE m.criado_em > now() - interval '30 days' GROUP BY m.empresa_id
  )
  SELECT e.id, e.nome, e.codigo_acesso, e.created_at,
         a.plan_status, a.origem, a.plano_slug,
         a.current_period_end, a.cancel_at_period_end,
         (a.stripe_customer_id IS NOT NULL),
         (a.stripe_subscription_id IS NOT NULL),
         a.ativado_em,
         COALESCE(ac.total, 0), COALESCE(ac.ativos, 0), ac.ultimo,
         COALESCE(ng.n, 0), COALESCE(wm.n, 0), COALESCE(em.n, 0),
         x.excluida_em, b.bloqueada_em, a.inadimplente_desde
  FROM public.empresas e
  LEFT JOIN public.empresa_assinaturas a ON a.empresa_id = e.id
  LEFT JOIN public.empresa_exclusoes x ON x.empresa_id = e.id AND x.purgada_em IS NULL
  LEFT JOIN public.empresa_bloqueios b ON b.empresa_id = e.id
  LEFT JOIN acesso ac ON ac.eid = e.id
  LEFT JOIN negocios ng ON ng.eid = e.id
  LEFT JOIN wamsg wm ON wm.eid = e.id
  LEFT JOIN emmsg em ON em.eid = e.id
  ORDER BY ac.ultimo DESC NULLS LAST;
END;
$function$;
