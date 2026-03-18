
CREATE TABLE public.licencas_natal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_edicao TEXT,
  numero_dom TEXT,
  tipo_licenca TEXT,
  cnpj TEXT,
  razao_social TEXT,
  obra_descricao TEXT,
  pdf_nome TEXT,
  pdf_link TEXT,
  bloco_texto TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.licencas_natal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read licencas_natal"
  ON public.licencas_natal FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert licencas_natal"
  ON public.licencas_natal FOR INSERT
  TO authenticated WITH CHECK (true);
