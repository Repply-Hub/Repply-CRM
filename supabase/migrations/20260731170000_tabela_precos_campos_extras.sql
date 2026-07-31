-- Adiciona coluna campos_extras (JSONB) em tabela_precos, na mesma linha de clientes/contatos/pedidos/obras
-- (20260418193314, 20260731140000). O front-end de importação de catálogo (ImportCatalogoDialog,
-- GlobalImportCatalogoDialog) já envia esse campo ao inserir produtos, mas a coluna nunca foi criada
-- nesta tabela, causando erro "Could not find the 'campos_extras' column of 'tabela_precos' in the
-- schema cache" ao importar planilhas.
ALTER TABLE public.tabela_precos
  ADD COLUMN IF NOT EXISTS campos_extras JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_tabela_precos_campos_extras ON public.tabela_precos USING GIN (campos_extras);
