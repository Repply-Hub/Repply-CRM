-- Garantir que o índice único existe para o upsert funcionar
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE tablename = 'emails_recebidos' AND indexname = 'emails_recebidos_resend_id_key'
    ) THEN
        CREATE UNIQUE INDEX emails_recebidos_resend_id_key ON public.emails_recebidos (resend_id);
    END IF;
END $$;

-- Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Agendar a função a cada 2 minutos
-- Nota: O placeholder {SUPABASE_SERVICE_ROLE_KEY} deve ser substituído pelo valor real
-- Mas como estamos em um ambiente gerenciado, tentaremos usar a variável de ambiente se possível, 
-- ou deixar que o usuário saiba que precisa configurar a chave.
-- No entanto, a instrução do usuário foi específica sobre o formato.

SELECT cron.schedule('sync-gmail-inbox', '*/2 * * * *', 
  $$ SELECT net.http_post(
    url:='https://ukwwhwytyovrzefkdeyj.supabase.co/functions/v1/gmail-sync-inbox',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key', true) || '"}'::jsonb,
    body:='{}'::jsonb
  ) $$);
