-- Aplicada em tres partes (o arquivo unico estourou o tempo limite). As
-- versoes registradas no banco sao 20260804134805 / 134921 / 134949, e os
-- nomes destes arquivos as espelham para o `supabase db push` reconhecer como
-- ja aplicadas em vez de reexecutar.

-- ---------------------------------------------------------------------------
-- 3. Usuários de uma empresa
-- ---------------------------------------------------------------------------
-- Responde a pergunta que o agregado não responde: a equipe adotou, ou só o
-- dono entra? Uma empresa com 12 usuários e 1 ativo é risco de churn mesmo
-- pagando em dia.
CREATE OR REPLACE FUNCTION public.admin_empresa_usuarios(p_empresa_id UUID)
RETURNS TABLE (
  usuario_id UUID,
  nome TEXT,
  email TEXT,
  role TEXT,
  criado_em TIMESTAMPTZ,
  ultimo_acesso TIMESTAMPTZ,
  suspenso BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas o administrador global pode consultar usuários de outra empresa.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT u.id, u.nome, u.email, u.role, u.created_at,
         au.last_sign_in_at,
         (u.deleted_at IS NOT NULL)
  FROM public.usuarios u
  LEFT JOIN auth.users au ON au.id = u.user_id
  WHERE u.empresa_id = p_empresa_id
  ORDER BY au.last_sign_in_at DESC NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_empresa_usuarios(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_empresa_usuarios(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Liberar / bloquear acesso
-- ---------------------------------------------------------------------------
-- empresa_assinaturas não tem policy de escrita, e o REVOKE tirou INSERT/UPDATE/
-- DELETE de authenticated. Isso foi deliberado e continua valendo: esta função é
-- a ÚNICA porta de escrita, e ela exige is_admin() no corpo. Ninguém ganha
-- permissão de tabela para o painel funcionar.
CREATE OR REPLACE FUNCTION public.admin_definir_plano(
  p_empresa_id UUID,
  p_acao TEXT,
  p_dias INTEGER DEFAULT 7
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_origem TEXT;
  v_fim TIMESTAMPTZ;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas o administrador global pode alterar o plano de uma empresa.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.empresas WHERE id = p_empresa_id) THEN
    RAISE EXCEPTION 'Empresa não encontrada.' USING ERRCODE = '42704';
  END IF;

  CASE p_acao
    WHEN 'trial' THEN
      IF p_dias IS NULL OR p_dias < 1 OR p_dias > 90 THEN
        RAISE EXCEPTION 'O teste precisa ser de 1 a 90 dias.' USING ERRCODE = '22023';
      END IF;
      v_status := 'trialing';
      v_origem := 'trial';
      v_fim := now() + make_interval(days => p_dias);

    WHEN 'cortesia' THEN
      -- 'cortesia' e não 'legacy': legacy identifica quem já usava o sistema
      -- antes de existir cobrança. Misturar os dois apagaria a distinção entre
      -- "herdou" e "foi liberado", que é justamente o que o painel precisa
      -- mostrar.
      v_status := 'active';
      v_origem := 'cortesia';
      v_fim := NULL;

    WHEN 'bloquear' THEN
      v_status := 'inactive';
      v_origem := NULL;  -- preserva a origem atual: como chegou aqui importa
      v_fim := NULL;

    ELSE
      RAISE EXCEPTION 'Ação inválida: %', p_acao USING ERRCODE = '22023';
  END CASE;

  INSERT INTO public.empresa_assinaturas (empresa_id, plan_status, origem, current_period_end, ativado_em)
  VALUES (
    p_empresa_id,
    v_status,
    COALESCE(v_origem, 'stripe'),
    v_fim,
    CASE WHEN v_status IN ('active', 'trialing') THEN now() ELSE NULL END
  )
  ON CONFLICT (empresa_id) DO UPDATE SET
    plan_status = EXCLUDED.plan_status,
    origem = COALESCE(v_origem, public.empresa_assinaturas.origem),
    current_period_end = v_fim,
    ativado_em = CASE
      WHEN v_status IN ('active', 'trialing')
        THEN COALESCE(public.empresa_assinaturas.ativado_em, now())
      ELSE public.empresa_assinaturas.ativado_em
    END;

  RETURN jsonb_build_object(
    'empresa_id', p_empresa_id,
    'plan_status', v_status,
    'origem', COALESCE(v_origem, 'mantida'),
    'current_period_end', v_fim
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_definir_plano(UUID, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_definir_plano(UUID, TEXT, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.admin_empresas_cs() IS
  'Panorama de CS das empresas. SECURITY DEFINER para alcançar auth.users.last_sign_in_at; exige is_admin() no corpo.';
COMMENT ON FUNCTION public.admin_definir_plano(UUID, TEXT, INTEGER) IS
  'Única porta de escrita em empresa_assinaturas fora do webhook do Stripe. Ações: trial, cortesia, bloquear.';
