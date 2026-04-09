
CREATE TABLE public.perfis_customizados (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.perfis_customizados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "perfis_select" ON public.perfis_customizados FOR SELECT TO authenticated USING (true);
CREATE POLICY "perfis_insert" ON public.perfis_customizados FOR INSERT TO authenticated WITH CHECK (is_gestor());
CREATE POLICY "perfis_update" ON public.perfis_customizados FOR UPDATE TO authenticated USING (is_gestor());
CREATE POLICY "perfis_delete" ON public.perfis_customizados FOR DELETE TO authenticated USING (is_gestor());
