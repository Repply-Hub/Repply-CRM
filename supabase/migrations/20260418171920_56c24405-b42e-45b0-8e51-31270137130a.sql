-- 1. Add columns to tabela_precos
ALTER TABLE public.tabela_precos
  ADD COLUMN IF NOT EXISTS categoria text,
  ADD COLUMN IF NOT EXISTS imagem_url text;

CREATE INDEX IF NOT EXISTS idx_tabela_precos_categoria
  ON public.tabela_precos (categoria);

-- 2. Create public storage bucket for product images
INSERT INTO storage.buckets (id, name, public)
VALUES ('catalogo-produtos', 'catalogo-produtos', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Storage policies
DROP POLICY IF EXISTS "catalogo_produtos_public_read" ON storage.objects;
CREATE POLICY "catalogo_produtos_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'catalogo-produtos');

DROP POLICY IF EXISTS "catalogo_produtos_auth_insert" ON storage.objects;
CREATE POLICY "catalogo_produtos_auth_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'catalogo-produtos');

DROP POLICY IF EXISTS "catalogo_produtos_auth_update" ON storage.objects;
CREATE POLICY "catalogo_produtos_auth_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'catalogo-produtos');

DROP POLICY IF EXISTS "catalogo_produtos_auth_delete" ON storage.objects;
CREATE POLICY "catalogo_produtos_auth_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'catalogo-produtos');