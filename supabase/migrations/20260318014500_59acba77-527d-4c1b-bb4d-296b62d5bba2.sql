
CREATE TABLE public.licencas_extremoz (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  data_edicao TEXT,
  tipo_licenca TEXT,
  prioridade TEXT,
  cnpj TEXT,
  razao_social TEXT,
  nome_fantasia TEXT,
  telefone TEXT,
  email TEXT,
  endereco_empresa TEXT,
  quadro_societario TEXT,
  obra_descricao TEXT,
  pdf_nome TEXT,
  pdf_link TEXT,
  bloco_texto TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.licencas_extremoz ENABLE ROW LEVEL SECURITY;

CREATE POLICY "licencas_extremoz_select" ON public.licencas_extremoz
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "licencas_extremoz_insert" ON public.licencas_extremoz
  FOR INSERT TO authenticated WITH CHECK (is_gestor());

CREATE POLICY "licencas_extremoz_update" ON public.licencas_extremoz
  FOR UPDATE TO authenticated USING (is_gestor());

CREATE POLICY "licencas_extremoz_delete" ON public.licencas_extremoz
  FOR DELETE TO authenticated USING (is_gestor());
