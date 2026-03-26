
-- Delete vendedores that are not the admin
DELETE FROM public.vendedores WHERE email != 'admin@admin.com';

-- Delete auth users that are not the admin
DELETE FROM auth.users WHERE email != 'admin@admin.com';
