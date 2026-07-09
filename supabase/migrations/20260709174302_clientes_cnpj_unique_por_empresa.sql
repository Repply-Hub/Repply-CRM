-- CNPJ deve ser único por empresa (tenant), não globalmente.
-- Duas empresas distintas do sistema podem cadastrar o mesmo cliente (mesmo CNPJ);
-- o que não pode acontecer é a mesma empresa cadastrar o mesmo CNPJ duas vezes.

-- 1. Backfill: herda empresa_id a partir de usuarios.empresa_id (via clientes.usuario_id)
--    para registros antigos que ficaram com empresa_id nulo.
UPDATE public.clientes c
SET empresa_id = u.empresa_id
FROM public.usuarios u
WHERE c.usuario_id = u.id
  AND c.empresa_id IS NULL
  AND u.empresa_id IS NOT NULL;

-- 2. Remove a constraint UNIQUE antiga, global, apenas na coluna cnpj.
--    Busca dinamicamente o nome real da constraint (default: clientes_cnpj_key)
--    para não depender de um nome fixo caso ela tenha sido renomeada.
DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT con.conname INTO v_constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'clientes'
    AND con.contype = 'u'
    AND con.conkey = (
      SELECT array_agg(attnum ORDER BY attnum)
      FROM pg_attribute
      WHERE attrelid = rel.oid AND attname = 'cnpj'
    )
  LIMIT 1;

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.clientes DROP CONSTRAINT %I', v_constraint_name);
  END IF;
END $$;

-- 3. Cria a nova constraint composta: CNPJ único por empresa.
ALTER TABLE public.clientes
  ADD CONSTRAINT clientes_empresa_id_cnpj_key UNIQUE (empresa_id, cnpj);
