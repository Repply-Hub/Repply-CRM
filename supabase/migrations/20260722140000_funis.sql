-- Suporte a múltiplos funis (pipelines) de vendas por empresa.
-- Cada empresa passa a ter N funis (antes: um único conjunto implícito de kanban_colunas).
-- kanban_colunas e pedidos passam a pertencer a um funil específico.

-- 1. Tabela funis (mesmo padrão de kanban_colunas)
CREATE TABLE public.funis (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL,
  nome TEXT NOT NULL,
  is_padrao BOOLEAN NOT NULL DEFAULT false,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_funis_empresa ON public.funis(empresa_id, ordem);

ALTER TABLE public.funis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "funis_select"
ON public.funis FOR SELECT TO authenticated
USING (is_admin() OR empresa_id = get_my_empresa_id());

CREATE POLICY "funis_insert"
ON public.funis FOR INSERT TO authenticated
WITH CHECK (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id()));

CREATE POLICY "funis_update"
ON public.funis FOR UPDATE TO authenticated
USING (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id()));

CREATE POLICY "funis_delete"
ON public.funis FOR DELETE TO authenticated
USING (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id()));

CREATE TRIGGER update_funis_updated_at
BEFORE UPDATE ON public.funis
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Backfill: um funil "Funil Padrão" por empresa existente
INSERT INTO public.funis (empresa_id, nome, is_padrao, ordem)
SELECT e.id, 'Funil Padrão', true, 0
FROM public.empresas e;

-- 3. kanban_colunas passa a pertencer a um funil
ALTER TABLE public.kanban_colunas ADD COLUMN funil_id UUID REFERENCES public.funis(id) ON DELETE CASCADE;

UPDATE public.kanban_colunas k
SET funil_id = f.id
FROM public.funis f
WHERE f.empresa_id = k.empresa_id AND f.is_padrao = true;

ALTER TABLE public.kanban_colunas ALTER COLUMN funil_id SET NOT NULL;

ALTER TABLE public.kanban_colunas DROP CONSTRAINT kanban_colunas_empresa_id_slug_key;
ALTER TABLE public.kanban_colunas ADD CONSTRAINT kanban_colunas_empresa_funil_slug_key UNIQUE (empresa_id, funil_id, slug);

DROP INDEX IF EXISTS idx_kanban_colunas_empresa;
CREATE INDEX idx_kanban_colunas_empresa_funil ON public.kanban_colunas(empresa_id, funil_id, ordem);

-- 4. pedidos passa a pertencer a um funil
ALTER TABLE public.pedidos ADD COLUMN funil_id UUID REFERENCES public.funis(id);

UPDATE public.pedidos p
SET funil_id = f.id
FROM public.usuarios u
JOIN public.funis f ON f.empresa_id = u.empresa_id AND f.is_padrao = true
WHERE u.id = p.usuario_id;

ALTER TABLE public.pedidos ALTER COLUMN funil_id SET NOT NULL;

CREATE INDEX idx_pedidos_funil_id ON public.pedidos(funil_id);

-- 5. Seed de empresa nova: cria o funil padrão + as 6 colunas padrão nele
CREATE OR REPLACE FUNCTION public.criar_kanban_colunas_padrao()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_funil_id UUID;
BEGIN
  INSERT INTO public.funis (empresa_id, nome, is_padrao, ordem)
  VALUES (NEW.id, 'Funil Padrão', true, 0)
  RETURNING id INTO v_funil_id;

  INSERT INTO public.kanban_colunas (empresa_id, funil_id, slug, nome, cor, ordem, is_sistema) VALUES
    (NEW.id, v_funil_id, 'novo_lead', 'Novo Lead', 'kanban-new', 0, true),
    (NEW.id, v_funil_id, 'elaboracao', 'Elaboração de Orçamento', 'kanban-budget', 1, true),
    (NEW.id, v_funil_id, 'enviado', 'Orçamento Enviado', 'kanban-sent', 2, true),
    (NEW.id, v_funil_id, 'negociacao', 'Negociação', 'kanban-negotiation', 3, true),
    (NEW.id, v_funil_id, 'fechamento', 'Fechamento', 'kanban-closed', 4, true),
    (NEW.id, v_funil_id, 'perdido', 'Perdido', 'destructive', 5, true)
  ON CONFLICT (empresa_id, funil_id, slug) DO NOTHING;

  RETURN NEW;
END;
$$;

-- 6. RPC para criar um novo funil (com as mesmas 6 colunas padrão), usada pela tela
--    "Criar novo funil" — transacional: funil e colunas nascem juntos ou nenhum dos dois.
CREATE OR REPLACE FUNCTION public.criar_funil(p_nome TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_empresa_id UUID;
  v_funil_id UUID;
  v_ordem INTEGER;
BEGIN
  IF NOT (is_gestor() OR is_admin()) THEN
    RAISE EXCEPTION 'Apenas gestores e administradores podem criar funis';
  END IF;

  v_empresa_id := get_my_empresa_id();
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'Empresa não encontrada para o usuário atual';
  END IF;

  SELECT COALESCE(MAX(ordem) + 1, 0) INTO v_ordem FROM public.funis WHERE empresa_id = v_empresa_id;

  INSERT INTO public.funis (empresa_id, nome, is_padrao, ordem)
  VALUES (v_empresa_id, p_nome, false, v_ordem)
  RETURNING id INTO v_funil_id;

  INSERT INTO public.kanban_colunas (empresa_id, funil_id, slug, nome, cor, ordem, is_sistema) VALUES
    (v_empresa_id, v_funil_id, 'novo_lead', 'Novo Lead', 'kanban-new', 0, true),
    (v_empresa_id, v_funil_id, 'elaboracao', 'Elaboração de Orçamento', 'kanban-budget', 1, true),
    (v_empresa_id, v_funil_id, 'enviado', 'Orçamento Enviado', 'kanban-sent', 2, true),
    (v_empresa_id, v_funil_id, 'negociacao', 'Negociação', 'kanban-negotiation', 3, true),
    (v_empresa_id, v_funil_id, 'fechamento', 'Fechamento', 'kanban-closed', 4, true),
    (v_empresa_id, v_funil_id, 'perdido', 'Perdido', 'destructive', 5, true);

  RETURN v_funil_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.criar_funil(TEXT) TO authenticated;

-- 7. Protege o funil padrão contra exclusão e contra perder a flag is_padrao
CREATE OR REPLACE FUNCTION public.proteger_funil_padrao()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_padrao THEN
      RAISE EXCEPTION 'O funil "%" é padrão do sistema e não pode ser excluído', OLD.nome;
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.is_padrao AND NOT NEW.is_padrao THEN
      RAISE EXCEPTION 'O funil "%" é padrão do sistema e precisa continuar sendo o funil padrão', OLD.nome;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_funil_padrao ON public.funis;
CREATE TRIGGER trg_proteger_funil_padrao
  BEFORE UPDATE OR DELETE ON public.funis
  FOR EACH ROW EXECUTE FUNCTION public.proteger_funil_padrao();

-- 8. RPC pedidos_stats ganha filtro opcional por funil (parâmetro novo no final,
--    com DEFAULT NULL — não quebra chamadas existentes que não o informam)
CREATE OR REPLACE FUNCTION public.pedidos_stats(
  p_usuario_ids uuid[] DEFAULT NULL,
  p_stages text[] DEFAULT NULL,
  p_fabricante_ids uuid[] DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_only_attention boolean DEFAULT false,
  p_funil_id uuid DEFAULT NULL
)
RETURNS TABLE(total_count bigint, total_valor numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    COUNT(*)::bigint AS total_count,
    COALESCE(SUM(p.valor_total), 0)::numeric AS total_valor
  FROM public.pedidos p
  LEFT JOIN public.clientes c ON c.id = p.cliente_id
  LEFT JOIN public.fabricantes f ON f.id = p.fabricante_id
  WHERE (p_usuario_ids IS NULL OR p.usuario_id = ANY(p_usuario_ids))
    AND (p_stages IS NULL OR p.status = ANY(p_stages))
    AND (p_fabricante_ids IS NULL OR p.fabricante_id = ANY(p_fabricante_ids))
    AND (p_date_from IS NULL OR p.data_pedido >= p_date_from)
    AND (p_date_to IS NULL OR p.data_pedido <= p_date_to)
    AND (
      p_search IS NULL OR p_search = '' OR
      c.empresa ILIKE '%' || p_search || '%' OR
      f.nome ILIKE '%' || p_search || '%'
    )
    AND (NOT p_only_attention OR p.created_at <= now() - interval '7 days')
    AND (p_funil_id IS NULL OR p.funil_id = p_funil_id);
$$;

GRANT EXECUTE ON FUNCTION public.pedidos_stats(uuid[], text[], uuid[], date, date, text, boolean, uuid) TO authenticated;
