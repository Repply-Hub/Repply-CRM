-- Quantas mensagens o CRM realmente tem em cada marcador, e quantas por ler.
--
-- Existe porque `email_pastas.nao_lidas` é o número do PROVEDOR: conta a
-- etiqueta inteira no Gmail, inclusive o que nunca foi sincronizado para cá.
-- Usar aquele número no badge da barra lateral fazia a tela prometer mensagens
-- que a lista não tinha — "006 - NAMBEI" mostrava 3 e abria vazio, porque não
-- havia uma única mensagem dele aqui.
--
-- Fazer isso no cliente exigiria trazer as ~340 linhas com o array `pastas` só
-- para contar; a caixa cresce e a conta seria refeita a cada render.
--
-- SECURITY INVOKER (o padrão) DE PROPÓSITO: a RLS de email_mensagens continua
-- valendo dentro da função, então quem foi liberado só num marcador não
-- descobre o tamanho dos outros pelo badge. Um SECURITY DEFINER aqui vazaria
-- exatamente a informação que a regra por marcador existe para conter.
CREATE OR REPLACE FUNCTION public.email_contagem_por_marcador(p_conta_id uuid)
RETURNS TABLE(pasta_id text, total bigint, nao_lidas bigint)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT p AS pasta_id,
         count(*)                           AS total,
         count(*) FILTER (WHERE NOT m.lido) AS nao_lidas
  FROM public.email_mensagens m,
       LATERAL unnest(m.pastas) AS p
  WHERE m.conta_id = p_conta_id
    AND m.direcao = 'recebido'
    AND m.excluido = false
  GROUP BY p;
$$;

GRANT EXECUTE ON FUNCTION public.email_contagem_por_marcador(uuid) TO authenticated;
