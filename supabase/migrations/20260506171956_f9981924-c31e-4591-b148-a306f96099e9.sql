-- Enable pg_cron if not enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable pg_net if not enabled
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create the cron job
-- We use net.http_post to call the edge function
SELECT cron.schedule(
    'gmail-sync-inbox-every-2-min',
    '*/2 * * * *',
    $$
    SELECT net.http_post(
        url := 'https://ukwwhwytyovrzefkdeyj.supabase.co/functions/v1/gmail-sync-inbox',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := '{}'::jsonb
    )
    $$
);
