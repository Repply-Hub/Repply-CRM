-- A busca da inbox continuava morrendo no statement_timeout para termo RARO.
--
-- O índice trigram criado em 20260805184506 está correto, mas NUNCA é usado pela
-- consulta que o app faz. Motivo: sob RLS o Postgres não pode avaliar o `ilike`
-- antes das cláusulas da policy, porque `texticlike` não é leakproof — avaliar o
-- texto antes da checagem de acesso poderia vazar conteúdo de linha proibida por
-- mensagem de erro ou por tempo. Então o `ilike` vira Filter DEPOIS de
-- `can_access_wa_conversa()`, e o índice de texto fica inútil.
--
-- O custo passa a ser proporcional a quantas linhas o Postgres varre até juntar
-- 100 resultados — ou seja, quanto MAIS RARO o termo, PIOR. Medido em produção,
-- na sessão de um vendedor real:
--
--   '%pedido%'  ->   2.063 ms    (820 ocorrências, enche o limite logo)
--   '%obra%'    ->   4.376 ms
--   '%zxqwvk%'  ->  12.013 ms, 330.218 buffers  -- MORRE nos 8 s
--
-- A MESMA consulta, fora da RLS (papel dono), usa o trigram e leva 63 ms com 45
-- buffers. A diferença é de 190x, e não está no índice: está em QUEM pergunta.
--
-- Esta função é a ponte. SECURITY DEFINER tira a barreira de RLS do caminho, o
-- que libera o trigram; e as DUAS cláusulas que a policy aplicaria são escritas
-- aqui, explicitamente:
--
--   1. empresa_id = get_my_empresa_id()      (recorte por empresa)
--   2. can_access_wa_conversa(conversa_id)   (recorte por conversa)
--
-- A visibilidade resultante é IDÊNTICA à da policy wa_mensagens_access —
-- verificado lado a lado. O que muda é só a ordem de avaliação.
--
-- NOTA: esta versão é substituída pela migration seguinte (20260805193012), que
-- acrescenta os dados da conversa ao retorno. Fica registrada como aplicada.
CREATE OR REPLACE FUNCTION public.wa_buscar_mensagens(
  p_termo  TEXT,
  p_de     TIMESTAMPTZ DEFAULT NULL,
  p_ate    TIMESTAMPTZ DEFAULT NULL,
  p_limite INTEGER     DEFAULT 100
)
RETURNS TABLE (
  id          UUID,
  conversa_id UUID,
  conteudo    TEXT,
  created_at  TIMESTAMPTZ,
  direcao     TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
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
  LIMIT LEAST(GREATEST(COALESCE(p_limite, 100), 1), 200);
$fn$;

REVOKE ALL ON FUNCTION public.wa_buscar_mensagens(TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wa_buscar_mensagens(TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER)
  TO authenticated;
