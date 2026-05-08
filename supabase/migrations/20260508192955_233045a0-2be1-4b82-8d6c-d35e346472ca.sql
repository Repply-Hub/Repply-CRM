-- Alterar a constraint de mensagens_whatsapp para CASCADE no pedido_id
ALTER TABLE public.mensagens_whatsapp 
DROP CONSTRAINT IF EXISTS mensagens_whatsapp_pedido_id_fkey;

ALTER TABLE public.mensagens_whatsapp 
ADD CONSTRAINT mensagens_whatsapp_pedido_id_fkey 
FOREIGN KEY (pedido_id) 
REFERENCES public.pedidos(id) 
ON DELETE CASCADE;

-- Alterar a constraint de notificações para CASCADE no cliente_id (opcional mas recomendado se houver vínculos)
ALTER TABLE public.notificacoes 
DROP CONSTRAINT IF EXISTS notificacoes_cliente_id_fkey;

ALTER TABLE public.notificacoes 
ADD CONSTRAINT notificacoes_cliente_id_fkey 
FOREIGN KEY (cliente_id) 
REFERENCES public.clientes(id) 
ON DELETE CASCADE;
