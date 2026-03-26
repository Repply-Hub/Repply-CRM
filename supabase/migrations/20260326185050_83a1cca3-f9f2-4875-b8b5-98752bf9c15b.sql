
-- Delete in order: itens_pedido → historico_contatos → mensagens_whatsapp → notificacoes (pedido refs) → pedidos → tabela_precos → fabricantes
DELETE FROM public.itens_pedido WHERE pedido_id IN (SELECT id FROM public.pedidos);
DELETE FROM public.historico_contatos WHERE pedido_id IN (SELECT id FROM public.pedidos);
DELETE FROM public.mensagens_whatsapp WHERE pedido_id IN (SELECT id FROM public.pedidos);
DELETE FROM public.notificacoes WHERE pedido_id IN (SELECT id FROM public.pedidos);
DELETE FROM public.automation_logs WHERE pedido_id IN (SELECT id FROM public.pedidos);
DELETE FROM public.pedidos;
DELETE FROM public.tabela_precos;
DELETE FROM public.fabricantes;
