-- Desacopla instâncias WhatsApp dos usuários.
-- Instâncias passam a ser entidades independentes, vinculadas opcionalmente
-- a um usuário via usuario_id (nullable, UNIQUE excluindo NULLs pelo comportamento
-- padrão do PostgreSQL).

-- 1. Garantir que usuario_id aceita NULL (já deve ser nullable, mas garante)
ALTER TABLE public.configuracoes_wapi
  ALTER COLUMN usuario_id DROP NOT NULL;

-- 2. Adicionar UNIQUE em instance_name (identificador estável da instância na uazapi)
ALTER TABLE public.configuracoes_wapi
  ADD CONSTRAINT configuracoes_wapi_instance_name_key UNIQUE (instance_name);

-- 3. Nenhuma mudança de RLS necessária:
--    - As policies existentes já lêem por empresa_id para gestor/empresa
--    - O service role (usado nas functions) ignora RLS
