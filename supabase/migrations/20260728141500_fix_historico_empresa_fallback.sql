-- Corrige o fallback de resolução de empresa_id em fn_log_historico_alteracao():
-- clientes.empresa_id está sempre NULL em produção (coluna vestigial — a
-- autorização real da tabela usa usuario_id -> usuarios.empresa_id, ver
-- policies "clientes_select"/"clientes_update"/etc.). O fallback anterior
-- tentava ler clientes.empresa_id diretamente, o que nunca resolvia nada em
-- ações sem contexto de auth (ex.: edge functions). obras dependia do mesmo
-- valor (via cliente_id -> clientes.empresa_id) e tinha o mesmo problema.
CREATE OR REPLACE FUNCTION public.fn_log_historico_alteracao()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_usuario_id UUID;
  v_empresa_id UUID;
  v_row JSONB;
BEGIN
  v_usuario_id := public.get_my_usuario_id();
  v_row := to_jsonb(COALESCE(NEW, OLD));

  IF v_usuario_id IS NOT NULL THEN
    SELECT empresa_id INTO v_empresa_id FROM public.usuarios WHERE id = v_usuario_id;
  END IF;

  IF v_empresa_id IS NULL THEN
    IF TG_TABLE_NAME IN ('kanban_colunas', 'funis', 'usuarios') THEN
      v_empresa_id := (v_row->>'empresa_id')::uuid;
    ELSIF TG_TABLE_NAME IN ('pedidos', 'clientes', 'contatos', 'tarefas', 'permissoes_usuario') THEN
      SELECT empresa_id INTO v_empresa_id FROM public.usuarios WHERE id = (v_row->>'usuario_id')::uuid;
    ELSIF TG_TABLE_NAME = 'obras' THEN
      SELECT u.empresa_id INTO v_empresa_id
      FROM public.clientes c
      JOIN public.usuarios u ON u.id = c.usuario_id
      WHERE c.id = (v_row->>'cliente_id')::uuid;
    END IF;
  END IF;

  INSERT INTO public.historico_alteracoes (
    empresa_id, usuario_id, tabela, registro_id, acao, dados_antes, dados_depois, origem
  ) VALUES (
    v_empresa_id,
    v_usuario_id,
    TG_TABLE_NAME,
    (v_row->>'id')::uuid,
    TG_OP,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('UPDATE', 'INSERT') THEN to_jsonb(NEW) ELSE NULL END,
    'trigger'
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
