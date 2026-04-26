CREATE OR REPLACE FUNCTION public.validar_codigo_empresa(p_codigo text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_empresa_id uuid;
  v_empresa_nome text;
  v_new_code text;
BEGIN
  -- Busca a empresa pelo código fornecido
  SELECT id, nome INTO v_empresa_id, v_empresa_nome
  FROM public.empresas
  WHERE codigo_acesso = upper(p_codigo)
  LIMIT 1;

  -- Se encontrou a empresa, invalida o código atual gerando um novo aleatório
  IF v_empresa_id IS NOT NULL THEN
    v_new_code := upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8));
    
    UPDATE public.empresas
    SET codigo_acesso = v_new_code
    WHERE id = v_empresa_id;

    RETURN json_build_object('id', v_empresa_id, 'nome', v_empresa_nome);
  ELSE
    RETURN NULL;
  END IF;
END;
$function$;