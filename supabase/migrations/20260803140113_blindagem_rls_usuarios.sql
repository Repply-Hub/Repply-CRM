-- BLINDAGEM DE PRIVILÉGIOS — pré-requisito de qualquer cobrança.
--
-- Hoje existem dois caminhos pelos quais QUALQUER usuário autenticado vira
-- administrador global, e enquanto eles existirem nenhum controle de assinatura
-- tem valor: basta virar admin para passar por cima de tudo.
--
--   1) A policy usuarios_update (criada em 20260416174744_b3dbd7b7-...sql:195)
--      foi declarada só com USING e sem restrição de coluna. Quando uma policy
--      de UPDATE não tem WITH CHECK, o Postgres reaproveita o USING como
--      verificação da linha nova — e como um dos disjuntos é
--      `user_id = auth.uid()`, a pessoa passa nos dois lados ao editar a
--      própria linha. Na prática:
--          supabase.from('usuarios').update({ role: 'admin' }).eq('user_id', <meu uid>)
--      é suficiente para escalar privilégio pelo PostgREST.
--
--   2) A função restaurar_usuario_por_email (20260630000000_usuarios_soft_delete.sql:8)
--      é SECURITY DEFINER, tem GRANT EXECUTE para authenticated e NÃO faz
--      nenhuma checagem de papel no corpo — ela aceita p_role e p_empresa_id
--      arbitrários. Qualquer usuário logado chama com o próprio e-mail e sai
--      admin de qualquer empresa. Também estava sem SET search_path, o que a
--      deixa exposta a sequestro de resolução de nomes.
--
-- Nenhuma migration posterior corrigiu esses dois pontos. Esta corrige.

-- ---------------------------------------------------------------------------
-- 1. usuarios_update: separa o que a pessoa pode ver do que ela pode gravar
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS usuarios_update ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_update" ON public.usuarios;

CREATE POLICY usuarios_update ON public.usuarios
FOR UPDATE TO authenticated
USING (
  is_admin()
  OR (user_id = auth.uid())
  OR (is_gestor() AND empresa_id = get_my_empresa_id())
)
WITH CHECK (
  is_admin()
  OR (user_id = auth.uid())
  OR (is_gestor() AND empresa_id = get_my_empresa_id())
);

-- O WITH CHECK acima ainda deixaria a própria pessoa gravar qualquer valor na
-- própria linha — inclusive role. Restringir por coluna não é possível em
-- policy, então quem faz isso é o trigger abaixo.

-- ---------------------------------------------------------------------------
-- 2. Trigger que impede auto-promoção
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER de propósito: precisamos do papel real da requisição. Numa
-- função SECURITY DEFINER, current_user viraria o dono da função e a checagem
-- perderia o sentido.
--
-- A regra é estreita: só barra quando quem edita é o DONO da própria linha.
-- Gestor e admin mexendo em outras pessoas seguem funcionando (é assim que a
-- tela de usuários troca o papel de um vendedor), e o service_role — usado pelo
-- webhook de cobrança e pelos triggers de signup, onde auth.uid() é nulo —
-- passa livre.
CREATE OR REPLACE FUNCTION public.impedir_auto_escalacao_usuario()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- Sem usuário autenticado no contexto: signup, trigger interno ou
  -- service_role. Não é caminho de escalação por PostgREST.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Editando a linha de outra pessoa: quem autoriza é a policy.
  IF OLD.user_id IS DISTINCT FROM auth.uid() THEN
    RETURN NEW;
  END IF;

  -- A partir daqui a pessoa está editando a própria linha. Campos de identidade
  -- e de vínculo são imutáveis por ela: pode trocar nome, telefone, avatar e
  -- assinatura de e-mail, mas não o próprio papel nem a empresa a que pertence.
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Não é permitido alterar o próprio papel de acesso.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.empresa_id IS DISTINCT FROM OLD.empresa_id THEN
    RAISE EXCEPTION 'Não é permitido alterar a própria empresa.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Não é permitido alterar o vínculo de autenticação.'
      USING ERRCODE = '42501';
  END IF;

  -- Reativar a si mesmo depois de suspenso também não.
  IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    RAISE EXCEPTION 'Não é permitido alterar o próprio status da conta.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_impedir_auto_escalacao_usuario ON public.usuarios;
CREATE TRIGGER trg_impedir_auto_escalacao_usuario
BEFORE UPDATE ON public.usuarios
FOR EACH ROW EXECUTE FUNCTION public.impedir_auto_escalacao_usuario();

-- ---------------------------------------------------------------------------
-- 3. restaurar_usuario_por_email: exigir autorização de verdade
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restaurar_usuario_por_email(
  p_email TEXT,
  p_nome TEXT,
  p_role TEXT,
  p_empresa_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_usuario_id UUID;
  v_existing RECORD;
  v_minha_empresa UUID;
BEGIN
  -- A função roda como dono (SECURITY DEFINER) e escreve papel e empresa: sem
  -- checagem no corpo, ela é um caminho aberto de escalação para qualquer
  -- authenticated, já que o GRANT é para todos eles.
  IF NOT (is_admin() OR is_gestor()) THEN
    RAISE EXCEPTION 'Sem permissão para restaurar usuários.' USING ERRCODE = '42501';
  END IF;

  -- Só o admin global cria/restaura outro admin.
  IF p_role = 'admin' AND NOT is_admin() THEN
    RAISE EXCEPTION 'Sem permissão para conceder acesso de administrador.' USING ERRCODE = '42501';
  END IF;

  -- Gestor age apenas dentro da própria empresa.
  IF NOT is_admin() THEN
    v_minha_empresa := get_my_empresa_id();
    IF p_empresa_id IS DISTINCT FROM v_minha_empresa THEN
      RAISE EXCEPTION 'Sem permissão para vincular usuários a outra empresa.' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = p_email
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Nenhuma conta de acesso encontrada com esse email.');
  END IF;

  SELECT * INTO v_existing
  FROM usuarios
  WHERE user_id = v_user_id
  LIMIT 1;

  -- Gestor também não pode sequestrar alguém que hoje pertence a outra empresa.
  IF v_existing.id IS NOT NULL AND NOT is_admin()
     AND v_existing.empresa_id IS DISTINCT FROM v_minha_empresa THEN
    RAISE EXCEPTION 'Este usuário pertence a outra empresa.' USING ERRCODE = '42501';
  END IF;

  IF v_existing.id IS NOT NULL THEN
    UPDATE usuarios
    SET deleted_at = NULL,
        nome = COALESCE(p_nome, v_existing.nome),
        role = COALESCE(p_role, v_existing.role),
        empresa_id = COALESCE(p_empresa_id, v_existing.empresa_id)
    WHERE id = v_existing.id;

    RETURN jsonb_build_object('action', 'restored', 'id', v_existing.id, 'user_id', v_user_id);
  ELSE
    INSERT INTO usuarios (user_id, email, nome, role, empresa_id)
    VALUES (v_user_id, p_email, p_nome, p_role, p_empresa_id)
    RETURNING id INTO v_usuario_id;

    RETURN jsonb_build_object('action', 'created', 'id', v_usuario_id, 'user_id', v_user_id);
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. usuarios_select: garantir que a pessoa sempre leia a própria linha
-- ---------------------------------------------------------------------------
-- O predicado atual é `is_admin() OR empresa_id = get_my_empresa_id()`. Quem
-- está com empresa_id nulo — o caso de quem se cadastrou com código inválido —
-- não satisfaz nenhum dos dois, porque NULL = NULL não é verdadeiro em SQL.
-- Resultado: a pessoa não consegue ler o próprio perfil, o front recebe zero
-- linhas e o ProtectedRoute trata isso como sessão órfã, deslogando em laço.
DROP POLICY IF EXISTS usuarios_select ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_select" ON public.usuarios;

CREATE POLICY usuarios_select ON public.usuarios
FOR SELECT TO authenticated
USING (
  is_admin()
  OR (user_id = auth.uid())
  OR (empresa_id IS NOT NULL AND empresa_id = get_my_empresa_id())
);
