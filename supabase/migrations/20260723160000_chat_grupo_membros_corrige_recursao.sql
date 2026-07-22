-- Corrige "infinite recursion detected in policy for relation chat_grupo_membros"
-- introduzido em 20260723140000: a policy chat_grupo_membros_select fazia um EXISTS
-- na própria tabela chat_grupo_membros (gm2) dentro da sua própria USING, então pra
-- avaliar a policy o Postgres precisava reavaliar a mesma policy recursivamente.
--
-- Solução: como já é convenção neste projeto (is_gestor(), usuario_in_my_empresa(),
-- etc.), extrai a checagem de membresia pra uma função SECURITY DEFINER, que roda com
-- privilégios do dono da função e não reaplica RLS da tabela consultada — quebrando o
-- ciclo. As policies de chat_mensagens e chat_grupos também passam a usar a função, no
-- lugar do EXISTS direto em chat_grupo_membros, para não dependerem da avaliação da
-- policy de SELECT dessa tabela.

CREATE OR REPLACE FUNCTION public.is_member_of_grupo(_grupo_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_grupo_membros
    WHERE grupo_id = _grupo_id AND usuario_id = get_my_usuario_id()
  );
$$;

DROP POLICY IF EXISTS chat_select ON public.chat_mensagens;
CREATE POLICY chat_select ON public.chat_mensagens FOR SELECT TO authenticated
  USING (
    is_admin()
    OR (
      empresa_id = get_my_empresa_id()
      AND (
        (grupo_id IS NULL AND recipient_id IS NULL)
        OR usuario_id = get_my_usuario_id()
        OR recipient_id = get_my_usuario_id()
        OR (grupo_id IS NOT NULL AND public.is_member_of_grupo(grupo_id))
      )
    )
  );

DROP POLICY IF EXISTS chat_grupos_select ON public.chat_grupos;
CREATE POLICY chat_grupos_select ON public.chat_grupos FOR SELECT TO authenticated
  USING (
    is_admin()
    OR (
      empresa_id = get_my_empresa_id()
      AND (
        criado_por = get_my_usuario_id()
        OR public.is_member_of_grupo(id)
      )
    )
  );

DROP POLICY IF EXISTS chat_grupo_membros_select ON public.chat_grupo_membros;
CREATE POLICY chat_grupo_membros_select ON public.chat_grupo_membros FOR SELECT TO authenticated
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM public.chat_grupos g
      WHERE g.id = chat_grupo_membros.grupo_id
        AND g.empresa_id = get_my_empresa_id()
        AND (
          g.criado_por = get_my_usuario_id()
          OR public.is_member_of_grupo(g.id)
        )
    )
  );
