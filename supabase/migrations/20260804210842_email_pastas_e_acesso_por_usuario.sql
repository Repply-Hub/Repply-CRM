-- Duas capacidades novas na caixa de e-mail da empresa:
--   1. as PASTAS/MARCADORES que a caixa ja tem no provedor;
--   2. escolher QUEM do time enxerga a caixa conectada.

-- =====================================================================
-- 1) PASTAS
-- =====================================================================
-- O Nylas ja entrega isso e nos ja guardavamos metade: `mensagemParaLinha`
-- grava os ids em email_mensagens.pastas (ha valores como
-- 'Label_1548366516208533556' nas mensagens reais), e o email-callback ja
-- chama /v3/grants/{id}/folders -- mas so aproveitava o id da entrada e o de
-- enviados e descartava o resto. Faltava so onde guardar o NOME.
--
-- Nada aqui interpreta o nome da pasta. Cada caixa tem a organizacao que o
-- dono dela criou, e tentar casar com o cadastro do CRM daria errado na
-- proxima empresa que usar outro criterio.
CREATE TABLE public.email_pastas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id UUID NOT NULL REFERENCES public.email_contas(id) ON DELETE CASCADE,
  -- Redundante em relacao a conta, mas e o que sustenta o RLS sem JOIN --
  -- mesmo padrao de email_mensagens.
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  -- Id no provedor. E ele que aparece em email_mensagens.pastas e o que a
  -- API do Nylas aceita no filtro `in`.
  pasta_id TEXT NOT NULL,
  nome TEXT NOT NULL,
  -- \inbox, \sent, \trash, \spam... vem do Nylas. Distingue pasta de
  -- sistema de marcador criado pelo usuario, que e o que vai para a lista.
  atributos TEXT[] NOT NULL DEFAULT '{}',
  total_mensagens INTEGER,
  nao_lidas INTEGER,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (conta_id, pasta_id)
);

CREATE INDEX idx_email_pastas_conta ON public.email_pastas (conta_id, nome);

ALTER TABLE public.email_pastas ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- 2) QUEM ENXERGA A CAIXA
-- =====================================================================
-- Espelha wapi_instancia_usuarios, que ja resolve o mesmo problema para as
-- instancias de WhatsApp: um recurso da empresa e uma lista de quem o usa.
--
-- Ausencia de linha NAO significa "ninguem ve": gestores e o dono sempre
-- enxergam, porque sao eles que conectam e administram. A lista serve para
-- LIBERAR quem nao e gestor -- o vendedor do atendimento, por exemplo.
CREATE TABLE public.email_conta_usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id UUID NOT NULL REFERENCES public.email_contas(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_por UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  UNIQUE (conta_id, usuario_id)
);

CREATE INDEX idx_email_conta_usuarios_usuario ON public.email_conta_usuarios (usuario_id);

ALTER TABLE public.email_conta_usuarios ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- 3) A REGRA DE ACESSO
-- =====================================================================
-- Uma funcao so, para as policies das tres tabelas nao repetirem a regra e
-- nao poderem divergir com o tempo.
--
-- STABLE e nao IMMUTABLE porque le tabela. SECURITY INVOKER de proposito: ela
-- checa quem esta chamando, e rodar como dono deixaria de enxergar o RLS que a
-- protege. SET search_path para nao ser sequestrada por um schema no caminho.
CREATE OR REPLACE FUNCTION public.tenho_acesso_a_caixa(p_conta_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $fn$
  SELECT
    -- Mensagem arquivada (conta desconectada) nao pertence mais a caixa
    -- nenhuma. Fica com quem administra, nao com quem tinha acesso a uma
    -- caixa que ja nao existe.
    CASE WHEN p_conta_id IS NULL THEN public.is_gestor()
         ELSE public.is_gestor()
              OR EXISTS (
                SELECT 1 FROM public.email_conta_usuarios ecu
                WHERE ecu.conta_id = p_conta_id
                  AND ecu.usuario_id = public.get_my_usuario_id()
              )
    END;
$fn$;

COMMENT ON FUNCTION public.tenho_acesso_a_caixa(UUID) IS
  'Quem enxerga a caixa: gestor/dono sempre; os demais so se liberados em email_conta_usuarios. Usada pelas policies de email_mensagens, email_pastas e email_conta_usuarios.';

-- ---- policies das tabelas novas -------------------------------------
CREATE POLICY email_pastas_select ON public.email_pastas
  FOR SELECT TO authenticated
  USING (empresa_id = get_my_empresa_id() AND public.tenho_acesso_a_caixa(conta_id));

-- Quem lista a caixa e quem pode liberar. Ver a lista de liberados sem ser
-- gestor nao serve para nada e expoe quem tem acesso ao que.
CREATE POLICY email_conta_usuarios_select ON public.email_conta_usuarios
  FOR SELECT TO authenticated
  USING (
    is_gestor()
    AND EXISTS (SELECT 1 FROM public.email_contas c
                WHERE c.id = email_conta_usuarios.conta_id
                  AND c.empresa_id = get_my_empresa_id())
  );

-- Liberar e revogar acesso: so gestor/dono, e so na propria empresa. O
-- WITH CHECK repete a condicao de proposito -- sem ele daria para INSERIR
-- uma linha apontando para a conta de outra empresa.
CREATE POLICY email_conta_usuarios_insert ON public.email_conta_usuarios
  FOR INSERT TO authenticated
  WITH CHECK (
    is_gestor()
    AND EXISTS (SELECT 1 FROM public.email_contas c
                WHERE c.id = email_conta_usuarios.conta_id
                  AND c.empresa_id = get_my_empresa_id())
    AND usuario_in_my_empresa(usuario_id)
  );

CREATE POLICY email_conta_usuarios_delete ON public.email_conta_usuarios
  FOR DELETE TO authenticated
  USING (
    is_gestor()
    AND EXISTS (SELECT 1 FROM public.email_contas c
                WHERE c.id = email_conta_usuarios.conta_id
                  AND c.empresa_id = get_my_empresa_id())
  );

-- =====================================================================
-- 4) MENSAGENS E CONTA passam a respeitar a lista
-- =====================================================================
-- Antes: qualquer pessoa da empresa lia a caixa inteira. Agora a empresa
-- continua sendo a fronteira externa (nada muda entre empresas) e dentro dela
-- vale a lista.
ALTER POLICY email_mensagens_select ON public.email_mensagens
  USING (empresa_id = get_my_empresa_id() AND public.tenho_acesso_a_caixa(conta_id));

ALTER POLICY email_mensagens_update ON public.email_mensagens
  USING (empresa_id = get_my_empresa_id() AND public.tenho_acesso_a_caixa(conta_id))
  WITH CHECK (empresa_id = get_my_empresa_id() AND public.tenho_acesso_a_caixa(conta_id));

ALTER POLICY email_contas_select ON public.email_contas
  USING (empresa_id = get_my_empresa_id() AND public.tenho_acesso_a_caixa(id));
