-- ============================================================================
-- O anexo do PDF passa a ser exigido no passo 2, onde ele agora é preenchido
-- ============================================================================
--
-- 🔴 CONSERTO DE BUG EM PRODUÇÃO. O passo 1 do Novo Negócio parou de deixar avançar.
--
-- A causa: em 26/08/2026 (commit acbcb415) o campo "Anexar PDF" foi movido do passo 1 para o
-- passo 2, junto com o valor de negociação. A CONFIGURAÇÃO dele não foi junto — continuou
-- dizendo `etapa = 'Informações do Negócio'`, e `obrigatorio = true`, nas 8 empresas.
--
-- Resultado: o passo 1 cobrava um campo que só existe no passo 2. Não havia onde preencher,
-- e o botão "Próximo" nunca habilitava.
--
-- É a TERCEIRA vez que este código tropeça no mesmo buraco — campo obrigatório sem lugar para
-- ser preenchido. As duas anteriores viraram exceção escrita à mão em NovoNegocioDialog
-- (`proximo_contato`, que saiu da tela, e `obra_id`, quando a seção Obras está desligada).
-- Esta não vira exceção: aqui o campo EXISTE e DEVE continuar obrigatório — só mudou de passo.
-- Alinhar a configuração com a tela é o conserto da causa; mais uma exceção seria remendo.
--
-- Decisão do Lucas em 26/08/2026: "ele deve ser obrigatório somente na segunda".
-- ============================================================================

update configuracoes_campos
   set etapa = 'Valor e orçamento',
       updated_at = now()
 where entidade = 'pedidos'
   and campo_key = 'anexo_pdf'
   and etapa = 'Informações do Negócio';
