-- Aparência de grupo / Chat Geral: símbolo escolhido + cor de fundo + cor do ícone.
-- Só ADD COLUMN (anuláveis): as tabelas já têm RLS e políticas de UPDATE (quem pode
-- editar grupo = criador/admin; Geral = gestor/admin), e colunas novas herdam essas
-- políticas — nenhuma política nova. `foto_url` (imagem) continua e tem prioridade na tela.

ALTER TABLE public.chat_grupos       ADD COLUMN IF NOT EXISTS icone text;
ALTER TABLE public.chat_grupos       ADD COLUMN IF NOT EXISTS cor_fundo text;
ALTER TABLE public.chat_grupos       ADD COLUMN IF NOT EXISTS cor_icone text;

ALTER TABLE public.chat_geral_config ADD COLUMN IF NOT EXISTS icone text;
ALTER TABLE public.chat_geral_config ADD COLUMN IF NOT EXISTS cor_fundo text;
ALTER TABLE public.chat_geral_config ADD COLUMN IF NOT EXISTS cor_icone text;
