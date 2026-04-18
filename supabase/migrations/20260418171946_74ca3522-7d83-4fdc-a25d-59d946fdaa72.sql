DROP POLICY IF EXISTS "catalogo_produtos_auth_insert" ON storage.objects;
CREATE POLICY "catalogo_produtos_gestor_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'catalogo-produtos' AND public.is_gestor());

DROP POLICY IF EXISTS "catalogo_produtos_auth_update" ON storage.objects;
CREATE POLICY "catalogo_produtos_gestor_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'catalogo-produtos' AND public.is_gestor());

DROP POLICY IF EXISTS "catalogo_produtos_auth_delete" ON storage.objects;
CREATE POLICY "catalogo_produtos_gestor_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'catalogo-produtos' AND public.is_gestor());