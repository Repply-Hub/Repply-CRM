-- Central de Cargos: a lista de cargos de contato deixa de ser um array fixo no
-- código + localStorage por navegador (src/components/shared/CargoSelect.tsx) e passa
-- a viver no banco, por empresa, com o gestor podendo criar, renomear, reordenar e
-- excluir.
--
-- Mesmo padrão de `tarefas_kanban_colunas` / `kanban_colunas`: tabela própria por
-- empresa, com `ordem` e `is_sistema`. Sem `slug` — `contatos.cargo` é texto livre e
-- o casamento é pelo nome. Sem `cor`.
--
-- Os 9 cargos que hoje vêm embutidos no código entram como `is_sistema = true`: o
-- gestor pode reordená-los, mas não renomear nem excluir (trava no trigger abaixo,
-- além da UI). `contatos.cargo` NÃO é migrado nem mexido — quem tiver um cargo fora
-- da lista continua aparecendo com o texto que tem (o CargoSelect já trata isso).

CREATE TABLE public.cargos_contato (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  is_sistema BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Dois cargos com o mesmo nome na mesma empresa não fazem sentido, e o CargoSelect
-- sempre comparou sem caixa ("comprador" == "Comprador") — o índice reflete isso.
CREATE UNIQUE INDEX idx_cargos_contato_empresa_nome
  ON public.cargos_contato(empresa_id, lower(nome));

CREATE INDEX idx_cargos_contato_empresa ON public.cargos_contato(empresa_id, ordem);

ALTER TABLE public.cargos_contato ENABLE ROW LEVEL SECURITY;

-- Ver: qualquer membro da empresa (todo mundo precisa da lista para escolher o cargo).
CREATE POLICY "cargos_contato_select"
ON public.cargos_contato FOR SELECT TO authenticated
USING (is_admin() OR empresa_id = get_my_empresa_id());

-- Escrever: só gestor/admin/empresa, e só na própria empresa. Mesmo recorte de
-- `tarefas_kanban_colunas_insert/update/delete`.
CREATE POLICY "cargos_contato_insert"
ON public.cargos_contato FOR INSERT TO authenticated
WITH CHECK (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id()));

CREATE POLICY "cargos_contato_update"
ON public.cargos_contato FOR UPDATE TO authenticated
USING (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id()));

CREATE POLICY "cargos_contato_delete"
ON public.cargos_contato FOR DELETE TO authenticated
USING (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id()));

CREATE TRIGGER update_cargos_contato_updated_at
BEFORE UPDATE ON public.cargos_contato
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Cargo padrão é intocável no nome e não pode ser excluído — só reordenado. A UI já
-- desabilita os botões; isto fecha a porta para uma chamada crua fazer o mesmo.
CREATE OR REPLACE FUNCTION public.protege_cargo_sistema()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_sistema THEN
      RAISE EXCEPTION 'Cargo padrão do sistema não pode ser excluído';
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE: em linha de sistema, deixa mudar só ordem/updated_at.
  IF OLD.is_sistema THEN
    IF NEW.nome IS DISTINCT FROM OLD.nome THEN
      RAISE EXCEPTION 'Cargo padrão do sistema não pode ser renomeado';
    END IF;
    IF NEW.is_sistema IS DISTINCT FROM OLD.is_sistema THEN
      RAISE EXCEPTION 'Não é possível alterar a marca de cargo padrão';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protege_cargo_sistema
BEFORE UPDATE OR DELETE ON public.cargos_contato
FOR EACH ROW EXECUTE FUNCTION public.protege_cargo_sistema();

-- Popular os 9 cargos padrão para todas as empresas existentes. Mesma lista, mesma
-- ordem que `BASE_CARGOS` em src/components/shared/CargoSelect.tsx.
INSERT INTO public.cargos_contato (empresa_id, nome, ordem, is_sistema)
SELECT e.id, v.nome, v.ordem, true
FROM public.empresas e
CROSS JOIN (VALUES
  ('Comprador', 0),
  ('Engenheiro', 1),
  ('Arquiteto', 2),
  ('Mestre de Obras', 3),
  ('Gerente de Obras', 4),
  ('Diretor', 5),
  ('Sócio/Proprietário', 6),
  ('Financeiro', 7),
  ('Almoxarife', 8)
) AS v(nome, ordem)
ON CONFLICT (empresa_id, lower(nome)) DO NOTHING;

-- Nova empresa nasce com a mesma lista.
CREATE OR REPLACE FUNCTION public.criar_cargos_contato_padrao()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.cargos_contato (empresa_id, nome, ordem, is_sistema) VALUES
    (NEW.id, 'Comprador', 0, true),
    (NEW.id, 'Engenheiro', 1, true),
    (NEW.id, 'Arquiteto', 2, true),
    (NEW.id, 'Mestre de Obras', 3, true),
    (NEW.id, 'Gerente de Obras', 4, true),
    (NEW.id, 'Diretor', 5, true),
    (NEW.id, 'Sócio/Proprietário', 6, true),
    (NEW.id, 'Financeiro', 7, true),
    (NEW.id, 'Almoxarife', 8, true)
  ON CONFLICT (empresa_id, lower(nome)) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_criar_cargos_contato_padrao
AFTER INSERT ON public.empresas
FOR EACH ROW EXECUTE FUNCTION public.criar_cargos_contato_padrao();
