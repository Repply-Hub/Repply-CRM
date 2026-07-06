-- Fase 5 do plano de consolidacao multi-tenant do Gmail OAuth2/projetos Supabase
-- (ver scripts/migration/INVESTIGACAO.md secoes 3-4): configuracoes_automacao e o bloqueador
-- confirmado por teste real (dry-run) - UNIQUE(chave) global e RLS de SELECT "USING (true)"
-- impedem consolidar mais de uma empresa nessa tabela sem colisao e sem isolamento de leitura.
--
-- Reversao manual (nao ha DOWN automatico neste projeto): para reverter, nessa ordem,
--   1) DROP POLICY automacao_config_select/_upsert/_update e recriar com USING (true) /
--      WITH CHECK (is_gestor()) como em 20260306171805 + 20260413223933;
--   2) ALTER TABLE public.configuracoes_automacao DROP CONSTRAINT configuracoes_automacao_empresa_chave_key;
--      ADD CONSTRAINT configuracoes_automacao_chave_key UNIQUE (chave) -- só funciona se sobrar 1 linha por chave;
--   3) DELETE as linhas duplicadas criadas pelo backfill do passo 2 abaixo (identificáveis por
--      terem o mesmo "chave" e "valor" que a linha da empresa mais antiga) antes do passo 2 acima,
--      caso existam múltiplas empresas;
--   4) ALTER TABLE public.configuracoes_automacao DROP COLUMN empresa_id;

-- 1. Adiciona empresa_id (nullable por enquanto - populado no passo 2 antes de virar NOT NULL)
ALTER TABLE public.configuracoes_automacao
  ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id);

-- 2. Backfill. A tabela nunca guardou a relacao com empresa (ela nasceu como config global de um
-- deploy single-tenant), entao a unica fonte disponivel dentro do proprio projeto e a tabela
-- empresas. Em todo projeto single-tenant hoje existe exatamente UMA empresa real, que fica com a
-- linha original. O laco por "empresa extra" abaixo e apenas defensivo, para nao perder dados caso
-- um projeto especifico já tenha mais de uma linha em empresas (nesse caso cada empresa adicional
-- recebe uma COPIA da config vigente, nunca NULL).
DO $$
DECLARE
  v_primeira_empresa UUID;
  v_config RECORD;
  v_empresa RECORD;
BEGIN
  SELECT id INTO v_primeira_empresa FROM public.empresas ORDER BY created_at ASC LIMIT 1;

  IF v_primeira_empresa IS NULL THEN
    RAISE NOTICE 'Nenhuma linha em public.empresas neste projeto - configuracoes_automacao.empresa_id permanecera NULL ate a primeira empresa ser criada (esperado apenas em projeto recem-provisionado).';
  ELSE
    FOR v_config IN SELECT * FROM public.configuracoes_automacao WHERE empresa_id IS NULL LOOP
      UPDATE public.configuracoes_automacao SET empresa_id = v_primeira_empresa WHERE id = v_config.id;

      FOR v_empresa IN SELECT id FROM public.empresas WHERE id <> v_primeira_empresa LOOP
        INSERT INTO public.configuracoes_automacao (empresa_id, chave, valor, updated_at, updated_by)
        VALUES (v_empresa.id, v_config.chave, v_config.valor, v_config.updated_at, v_config.updated_by);
      END LOOP;
    END LOOP;
  END IF;
END $$;

-- 3. So exige NOT NULL se o backfill conseguiu popular todas as linhas - evita travar um projeto
-- recem-provisionado sem nenhuma empresa ainda, mas nao permite NULL silencioso quando ja ha dados.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.configuracoes_automacao WHERE empresa_id IS NULL) THEN
    ALTER TABLE public.configuracoes_automacao ALTER COLUMN empresa_id SET NOT NULL;
  END IF;
END $$;

-- 4. Troca UNIQUE(chave) global por UNIQUE(empresa_id, chave). Nome da constraint antiga
-- confirmado empiricamente (reproduzido no dry-run da fase 5): configuracoes_automacao_chave_key.
ALTER TABLE public.configuracoes_automacao DROP CONSTRAINT IF EXISTS configuracoes_automacao_chave_key;
ALTER TABLE public.configuracoes_automacao
  ADD CONSTRAINT configuracoes_automacao_empresa_chave_key UNIQUE (empresa_id, chave);

-- 5. RLS: mesmo padrao (is_admin() / is_gestor() / get_my_empresa_id()) ja usado no restante do
-- schema desde a migration 20260413223933 (empresas, clientes, pedidos, etc.) - nao inventa um
-- padrao novo.
DROP POLICY IF EXISTS "automacao_config_select" ON public.configuracoes_automacao;
CREATE POLICY "automacao_config_select" ON public.configuracoes_automacao
  FOR SELECT TO authenticated
  USING (is_admin() OR empresa_id = get_my_empresa_id());

DROP POLICY IF EXISTS "automacao_config_upsert" ON public.configuracoes_automacao;
CREATE POLICY "automacao_config_upsert" ON public.configuracoes_automacao
  FOR INSERT TO authenticated
  WITH CHECK (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id()));

DROP POLICY IF EXISTS "automacao_config_update" ON public.configuracoes_automacao;
CREATE POLICY "automacao_config_update" ON public.configuracoes_automacao
  FOR UPDATE TO authenticated
  USING (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id()));
