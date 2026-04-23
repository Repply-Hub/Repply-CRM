-- Criar o bucket branding se não existir
INSERT INTO storage.buckets (id, name, public) 
VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO NOTHING;

-- Políticas para o bucket branding
CREATE POLICY "Logos são acessíveis publicamente" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'branding');

CREATE POLICY "Usuários autenticados podem fazer upload de logos" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'branding' AND auth.role() = 'authenticated');

CREATE POLICY "Usuários podem atualizar seus próprios logos" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'branding' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Usuários podem deletar seus próprios logos" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'branding' AND auth.uid()::text = (storage.foldername(name))[1]);
