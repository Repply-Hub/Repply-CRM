ALTER TABLE public.pedidos 
DROP CONSTRAINT pedidos_obra_id_fkey,
ADD CONSTRAINT pedidos_obra_id_fkey 
  FOREIGN KEY (obra_id) 
  REFERENCES public.obras(id) 
  ON DELETE CASCADE;