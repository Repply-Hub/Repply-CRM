-- ============================================================================
-- DONO DE CONTA SO APAGA O CHAT DA PROPRIA EMPRESA
-- ============================================================================
-- A regra `chat_delete` autorizava a exclusao assim:
--
--     usuario_id = get_my_usuario_id()                     <- o autor da mensagem, OK
--     OR exists (select 1 from usuarios
--                 where user_id = auth.uid()
--                   and role = 'empresa')                  <- 🔴 NAO OLHA A LINHA
--
-- O segundo ramo nao menciona a mensagem. Ele e verdadeiro ou falso PARA A PESSOA, e quando e
-- verdadeiro vale para TODAS as linhas da tabela — de todas as empresas. Nao ha nada a somar que
-- corrija isso: a regra restritiva de cobranca (`chat_mensagens_exige_plano_delete`) tambem e
-- por pessoa, nao por linha.
--
-- Medido em producao em 23/09/2026, em transacao desfeita, assumindo a identidade do dono de
-- conta da empresa de DEMONSTRACAO (que tem 20 mensagens proprias e nao le nenhuma das outras):
--
--     ANTES  -> um `delete` sem filtro apagava 748 linhas — o banco inteiro, incluindo as 715
--               do cliente pagante.
--     DEPOIS -> apaga 20, exatamente as da propria empresa.
--
-- Sao 11 contas com role='empresa', em 11 empresas diferentes. Qualquer uma delas fazia isso
-- com uma linha de codigo, sem tela e sem volta. Nao e leitura indevida: e perda de dado do
-- cliente atravessando a fronteira entre inquilinos.
--
-- O QUE MUDA PARA QUEM USA: nada. O produto nao tem tela para apagar mensagem de outra empresa;
-- as duas exclusoes que existem (`use-chat.ts:794` limpar conversa e `:823` excluir a propria
-- mensagem) continuam iguais. O dono de conta segue apagando tudo o que e da empresa dele.
--
-- POR QUE `empresa_id` E NAO UMA SUBCONSULTA: a coluna existe na propria tabela e ja e o que a
-- regra de leitura (`chat_select`) usa. Fica no mesmo idioma do arquivo e nao acrescenta custo
-- por linha.
--
-- Papel e forma preservados: permissiva, `to authenticated`, so DELETE. Sem DROP de outra regra.
-- Rollback: recriar a versao anterior (esta no historico do git).
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS chat_delete ON public.chat_mensagens;

CREATE POLICY chat_delete ON public.chat_mensagens
  FOR DELETE TO authenticated
  USING (
    -- o autor apaga a propria mensagem, onde quer que ela esteja
    usuario_id = public.get_my_usuario_id()
    -- ou o dono da conta apaga qualquer mensagem DA EMPRESA DELE
    OR (
      empresa_id = public.get_my_empresa_id()
      AND EXISTS (
        SELECT 1 FROM public.usuarios
        WHERE user_id = auth.uid() AND role = 'empresa'
      )
    )
  );

COMMIT;
