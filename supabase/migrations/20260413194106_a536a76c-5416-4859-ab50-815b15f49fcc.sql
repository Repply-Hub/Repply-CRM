
-- Tabela de mensagens do chat interno
CREATE TABLE public.chat_mensagens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conteudo TEXT NOT NULL,
  vendedor_id UUID NOT NULL,
  empresa_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.chat_mensagens ENABLE ROW LEVEL SECURITY;

-- Policies: mesma empresa pode ler
CREATE POLICY "chat_select" ON public.chat_mensagens
  FOR SELECT TO authenticated
  USING (
    empresa_id = (SELECT empresa_id FROM public.vendedores WHERE user_id = auth.uid() LIMIT 1)
  );

-- Mesma empresa pode inserir
CREATE POLICY "chat_insert" ON public.chat_mensagens
  FOR INSERT TO authenticated
  WITH CHECK (
    vendedor_id = get_my_vendedor_id()
    AND empresa_id = (SELECT empresa_id FROM public.vendedores WHERE user_id = auth.uid() LIMIT 1)
  );

-- Apenas gestor pode deletar
CREATE POLICY "chat_delete" ON public.chat_mensagens
  FOR DELETE TO authenticated
  USING (is_gestor());

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_mensagens;
