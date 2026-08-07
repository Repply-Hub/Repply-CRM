-- "Nova conversa" resolve a variante do 9º dígito DENTRO da RPC, onde a RLS
-- não cega.
--
-- O problema que isto fecha: o frontend consulta as duas variantes do número
-- (com/sem 9, faixa ambígua [2-5]) antes de chamar a RPC, mas essa consulta
-- passa pela RLS de whatsapp_conversas — que é por RESPONSÁVEL. Um vendedor que
-- não enxerga a conversa do colega não encontra nenhuma variante, chama a RPC
-- com a forma canônica nova e cria uma conversa DUPLICADA do mesmo contato,
-- driblando sem querer a regra de "conversa em atendimento com outro
-- responsável".
--
-- A RPC é SECURITY DEFINER e já faz um lookup sem RLS por (empresa_id,
-- telefone) exatamente para aplicar essa regra. Basta estender o lookup à
-- variante: se o número pedido não tem conversa mas a variante tem, a conversa
-- da variante É o contato — reaproveita (sujeita à MESMA checagem de acesso,
-- que agora dispara o erro claro em vez de deixar nascer a duplicata).
--
-- Só a faixa ambígua entra no jogo: celular inequívoco (9+[6-9]) não tem
-- variante. Espelha `varianteDoNumero` de _shared/whatsapp.ts e do
-- use-whatsapp-inbox.ts — as três pontas precisam concordar.
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
  v_existente_id uuid;
  v_variante text;
  v_conversa whatsapp_conversas;
BEGIN
  v_empresa_id := get_my_empresa_id();
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'Empresa não encontrada';
  END IF;
  v_usuario_id := get_my_usuario_id();

  SELECT id INTO v_existente_id
  FROM whatsapp_conversas
  WHERE empresa_id = v_empresa_id AND telefone = p_telefone;

  -- Sem conversa na forma pedida? Se o número é da faixa ambígua, a variante
  -- com/sem 9 pode ser o MESMO contato já em conversa — reaproveita para não
  -- rachar o histórico em dois.
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
      WHERE empresa_id = v_empresa_id AND telefone = v_variante;
      IF v_existente_id IS NOT NULL THEN
        p_telefone := v_variante;
      END IF;
    END IF;
  END IF;

  -- Se já existe uma conversa para esse telefone e ela está atribuída a outra(s)
  -- pessoa(s) (não é visível para o usuário atual via can_access_wa_conversa),
  -- não deixa "Nova conversa" sequestrar/reabrir silenciosamente uma conversa
  -- alheia — mantém a mesma regra de acesso já usada para leitura.
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
$function$;
