-- "Nova conversa" (src/hooks/use-whatsapp-inbox.ts useWaNovaConversa) faz um
-- upsert client-side direto em whatsapp_conversas com onConflict empresa_id,telefone.
-- Isso funciona para telefone inédito (vira INSERT, coberto pelo trigger
-- trg_wa_conversa_auto_responsavel de 20260709190000). Mas se já existe uma conversa
-- para aquele telefone e o usuário atual não é admin/empresa nem responsável por ela,
-- o upsert cai no caminho ON CONFLICT DO UPDATE — e a policy "wa_conversas_access"
-- (FOR ALL, USING can_access_wa_conversa(id)) bloqueia o UPDATE antes mesmo do
-- WITH CHECK, com "new row violates row-level security policy".
--
-- Substitui por uma function SECURITY DEFINER que faz o upsert já validando a
-- empresa do usuário e garantindo que ele vire responsável da conversa (nova ou
-- reaberta), do mesmo jeito que o trigger fazia para o caso de INSERT puro.
CREATE OR REPLACE FUNCTION public.wa_iniciar_conversa(
  p_telefone text,
  p_nome_contato text DEFAULT NULL,
  p_cliente_id uuid DEFAULT NULL
)
RETURNS whatsapp_conversas
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_empresa_id uuid;
  v_usuario_id uuid;
  v_existente_id uuid;
  v_conversa whatsapp_conversas;
BEGIN
  v_empresa_id := get_my_empresa_id();
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'Empresa não encontrada';
  END IF;
  v_usuario_id := get_my_usuario_id();

  -- Se já existe uma conversa para esse telefone e ela está atribuída a outra(s)
  -- pessoa(s) (não é visível para o usuário atual via can_access_wa_conversa),
  -- não deixa "Nova conversa" sequestrar/reabrir silenciosamente uma conversa
  -- alheia — mantém a mesma regra de acesso já usada para leitura.
  SELECT id INTO v_existente_id
  FROM whatsapp_conversas
  WHERE empresa_id = v_empresa_id AND telefone = p_telefone;

  IF v_existente_id IS NOT NULL AND NOT can_access_wa_conversa(v_existente_id) THEN
    RAISE EXCEPTION 'Esta conversa já está em atendimento com outro responsável';
  END IF;

  INSERT INTO whatsapp_conversas (empresa_id, telefone, nome_contato, cliente_id)
  VALUES (v_empresa_id, p_telefone, p_nome_contato, p_cliente_id)
  ON CONFLICT (empresa_id, telefone) DO UPDATE
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
$$;

GRANT EXECUTE ON FUNCTION public.wa_iniciar_conversa(text, text, uuid) TO authenticated;
