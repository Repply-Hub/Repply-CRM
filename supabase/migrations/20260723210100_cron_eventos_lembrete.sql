-- Agenda a checagem de lembretes de eventos a cada 5 minutos.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'eventos-lembrete') THEN
    PERFORM cron.unschedule('eventos-lembrete');
  END IF;
END $$;

SELECT cron.schedule('eventos-lembrete', '*/5 * * * *',
  $$ SELECT net.http_post(
    url:='https://hukeirrmsoiowvvrhivx.supabase.co/functions/v1/eventos-lembrete',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key', true) || '"}'::jsonb,
    body:='{}'::jsonb
  ) $$);
