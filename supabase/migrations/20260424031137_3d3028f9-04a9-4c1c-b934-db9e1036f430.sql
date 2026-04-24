CREATE TABLE public.debug_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Inserir o resultado do RPC na tabela de debug
DO $$
DECLARE
    vid uuid;
BEGIN
    -- Configurar o UID do usuário md@teste.com
    SET LOCAL "request.jwt.claim.sub" = '03f756b0-c565-471b-9434-bed90844ed00';
    -- Nota: O postgrest usa essa variável para o auth.uid()
    -- Mas como estamos em um bloco SQL direto, auth.uid() pode não funcionar se não houver um contexto de sessão.
    -- No entanto, get_my_usuario_id usa auth.uid().
    -- Vamos tentar forçar o valor se possível ou apenas checar a query que a função faz.
    
    INSERT INTO public.debug_logs (message) 
    SELECT 'Usuario ID para ' || email || ': ' || id::text 
    FROM public.usuarios 
    WHERE user_id = '03f756b0-c565-471b-9434-bed90844ed00';
END $$;