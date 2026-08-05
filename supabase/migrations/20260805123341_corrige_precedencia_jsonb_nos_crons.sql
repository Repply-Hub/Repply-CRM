-- Bug de precedência de operador nos comandos de cron.
--
--   '{"a": "Bearer ' || chave || '"}'::jsonb
--
-- `::` liga MAIS FORTE que `||`, então o Postgres lê isto como
--
--   '{"a": "Bearer ' || chave || ('"}'::jsonb)
--
-- ou seja, tenta converter a string `"}` sozinha em jsonb e falha com
-- `22P02 invalid input syntax for type json`. Confirmado executando a expressão.
--
-- O comando de eventos-lembrete carrega este defeito desde 20260723210100 e o
-- de email-sync o herdou por cópia. Nenhum dos dois chegou a falhar POR ISTO
-- ainda, porque o pg_cron não consegue nem iniciar o job — mas é uma mina
-- esperando o dia em que o resto for consertado.
--
-- ================================================================
-- DOIS BLOQUEIOS QUE NÃO SE RESOLVEM EM SQL
-- ================================================================
-- Registrados aqui porque quem retomar isto vai encontrar os jobs agendados e
-- concluir, erradamente, que estão funcionando.
--
--   1. `cron.use_background_workers = off`. Com isso, o pg_cron abre conexão
--      libpq em `cron.host` e não consegue autenticar: as 3656 execuções
--      registradas até 05/08/2026 falharam TODAS com "job startup timeout",
--      desde a criação do job em 23/07. O parâmetro é de contexto `postmaster`
--      — mudá-lo exige REINICIAR o banco.
--
--   2. `app.settings.service_role_key` não está definida (nem no Vault). O
--      header sai como "Bearer " vazio e a function devolve 401. Verificado
--      disparando `net.http_post` na mão: resposta 401 "Sessão não
--      identificada." — foi a primeira linha que `net._http_response` recebeu
--      neste banco, o que por si só mostra que nenhum cron nunca saiu daqui.
--
-- Consequências enquanto os dois não forem resolvidos:
--   · o email-sync só roda quando alguém clica em atualizar na tela E-mails;
--   · os lembretes de evento NUNCA foram enviados.
--
-- `coalesce(..., '')` foi acrescentado para o comando ao menos executar e
-- registrar um 401 legível em `net._http_response`, em vez de estourar com
-- "could not determine data type of parameter" e não deixar rastro.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'eventos-lembrete') THEN
    PERFORM cron.unschedule('eventos-lembrete');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'email-sync') THEN
    PERFORM cron.unschedule('email-sync');
  END IF;
END $$;

SELECT cron.schedule('eventos-lembrete', '*/5 * * * *',
  $$ SELECT net.http_post(
    url := 'https://hukeirrmsoiowvvrhivx.supabase.co/functions/v1/eventos-lembrete',
    headers := ('{"Content-Type":"application/json","Authorization":"Bearer '
                || coalesce(current_setting('app.settings.service_role_key', true), '')
                || '"}')::jsonb,
    body := '{}'::jsonb
  ) $$);

SELECT cron.schedule('email-sync', '*/15 * * * *',
  $$ SELECT net.http_post(
    url := 'https://hukeirrmsoiowvvrhivx.supabase.co/functions/v1/email-sync',
    headers := ('{"Content-Type":"application/json","Authorization":"Bearer '
                || coalesce(current_setting('app.settings.service_role_key', true), '')
                || '"}')::jsonb,
    body := '{"limit":50}'::jsonb,
    timeout_milliseconds := 120000
  ) $$);
