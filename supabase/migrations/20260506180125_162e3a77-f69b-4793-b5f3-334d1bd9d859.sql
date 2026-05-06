-- Remover agendamento anterior se existir para garantir que usamos o formato exato
SELECT cron.unschedule('sync-gmail-inbox');

SELECT cron.schedule('sync-gmail-inbox', '*/2 * * * *', 
  $$ select net.http_post(
    url:='https://ukwwhwytyovrzefkdeyj.supabase.co/functions/v1/gmail-sync-inbox',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer {SUPABASE_SERVICE_ROLE_KEY}"}'::jsonb,
    body:='{}'::jsonb
  ) $$);
