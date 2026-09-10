-- Os e-mails que pertencem a um negócio, agrupados por assunto.
--
-- 🔴 SECURITY INVOKER (o padrão) DE PROPÓSITO. A RLS de email_mensagens continua
-- valendo dentro da função, então quem não foi liberado na caixa não recebe
-- linha nenhuma — nem a existência da troca. É a decisão do dono do produto de
-- 09/09/2026, e a mesma razão pela qual `email_contagem_por_marcador` é invoker:
-- um SECURITY DEFINER aqui abriria por uma porta lateral exatamente o que a
-- seção de E-mails fecha pela porta da frente.
--
-- O bloco é o ASSUNTO (`nylas_thread_id`), e não um corte de tempo: no e-mail
-- "aberta e fechada" é literalmente a thread, que o provedor já entrega
-- amarrada. Mensagem sem thread (raro) vira um bloco de uma linha só, via
-- coalesce com o id da própria mensagem.
--
-- O endereço casa em TRÊS lugares — remetente, destinatários e cópia. O exemplo
-- do dono do produto pede os dois lados: a construtora E o contato dela.
CREATE OR REPLACE FUNCTION public.email_do_negocio(
  p_cliente_id uuid,
  p_de         timestamptz,
  p_ate        timestamptz
)
RETURNS TABLE (
  thread_id            text,
  assunto              text,
  primeira_em          timestamptz,
  ultima_em            timestamptz,
  mensagens            bigint,
  primeira_mensagem_id uuid,
  com_quem             text
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH brutos AS (
    SELECT lower(trim(c.email)) AS email
      FROM public.clientes c
     WHERE c.id = p_cliente_id
       AND coalesce(trim(c.email), '') <> ''
    UNION
    SELECT lower(trim(ct.email))
      FROM public.contatos ct
     WHERE ct.cliente_id = p_cliente_id
       AND coalesce(trim(ct.email), '') <> ''
  ),
  enderecos AS (
    -- 🔴 O ENDEREÇO DA PRÓPRIA CAIXA NUNCA CASA.
    --
    -- Medido em 10/09/2026: existe 1 cliente cadastrado com
    -- `atendimento@mdrepres.com.br`, que é a caixa da própria MD. Sem esta
    -- linha, TODA mensagem da caixa (3.739 hoje) apareceria no histórico dos
    -- negócios daquele cliente — a caixa inteira, como se fosse conversa com
    -- ele.
    --
    -- É erro de cadastro, não defeito nosso, mas é um erro que se repete: mais
    -- cedo ou mais tarde alguém registra o próprio endereço como cliente. O
    -- filtro custa nada e a alternativa é ruído total numa ficha.
    SELECT b.email FROM brutos b
     WHERE b.email NOT IN (
       SELECT lower(trim(ec.email)) FROM public.email_contas ec
        WHERE coalesce(trim(ec.email), '') <> ''
     )
  ),
  msgs AS (
    SELECT m.id, m.data_mensagem, m.assunto, m.nylas_thread_id,
           m.nylas_message_id, m.remetente_email, m.remetente_nome
      FROM public.email_mensagens m
     WHERE m.excluido = false
       AND m.data_mensagem >= p_de
       AND m.data_mensagem <= p_ate
       AND EXISTS (SELECT 1 FROM enderecos)
       AND (
            lower(m.remetente_email) IN (SELECT email FROM enderecos)
         OR EXISTS (
              SELECT 1
                FROM jsonb_array_elements(coalesce(m.destinatarios, '[]'::jsonb)) d
               WHERE lower(d->>'email') IN (SELECT email FROM enderecos)
            )
         OR EXISTS (
              SELECT 1
                FROM jsonb_array_elements(coalesce(m.cc, '[]'::jsonb)) d
               WHERE lower(d->>'email') IN (SELECT email FROM enderecos)
            )
       )
  )
  SELECT coalesce(nylas_thread_id, nylas_message_id)                    AS thread_id,
         (array_agg(assunto ORDER BY data_mensagem))[1]                 AS assunto,
         min(data_mensagem)                                             AS primeira_em,
         max(data_mensagem)                                             AS ultima_em,
         count(*)                                                       AS mensagens,
         (array_agg(id ORDER BY data_mensagem))[1]                      AS primeira_mensagem_id,
         (array_agg(coalesce(remetente_nome, remetente_email)
                    ORDER BY data_mensagem))[1]                         AS com_quem
    FROM msgs
   GROUP BY coalesce(nylas_thread_id, nylas_message_id)
   ORDER BY min(data_mensagem) DESC;
$$;

GRANT EXECUTE ON FUNCTION public.email_do_negocio(uuid, timestamptz, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.email_do_negocio(uuid, timestamptz, timestamptz) IS
  'E-mails do cliente e dos contatos dele numa janela de tempo, agrupados por assunto. SECURITY INVOKER: a RLS da caixa decide quem ve.';
