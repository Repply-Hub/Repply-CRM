-- Add user_id column if not exists
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'emails_recebidos' AND column_name = 'user_id') THEN
        ALTER TABLE public.emails_recebidos ADD COLUMN user_id UUID REFERENCES auth.users(id);
    END IF;
END $$;

-- Add gmail_message_id column and unique constraint
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'emails_recebidos' AND column_name = 'gmail_message_id') THEN
        ALTER TABLE public.emails_recebidos ADD COLUMN gmail_message_id TEXT;
        ALTER TABLE public.emails_recebidos ADD CONSTRAINT emails_recebidos_gmail_message_id_key UNIQUE (gmail_message_id);
    END IF;
END $$;

-- Make resend_id nullable if it exists
ALTER TABLE public.emails_recebidos ALTER COLUMN resend_id DROP NOT NULL;
ALTER TABLE public.emails_recebidos ALTER COLUMN destinatarios DROP NOT NULL;

-- Add data_recebimento column
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'emails_recebidos' AND column_name = 'data_recebimento') THEN
        ALTER TABLE public.emails_recebidos ADD COLUMN data_recebimento TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- Enable RLS (assuming it might already be enabled, but let's be sure)
ALTER TABLE public.emails_recebidos ENABLE ROW LEVEL SECURITY;

-- Create policy for users to see their own received emails
DROP POLICY IF EXISTS "Users can view their own received emails" ON public.emails_recebidos;
CREATE POLICY "Users can view their own received emails" 
ON public.emails_recebidos 
FOR SELECT 
USING (auth.uid() = user_id);

-- Create policy for service role to insert (needed for edge function)
-- Service role usually bypasses RLS, but if the edge function uses a user token later...
-- For now, the edge function will use service_role, so it's fine.

-- Setup pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- The actual cron job creation will be done after the function is deployed
-- so we can use the correct URL.
