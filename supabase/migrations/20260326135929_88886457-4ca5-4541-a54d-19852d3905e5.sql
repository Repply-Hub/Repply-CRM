
CREATE TABLE public.eventos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  titulo TEXT NOT NULL,
  descricao TEXT,
  inicio TIMESTAMP WITH TIME ZONE NOT NULL,
  fim TIMESTAMP WITH TIME ZONE NOT NULL,
  dia_inteiro BOOLEAN NOT NULL DEFAULT false,
  tipo_calendario TEXT NOT NULL DEFAULT 'pessoal',
  cor TEXT NOT NULL DEFAULT '#3b82f6',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "eventos_select" ON public.eventos FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "eventos_insert" ON public.eventos FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "eventos_update" ON public.eventos FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "eventos_delete" ON public.eventos FOR DELETE TO authenticated USING (user_id = auth.uid());
