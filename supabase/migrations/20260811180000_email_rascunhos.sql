-- Rascunhos de e-mail — autosave da composição, uma linha por rascunho.
--
-- Tabela nova, e não uma extensão de email_mensagens: rascunho não tem
-- direção, não tem thread no provedor e nunca é sincronizado com o Nylas.
-- Misturar os dois modelos faria toda query da caixa (direção, pastas,
-- nylas_message_id...) ter que lidar com uma linha que não tem nada disso.
--
-- `atualizado_em` é gravado pelo próprio cliente a cada autosave (não por
-- trigger): `update_updated_at_column()` já existente no schema escreve em
-- `updated_at`, nome que esta tabela não usa, e criar uma segunda função só
-- para trocar o nome da coluna não paga a complexidade a mais.

CREATE TABLE IF NOT EXISTS public.email_rascunhos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,

  destinatario TEXT,
  assunto TEXT,
  corpo TEXT,

  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sustenta tanto "meu rascunho mais recente" (autosave ao abrir o compositor
-- em branco) quanto a listagem da aba Rascunhos, ordenada por atualização.
CREATE INDEX IF NOT EXISTS idx_email_rascunhos_usuario
  ON public.email_rascunhos (usuario_id, atualizado_em DESC);

ALTER TABLE public.email_rascunhos ENABLE ROW LEVEL SECURITY;

-- Rascunho é pessoal: mesmo dentro da mesma empresa, ninguém lê o rascunho de
-- outro vendedor — ao contrário de email_mensagens, que é a caixa
-- COMPARTILHADA do time. is_admin() entra pelo mesmo motivo de sempre:
-- suporte/depuração sem exigir troca de sessão.
DROP POLICY IF EXISTS email_rascunhos_select ON public.email_rascunhos;
CREATE POLICY email_rascunhos_select ON public.email_rascunhos
FOR SELECT TO authenticated
USING (is_admin() OR (empresa_id = get_my_empresa_id() AND usuario_id = get_my_usuario_id()));

DROP POLICY IF EXISTS email_rascunhos_insert ON public.email_rascunhos;
CREATE POLICY email_rascunhos_insert ON public.email_rascunhos
FOR INSERT TO authenticated
WITH CHECK (empresa_id = get_my_empresa_id() AND usuario_id = get_my_usuario_id());

DROP POLICY IF EXISTS email_rascunhos_update ON public.email_rascunhos;
CREATE POLICY email_rascunhos_update ON public.email_rascunhos
FOR UPDATE TO authenticated
USING (is_admin() OR (empresa_id = get_my_empresa_id() AND usuario_id = get_my_usuario_id()))
WITH CHECK (empresa_id = get_my_empresa_id() AND usuario_id = get_my_usuario_id());

DROP POLICY IF EXISTS email_rascunhos_delete ON public.email_rascunhos;
CREATE POLICY email_rascunhos_delete ON public.email_rascunhos
FOR DELETE TO authenticated
USING (is_admin() OR (empresa_id = get_my_empresa_id() AND usuario_id = get_my_usuario_id()));
