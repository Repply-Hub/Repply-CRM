-- Create user_domains table
CREATE TABLE public.user_domains (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    domain_name TEXT NOT NULL,
    resend_domain_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    dns_records JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_domains ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own domains"
ON public.user_domains
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own domains"
ON public.user_domains
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own domains"
ON public.user_domains
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own domains"
ON public.user_domains
FOR DELETE
USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_user_domains_updated_at
BEFORE UPDATE ON public.user_domains
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();