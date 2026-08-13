-- A "Auth Upload" original só cobre INSERT. `upload(..., { upsert: true })`
-- sobre um arquivo já existente (troca da logo) e a remoção explícita da
-- logo (`storage.remove`) passam por UPDATE/DELETE em storage.objects, que
-- não tinham policy — a UI de "Remover" ficaria bloqueada por RLS.
CREATE POLICY "Auth Update"
ON storage.objects FOR UPDATE
USING (bucket_id = 'email-assets' AND auth.role() = 'authenticated')
WITH CHECK (bucket_id = 'email-assets' AND auth.role() = 'authenticated');

CREATE POLICY "Auth Delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'email-assets' AND auth.role() = 'authenticated');
