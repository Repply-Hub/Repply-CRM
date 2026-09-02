-- ============================================================================
-- A LEITURA DE `contatos` PARA DE VAZAR CONTATO SEM DONO ENTRE EMPRESAS
-- ============================================================================
-- Antes:
--   USING ((usuario_id = get_my_usuario_id())
--          OR usuario_in_my_empresa(usuario_id)
--          OR (usuario_id IS NULL))          ← sem escopo de empresa
--
-- A terceira cláusula não olhava empresa nenhuma: um contato com `usuario_id`
-- nulo ficava visível para TODAS as empresas do sistema — nome, telefone e
-- e-mail (docs/divida-tecnica.md §58). Medido em 30/08 e de novo em 02/09/2026:
-- zero órfãos hoje, mas três caminhos de código podiam criar um, e um deles
-- (o cadastro pela conversa de WhatsApp) gravava o nulo de propósito.
--
-- Agora que `contatos.empresa_id` existe, é obrigatório e é preenchido por
-- trigger (migrations 20260902150000 / 151000 / 152000), o contato órfão passa a
-- ser recortável: só a empresa dona o enxerga. Um órfão da empresa A continua
-- invisível para a empresa B.
--
-- As duas primeiras cláusulas não mudam — o caminho normal (contato com dono na
-- minha empresa) segue idêntico. Não há ramo `is_admin()` nesta política e ele
-- continua de fora (decisão de 04/08/2026: admin global não vê conteúdo de
-- cliente).
-- ============================================================================

ALTER POLICY contatos_select ON public.contatos
  USING (
    (usuario_id = public.get_my_usuario_id())
    OR public.usuario_in_my_empresa(usuario_id)
    OR (usuario_id IS NULL AND empresa_id = public.get_my_empresa_id())
  );
