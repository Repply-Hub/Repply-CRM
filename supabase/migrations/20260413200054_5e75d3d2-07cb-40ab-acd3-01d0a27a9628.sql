
-- Add file columns to chat_mensagens
ALTER TABLE public.chat_mensagens
  ADD COLUMN IF NOT EXISTS arquivo_url text,
  ADD COLUMN IF NOT EXISTS arquivo_nome text,
  ADD COLUMN IF NOT EXISTS arquivo_tipo text;

-- Create storage bucket for chat files
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-files', 'chat-files', true)
ON CONFLICT (id) DO NOTHING;

-- RLS: authenticated users can upload files
CREATE POLICY "Authenticated users can upload chat files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'chat-files');

-- RLS: anyone can view chat files (public bucket)
CREATE POLICY "Public read access for chat files"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'chat-files');

-- RLS: users can delete their own uploads
CREATE POLICY "Users can delete own chat files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'chat-files' AND (storage.foldername(name))[1] = auth.uid()::text);
