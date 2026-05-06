-- Ensure RLS is enabled for all target tables
ALTER TABLE public.emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emails_recebidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gmail_tokens ENABLE ROW LEVEL SECURITY;

-- Clean up existing policies to avoid conflicts
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('emails', 'emails_recebidos', 'gmail_tokens')) 
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    END LOOP;
END $$;

-- Policies for public.emails
CREATE POLICY "Users can manage their own emails" 
ON public.emails 
FOR ALL 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policies for public.emails_recebidos
CREATE POLICY "Users can manage their own received emails" 
ON public.emails_recebidos 
FOR ALL 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policies for public.gmail_tokens
CREATE POLICY "Users can manage their own gmail tokens" 
ON public.gmail_tokens 
FOR ALL 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
