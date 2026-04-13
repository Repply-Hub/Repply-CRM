
-- Tabela de grupos de chat
CREATE TABLE public.chat_grupos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  descricao TEXT,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  criado_por UUID NOT NULL REFERENCES public.vendedores(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de membros dos grupos
CREATE TABLE public.chat_grupo_membros (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  grupo_id UUID NOT NULL REFERENCES public.chat_grupos(id) ON DELETE CASCADE,
  vendedor_id UUID NOT NULL REFERENCES public.vendedores(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(grupo_id, vendedor_id)
);

-- Adicionar coluna grupo_id na tabela chat_mensagens
ALTER TABLE public.chat_mensagens ADD COLUMN grupo_id UUID REFERENCES public.chat_grupos(id) ON DELETE CASCADE;

-- RLS para chat_grupos
ALTER TABLE public.chat_grupos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_grupos_select" ON public.chat_grupos
  FOR SELECT TO authenticated
  USING (empresa_id = (SELECT empresa_id FROM vendedores WHERE user_id = auth.uid() LIMIT 1));

CREATE POLICY "chat_grupos_insert" ON public.chat_grupos
  FOR INSERT TO authenticated
  WITH CHECK (empresa_id = (SELECT empresa_id FROM vendedores WHERE user_id = auth.uid() LIMIT 1));

CREATE POLICY "chat_grupos_update" ON public.chat_grupos
  FOR UPDATE TO authenticated
  USING (criado_por = get_my_vendedor_id() OR is_gestor());

CREATE POLICY "chat_grupos_delete" ON public.chat_grupos
  FOR DELETE TO authenticated
  USING (criado_por = get_my_vendedor_id() OR is_gestor());

-- RLS para chat_grupo_membros
ALTER TABLE public.chat_grupo_membros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_grupo_membros_select" ON public.chat_grupo_membros
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM chat_grupos g
    WHERE g.id = grupo_id
    AND g.empresa_id = (SELECT empresa_id FROM vendedores WHERE user_id = auth.uid() LIMIT 1)
  ));

CREATE POLICY "chat_grupo_membros_insert" ON public.chat_grupo_membros
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM chat_grupos g
    WHERE g.id = grupo_id
    AND g.empresa_id = (SELECT empresa_id FROM vendedores WHERE user_id = auth.uid() LIMIT 1)
  ));

CREATE POLICY "chat_grupo_membros_delete" ON public.chat_grupo_membros
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM chat_grupos g
    WHERE g.id = grupo_id
    AND (g.criado_por = get_my_vendedor_id() OR is_gestor())
  ));

-- Enable realtime for grupos
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_grupos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_grupo_membros;
