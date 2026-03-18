
CREATE TABLE public.licencas_idema (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_licenca TEXT,
  tipo_licenca TEXT,
  data_emissao TEXT,
  data_validade TEXT,
  cnpj TEXT,
  razao_social TEXT,
  empreendimento TEXT,
  municipio TEXT,
  atividade TEXT,
  porte TEXT,
  potencial_poluidor TEXT,
  pdf_link TEXT,
  bloco_texto TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.licencas_idema ENABLE ROW LEVEL SECURITY;

CREATE POLICY "licencas_idema_select"
  ON public.licencas_idema FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "licencas_idema_insert"
  ON public.licencas_idema FOR INSERT
  TO authenticated WITH CHECK (true);
