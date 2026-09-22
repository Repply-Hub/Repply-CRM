-- Alinha os benefícios do "Plano de Lançamento" (tabela public.planos) ao que o código já
-- define em src/lib/planos.ts (constante PLANOS).
--
-- POR QUÊ: a seed (20260803140240) gravou "Todos os módulos" na lista, mas o assinante NÃO
-- recebe todos os módulos — o Portal de Consultas é exclusivo da MD Representações (SPEC.md §11).
-- Prometer "todos" e entregar menos é o tipo de coisa que o cliente descobre sozinho, no pior
-- momento. O código já tinha corrigido a lista em 21/08/2026; o banco de produção ficou para trás
-- e continuava mostrando o texto antigo na landing e em Configurações → Assinatura.
--
-- Só o texto dos benefícios muda. Preço (preco_centavos), ciclo e stripe_price_id ficam intactos:
-- a vitrine de preço já não lê `plano.preco` (usa VITRINE_LANCAMENTO), e a cobrança do Stripe é
-- tratada à parte.
--
-- Idempotente: rodar de novo deixa a lista no mesmo estado.
UPDATE public.planos
SET beneficios = '["Usuários ilimitados","Funil, clientes, obras e catálogo","WhatsApp e e-mail","Importação da sua base","Suporte direto com o time"]'::jsonb
WHERE slug = 'lancamento';
