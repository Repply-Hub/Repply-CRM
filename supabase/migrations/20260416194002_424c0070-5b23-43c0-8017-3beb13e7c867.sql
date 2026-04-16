DROP POLICY IF EXISTS eventos_insert ON public.eventos;

CREATE POLICY eventos_insert ON public.eventos
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  OR (
    is_gestor()
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.user_id = eventos.user_id
        AND u.empresa_id = public.get_my_empresa_id()
    )
  )
  OR EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.user_id = eventos.user_id
      AND u.empresa_id = public.get_my_empresa_id()
  )
);