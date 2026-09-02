-- ============================================================================
-- TIPOS DE CLIENTE VIRAM UMA LISTA POR EMPRESA
-- ============================================================================
-- ANTES: a lista do campo "Tipo" do cadastro de cliente eram 9 valores fixos no
-- codigo (baseTipos, em src/pages/Clientes.tsx) mais o que cada pessoa criasse
-- em localStorage['clientes_custom_tipos'] -- por NAVEGADOR. Nada disso era
-- compartilhado com a equipe nem preso a empresa.
--
-- AGORA: uma linha por tipo, por empresa.
--
-- O valor guardado em clientes.tipo continua sendo TEXTO LIVRE, sem chave
-- estrangeira para ca. Esta tabela governa o DROPDOWN e o ROTULO, nao a
-- integridade. Foi decisao explicita: virar chave estrangeira exigiria reescrever
-- o tipo de 1.584 clientes de 5 empresas, com risco alto e nenhum ganho para o
-- objetivo. Ver docs/superpowers/specs/2026-09-02-tipos-cliente-por-empresa-design.md
--
-- MOLDE: 20260731130000_marcadores_negocios.sql -- tabela + UNIQUE(empresa_id,slug)
-- + indice + 4 policies + trigger de updated_at + backfill + gatilho de empresa nova.
-- Este e o SETIMO gatilho AFTER INSERT ON public.empresas. Backfill e gatilho ficam
-- no MESMO arquivo de proposito: a divergencia entre "consertar quem ja existe" e
-- "consertar a fabrica" ja custou caro neste projeto.
-- ============================================================================

CREATE TABLE public.clientes_tipos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id),
  slug TEXT NOT NULL,
  nome TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  is_sistema BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, slug)
);

CREATE INDEX idx_clientes_tipos_empresa ON public.clientes_tipos(empresa_id, ordem);

ALTER TABLE public.clientes_tipos ENABLE ROW LEVEL SECURITY;

-- Leitura: todo mundo da empresa (o vendedor precisa ver a lista para escolher).
-- Escrita: so gestor. is_admin() entra nas quatro porque e tabela de CONFIGURACAO,
-- igual a marcadores -- o admin da plataforma da suporte sem virar membro da empresa.
CREATE POLICY "clientes_tipos_select"
ON public.clientes_tipos FOR SELECT TO authenticated
USING (is_admin() OR empresa_id = get_my_empresa_id());

CREATE POLICY "clientes_tipos_insert"
ON public.clientes_tipos FOR INSERT TO authenticated
WITH CHECK (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id()));

CREATE POLICY "clientes_tipos_update"
ON public.clientes_tipos FOR UPDATE TO authenticated
USING (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id()));

CREATE POLICY "clientes_tipos_delete"
ON public.clientes_tipos FOR DELETE TO authenticated
USING (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id()));

CREATE TRIGGER update_clientes_tipos_updated_at
BEFORE UPDATE ON public.clientes_tipos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- BACKFILL: cada empresa recebe EXATAMENTE os tipos que seus clientes ja usam.
-- ----------------------------------------------------------------------------
-- clientes.empresa_id esta NULO nas 1.584 linhas (medido em 02/09/2026), entao a
-- empresa do cliente vem por usuario_id -> usuarios.empresa_id. Medido: esse
-- caminho alcanca 100% das linhas (nenhum cliente sem usuario, nenhum usuario sem
-- empresa, nenhum tipo nulo ou vazio).
--
-- Repare: este caminho (usuario_id) e do BACKFILL, para descobrir de qual empresa
-- e cada cliente. Ele NAO entra nas policies acima, que escopam por
-- empresa_id = get_my_empresa_id(). Sao dois mecanismos diferentes no mesmo arquivo.
--
-- nome = slug DE PROPOSITO: preserva exatamente o rotulo que a tela ja mostra hoje.
-- A MD continua vendo "construtora - 3 níveis" como esta gravado. Embelezar rotulo
-- de outra empresa esta fora de escopo.
--
-- Esperado: 34 linhas (MD 19, Repply 7, PR & COCENTINO 4, JHS 3, House Design 1).
INSERT INTO public.clientes_tipos (empresa_id, slug, nome, ordem, is_sistema)
SELECT
  t.empresa_id,
  t.tipo,
  t.tipo,
  (row_number() OVER (PARTITION BY t.empresa_id ORDER BY t.n DESC, t.tipo))::int - 1,
  false
FROM (
  SELECT u.empresa_id, c.tipo, count(*) AS n
  FROM public.clientes c
  JOIN public.usuarios u ON u.id = c.usuario_id
  WHERE c.tipo IS NOT NULL
    AND btrim(c.tipo) <> ''
    AND u.empresa_id IS NOT NULL
  GROUP BY u.empresa_id, c.tipo
) t
ON CONFLICT (empresa_id, slug) DO NOTHING;

-- ----------------------------------------------------------------------------
-- EMPRESA NOVA nasce com a lista padrao enxuta.
-- ----------------------------------------------------------------------------
-- 'pessoa fisica' com ESPACO e sem acento nao e descuido: e exatamente o valor que
-- a importacao produz hoje (TIPO_MAP em ImportClientesDialog.tsx normaliza
-- 'pessoa_fisica', 'pessoa física' e 'pf' todos para 'pessoa fisica') e o que a MD
-- ja tem gravado em 129 clientes. Usar underscore aqui criaria um tipo orfao a cada
-- importacao.
CREATE OR REPLACE FUNCTION public.criar_clientes_tipos_padrao()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.clientes_tipos (empresa_id, slug, nome, ordem, is_sistema) VALUES
    (NEW.id, 'construtora',   'Construtora',   0, true),
    (NEW.id, 'loja',          'Loja',          1, true),
    (NEW.id, 'pessoa fisica', 'Pessoa Física', 2, true)
  ON CONFLICT (empresa_id, slug) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_criar_clientes_tipos_padrao
AFTER INSERT ON public.empresas
FOR EACH ROW EXECUTE FUNCTION public.criar_clientes_tipos_padrao();

COMMENT ON TABLE public.clientes_tipos IS
  'Lista de tipos/segmentos de cliente, por empresa. Governa o dropdown e o rotulo do campo Tipo; clientes.tipo continua texto livre, sem chave estrangeira para ca.';
