
-- Tabela de empresas com código de acesso
CREATE TABLE public.empresas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cnpj text,
  codigo_acesso text NOT NULL DEFAULT upper(substr(md5(random()::text), 1, 8)),
  owner_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(codigo_acesso)
);

ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;

-- Apenas o dono e admins podem ver/gerenciar a empresa
CREATE POLICY "empresas_select" ON public.empresas FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR is_gestor());

CREATE POLICY "empresas_insert" ON public.empresas FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() OR is_gestor());

CREATE POLICY "empresas_update" ON public.empresas FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR is_gestor());

CREATE POLICY "empresas_delete" ON public.empresas FOR DELETE TO authenticated
  USING (is_gestor());

-- Adiciona empresa_id na tabela vendedores
ALTER TABLE public.vendedores ADD COLUMN empresa_id uuid REFERENCES public.empresas(id) ON DELETE SET NULL;

-- Cria empresa para md@teste.com (role='empresa')
INSERT INTO public.empresas (nome, owner_id)
SELECT 'MD Teste', v.user_id
FROM public.vendedores v
WHERE v.email = 'md@teste.com' AND v.user_id IS NOT NULL;

-- Vincula md@teste.com à sua empresa
UPDATE public.vendedores
SET empresa_id = (SELECT e.id FROM public.empresas e JOIN public.vendedores v2 ON e.owner_id = v2.user_id WHERE v2.email = 'md@teste.com' LIMIT 1)
WHERE email = 'md@teste.com';

-- Função para vincular funcionário à empresa ao cadastrar com código
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _empresa_id uuid;
  _role text;
BEGIN
  _role := COALESCE(NEW.raw_user_meta_data->>'role', 'vendedor');
  
  -- Se for empresa, cria registro na tabela empresas
  IF _role = 'empresa' OR _role = 'gestor' THEN
    IF NEW.raw_user_meta_data->>'nome_empresa' IS NOT NULL AND NEW.raw_user_meta_data->>'nome_empresa' != '' THEN
      INSERT INTO public.empresas (nome, cnpj, owner_id)
      VALUES (
        NEW.raw_user_meta_data->>'nome_empresa',
        NULLIF(NEW.raw_user_meta_data->>'cnpj_empresa', ''),
        NEW.id
      )
      RETURNING id INTO _empresa_id;
    END IF;
    
    INSERT INTO public.vendedores (user_id, nome, email, role, empresa_id)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)),
      NEW.email,
      CASE WHEN _role = 'gestor' THEN 'empresa' ELSE _role END,
      _empresa_id
    )
    ON CONFLICT DO NOTHING;
  ELSE
    -- Funcionário: busca empresa pelo código
    IF NEW.raw_user_meta_data->>'codigo_empresa' IS NOT NULL THEN
      SELECT id INTO _empresa_id
      FROM public.empresas
      WHERE codigo_acesso = upper(NEW.raw_user_meta_data->>'codigo_empresa');
    END IF;
    
    INSERT INTO public.vendedores (user_id, nome, email, role, empresa_id)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)),
      NEW.email,
      'vendedor',
      _empresa_id
    )
    ON CONFLICT DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$;
