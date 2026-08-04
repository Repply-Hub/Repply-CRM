-- CORRECAO: a funcao nascera SECURITY INVOKER na migration anterior
-- (20260804210842) e isso quebrava POR COMPLETO o compartilhamento da caixa.
--
-- Ela responde "esta pessoa enxerga esta caixa?" consultando
-- email_conta_usuarios. Mas a policy de SELECT dessa tabela exige is_gestor()
-- -- de proposito, para nao-gestor nao ficar sabendo quem tem acesso ao que.
-- Como INVOKER, a consulta interna rodava com os privilegios de quem chamou,
-- entao o vendedor liberado nao conseguia ler a PROPRIA linha de liberacao,
-- o EXISTS dava falso e a funcao devolvia false.
--
-- Reproduzido antes de corrigir, com um vendedor liberado de verdade:
--   linhas de liberacao que ele ve : 0
--   tenho_acesso_a_caixa           : false
--   mensagens que ele ve           : 0
-- Ou seja: marcar a pessoa na tela "Quem tem acesso" nao fazia nada.
--
-- SECURITY DEFINER e o certo aqui, e e o mesmo padrao de is_admin(),
-- is_gestor(), get_my_empresa_id() e usuario_in_my_empresa() -- todas DEFINER
-- porque precisam ler `usuarios`, que o RLS restringe.
--
-- Por que e seguro: a funcao nao devolve DADO, devolve um booleano sobre QUEM
-- ESTA CHAMANDO. Ela nao aceita "usuario" como parametro -- resolve o chamador
-- por get_my_usuario_id(), que sai de auth.uid(). Nao ha como perguntar pelos
-- outros. O SET search_path impede sequestro por schema no caminho.
--
-- Verificado depois da correcao:
--   vendedor liberado      -> 40 mensagens, 1 conta
--   vendedor NAO liberado  ->  0 mensagens, 0 conta
--   gestor da empresa      -> 40 mensagens, 1 conta
--   outra empresa          -> so o proprio arquivo, 0 conta
CREATE OR REPLACE FUNCTION public.tenho_acesso_a_caixa(p_conta_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT
    CASE WHEN p_conta_id IS NULL THEN public.is_gestor()
         ELSE public.is_gestor()
              OR EXISTS (
                SELECT 1 FROM public.email_conta_usuarios ecu
                WHERE ecu.conta_id = p_conta_id
                  AND ecu.usuario_id = public.get_my_usuario_id()
              )
    END;
$fn$;

REVOKE ALL ON FUNCTION public.tenho_acesso_a_caixa(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tenho_acesso_a_caixa(UUID) TO authenticated;
