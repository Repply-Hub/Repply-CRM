-- Compartilhar a caixa POR MARCADOR, e nao so inteira.
--
-- O caso real: a caixa atendimento@ e organizada por fabricante (001-ELIZABETH,
-- 004-DECA, 005-PORMADE...) e cada vendedor cuida dos seus. Dar a caixa toda a
-- quem cuida de um fabricante entrega junto a correspondencia dos outros.

-- pasta_id NULO = caixa inteira (o que ja existia). Preenchido = so as
-- mensagens que carregam aquele marcador.
ALTER TABLE public.email_conta_usuarios ADD COLUMN pasta_id TEXT;

COMMENT ON COLUMN public.email_conta_usuarios.pasta_id IS
  'Id do marcador no provedor. NULO = acesso a caixa inteira; preenchido = so as mensagens com aquele marcador.';

-- A unicidade muda: antes uma linha por pessoa, agora uma por pessoa+marcador.
ALTER TABLE public.email_conta_usuarios
  DROP CONSTRAINT email_conta_usuarios_conta_id_usuario_id_key;

ALTER TABLE public.email_conta_usuarios
  ADD CONSTRAINT uniq_email_conta_usuario_pasta UNIQUE (conta_id, usuario_id, pasta_id);

-- O UNIQUE acima NAO cobre o caso da caixa inteira: no Postgres, NULLs contam
-- como distintos num indice unico, entao daria para gravar "caixa inteira"
-- varias vezes para a mesma pessoa. Este indice parcial fecha isso.
--
-- ATENCAO ao mexer: indice PARCIAL nao serve de arbitro para ON CONFLICT, e o
-- PostgREST nao emite o WHERE. Quem escreve nesta tabela precisa usar INSERT
-- simples e tratar o 23505 -- e o que o hook do front faz. Foi exatamente assim
-- que a entrada de e-mail quebrou uma vez nesta base (erro 42P10).
CREATE UNIQUE INDEX uniq_email_conta_usuario_caixa_inteira
  ON public.email_conta_usuarios (conta_id, usuario_id)
  WHERE pasta_id IS NULL;

-- ---------------------------------------------------------------------
-- A regra por MENSAGEM
-- ---------------------------------------------------------------------
-- Precisa dos marcadores da mensagem, que `tenho_acesso_a_caixa` nao recebia.
-- SECURITY DEFINER pelo mesmo motivo da outra: ela le email_conta_usuarios,
-- cuja leitura e restrita a gestor -- como INVOKER, a pessoa liberada nao
-- conseguiria ler a propria liberacao (o defeito corrigido na migration
-- 20260804212651).
CREATE OR REPLACE FUNCTION public.tenho_acesso_a_mensagem(
  p_conta_id UUID,
  p_pastas TEXT[]
)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT
    CASE WHEN p_conta_id IS NULL THEN public.is_gestor()
         ELSE public.is_gestor()
              OR EXISTS (
                SELECT 1 FROM public.email_conta_usuarios ecu
                WHERE ecu.conta_id = p_conta_id
                  AND ecu.usuario_id = public.get_my_usuario_id()
                  -- NULO: caixa inteira. Preenchido: so se a mensagem carrega
                  -- aquele marcador.
                  AND (ecu.pasta_id IS NULL
                       OR ecu.pasta_id = ANY(COALESCE(p_pastas, '{}')))
              )
    END;
$fn$;

COMMENT ON FUNCTION public.tenho_acesso_a_mensagem(UUID, TEXT[]) IS
  'Quem le UMA mensagem: gestor sempre; os demais se liberados na caixa inteira ou num marcador que a mensagem carregue.';

REVOKE ALL ON FUNCTION public.tenho_acesso_a_mensagem(UUID, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tenho_acesso_a_mensagem(UUID, TEXT[]) TO authenticated;

-- ---------------------------------------------------------------------
-- Policies passam a olhar a mensagem, nao so a caixa
-- ---------------------------------------------------------------------
ALTER POLICY email_mensagens_select ON public.email_mensagens
  USING (empresa_id = get_my_empresa_id()
         AND public.tenho_acesso_a_mensagem(conta_id, pastas));

ALTER POLICY email_mensagens_update ON public.email_mensagens
  USING (empresa_id = get_my_empresa_id()
         AND public.tenho_acesso_a_mensagem(conta_id, pastas))
  WITH CHECK (empresa_id = get_my_empresa_id()
              AND public.tenho_acesso_a_mensagem(conta_id, pastas));

-- A barra lateral so mostra o que a pessoa alcanca: quem foi liberado em
-- 004-DECA nao precisa ver que existe um 007-ASTRA.
--
-- NOTA: esta versao da policy esta ERRADA e e corrigida na migration seguinte
-- (20260805121953). O EXISTS le email_conta_usuarios INLINE, e toda subconsulta
-- dentro de uma policy passa pela RLS da tabela lida -- que aqui exige
-- is_gestor(). O vendedor liberado nao conseguia ler a propria liberacao e
-- ficava sem enxergar marcador nenhum. Fica registrada como aplicada.
ALTER POLICY email_pastas_select ON public.email_pastas
  USING (
    empresa_id = get_my_empresa_id()
    AND (
      is_gestor()
      OR EXISTS (
        SELECT 1 FROM public.email_conta_usuarios ecu
        WHERE ecu.conta_id = email_pastas.conta_id
          AND ecu.usuario_id = get_my_usuario_id()
          AND (ecu.pasta_id IS NULL OR ecu.pasta_id = email_pastas.pasta_id)
      )
    )
  );

-- O filtro por marcador vira consulta corriqueira; sem isto e varredura.
CREATE INDEX IF NOT EXISTS idx_email_mensagens_pastas
  ON public.email_mensagens USING GIN (pastas);
