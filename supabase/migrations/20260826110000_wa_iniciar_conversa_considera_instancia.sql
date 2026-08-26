-- Acompanha 20260826100000: a identidade de uma conversa agora inclui a
-- instância (empresa_id, telefone, instancia_id), não só (empresa_id, telefone).
--
-- "Nova conversa" precisa gravar QUAL instância a origina, do contrário nasceria
-- com instancia_id NULL — e como NULL nunca colide em UNIQUE, clicar em "Nova
-- conversa" de novo para o mesmo telefone criaria uma linha nova a cada vez em
-- vez de reabrir a existente. A instância usada é a mesma que whatsapp-send
-- escolheria no primeiro envio desta conversa quando ela ainda não tem
-- instancia_id própria: a instância vinculada ao usuário logado
-- (wapi_instancia_usuarios) — mantém as duas pontas consistentes.
CREATE OR REPLACE FUNCTION public.wa_iniciar_conversa(
  p_telefone text,
  p_nome_contato text DEFAULT NULL::text,
  p_cliente_id uuid DEFAULT NULL::uuid
)
RETURNS whatsapp_conversas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_empresa_id uuid;
  v_usuario_id uuid;
  v_instancia_id uuid;
  v_existente_id uuid;
  v_variante text;
  v_conversa whatsapp_conversas;
BEGIN
  v_empresa_id := get_my_empresa_id();
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'Empresa não encontrada';
  END IF;
  v_usuario_id := get_my_usuario_id();

  SELECT cw.id INTO v_instancia_id
  FROM wapi_instancia_usuarios wiu
  JOIN configuracoes_wapi cw ON cw.id = wiu.instancia_id
  WHERE wiu.usuario_auth_id = auth.uid()
  LIMIT 1;

  SELECT id INTO v_existente_id
  FROM whatsapp_conversas
  WHERE empresa_id = v_empresa_id AND telefone = p_telefone
    AND instancia_id IS NOT DISTINCT FROM v_instancia_id;

  -- Sem conversa na forma pedida (nesta instância)? Se o número é da faixa
  -- ambígua, a variante com/sem 9 pode ser o MESMO contato já em conversa
  -- nesta mesma instância — reaproveita para não rachar o histórico em dois.
  IF v_existente_id IS NULL THEN
    v_variante := CASE
      WHEN p_telefone ~ '^55\d{2}9[2-5]\d{7}$'
        THEN substring(p_telefone from 1 for 4) || substring(p_telefone from 6)
      WHEN p_telefone ~ '^55\d{2}[2-5]\d{7}$'
        THEN substring(p_telefone from 1 for 4) || '9' || substring(p_telefone from 5)
      ELSE NULL
    END;

    IF v_variante IS NOT NULL THEN
      SELECT id INTO v_existente_id
      FROM whatsapp_conversas
      WHERE empresa_id = v_empresa_id AND telefone = v_variante
        AND instancia_id IS NOT DISTINCT FROM v_instancia_id;
      IF v_existente_id IS NOT NULL THEN
        p_telefone := v_variante;
      END IF;
    END IF;
  END IF;

  -- Se já existe uma conversa para esse telefone nesta instância e ela está
  -- atribuída a outra(s) pessoa(s) (não é visível para o usuário atual via
  -- can_access_wa_conversa), não deixa "Nova conversa" sequestrar/reabrir
  -- silenciosamente uma conversa alheia — mantém a mesma regra de acesso já
  -- usada para leitura.
  IF v_existente_id IS NOT NULL AND NOT can_access_wa_conversa(v_existente_id) THEN
    RAISE EXCEPTION 'Esta conversa já está em atendimento com outro responsável';
  END IF;

  INSERT INTO whatsapp_conversas (empresa_id, telefone, nome_contato, cliente_id, instancia_id)
  VALUES (v_empresa_id, p_telefone, p_nome_contato, p_cliente_id, v_instancia_id)
  ON CONFLICT (empresa_id, telefone, instancia_id) DO UPDATE
    SET nome_contato = COALESCE(EXCLUDED.nome_contato, whatsapp_conversas.nome_contato),
        cliente_id = COALESCE(EXCLUDED.cliente_id, whatsapp_conversas.cliente_id),
        arquivada = false
  RETURNING * INTO v_conversa;

  IF v_usuario_id IS NOT NULL THEN
    INSERT INTO whatsapp_conversa_responsaveis (conversa_id, usuario_id)
    VALUES (v_conversa.id, v_usuario_id)
    ON CONFLICT (conversa_id, usuario_id) DO NOTHING;
  END IF;

  RETURN v_conversa;
END;
$function$;
