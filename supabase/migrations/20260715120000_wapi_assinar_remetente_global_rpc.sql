-- Aplica a preferência "assinar remetente" do WhatsApp em TODAS as empresas de uma vez.
--
-- Contexto: whatsapp_assinar_remetente é uma coluna por empresa (empresas). Por isso o
-- toggle da tela Configurações -> WhatsApp só afetava a empresa do usuário logado
-- (update ... eq('id', empresa_do_caller)). O objetivo passa a ser: um ajuste vale para
-- todas as empresas, independentemente da conta/role de quem está logado.
--
-- Solução: RPC SECURITY DEFINER que grava o valor em todas as empresas de uma vez,
-- ignorando o RLS de UPDATE de empresas (que restringe a is_admin() OR owner_id).
-- A permissão é validada explicitamente dentro da função (is_admin() OR is_gestor()),
-- mesmo padrão de gate usado em configuracoes_automacao.

CREATE OR REPLACE FUNCTION public.set_whatsapp_assinar_remetente_global(p_valor boolean)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_afetadas integer;
BEGIN
  IF NOT (public.is_admin() OR public.is_gestor()) THEN
    RAISE EXCEPTION 'Sem permissão para alterar a configuração global de WhatsApp';
  END IF;

  UPDATE public.empresas
    SET whatsapp_assinar_remetente = p_valor;

  GET DIAGNOSTICS v_afetadas = ROW_COUNT;
  RETURN v_afetadas;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_whatsapp_assinar_remetente_global(boolean) TO authenticated;
