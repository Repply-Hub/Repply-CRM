-- Registra COMO cada tentativa de conectar a caixa de e-mail terminou.
--
-- 🔴 O DEFEITO QUE ISTO FECHA, medido na JHS em 09/09/2026:
--
-- Eles tentaram conectar quatro vezes (12:29 imap, 12:30 microsoft, 12:31
-- google, 12:31 imap). Nas quatro o `email-conectar` respondeu 200 e devolveu
-- a URL, e NENHUMA gerou uma linha de `email-callback` no log. Do nosso lado
-- não sobrou explicação nenhuma: só quatro linhas em `email_conexao_estados`
-- que ninguém olha, e que a limpeza oportunista apagaria na tentativa seguinte.
--
-- Levou um dia de investigação para descobrir que o rastro não existia. Estas
-- colunas fazem a tentativa contar o que aconteceu com ela.
--
-- Por que AQUI e não numa tabela nova: a linha da tentativa já existe, já tem
-- empresa, usuário, provedor e hora. O que faltava era o desfecho. E o caminho
-- de erro do provedor devolve ANTES de consumir a linha (ver o `if (erroProvedor)`
-- em email-callback), então ela está lá para ser atualizada.
--
-- 🔴 O CONSUMO ATÔMICO NÃO MUDA. O sucesso continua sendo
-- `DELETE ... RETURNING` por `state` — é o que impede alguém de amarrar a caixa
-- dele à empresa de outro. Estas colunas só descrevem tentativa que NÃO virou
-- conexão.

ALTER TABLE public.email_conexao_estados
  -- 'cancelada'  = a pessoa desistiu na tela do provedor (access_denied)
  -- 'recusada'   = o provedor recusou por outro motivo, e o código está abaixo
  -- 'erro'       = falhou do nosso lado depois de voltar
  -- NULL         = ainda não voltou. Passado o prazo, é tentativa abandonada —
  --                que é justamente o caso da JHS, e o que era invisível.
  ADD COLUMN IF NOT EXISTS resultado    text,
  -- O código cru do provedor (`error`), curto e enumerável.
  ADD COLUMN IF NOT EXISTS erro_codigo  text,
  -- A frase do provedor (`error_description`), truncada. É a parte útil para
  -- quem vai consertar, e a que hoje é jogada fora.
  ADD COLUMN IF NOT EXISTS erro_detalhe text,
  ADD COLUMN IF NOT EXISTS concluido_em timestamptz;

COMMENT ON COLUMN public.email_conexao_estados.resultado IS
  'Como a tentativa terminou: cancelada, recusada, erro. NULL = nao voltou do provedor.';

-- A tela do gestor lê "as tentativas desta empresa, mais recentes primeiro".
CREATE INDEX IF NOT EXISTS idx_email_conexao_estados_empresa_criado
  ON public.email_conexao_estados (empresa_id, criado_em DESC);

-- ---------------------------------------------------------------------------
-- Quem pode LER a própria tentativa.
--
-- A tabela nasceu sem política de leitura porque nada a lia: só as Edge
-- Functions, com service_role, que passa por cima da RLS. Agora a tela de
-- E-mails mostra a última tentativa que falhou, então quem administra a empresa
-- precisa enxergar as linhas dela — e só as dela.
--
-- Sem `USING` restrito a `empresa_id`, o `state` de outra empresa ficaria
-- legível, e `state` é justamente o segredo que amarra a volta do provedor.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS email_conexao_estados_select_propria ON public.email_conexao_estados;

CREATE POLICY email_conexao_estados_select_propria
  ON public.email_conexao_estados
  FOR SELECT
  TO authenticated
  USING (
    empresa_id = (
      SELECT u.empresa_id FROM public.usuarios u
      WHERE u.user_id = auth.uid() AND u.deleted_at IS NULL
    )
    AND (
      SELECT u.role FROM public.usuarios u
      WHERE u.user_id = auth.uid() AND u.deleted_at IS NULL
    ) IN ('admin', 'empresa', 'gestor')
  );
