-- ============================================================================
-- FIGURINHAS DO WHATSAPP — a coleção que "circula" em cada número
-- ============================================================================
--
-- O WhatsApp não expõe, para nenhuma API de bot (uazapi, wuzapi, Baileys), a
-- gaveta de figurinhas salvas no aparelho. "Sincronizado com as figurinhas
-- disponíveis do número da instância" virou então: toda figurinha que já PASSOU
-- por aquele número — recebida de um contato ou enviada pelo CRM — fica guardada
-- aqui e reaparece no seletor de figurinhas do compositor.
--
-- Quem popula esta tabela são as functions do servidor (service_role), em
-- `whatsapp-webhook` (figurinha recebida) e `whatsapp-send` (figurinha enviada),
-- via o helper `_shared/figurinhas.ts`. O app só LÊ e marca `removida_em`.
--
-- A deduplicação é por CONTEÚDO (`media_hash` = sha256 dos bytes do arquivo):
-- a mesma figurinha recebida dez vezes gera dez arquivos diferentes no Storage,
-- mas um `media_hash` só, então aparece uma vez na grade.
--
-- `removida_em` é decisão explícita do atendente ("tirar da grade") e vence: uma
-- figurinha removida não volta a aparecer mesmo que circule de novo (o upsert do
-- helper não toca nessa coluna).

CREATE TABLE IF NOT EXISTS public.whatsapp_figurinhas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  instancia_id uuid NOT NULL REFERENCES public.configuracoes_wapi(id) ON DELETE CASCADE,
  media_url text NOT NULL,
  media_hash text NOT NULL,
  media_mime text,
  origem text NOT NULL CHECK (origem IN ('recebida', 'enviada')),
  criada_em timestamptz NOT NULL DEFAULT now(),
  ultima_vez_em timestamptz NOT NULL DEFAULT now(),
  removida_em timestamptz,
  UNIQUE (instancia_id, media_hash)
);

-- A grade lê por número, só as não removidas, mais recente primeiro.
CREATE INDEX IF NOT EXISTS idx_wa_figurinhas_grade
  ON public.whatsapp_figurinhas (instancia_id, ultima_vez_em DESC)
  WHERE removida_em IS NULL;

ALTER TABLE public.whatsapp_figurinhas ENABLE ROW LEVEL SECURITY;

-- Ver e gerenciar: qualquer usuário VINCULADO AO NÚMERO (wapi_instancia_usuarios),
-- da mesma empresa. É a mesma cerca de número de `can_access_wa_conversa`
-- (20260902170000): `usuario_auth_id` é da família `auth.uid()`.
--
-- INSERT tem duas origens: as functions do servidor (service_role, passam por cima
-- da RLS) e o botão "Salvar figurinha" numa mensagem de figurinha do chat, que grava
-- direto pelo cliente autenticado — por isso a política de INSERT abaixo.
DROP POLICY IF EXISTS "wa_figurinhas_select" ON public.whatsapp_figurinhas;
CREATE POLICY "wa_figurinhas_select" ON public.whatsapp_figurinhas
  FOR SELECT
  USING (
    empresa_id = public.get_my_empresa_id()
    AND EXISTS (
      SELECT 1 FROM public.wapi_instancia_usuarios wiu
      WHERE wiu.instancia_id = whatsapp_figurinhas.instancia_id
        AND wiu.usuario_auth_id = auth.uid()
    )
  );

-- "Salvar figurinha" (botão na mensagem de figurinha do chat) grava direto pelo
-- cliente. `empresa_id` e o vínculo ao número são checados aqui — a function do
-- servidor não precisa desta política porque roda com a chave de serviço.
DROP POLICY IF EXISTS "wa_figurinhas_insert" ON public.whatsapp_figurinhas;
CREATE POLICY "wa_figurinhas_insert" ON public.whatsapp_figurinhas
  FOR INSERT TO authenticated
  WITH CHECK (
    empresa_id = public.get_my_empresa_id()
    AND EXISTS (
      SELECT 1 FROM public.wapi_instancia_usuarios wiu
      WHERE wiu.instancia_id = whatsapp_figurinhas.instancia_id
        AND wiu.usuario_auth_id = auth.uid()
    )
  );

-- "Tirar da grade" é UPDATE de `removida_em` — nunca DELETE (a linha guarda o
-- dedupe; apagá-la faria a figurinha voltar na próxima vez que circulasse).
-- "Salvar" uma figurinha que estava removida faz o caminho de volta pelo mesmo
-- UPDATE (removida_em de volta a NULL no upsert do cliente).
DROP POLICY IF EXISTS "wa_figurinhas_update" ON public.whatsapp_figurinhas;
CREATE POLICY "wa_figurinhas_update" ON public.whatsapp_figurinhas
  FOR UPDATE
  USING (
    empresa_id = public.get_my_empresa_id()
    AND EXISTS (
      SELECT 1 FROM public.wapi_instancia_usuarios wiu
      WHERE wiu.instancia_id = whatsapp_figurinhas.instancia_id
        AND wiu.usuario_auth_id = auth.uid()
    )
  )
  WITH CHECK (
    empresa_id = public.get_my_empresa_id()
    AND EXISTS (
      SELECT 1 FROM public.wapi_instancia_usuarios wiu
      WHERE wiu.instancia_id = whatsapp_figurinhas.instancia_id
        AND wiu.usuario_auth_id = auth.uid()
    )
  );

COMMENT ON TABLE public.whatsapp_figurinhas IS
  'Figurinhas que já circularam em cada número de WhatsApp (recebidas ou enviadas). '
  'Populada pelas functions whatsapp-webhook e whatsapp-send. Dedupe por media_hash '
  '(sha256 do arquivo). removida_em = tirada da grade pelo atendente, e não volta.';
