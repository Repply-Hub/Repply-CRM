-- ============================================================================
-- A REGRA DE INSERT DE `contatos` PASSA A EXIGIR `empresa_id = a minha empresa`
-- ============================================================================
-- Antes:
--   WITH CHECK ((usuario_id = get_my_usuario_id()) OR usuario_in_my_empresa(usuario_id))
--
-- Isso amarrava o contato ao inquilino só pelo `usuario_id`. Com a coluna
-- `empresa_id` agora obrigatória (20260902152000) e preenchida por trigger a
-- partir do login (20260902151000), a regra passa a cravar também que o
-- `empresa_id` da linha é o da empresa de quem está gravando — nenhum caminho
-- consegue depositar um contato na empresa de outro assinante.
--
-- O `usuario_id` continua tendo que ser de alguém da minha empresa: contato sem
-- dono não entra por aqui (o app agora recusa antes, com "Usuário não
-- encontrado"). Admin global não insere contato (nunca inseriu — não há ramo
-- `is_admin()` nesta política).
--
-- A política RESTRITIVA `contatos_exige_plano_insert` (assinatura ativa) não é
-- tocada e continua valendo em conjunto.
-- ============================================================================

ALTER POLICY contatos_insert ON public.contatos
  WITH CHECK (
    empresa_id = public.get_my_empresa_id()
    AND (
      usuario_id = public.get_my_usuario_id()
      OR public.usuario_in_my_empresa(usuario_id)
    )
  );
