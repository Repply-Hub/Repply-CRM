-- Vendedores (usuários comuns) não enxergavam conversas de WhatsApp sem
-- responsável: can_access_wa_conversa só liberava conversas não atribuídas
-- para admin/gestor/empresa, obrigando o vendedor a depender de alguém com
-- esse papel para "empurrar" a conversa antes dele conseguir vê-la.
--
-- Agora qualquer usuário da mesma empresa pode ver (e assumir) uma conversa
-- que ainda não tem nenhum responsável, mantendo a regra de que conversas
-- já atribuídas a outra pessoa continuam visíveis só para quem é
-- admin/gestor/empresa ou está entre os responsáveis.

CREATE OR REPLACE FUNCTION public.can_access_wa_conversa(_conversa_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        OR NOT EXISTS (
          SELECT 1 FROM whatsapp_conversa_responsaveis wcr2
          WHERE wcr2.conversa_id = c.id
        )
      )
  );
$function$;
