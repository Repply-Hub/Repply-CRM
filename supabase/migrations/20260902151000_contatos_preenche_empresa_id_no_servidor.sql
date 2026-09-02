-- ============================================================================
-- `contatos.empresa_id` PASSA A SER PREENCHIDO NO SERVIDOR, NÃO PELO CLIENTE
-- ============================================================================
-- Complemento da migration 20260902150000 (a coluna) e da correção dos hooks de
-- INSERT no mesmo commit.
--
-- POR QUE UM TRIGGER, e não só confiar no app mandar o campo:
--
--   1. São QUATRO caminhos de INSERT em `contatos` (cadastro pela conversa de
--      WhatsApp, cadastro em Clientes, retry de importação, importação em lote).
--      Um trigger cobre os quatro de uma vez — e cobre o próximo, que ainda não
--      existe.
--   2. A importação em lote roda com service role, SEM contexto de login. Nesse
--      caso `get_my_empresa_id()` volta nulo e o trigger cai no plano B: herda a
--      empresa do `usuario_id` que a própria linha já traz.
--   3. É o mesmo desenho já usado em `fabricantes` e `precos` desde 19/08/2026
--      (migration 20260819124247).
--
-- O trigger só ESCREVE quando `empresa_id` vem nulo — se o app um dia mandar o
-- valor certo, ele é respeitado.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.contatos_preenche_empresa_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Caminho normal: a empresa de quem está logado.
  IF NEW.empresa_id IS NULL THEN
    NEW.empresa_id := public.get_my_empresa_id();
  END IF;

  -- Plano B: sem contexto de login (service role da importação em lote) ou login
  -- sem empresa resolvida — herda do dono já gravado na linha.
  IF NEW.empresa_id IS NULL AND NEW.usuario_id IS NOT NULL THEN
    SELECT u.empresa_id INTO NEW.empresa_id
    FROM public.usuarios u
    WHERE u.id = NEW.usuario_id;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.contatos_preenche_empresa_id() IS
  'BEFORE INSERT em contatos: preenche empresa_id a partir do login '
  '(get_my_empresa_id()), com fallback para a empresa do usuario_id da linha. '
  'Existe para nenhum caminho de cadastro conseguir gravar contato sem empresa.';

DROP TRIGGER IF EXISTS trg_contatos_preenche_empresa_id ON public.contatos;
CREATE TRIGGER trg_contatos_preenche_empresa_id
  BEFORE INSERT ON public.contatos
  FOR EACH ROW
  EXECUTE FUNCTION public.contatos_preenche_empresa_id();
