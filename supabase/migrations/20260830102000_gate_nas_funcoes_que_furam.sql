-- As funções SECURITY DEFINER furam a RLS por definição: rodam com privilégio de dono e as
-- políticas de segurança do banco NÃO são avaliadas para elas. As tarefas anteriores fecharam
-- o bloqueio por falta de pagamento nas políticas das tabelas; isto fecha as portas laterais —
-- as funções que escrevem e são alcançáveis por quem está autenticado.
--
-- A guarda é sempre a mesma, e sempre no mesmo lugar: DEPOIS da checagem de papel que a função
-- já tinha (quando tinha uma). Nessa ordem, quem não tem permissão continua recebendo o erro de
-- permissão — não o de cobrança. Trocar a ordem esconderia de um vendedor sem alçada, por
-- exemplo, que o problema dele nunca foi a assinatura.
--
--   IF NOT public.empresa_plano_ativo() THEN
--     RAISE EXCEPTION 'Esta ação está indisponível enquanto a assinatura estiver pendente.'
--       USING ERRCODE = '42501';
--   END IF;
--
-- 🔴 CADA CORPO ABAIXO FOI LIDO DIRETO DO BANCO (pg_get_functiondef) em 29/08/2026, não copiado
-- de migration antiga. As migrations deste projeto já se mostraram desatualizadas em relação ao
-- que está de fato aplicado — ver o cabeçalho de `20260803140113_blindagem_rls_usuarios.sql` e o
-- relato em `.superpowers/sdd/task-5-report.md`. Fora a guarda nova, cada função abaixo é uma
-- cópia literal do que o banco tinha, comentários (ou a falta deles) inclusive.
--
-- 🔴 `delete_current_user` FICA DE FORA DE PROPÓSITO. Apagar a própria conta tem de continuar
-- funcionando com a empresa bloqueada — impedir alguém de sair do sistema porque a empresa dele
-- não pagou é problema de LGPD (direito de exclusão), não de cobrança. Não é esquecimento.
--
-- 🔴 `delete_obras_bulk` foi corrigida em 29/08/2026
-- (20260829120000_duas_funcoes_atravessavam_a_parede_entre_empresas.sql) para não apagar obra de
-- outra empresa, ganhando o filtro `usuario_in_my_empresa`. Essa migration reescreve a mesma
-- função de novo para acrescentar a guarda de plano — o filtro de empresa foi conferido linha a
-- linha contra o corpo atual do banco e CONTINUA no DELETE, exatamente onde a correção o deixou.
--
-- `set_whatsapp_assinar_remetente_global` só é alcançável por `is_admin()` desde a mesma
-- migration de 29/08/2026, e o admin é isento do gate por construção
-- (`empresa_plano_ativo()` termina em `OR public.is_admin()`). A guarda aqui é redundante hoje —
-- acrescentada mesmo assim, para a função não virar porta se a permissão dela mudar um dia.

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 1. criar_funil
-- ═══════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.criar_funil(p_nome text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_empresa_id UUID;
  v_funil_id UUID;
  v_ordem INTEGER;
BEGIN
  IF NOT (is_gestor() OR is_admin()) THEN
    RAISE EXCEPTION 'Apenas gestores e administradores podem criar funis';
  END IF;

  IF NOT public.empresa_plano_ativo() THEN
    RAISE EXCEPTION 'Esta ação está indisponível enquanto a assinatura estiver pendente.'
      USING ERRCODE = '42501';
  END IF;

  v_empresa_id := get_my_empresa_id();
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'Empresa não encontrada para o usuário atual';
  END IF;

  SELECT COALESCE(MAX(ordem) + 1, 0) INTO v_ordem FROM public.funis WHERE empresa_id = v_empresa_id;

  INSERT INTO public.funis (empresa_id, nome, is_padrao, ordem)
  VALUES (v_empresa_id, p_nome, false, v_ordem)
  RETURNING id INTO v_funil_id;

  INSERT INTO public.kanban_colunas (empresa_id, funil_id, slug, nome, cor, ordem, is_sistema) VALUES
    (v_empresa_id, v_funil_id, 'novo_lead', 'Novo Lead', 'kanban-new', 0, true),
    (v_empresa_id, v_funil_id, 'elaboracao', 'Elaboração de Orçamento', 'kanban-budget', 1, true),
    (v_empresa_id, v_funil_id, 'enviado', 'Orçamento Enviado', 'kanban-sent', 2, true),
    (v_empresa_id, v_funil_id, 'negociacao', 'Negociação', 'kanban-negotiation', 3, true),
    (v_empresa_id, v_funil_id, 'fechamento', 'Fechamento', 'kanban-closed', 4, true),
    (v_empresa_id, v_funil_id, 'perdido', 'Perdido', 'destructive', 5, true);

  RETURN v_funil_id;
END;
$function$
;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 2. delete_obras_bulk — o filtro de empresa (usuario_in_my_empresa) é da correção de
--    29/08/2026 e continua aqui, sem alteração nenhuma. Só a guarda de plano é nova.
-- ═══════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.delete_obras_bulk(obra_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_gestor() THEN
    RAISE EXCEPTION 'Acesso negado: Você não tem permissão para excluir obras.';
  END IF;

  IF NOT public.empresa_plano_ativo() THEN
    RAISE EXCEPTION 'Esta ação está indisponível enquanto a assinatura estiver pendente.'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.obras o
  WHERE o.id = ANY(obra_ids)
    AND EXISTS (
      SELECT 1
      FROM public.clientes c
      WHERE c.id = o.cliente_id
        AND public.usuario_in_my_empresa(c.usuario_id)
    );
END;
$function$
;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 3. liberar_envio_de_catalogo — sem checagem de papel (é "a própria pessoa, dentro da
--    janela"); a guarda entra logo após o BEGIN, antes de qualquer outra coisa.
-- ═══════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.liberar_envio_de_catalogo(p_envio_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.empresa_plano_ativo() then
    raise exception 'Esta ação está indisponível enquanto a assinatura estiver pendente.'
      using errcode = '42501';
  end if;

  -- Só a própria pessoa, e só nos primeiros minutos: sem essa janela, esta função viraria um
  -- jeito de apagar o histórico de envio de qualquer um.
  delete from fabricante_arquivo_envios
   where id = p_envio_id
     and usuario_id = get_my_usuario_id()
     and enviado_em > now() - interval '5 minutes';
end;
$function$
;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 4. reservar_envio_de_catalogo — sem checagem de papel; a guarda entra logo após o BEGIN,
--    antes das checagens de instância/limite que já existiam.
-- ═══════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.reservar_envio_de_catalogo(p_arquivo_id uuid, p_contato_id uuid, p_telefone text)
 RETURNS TABLE(ok boolean, motivo text, libera_em timestamp with time zone, envio_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_usuario_id   uuid := get_my_usuario_id();
  v_empresa_id   uuid := get_my_empresa_id();
  v_instancia_id uuid;
  v_marco        timestamptz;
  v_novo_id      uuid;
begin
  if not public.empresa_plano_ativo() then
    raise exception 'Esta ação está indisponível enquanto a assinatura estiver pendente.'
      using errcode = '42501';
  end if;

  if v_usuario_id is null or v_empresa_id is null then
    return query select false, 'sem_instancia'::text, null::timestamptz, null::uuid; return;
  end if;

  if not exists (select 1 from fabricante_arquivos a
                  where a.id = p_arquivo_id and a.empresa_id = v_empresa_id) then
    return query select false, 'sem_instancia'::text, null::timestamptz, null::uuid; return;
  end if;

  -- 🔴 O NÚMERO É RESOLVIDO AQUI, de auth.uid() — nunca informado por quem chama.
  select iu.instancia_id into v_instancia_id
    from wapi_instancia_usuarios iu where iu.usuario_auth_id = auth.uid() limit 1;
  if v_instancia_id is null then
    return query select false, 'sem_instancia'::text, null::timestamptz, null::uuid; return;
  end if;

  -- Trava 1: mesmo arquivo, MESMA PESSOA, 10 minutos.
  --   COM contato do CRM -> o contato (como sempre foi).
  --   SEM contato        -> o telefone. É o caso das conversas de WhatsApp: com contato nulo,
  --                         `is not distinct from` casava com TODAS elas, e o sistema recusava
  --                         o envio para a Maria dizendo que ela já tinha recebido.
  select max(e.enviado_em) + interval '10 minutes' into v_marco
    from fabricante_arquivo_envios e
   where e.arquivo_id = p_arquivo_id
     and e.enviado_em > now() - interval '10 minutes'
     and (
       (p_contato_id is not null and e.contato_id = p_contato_id)
       or
       (p_contato_id is null and e.contato_id is null
          and p_telefone is not null and e.telefone = p_telefone)
     );
  if v_marco is not null then
    return query select false, 'repeticao'::text, v_marco, null::uuid; return;
  end if;

  -- Trava 2: a pessoa
  select min(x.enviado_em) + interval '1 hour' into v_marco
    from (select enviado_em from fabricante_arquivo_envios
           where usuario_id = v_usuario_id and enviado_em > now() - interval '1 hour') x
   having count(*) >= 10;
  if v_marco is not null then
    return query select false, 'teto_pessoa_hora'::text, v_marco, null::uuid; return;
  end if;

  if (select count(*) from fabricante_arquivo_envios
       where usuario_id = v_usuario_id and enviado_em > now() - interval '1 day') >= 40 then
    return query select false, 'teto_pessoa_dia'::text, null::timestamptz, null::uuid; return;
  end if;

  -- Trava 3: o NÚMERO. É esta que protege o ativo.
  select min(x.enviado_em) + interval '1 hour' into v_marco
    from (select enviado_em from fabricante_arquivo_envios
           where instancia_id = v_instancia_id and enviado_em > now() - interval '1 hour') x
   having count(*) >= 40;
  if v_marco is not null then
    return query select false, 'teto_numero_hora'::text, v_marco, null::uuid; return;
  end if;

  if (select count(*) from fabricante_arquivo_envios
       where instancia_id = v_instancia_id and enviado_em > now() - interval '1 day') >= 150 then
    return query select false, 'teto_numero_dia'::text, null::timestamptz, null::uuid; return;
  end if;

  insert into fabricante_arquivo_envios
    (empresa_id, arquivo_id, contato_id, telefone, instancia_id, usuario_id)
  values (v_empresa_id, p_arquivo_id, p_contato_id, p_telefone, v_instancia_id, v_usuario_id)
  returning id into v_novo_id;

  return query select true, null::text, null::timestamptz, v_novo_id;
end;
$function$
;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 5. restaurar_usuario_por_email — a guarda entra depois das TRÊS checagens de papel que já
--    existiam (é admin ou gestor / só admin concede admin / gestor só age na própria empresa),
--    antes de qualquer leitura ou escrita de dado.
-- ═══════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.restaurar_usuario_por_email(p_email text, p_nome text, p_role text, p_empresa_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_usuario_id UUID;
  v_existing RECORD;
  v_minha_empresa UUID;
BEGIN
  IF NOT (is_admin() OR is_gestor()) THEN
    RAISE EXCEPTION 'Sem permissão para restaurar usuários.' USING ERRCODE = '42501';
  END IF;

  IF p_role = 'admin' AND NOT is_admin() THEN
    RAISE EXCEPTION 'Sem permissão para conceder acesso de administrador.' USING ERRCODE = '42501';
  END IF;

  IF NOT is_admin() THEN
    v_minha_empresa := get_my_empresa_id();
    IF p_empresa_id IS DISTINCT FROM v_minha_empresa THEN
      RAISE EXCEPTION 'Sem permissão para vincular usuários a outra empresa.' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NOT public.empresa_plano_ativo() THEN
    RAISE EXCEPTION 'Esta ação está indisponível enquanto a assinatura estiver pendente.'
      USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = p_email
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Nenhuma conta de acesso encontrada com esse email.');
  END IF;

  SELECT * INTO v_existing
  FROM usuarios
  WHERE user_id = v_user_id
  LIMIT 1;

  IF v_existing.id IS NOT NULL AND NOT is_admin()
     AND v_existing.empresa_id IS DISTINCT FROM v_minha_empresa THEN
    RAISE EXCEPTION 'Este usuário pertence a outra empresa.' USING ERRCODE = '42501';
  END IF;

  IF v_existing.id IS NOT NULL THEN
    UPDATE usuarios
    SET deleted_at = NULL,
        nome = COALESCE(p_nome, v_existing.nome),
        role = COALESCE(p_role, v_existing.role),
        empresa_id = COALESCE(p_empresa_id, v_existing.empresa_id)
    WHERE id = v_existing.id;

    RETURN jsonb_build_object('action', 'restored', 'id', v_existing.id, 'user_id', v_user_id);
  ELSE
    INSERT INTO usuarios (user_id, email, nome, role, empresa_id)
    VALUES (v_user_id, p_email, p_nome, p_role, p_empresa_id)
    RETURNING id INTO v_usuario_id;

    RETURN jsonb_build_object('action', 'created', 'id', v_usuario_id, 'user_id', v_user_id);
  END IF;
END;
$function$
;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 6. set_whatsapp_assinar_remetente_global — só is_admin() chega aqui, e admin é isento do
--    gate por construção. Guarda redundante hoje, acrescentada para não virar porta se a
--    permissão desta função mudar no futuro.
-- ═══════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.set_whatsapp_assinar_remetente_global(p_valor boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_afetadas integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas o administrador global pode alterar a preferência de assinatura do WhatsApp.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.empresa_plano_ativo() THEN
    RAISE EXCEPTION 'Esta ação está indisponível enquanto a assinatura estiver pendente.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.empresas
    SET whatsapp_assinar_remetente = p_valor;

  GET DIAGNOSTICS v_afetadas = ROW_COUNT;
  RETURN v_afetadas;
END;
$function$
;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 7. wa_iniciar_conversa — sem checagem de papel (qualquer usuário autenticado com empresa
--    pode abrir conversa); a guarda entra logo após o BEGIN, antes da resolução de empresa.
-- ═══════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.wa_iniciar_conversa(p_telefone text, p_nome_contato text DEFAULT NULL::text, p_cliente_id uuid DEFAULT NULL::uuid)
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
  IF NOT public.empresa_plano_ativo() THEN
    RAISE EXCEPTION 'Esta ação está indisponível enquanto a assinatura estiver pendente.'
      USING ERRCODE = '42501';
  END IF;

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
$function$
;
