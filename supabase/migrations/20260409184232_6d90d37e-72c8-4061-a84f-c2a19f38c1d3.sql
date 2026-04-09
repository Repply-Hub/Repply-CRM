
-- Remove vendedores entries
DELETE FROM public.vendedores WHERE email IN ('lucas@teste.com', 'md@teste.com');

-- Remove auth users
DELETE FROM auth.users WHERE email IN ('lucas@teste.com', 'md@teste.com');
