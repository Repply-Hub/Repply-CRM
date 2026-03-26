
-- =============================================
-- EMPRESAS: Suporte multi-tenant por empresa
-- =============================================

-- 1. Criar tabela de empresas
CREATE TABLE public.empresas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  cnpj TEXT UNIQUE,
  codigo_acesso TEXT NOT NULL UNIQUE DEFAULT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Adicionar empresa_id em vendedores
ALTER TABLE public.vendedores
  ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id);

-- 3. RLS para empresas
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;

-- Qualquer pessoa pode buscar empresa pelo código (necessário para cadastro de funcionários)
CREATE POLICY "leitura publica de empresas" ON public.empresas
  FOR SELECT
  USING (true);

-- Apenas gestores da própria empresa podem atualizar
CREATE POLICY "gestor atualiza sua empresa" ON public.empresas
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.vendedores
      WHERE user_id = auth.uid()
        AND role = 'gestor'
        AND empresa_id = empresas.id
    )
  );

-- 4. Atualizar trigger handle_new_user para suportar empresa e funcionário
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_empresa_id UUID;
  v_role TEXT;
  v_nome_empresa TEXT;
  v_cnpj_empresa TEXT;
  v_codigo_empresa TEXT;
BEGIN
  v_role          := COALESCE(NEW.raw_user_meta_data->>'role', 'vendedor');
  v_nome_empresa  := NEW.raw_user_meta_data->>'nome_empresa';
  v_cnpj_empresa  := NEW.raw_user_meta_data->>'cnpj_empresa';
  v_codigo_empresa := NEW.raw_user_meta_data->>'codigo_empresa';

  -- Cadastro de empresa: cria o registro de empresa e vira gestor
  IF v_role = 'gestor' AND v_nome_empresa IS NOT NULL THEN
    INSERT INTO public.empresas (nome, cnpj)
    VALUES (v_nome_empresa, NULLIF(v_cnpj_empresa, ''))
    RETURNING id INTO v_empresa_id;
  END IF;

  -- Cadastro de funcionário: busca empresa pelo código de acesso
  IF v_codigo_empresa IS NOT NULL THEN
    SELECT id INTO v_empresa_id
    FROM public.empresas
    WHERE codigo_acesso = upper(v_codigo_empresa);
  END IF;

  INSERT INTO public.vendedores (user_id, nome, email, role, empresa_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)),
    NEW.email,
    v_role,
    v_empresa_id
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;
