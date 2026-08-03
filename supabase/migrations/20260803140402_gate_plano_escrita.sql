-- GATE DE PLANO NO BANCO — a barreira que o front sozinho não dá.
--
-- O redirecionamento para /assinar é conveniência de navegação: quem bloquear a
-- requisição do perfil no navegador contorna. Enquanto o banco não souber de
-- plano nenhum, a cobrança é decorativa. Esta migration é o pré-requisito para
-- ligar VITE_PAYWALL_ATIVO.
--
-- POR QUE POLICIES RESTRITIVAS, E NÃO REESCREVER AS EXISTENTES:
-- as policies permissivas se somam com OR; as restritivas se somam com AND, e o
-- Postgres exige que TODAS as restritivas passem além de pelo menos uma
-- permissiva. Isso permite acrescentar a condição de plano sem ler, sem repetir
-- e sem sobrescrever os predicados atuais — o que importa porque este
-- repositório tem redefinições concorrentes das mesmas policies e o banco tem
-- objetos que nenhuma migration descreve (cinco colunas de `empresas`, por
-- exemplo). Reescrever à mão correria o risco de aplicar uma versão velha.
--
-- ESCOPO: só INSERT e UPDATE. A leitura continua livre de propósito — um cliente
-- inadimplente precisa ver que os dados dele estão lá, intactos, esperando o
-- pagamento. Bloquear SELECT faria parecer perda de dados e geraria pânico.
-- DELETE também fica livre: impedir alguém de apagar os próprios dados não
-- protege receita nenhuma.
--
-- Nenhuma destas tabelas tem coluna empresa_id — o vínculo é por usuario_id.
-- Por isso o predicado usa empresa_plano_ativo(), que resolve a empresa a partir
-- do usuário autenticado, em vez de comparar colunas.
--
-- O SELECT em volta da chamada não é estilo: faz o planner tratar o resultado
-- como InitPlan e avaliar uma vez por comando, em vez de uma vez por linha.

-- pedidos
DROP POLICY IF EXISTS pedidos_exige_plano_insert ON public.pedidos;
CREATE POLICY pedidos_exige_plano_insert ON public.pedidos
AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK ((SELECT public.empresa_plano_ativo()));

DROP POLICY IF EXISTS pedidos_exige_plano_update ON public.pedidos;
CREATE POLICY pedidos_exige_plano_update ON public.pedidos
AS RESTRICTIVE FOR UPDATE TO authenticated
USING ((SELECT public.empresa_plano_ativo()));

-- clientes
DROP POLICY IF EXISTS clientes_exige_plano_insert ON public.clientes;
CREATE POLICY clientes_exige_plano_insert ON public.clientes
AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK ((SELECT public.empresa_plano_ativo()));

DROP POLICY IF EXISTS clientes_exige_plano_update ON public.clientes;
CREATE POLICY clientes_exige_plano_update ON public.clientes
AS RESTRICTIVE FOR UPDATE TO authenticated
USING ((SELECT public.empresa_plano_ativo()));

-- contatos
DROP POLICY IF EXISTS contatos_exige_plano_insert ON public.contatos;
CREATE POLICY contatos_exige_plano_insert ON public.contatos
AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK ((SELECT public.empresa_plano_ativo()));

DROP POLICY IF EXISTS contatos_exige_plano_update ON public.contatos;
CREATE POLICY contatos_exige_plano_update ON public.contatos
AS RESTRICTIVE FOR UPDATE TO authenticated
USING ((SELECT public.empresa_plano_ativo()));

-- obras
DROP POLICY IF EXISTS obras_exige_plano_insert ON public.obras;
CREATE POLICY obras_exige_plano_insert ON public.obras
AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK ((SELECT public.empresa_plano_ativo()));

DROP POLICY IF EXISTS obras_exige_plano_update ON public.obras;
CREATE POLICY obras_exige_plano_update ON public.obras
AS RESTRICTIVE FOR UPDATE TO authenticated
USING ((SELECT public.empresa_plano_ativo()));

-- NÃO incluídas de propósito:
--   usuarios              — bloquear deixaria a empresa sem conseguir arrumar o
--                           próprio cadastro, e a linha de assinatura é de outra
--                           tabela mesmo.
--   empresa_assinaturas   — já é somente leitura para authenticated.
--   sidebar_preferences,
--   notificacoes, etc.    — preferências de interface e ruído operacional; travar
--                           isso irrita sem proteger receita.
