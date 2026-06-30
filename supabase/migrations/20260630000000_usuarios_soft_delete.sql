-- Soft delete para tabela usuarios
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_usuarios_deleted_at ON usuarios(deleted_at) WHERE deleted_at IS NOT NULL;

-- RPC: restaura ou recria um usuário a partir do email (busca em auth.users)
-- Usado pelo admin para recuperar usuários que foram hard-deletados
CREATE OR REPLACE FUNCTION restaurar_usuario_por_email(
  p_email TEXT,
  p_nome TEXT,
  p_role TEXT,
  p_empresa_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_usuario_id UUID;
  v_existing RECORD;
BEGIN
  -- Busca o user_id no auth.users pelo email
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = p_email
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Nenhuma conta de acesso encontrada com esse email.');
  END IF;

  -- Verifica se já existe um registro (mesmo deletado)
  SELECT * INTO v_existing
  FROM usuarios
  WHERE user_id = v_user_id
  LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    -- Reativa o registro existente (remove deleted_at)
    UPDATE usuarios
    SET deleted_at = NULL,
        nome = COALESCE(p_nome, v_existing.nome),
        role = COALESCE(p_role, v_existing.role),
        empresa_id = COALESCE(p_empresa_id, v_existing.empresa_id)
    WHERE id = v_existing.id;

    RETURN jsonb_build_object('action', 'restored', 'id', v_existing.id, 'user_id', v_user_id);
  ELSE
    -- Cria um novo registro
    INSERT INTO usuarios (user_id, email, nome, role, empresa_id)
    VALUES (v_user_id, p_email, p_nome, p_role, p_empresa_id)
    RETURNING id INTO v_usuario_id;

    RETURN jsonb_build_object('action', 'created', 'id', v_usuario_id, 'user_id', v_user_id);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION restaurar_usuario_por_email TO authenticated;
