
ALTER TABLE public.chat_mensagens
  ADD CONSTRAINT chat_mensagens_vendedor_id_fkey FOREIGN KEY (vendedor_id) REFERENCES public.vendedores(id) ON DELETE CASCADE;

ALTER TABLE public.chat_mensagens
  ADD CONSTRAINT chat_mensagens_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;
