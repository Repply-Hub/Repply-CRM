-- A tela de busca mostra o nome/foto do contato ao lado de cada resultado, e
-- antes obtinha isso por um join embutido no PostgREST
-- (`conversa:whatsapp_conversas(...)`). Como a busca passou a ser uma RPC, o
-- join precisa vir dela — caso contrário a lista de resultados perde o nome e
-- vira uma coluna de textos soltos sem contexto.
--
-- O join fica DEPOIS do LIMIT, sobre no máximo 200 linhas: é barato, e as
-- conversas em questão já passaram por `can_access_wa_conversa`, então ler
-- `whatsapp_conversas` sem RLS aqui não amplia nada — verificado com sessão
-- simulada: 200 resultados, 0 de conversa proibida.
--
-- DROP antes de CREATE porque o tipo de retorno muda; CREATE OR REPLACE não
-- permite alterar a assinatura de saída.
DROP FUNCTION IF EXISTS public.wa_buscar_mensagens(TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER);

CREATE FUNCTION public.wa_buscar_mensagens(
  p_termo  TEXT,
  p_de     TIMESTAMPTZ DEFAULT NULL,
  p_ate    TIMESTAMPTZ DEFAULT NULL,
  p_limite INTEGER     DEFAULT 100
)
RETURNS TABLE (
  id                       UUID,
  conversa_id              UUID,
  conteudo                 TEXT,
  created_at               TIMESTAMPTZ,
  direcao                  TEXT,
  conversa_nome_contato    TEXT,
  conversa_telefone        TEXT,
  conversa_foto_perfil_url TEXT,
  conversa_is_group        BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  WITH achadas AS (
    SELECT m.id, m.conversa_id, m.conteudo, m.created_at, m.direcao
    FROM public.whatsapp_mensagens m
    WHERE m.empresa_id = public.get_my_empresa_id()
      AND m.is_nota_interna = false
      AND m.conteudo ILIKE '%' || replace(replace(replace(btrim(p_termo),
            '\', '\\'), '%', '\%'), '_', '\_') || '%'
      AND (p_de  IS NULL OR m.created_at >= p_de)
      AND (p_ate IS NULL OR m.created_at <= p_ate)
      AND public.can_access_wa_conversa(m.conversa_id)
    ORDER BY m.created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limite, 100), 1), 200)
  )
  SELECT a.id, a.conversa_id, a.conteudo, a.created_at, a.direcao,
         c.nome_contato, c.telefone, c.foto_perfil_url, c.is_group
  FROM achadas a
  LEFT JOIN public.whatsapp_conversas c ON c.id = a.conversa_id
  ORDER BY a.created_at DESC;
$fn$;

COMMENT ON FUNCTION public.wa_buscar_mensagens(TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) IS
  'Busca por texto nas mensagens de WhatsApp. SECURITY DEFINER para que o indice trigram possa ser usado (sob RLS o ilike nao e avaliavel antes da policy, porque texticlike nao e leakproof); aplica empresa_id = get_my_empresa_id() e can_access_wa_conversa() explicitamente, com a mesma visibilidade da policy wa_mensagens_access.';

REVOKE ALL ON FUNCTION public.wa_buscar_mensagens(TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wa_buscar_mensagens(TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER)
  TO authenticated;
