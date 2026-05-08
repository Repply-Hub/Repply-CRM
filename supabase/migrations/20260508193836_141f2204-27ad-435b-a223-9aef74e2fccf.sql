-- Ensure CASCADE for notificacoes referencing pedidos
ALTER TABLE public.notificacoes 
DROP CONSTRAINT IF EXISTS notificacoes_pedido_id_fkey,
ADD CONSTRAINT notificacoes_pedido_id_fkey 
FOREIGN KEY (pedido_id) 
REFERENCES public.pedidos(id) 
ON DELETE CASCADE;

-- Ensure CASCADE for mensagens_whatsapp referencing pedidos
ALTER TABLE public.mensagens_whatsapp 
DROP CONSTRAINT IF EXISTS mensagens_whatsapp_pedido_id_fkey,
ADD CONSTRAINT mensagens_whatsapp_pedido_id_fkey 
FOREIGN KEY (pedido_id) 
REFERENCES public.pedidos(id) 
ON DELETE CASCADE;
