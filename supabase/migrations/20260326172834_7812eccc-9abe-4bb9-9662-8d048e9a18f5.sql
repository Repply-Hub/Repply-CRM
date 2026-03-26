
-- Cria empresa para o admin master
INSERT INTO public.empresas (nome, owner_id)
SELECT 'MD Representações', user_id
FROM public.vendedores
WHERE email = 'admin@admin.com' AND user_id IS NOT NULL;

-- Vincula admin à sua empresa
UPDATE public.vendedores
SET empresa_id = (SELECT e.id FROM public.empresas e JOIN public.vendedores v ON e.owner_id = v.user_id WHERE v.email = 'admin@admin.com' LIMIT 1)
WHERE email = 'admin@admin.com';
