-- ============================================================================
-- Bloquear quem JÁ estava sem acesso não pode gravar o bloqueio como "estado anterior".
--
-- 🔴 O CÍRCULO QUE ISTO FECHA. A migration anterior (20260830240000) fez o bloqueio guardar
-- o plano de antes, para o desbloquear devolver exatamente aquilo. Mas ela guardava sempre,
-- inclusive quando a empresa já estava `inactive` — e aí o "estado anterior" gravado era o
-- próprio bloqueio. Desbloquear devolvia `inactive`: a empresa continuava bloqueada, o botão
-- sumia (o painel deixava de ver bloqueio), e não sobrava caminho nenhum.
--
-- Não é hipótese: é o caminho de quem bloqueia duas vezes por engano, ou bloqueia uma empresa
-- que ainda não tinha ativado. Foi encontrado percorrendo o roteiro de teste do Lucas em
-- 30/08/2026, antes de ele chegar lá.
--
-- A saída é um marcador. Quando não há estado bom a guardar, grava-se `{"deduzir": true}` —
-- que registra o bloqueio (o painel precisa dele para mostrar o botão) sem mentir sobre o
-- passado. No desbloquear ele vale o mesmo que não ter registro: segue a evidência
-- (assinatura no Stripe, ou origem cortesia/legacy) e recusa quando nem essa existe.
--
-- ⚠️ Arquivo novo em vez de editar o 20260830240000, que já estava commitado — regra do
-- CLAUDE.md §6.3. É também o que de fato aconteceu na produção: a correção foi aplicada
-- depois, por cima.
-- ============================================================================

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

  IF p_acao = 'desbloquear' THEN
    SELECT estado_anterior INTO v_estado
    FROM public.empresa_bloqueios WHERE empresa_id = p_empresa_id;

    -- 'deduzir' vem de um bloqueio aplicado sobre uma empresa que JA estava sem acesso: nao
    -- havia estado bom a guardar. Vale o mesmo que nao ter registro nenhum.
    IF v_estado IS NULL OR coalesce((v_estado->>'deduzir')::boolean, false) THEN
      -- Sem estado gravado: segue a unica evidencia que sobrou, e recusa quando nem essa
      -- existe. Adivinhar aqui viraria pagante em cortesia sem ninguem perceber.
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

      -- Guarda o estado ANTES de sobrescrever, com duas guardas separadas.
      --
      -- O `on conflict do nothing`: bloquear duas vezes seguidas nao pode apagar o unico
      -- registro de que a empresa era pagante.
      --
      -- O CASE importa tanto quanto: bloquear uma empresa que JA estava sem acesso nao pode
      -- gravar 'inactive' como "o que ela era antes" — o desbloquear devolveria o proprio
      -- bloqueio, e o botao viraria um circulo.
      INSERT INTO public.empresa_bloqueios (empresa_id, bloqueada_por, estado_anterior)
      SELECT p_empresa_id, auth.uid(),
             CASE
               WHEN a.plan_status IN ('inactive', 'canceled', 'unpaid', 'incomplete_expired')
                 THEN jsonb_build_object('deduzir', true)
               ELSE jsonb_build_object(
                 'plan_status', a.plan_status, 'origem', a.origem,
                 'plano_slug', a.plano_slug,
                 'current_period_end', a.current_period_end,
                 'inadimplente_desde', a.inadimplente_desde)
             END
      FROM public.empresa_assinaturas a WHERE a.empresa_id = p_empresa_id
      ON CONFLICT (empresa_id) DO NOTHING;
    ELSE
      RAISE EXCEPTION 'Acao invalida: %', p_acao USING ERRCODE = '22023';
  END CASE;

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
