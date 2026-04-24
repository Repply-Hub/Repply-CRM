-- Update pedidos table constraint
ALTER TABLE public.pedidos
DROP CONSTRAINT IF EXISTS pedidos_cliente_id_fkey,
ADD CONSTRAINT pedidos_cliente_id_fkey 
    FOREIGN KEY (cliente_id) 
    REFERENCES public.clientes(id) 
    ON DELETE CASCADE;

-- Update automation_logs table constraints
ALTER TABLE public.automation_logs
DROP CONSTRAINT IF EXISTS automation_logs_cliente_id_fkey,
ADD CONSTRAINT automation_logs_cliente_id_fkey 
    FOREIGN KEY (cliente_id) 
    REFERENCES public.clientes(id) 
    ON DELETE CASCADE;

ALTER TABLE public.automation_logs
DROP CONSTRAINT IF EXISTS automation_logs_pedido_id_fkey,
ADD CONSTRAINT automation_logs_pedido_id_fkey 
    FOREIGN KEY (pedido_id) 
    REFERENCES public.pedidos(id) 
    ON DELETE CASCADE;
