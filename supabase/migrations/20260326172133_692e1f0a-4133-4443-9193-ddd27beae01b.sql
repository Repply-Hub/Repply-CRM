
-- admin@admin.com → role 'admin'
UPDATE public.vendedores SET role = 'admin' WHERE email = 'admin@admin.com';

-- md@teste.com → role 'empresa'  
UPDATE public.vendedores SET role = 'empresa' WHERE email = 'md@teste.com';
