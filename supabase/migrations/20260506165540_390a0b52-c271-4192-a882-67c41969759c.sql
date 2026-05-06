-- Atualizar slug da coluna Novo Lead no Kanban
UPDATE public.kanban_colunas SET slug = 'novo lead' WHERE slug = 'novo_lead';

-- Atualizar status dos pedidos
UPDATE public.pedidos SET status = 'novo lead' WHERE status = 'novo_lead';
UPDATE public.pedidos SET status = replace(status, '_', ' ') WHERE status LIKE '%\_%';

-- Atualizar status das tarefas
UPDATE public.tarefas SET status = 'em andamento' WHERE status = 'em_andamento';

-- Limpar marcadores das tarefas
UPDATE public.tarefas SET marcadores = replace(marcadores, '_', ' ') WHERE marcadores LIKE '%\_%';

-- Garantir que as colunas customizadas também não tenham sublinhados nos slugs se necessário
UPDATE public.colunas_customizadas SET slug = replace(slug, '_', ' ') WHERE slug LIKE '%\_%';
