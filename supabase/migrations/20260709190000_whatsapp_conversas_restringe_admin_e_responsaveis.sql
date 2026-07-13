-- Restringe a visibilidade das conversas de WhatsApp: até aqui, qualquer usuário da
-- empresa enxergava todas as conversas (whatsapp_conversas/whatsapp_mensagens tinham
-- policy "FOR ALL USING (empresa_id = minha empresa)"). Passa a ser: admin global,
-- admin da empresa (usuarios.role = 'empresa') ou usuário atribuído como responsável
-- pela conversa específica (whatsapp_conversa_responsaveis) — mesmo padrão já usado
-- para restringir a exclusão do chat interno (ver 20260709130000/20260709140000).
--
-- Criar uma conversa continua liberado para qualquer usuário da empresa (é assim que
-- "Nova conversa" funciona hoje, via upsert client-side) — só a leitura/edição de
-- conversas já existentes fica restrita. Um trigger auto-atribui quem criou a
-- conversa como responsável, senão a linha recém-criada não passaria na policy de
-- SELECT usada no RETURNING do upsert e o usuário "perderia" a conversa que acabou
-- de iniciar.

CREATE OR REPLACE FUNCTION public.can_access_wa_conversa(_conversa_id uuid)
 RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM whatsapp_conversas c
    WHERE c.id = _conversa_id
      AND c.empresa_id = get_my_empresa_id()
      AND (
        is_admin()
        OR EXISTS (SELECT 1 FROM usuarios WHERE user_id = auth.uid() AND role = 'empresa')
        OR EXISTS (
          SELECT 1 FROM whatsapp_conversa_responsaveis wcr
          WHERE wcr.conversa_id = c.id AND wcr.usuario_id = get_my_usuario_id()
        )
      )
  );
$$;

-- whatsapp_conversas
DROP POLICY IF EXISTS "empresa_own_conversas" ON whatsapp_conversas;
CREATE POLICY "wa_conversas_access" ON whatsapp_conversas
  FOR ALL
  USING (can_access_wa_conversa(id))
  WITH CHECK (empresa_id = get_my_empresa_id());

-- whatsapp_mensagens
DROP POLICY IF EXISTS "empresa_own_mensagens" ON whatsapp_mensagens;
CREATE POLICY "wa_mensagens_access" ON whatsapp_mensagens
  FOR ALL
  USING (can_access_wa_conversa(conversa_id))
  WITH CHECK (empresa_id = get_my_empresa_id());

-- whatsapp_conversa_responsaveis: quem tem acesso à conversa gerencia seus
-- responsáveis (é o que faz a opção "Responsáveis pelo atendimento" do LeadSheet
-- funcionar: admin/admin da empresa gerenciam qualquer conversa; um responsável
-- atual pode incluir/remover colegas na mesma conversa).
DO $$
BEGIN
  IF to_regclass('public.whatsapp_conversa_responsaveis') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.whatsapp_conversa_responsaveis ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "empresa_own_wa_responsaveis" ON public.whatsapp_conversa_responsaveis';
    EXECUTE 'DROP POLICY IF EXISTS "wa_conversa_responsaveis_access" ON public.whatsapp_conversa_responsaveis';

    EXECUTE 'CREATE POLICY "wa_conversa_responsaveis_access" ON public.whatsapp_conversa_responsaveis
      FOR ALL USING (public.can_access_wa_conversa(conversa_id))
      WITH CHECK (public.can_access_wa_conversa(conversa_id))';

    -- Necessária para o ON CONFLICT DO NOTHING do trigger abaixo.
    BEGIN
      ALTER TABLE public.whatsapp_conversa_responsaveis
        ADD CONSTRAINT whatsapp_conversa_responsaveis_conversa_usuario_key
        UNIQUE (conversa_id, usuario_id);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

-- Auto-atribui quem inicia uma conversa nova como responsável, para que a linha
-- recém-criada continue visível para quem a criou. auth.uid() só existe quando o
-- insert vem do client autenticado (ex: "Nova conversa"); inserts feitos por edge
-- functions com a service role (webhook, envio, criação de grupo) não passam por
-- aqui e cuidam de si mesmos (ver ensureResponsavel em whatsapp-send).
CREATE OR REPLACE FUNCTION public.wa_conversa_auto_responsavel()
 RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_usuario_id uuid;
BEGIN
  v_usuario_id := public.get_my_usuario_id();
  IF v_usuario_id IS NOT NULL THEN
    INSERT INTO public.whatsapp_conversa_responsaveis (conversa_id, usuario_id)
    VALUES (NEW.id, v_usuario_id)
    ON CONFLICT (conversa_id, usuario_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wa_conversa_auto_responsavel ON whatsapp_conversas;
CREATE TRIGGER trg_wa_conversa_auto_responsavel
  AFTER INSERT ON whatsapp_conversas
  FOR EACH ROW EXECUTE FUNCTION public.wa_conversa_auto_responsavel();
