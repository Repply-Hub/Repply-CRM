-- Create a bucket for email assets if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('email-assets', 'email-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public access to read files from email-assets
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING (bucket_id = 'email-assets');

-- Allow authenticated users to upload to email-assets
CREATE POLICY "Auth Upload"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'email-assets' AND auth.role() = 'authenticated');
