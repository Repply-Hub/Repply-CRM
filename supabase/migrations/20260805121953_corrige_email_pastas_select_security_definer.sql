-- A barra lateral ficava VAZIA para quem tinha acesso a um marcador.
--
-- A política de `email_pastas` consultava `email_conta_usuarios` INLINE. Toda
-- subconsulta dentro de uma política passa pela RLS da tabela consultada, e
-- `email_conta_usuarios_select` exige `is_gestor()` — ou seja, o vendedor
-- liberado não conseguia ler a PRÓPRIA linha de liberação, e o EXISTS dava
-- sempre falso.
--
-- Efeito prático: a pessoa via as mensagens do marcador (por
-- `tenho_acesso_a_mensagem`, que é SECURITY DEFINER) mas NENHUMA pasta — barra
-- lateral vazia, sem caminho para chegar ao próprio marcador. Encontrado ao
-- simular a sessão dela e conferir as três tabelas de uma vez.
--
-- É a mesma armadilha corrigida em 20260804212651 para `tenho_acesso_a_caixa`.
-- A lição, que vale para qualquer política nova daqui em diante: dentro de uma
-- política, ler outra tabela protegida SÓ funciona por função SECURITY DEFINER.
CREATE OR REPLACE FUNCTION public.tenho_acesso_a_pasta(
  p_conta_id UUID,
  p_pasta_id TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT public.is_gestor()
    OR EXISTS (
      SELECT 1 FROM public.email_conta_usuarios ecu
      WHERE ecu.conta_id = p_conta_id
        AND ecu.usuario_id = public.get_my_usuario_id()
        -- NULO: caixa inteira, entao toda pasta dela. Preenchido: so aquela.
        AND (ecu.pasta_id IS NULL OR ecu.pasta_id = p_pasta_id)
    );
$fn$;

ALTER POLICY email_pastas_select ON public.email_pastas
  USING (
    empresa_id = public.get_my_empresa_id()
    AND public.tenho_acesso_a_pasta(conta_id, pasta_id)
  );
