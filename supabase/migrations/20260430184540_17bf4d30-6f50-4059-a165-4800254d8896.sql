-- Corrigir a função validar_codigo_empresa para NÃO invalidar o código imediatamente
-- O código deve permanecer o mesmo para que o trigger handle_new_user possa usá-lo
CREATE OR REPLACE FUNCTION public.validar_codigo_empresa(p_codigo text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_empresa_id uuid;
  v_empresa_nome text;
BEGIN
  -- Apenas busca a empresa pelo código fornecido
  SELECT id, nome INTO v_empresa_id, v_empresa_nome
  FROM public.empresas
  WHERE codigo_acesso = upper(p_codigo)
  LIMIT 1;

  IF v_empresa_id IS NOT NULL THEN
    RETURN json_build_object('id', v_empresa_id, 'nome', v_empresa_nome);
  ELSE
    RETURN NULL;
  END IF;
END;
$function$;

-- Garantir que o trigger handle_new_user existe e está configurado corretamente
-- Primeiro, garantir que a função handle_new_user está atualizada
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _empresa_id uuid;
  _role text;
BEGIN
  _role := COALESCE(NEW.raw_user_meta_data->>'role', 'vendedor');
  
  IF _role = 'empresa' OR _role = 'gestor' THEN
    -- Lógica para criação de nova empresa
    IF NEW.raw_user_meta_data->>'nome_empresa' IS NOT NULL AND NEW.raw_user_meta_data->>'nome_empresa' != '' THEN
      INSERT INTO public.empresas (nome, cnpj, owner_id)
      VALUES (NEW.raw_user_meta_data->>'nome_empresa', NULLIF(NEW.raw_user_meta_data->>'cnpj_empresa', ''), NEW.id)
      RETURNING id INTO _empresa_id;
    END IF;
    
    INSERT INTO public.usuarios (user_id, nome, email, role, empresa_id)
    VALUES (
      NEW.id, 
      COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)),
      NEW.email, 
      CASE WHEN _role = 'gestor' THEN 'empresa' ELSE _role END, 
      _empresa_id
    )
    ON CONFLICT (user_id) DO UPDATE SET
      empresa_id = EXCLUDED.empresa_id,
      role = EXCLUDED.role;
  ELSE
    -- Lógica para funcionário entrando em empresa existente
    IF NEW.raw_user_meta_data->>'codigo_empresa' IS NOT NULL THEN
      SELECT id INTO _empresa_id 
      FROM public.empresas 
      WHERE codigo_acesso = upper(NEW.raw_user_meta_data->>'codigo_empresa');
    END IF;
    
    INSERT INTO public.usuarios (user_id, nome, email, role, empresa_id)
    VALUES (
      NEW.id, 
      COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)),
      NEW.email, 
      'vendedor', 
      _empresa_id
    )
    ON CONFLICT (user_id) DO UPDATE SET
      empresa_id = EXCLUDED.empresa_id,
      role = EXCLUDED.role;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Criar o trigger se ele não existir
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created') THEN
        CREATE TRIGGER on_auth_user_created
          AFTER INSERT ON auth.users
          FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
    END IF;
END $$;
