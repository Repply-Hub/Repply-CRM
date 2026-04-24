CREATE POLICY "Users can update own chat files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'chat-files' AND (storage.foldername(name))[1] = auth.uid()::text);