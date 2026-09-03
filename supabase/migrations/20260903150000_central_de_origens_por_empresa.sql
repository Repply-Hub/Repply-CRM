-- Central de Origens: a lista de origens do negócio (campo "Origem" do cadastro de
-- negócio) deixa de ser um array fixo no código + localStorage por navegador
-- (DEFAULT_ORIGENS + 'custom_origens' em NovoNegocioDialog.tsx / EditarPedido.tsx) e
-- passa a viver no banco, por empresa, com o gestor podendo criar, renomear, reordenar
-- e excluir.
--
-- Mesmo padrão da migration 20260903140000 (cargos_contato): tabela própria por
-- empresa, com `ordem` e `is_sistema`. A diferença é a coluna `valor`: `pedidos.origem_lead`
-- guarda um slug (ex.: 'prospeccao_ativa'), não o rótulo. `valor` é o que grava lá e é
-- ESTÁVEL — renomear a origem não mexe nele, então negócio antigo continua casando.
--
-- As 4 origens que hoje vêm embutidas no código entram como `is_sistema = true`, com os
-- MESMOS slugs de antes: o gestor pode reordená-las, mas não renomear nem excluir (trava
-- no trigger abaixo, além da UI). `pedidos.origem_lead` NÃO é migrado nem mexido — quem
-- tiver uma origem fora da lista continua aparecendo com o valor que tem (o
-- OrigemLeadSelect já trata isso).

CREATE TABLE public.origens_pedido (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  valor TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  is_sistema BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Duas origens com o mesmo nome na mesma empresa não fazem sentido; a comparação é
-- sem caixa ("recompra" == "Recompra"), igual ao cargos_contato.
CREATE UNIQUE INDEX idx_origens_pedido_empresa_nome
  ON public.origens_pedido(empresa_id, lower(nome));

-- E dois slugs iguais colidiriam ao gravar em pedidos.origem_lead.
CREATE UNIQUE INDEX idx_origens_pedido_empresa_valor
  ON public.origens_pedido(empresa_id, valor);

CREATE INDEX idx_origens_pedido_empresa ON public.origens_pedido(empresa_id, ordem);

ALTER TABLE public.origens_pedido ENABLE ROW LEVEL SECURITY;

-- Ver: qualquer membro da empresa (todo mundo precisa da lista para escolher a origem).
CREATE POLICY "origens_pedido_select"
ON public.origens_pedido FOR SELECT TO authenticated
USING (is_admin() OR empresa_id = get_my_empresa_id());

-- Escrever: só gestor/admin/empresa, e só na própria empresa. Mesmo recorte de
-- cargos_contato_insert/update/delete.
CREATE POLICY "origens_pedido_insert"
ON public.origens_pedido FOR INSERT TO authenticated
WITH CHECK (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id()));

CREATE POLICY "origens_pedido_update"
ON public.origens_pedido FOR UPDATE TO authenticated
USING (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id()));

CREATE POLICY "origens_pedido_delete"
ON public.origens_pedido FOR DELETE TO authenticated
USING (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id()));

CREATE TRIGGER update_origens_pedido_updated_at
BEFORE UPDATE ON public.origens_pedido
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Origem padrão é intocável no nome e no slug e não pode ser excluída — só reordenada.
-- A UI já desabilita os botões; isto fecha a porta para uma chamada crua fazer o mesmo.
CREATE OR REPLACE FUNCTION public.protege_origem_pedido_sistema()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_sistema THEN
      RAISE EXCEPTION 'Origem padrão do sistema não pode ser excluída';
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE: em linha de sistema, deixa mudar só ordem/updated_at.
  IF OLD.is_sistema THEN
    IF NEW.nome IS DISTINCT FROM OLD.nome THEN
      RAISE EXCEPTION 'Origem padrão do sistema não pode ser renomeada';
    END IF;
    IF NEW.valor IS DISTINCT FROM OLD.valor THEN
      RAISE EXCEPTION 'Origem padrão do sistema não pode ter o valor alterado';
    END IF;
    IF NEW.is_sistema IS DISTINCT FROM OLD.is_sistema THEN
      RAISE EXCEPTION 'Não é possível alterar a marca de origem padrão';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protege_origem_pedido_sistema
BEFORE UPDATE OR DELETE ON public.origens_pedido
FOR EACH ROW EXECUTE FUNCTION public.protege_origem_pedido_sistema();

-- Popular as 4 origens padrão para todas as empresas existentes. Mesma lista, mesma
-- ordem e MESMOS slugs que DEFAULT_ORIGENS em NovoNegocioDialog.tsx / EditarPedido.tsx.
INSERT INTO public.origens_pedido (empresa_id, nome, valor, ordem, is_sistema)
SELECT e.id, v.nome, v.valor, v.ordem, true
FROM public.empresas e
CROSS JOIN (VALUES
  ('Recompra', 'recompra', 0),
  ('Prospecção Ativa', 'prospeccao_ativa', 1),
  ('Indicação', 'indicacao', 2),
  ('Obra Nova', 'obra_nova', 3)
) AS v(nome, valor, ordem)
ON CONFLICT (empresa_id, lower(nome)) DO NOTHING;

-- Nova empresa nasce com a mesma lista.
CREATE OR REPLACE FUNCTION public.criar_origens_pedido_padrao()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.origens_pedido (empresa_id, nome, valor, ordem, is_sistema) VALUES
    (NEW.id, 'Recompra', 'recompra', 0, true),
    (NEW.id, 'Prospecção Ativa', 'prospeccao_ativa', 1, true),
    (NEW.id, 'Indicação', 'indicacao', 2, true),
    (NEW.id, 'Obra Nova', 'obra_nova', 3, true)
  ON CONFLICT (empresa_id, lower(nome)) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_criar_origens_pedido_padrao
AFTER INSERT ON public.empresas
FOR EACH ROW EXECUTE FUNCTION public.criar_origens_pedido_padrao();
