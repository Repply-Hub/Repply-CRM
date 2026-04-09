
CREATE TABLE public.contatos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa TEXT NOT NULL,
  nome_contato TEXT,
  telefone TEXT,
  email TEXT,
  cargo TEXT,
  vendedor_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.contatos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contatos_select" ON public.contatos
  FOR SELECT TO authenticated
  USING ((vendedor_id = get_my_vendedor_id()) OR is_gestor());

CREATE POLICY "contatos_insert" ON public.contatos
  FOR INSERT TO authenticated
  WITH CHECK ((vendedor_id = get_my_vendedor_id()) OR is_gestor());

CREATE POLICY "contatos_update" ON public.contatos
  FOR UPDATE TO authenticated
  USING ((vendedor_id = get_my_vendedor_id()) OR is_gestor());

CREATE POLICY "contatos_delete" ON public.contatos
  FOR DELETE TO authenticated
  USING (is_gestor());

CREATE TRIGGER update_contatos_updated_at
  BEFORE UPDATE ON public.contatos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
