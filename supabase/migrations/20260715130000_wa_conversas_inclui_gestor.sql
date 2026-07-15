-- A policy de leitura de whatsapp_conversas/whatsapp_mensagens criada em
-- 20260709190000 liberava acesso total à empresa apenas para admin global e
-- usuarios.role = 'empresa', deixando de fora usuarios.role = 'gestor'. Isso
-- era intencional para as policies de EXCLUSÃO (limpar chat, apagar grupo —
-- ver 20260709130000/20260709140000), mas foi aplicado por engano também à
-- policy de SELECT de conversas de WhatsApp: um gestor deixou de enxergar
-- conversas não atribuídas (sem linha em whatsapp_conversa_responsaveis),
-- porque nenhuma das três condições da função passava para ele.
--
-- Aqui a condição passa a aceitar também role = 'gestor', restaurando a
-- visibilidade de todas as conversas da empresa (inclusive as não
-- atribuídas) para gestores, mantendo a mesma regra para admin/'empresa'.

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
        OR EXISTS (SELECT 1 FROM usuarios WHERE user_id = auth.uid() AND role IN ('empresa', 'gestor'))
        OR EXISTS (
          SELECT 1 FROM whatsapp_conversa_responsaveis wcr
          WHERE wcr.conversa_id = c.id AND wcr.usuario_id = get_my_usuario_id()
        )
      )
  );
$$;
