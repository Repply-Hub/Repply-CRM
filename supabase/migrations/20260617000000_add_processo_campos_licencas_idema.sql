ALTER TABLE public.licencas_idema
  ADD COLUMN IF NOT EXISTS numero_processo TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS interessado TEXT,
  ADD COLUMN IF NOT EXISTS fato_gerador TEXT,
  ADD COLUMN IF NOT EXISTS data_formacao DATE,
  ADD COLUMN IF NOT EXISTS url_licenca TEXT,
  ADD COLUMN IF NOT EXISTS fonte TEXT DEFAULT 'IDEMA',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE POLICY IF NOT EXISTS "Usuários autenticados podem atualizar licenças"
  ON public.licencas_idema FOR UPDATE
  TO authenticated USING (true);
