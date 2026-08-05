-- Quem tem acesso a um marcador podia RESPONDER, mas nunca via a propria
-- resposta.
--
-- A copia que o Gmail guarda da mensagem enviada NAO herda os marcadores da
-- conversa: verificado nas 23 mensagens enviadas em producao, todas com
-- pastas = {SENT} e nenhuma com Label_*. Como a regra exigia
-- `ecu.pasta_id = ANY(pastas)`, a linha da resposta nunca casava, e a pessoa
-- mandava o e-mail, via o aviso de sucesso e a resposta sumia -- nem na aba
-- Enviados, nem em lugar nenhum. Reenviar achando que falhou (e o cliente
-- receber duas vezes) era o desfecho natural.
--
-- A correcao NAO pode ser gravar `pastas` no email-enviar: o webhook
-- `message.created` reescreve a linha logo depois com o que o provedor manda,
-- que e {SENT}. Tem de estar na REGRA.
--
-- O criterio: uma mensagem ENVIADA e visivel para quem enxerga a CONVERSA dela.
-- Deliberadamente estreito -- so `direcao = 'enviado'`, e a ancora tem de ser
-- uma mensagem RECEBIDA que a pessoa ja podia ler. Nao alarga nada do que ela
-- ve de entrada: uma recebida com outro marcador na mesma conversa continua
-- escondida. Verificado com sessao simulada: o vendedor liberado em UM marcador
-- passou de 9 para 10 mensagens -- ganhou exatamente a resposta da conversa
-- dele, e continuou sem ver as outras 22 enviadas.
--
-- Ler email_mensagens dentro da politica de email_mensagens so nao entra em
-- recursao porque a funcao e SECURITY DEFINER: o dono da tabela nao passa pela
-- RLS (a tabela nao tem FORCE ROW LEVEL SECURITY).

CREATE OR REPLACE FUNCTION public.tenho_acesso_a_mensagem(
  p_conta_id  UUID,
  p_pastas    TEXT[],
  p_thread_id TEXT,
  p_direcao   TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT
    CASE WHEN p_conta_id IS NULL THEN public.is_gestor()
         ELSE public.is_gestor()
              -- Acesso direto: caixa inteira (NULO) ou o marcador da mensagem.
              OR EXISTS (
                SELECT 1 FROM public.email_conta_usuarios ecu
                WHERE ecu.conta_id = p_conta_id
                  AND ecu.usuario_id = public.get_my_usuario_id()
                  AND (ecu.pasta_id IS NULL
                       OR ecu.pasta_id = ANY(COALESCE(p_pastas, '{}')))
              )
              -- Ou: e uma resposta numa conversa que a pessoa ja podia ler.
              OR (
                p_direcao = 'enviado'
                AND p_thread_id IS NOT NULL
                AND EXISTS (
                  SELECT 1
                    FROM public.email_mensagens m
                    JOIN public.email_conta_usuarios ecu
                      ON ecu.conta_id = m.conta_id
                     AND ecu.usuario_id = public.get_my_usuario_id()
                   WHERE m.conta_id = p_conta_id
                     AND m.nylas_thread_id = p_thread_id
                     AND m.direcao <> 'enviado'
                     AND (ecu.pasta_id IS NULL
                          OR ecu.pasta_id = ANY(COALESCE(m.pastas, '{}')))
                )
              )
    END;
$fn$;

COMMENT ON FUNCTION public.tenho_acesso_a_mensagem(UUID, TEXT[], TEXT, TEXT) IS
  'Quem le UMA mensagem: gestor sempre; os demais se liberados na caixa inteira, num marcador que a mensagem carregue, ou se e resposta numa conversa que ja podiam ler.';

REVOKE ALL ON FUNCTION public.tenho_acesso_a_mensagem(UUID, TEXT[], TEXT, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tenho_acesso_a_mensagem(UUID, TEXT[], TEXT, TEXT)
  TO authenticated;

ALTER POLICY email_mensagens_select ON public.email_mensagens
  USING (
    empresa_id = public.get_my_empresa_id()
    AND public.tenho_acesso_a_mensagem(conta_id, pastas, nylas_thread_id, direcao)
  );

ALTER POLICY email_mensagens_update ON public.email_mensagens
  USING (
    empresa_id = public.get_my_empresa_id()
    AND public.tenho_acesso_a_mensagem(conta_id, pastas, nylas_thread_id, direcao)
  )
  WITH CHECK (
    empresa_id = public.get_my_empresa_id()
    AND public.tenho_acesso_a_mensagem(conta_id, pastas, nylas_thread_id, direcao)
  );

-- A versao de 2 argumentos sai de cena: deixa-la viva convidaria a proxima
-- politica a chamar a regra incompleta sem ninguem perceber.
DROP FUNCTION IF EXISTS public.tenho_acesso_a_mensagem(UUID, TEXT[]);

-- A regra agora procura irmas de conversa a cada linha avaliada. Sem indice,
-- isso e uma varredura da tabela por mensagem enviada.
CREATE INDEX IF NOT EXISTS idx_email_mensagens_conta_thread
  ON public.email_mensagens (conta_id, nylas_thread_id);
