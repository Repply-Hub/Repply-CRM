-- Registra quem abriu uma conversa de WhatsApp enquanto ela ainda estava sem
-- responsável — dá pro gestor ver, na lista de "Não atribuídas", quem do time
-- está entrando na conversa e não está assumindo. É um registro à parte do
-- estado de lida/não lida (whatsapp_mensagens.lida / whatsapp_conversas.nao_lidas)
-- e não interfere nele: abrir a conversa continua marcando como lida do jeito
-- que já funciona hoje, isso aqui só soma uma visualização por usuário.
--
-- Uma linha por (conversa, usuário) — reabrir não duplica, só atualiza
-- `visualizado_em` (upsert client-side). Não é limpo quando a conversa é
-- atribuída: o histórico de quem olhou antes de alguém assumir continua
-- existindo, só deixa de aparecer na tela porque a seção "Não atribuídas" some.

CREATE TABLE IF NOT EXISTS public.whatsapp_conversa_visualizacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id uuid NOT NULL REFERENCES public.whatsapp_conversas(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  visualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversa_id, usuario_id)
);

CREATE INDEX IF NOT EXISTS idx_wa_conversa_visualizacoes_conversa
  ON public.whatsapp_conversa_visualizacoes (conversa_id);

ALTER TABLE public.whatsapp_conversa_visualizacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_conversa_visualizacoes_select" ON public.whatsapp_conversa_visualizacoes;
CREATE POLICY "wa_conversa_visualizacoes_select" ON public.whatsapp_conversa_visualizacoes
  FOR SELECT
  USING (public.can_access_wa_conversa(conversa_id));

-- Só registra visualização própria (usuario_id = quem está logado) — ninguém
-- pode inserir uma linha fingindo que outro colega abriu a conversa.
DROP POLICY IF EXISTS "wa_conversa_visualizacoes_insert" ON public.whatsapp_conversa_visualizacoes;
CREATE POLICY "wa_conversa_visualizacoes_insert" ON public.whatsapp_conversa_visualizacoes
  FOR INSERT
  WITH CHECK (
    public.can_access_wa_conversa(conversa_id)
    AND usuario_id = public.get_my_usuario_id()
  );

DROP POLICY IF EXISTS "wa_conversa_visualizacoes_update" ON public.whatsapp_conversa_visualizacoes;
CREATE POLICY "wa_conversa_visualizacoes_update" ON public.whatsapp_conversa_visualizacoes
  FOR UPDATE
  USING (usuario_id = public.get_my_usuario_id())
  WITH CHECK (usuario_id = public.get_my_usuario_id());
