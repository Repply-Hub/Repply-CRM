-- Create gmail_tokens table
CREATE TABLE public.gmail_tokens (
    user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at BIGINT NOT NULL,
    email TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.gmail_tokens ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own gmail tokens" 
ON public.gmail_tokens 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own gmail tokens" 
ON public.gmail_tokens 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own gmail tokens" 
ON public.gmail_tokens 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own gmail tokens" 
ON public.gmail_tokens 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE OR REPLACE FUNCTION public.update_gmail_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_gmail_tokens_updated_at
BEFORE UPDATE ON public.gmail_tokens
FOR EACH ROW
EXECUTE FUNCTION public.update_gmail_tokens_updated_at();