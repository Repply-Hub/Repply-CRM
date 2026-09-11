-- Desde quando a assinatura ATUAL existe, segundo o provedor de pagamento.
--
-- POR QUE NÃO `ativado_em`: o stripe-webhook grava now() nele a cada evento que libera
-- acesso — renovação inclusive —, então com o tempo ele vira "o último evento", não
-- "o início". Nas legacy ele guarda a hora da migration que as liberou.
--
-- O nome não diz "stripe" de propósito: quando o provedor mudar, o novo preenche o
-- mesmo campo e a tela não muda.
--
-- Sem preenchimento retroativo: hoje só uma empresa, de teste, passa pelo Stripe, e ela
-- recebe o valor no próximo evento. Até lá a tela não mostra a linha — nunca chuta.
ALTER TABLE public.empresa_assinaturas
  ADD COLUMN IF NOT EXISTS assinatura_iniciada_em timestamptz;

COMMENT ON COLUMN public.empresa_assinaturas.assinatura_iniciada_em IS
  'Inicio da assinatura atual segundo o provedor (Stripe: subscription.start_date). Nulo em cortesia/legacy e ate o primeiro evento do provedor.';
