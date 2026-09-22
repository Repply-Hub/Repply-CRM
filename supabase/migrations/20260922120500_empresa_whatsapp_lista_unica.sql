-- Estilo da caixa de WhatsApp, por empresa: Repply (agrupa por atendente) x WhatsApp Web (lista unica).
-- false = modo Repply (padrao) | true = lista unica estilo WhatsApp Web.
--
-- Preferencia de PRODUTO que o gestor controla. Cai sob a politica empresas_update ja existente
-- (is_gestor() AND id = get_my_empresa_id(), desde 22/07/2026) e NAO e bloqueada pelo gatilho
-- impedir_escalacao_na_empresa (que so tranca owner_id e secao_preset_id). E o mesmo caminho de
-- empresas.whatsapp_assinar_remetente. Nenhuma politica nova e necessaria.
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS whatsapp_lista_unica BOOLEAN NOT NULL DEFAULT false;
