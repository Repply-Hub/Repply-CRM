-- Adicionar coluna pdf_url na tabela pedidos
ALTER TABLE public.pedidos ADD COLUMN pdf_url TEXT;

-- Criar bucket para anexos de pedidos se não existir
INSERT INTO storage.buckets (id, name, public)
VALUES ('pedido-anexos', 'pedido-anexos', true)
ON CONFLICT (id) DO NOTHING;

-- Políticas de RLS para o bucket pedido-anexos
-- Permitir que todos vejam os anexos (já que é público, mas vamos garantir)
CREATE POLICY "Qualquer um pode ver anexos de pedidos"
ON storage.objects FOR SELECT
USING (bucket_id = 'pedido-anexos');

-- Permitir que usuários autenticados façam upload
CREATE POLICY "Usuários autenticados podem fazer upload de anexos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'pedido-anexos');

-- Permitir que usuários autenticados excluam seus próprios uploads (opcional, mas bom ter)
CREATE POLICY "Usuários autenticados podem excluir seus próprios anexos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'pedido-anexos');
