-- Estende o "Histórico de Movimentação" do negócio (visível a qualquer usuário que
-- enxerga o pedido, diferente do audit log genérico historico_alteracoes que é restrito
-- a gestor/admin) para registrar não só troca de etapa do Kanban, mas também qualquer
-- edição de campo feita via formulário (EditarPedido.tsx / useUpdatePedidoCompleto).
--
-- Reaproveita a mesma tabela em vez de criar uma nova: cada linha agora tem um "tipo"
-- ('status' ou 'campo'). Linhas 'status' continuam usando status_anterior/status_novo
-- como antes (não quebra dado histórico já gravado). Linhas 'campo' usam as 3 colunas
-- novas (campo/valor_anterior/valor_novo), já com nomes/valores legíveis resolvidos no
-- próprio trigger (nome do cliente/fabricante/vendedor/obra/marcador em vez do UUID),
-- para a UI não precisar rejoinar nada.
ALTER TABLE public.pedidos_historico_status
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'status',
  ADD COLUMN IF NOT EXISTS campo TEXT,
  ADD COLUMN IF NOT EXISTS valor_anterior_txt TEXT,
  ADD COLUMN IF NOT EXISTS valor_novo_txt TEXT;

ALTER TABLE public.pedidos_historico_status
  ALTER COLUMN status_novo DROP NOT NULL;

ALTER TABLE public.pedidos_historico_status
  DROP CONSTRAINT IF EXISTS pedidos_historico_status_tipo_check;
ALTER TABLE public.pedidos_historico_status
  ADD CONSTRAINT pedidos_historico_status_tipo_check CHECK (tipo IN ('status', 'campo'));

ALTER TABLE public.pedidos_historico_status
  DROP CONSTRAINT IF EXISTS pedidos_historico_status_shape_check;
ALTER TABLE public.pedidos_historico_status
  ADD CONSTRAINT pedidos_historico_status_shape_check CHECK (
    (tipo = 'status' AND status_novo IS NOT NULL)
    OR (tipo = 'campo' AND campo IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION public.fn_log_pedido_historico_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_usuario_id UUID;
  v_empresa_id UUID;
  v_cliente_old TEXT;
  v_cliente_new TEXT;
  v_fabricante_old TEXT;
  v_fabricante_new TEXT;
  v_vendedor_old TEXT;
  v_vendedor_new TEXT;
  v_obra_old TEXT;
  v_obra_new TEXT;
  v_marcador_old TEXT;
  v_marcador_new TEXT;
  v_old_extras JSONB;
  v_new_extras JSONB;
  v_key TEXT;
  v_label TEXT;
BEGIN
  v_usuario_id := COALESCE(public.get_my_usuario_id(), NEW.usuario_id);

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.pedidos_historico_status (pedido_id, tipo, status_anterior, status_novo, usuario_id)
    VALUES (NEW.id, 'status', NULL, NEW.status, v_usuario_id);
    RETURN NEW;
  END IF;

  -- TG_OP = 'UPDATE' a partir daqui

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.pedidos_historico_status (pedido_id, tipo, status_anterior, status_novo, usuario_id)
    VALUES (NEW.id, 'status', OLD.status, NEW.status, v_usuario_id);
  END IF;

  IF NEW.cliente_id IS DISTINCT FROM OLD.cliente_id THEN
    SELECT empresa INTO v_cliente_old FROM public.clientes WHERE id = OLD.cliente_id;
    SELECT empresa INTO v_cliente_new FROM public.clientes WHERE id = NEW.cliente_id;
    INSERT INTO public.pedidos_historico_status (pedido_id, tipo, campo, valor_anterior_txt, valor_novo_txt, usuario_id)
    VALUES (NEW.id, 'campo', 'Cliente', v_cliente_old, v_cliente_new, v_usuario_id);
  END IF;

  IF NEW.fabricante_id IS DISTINCT FROM OLD.fabricante_id THEN
    SELECT nome INTO v_fabricante_old FROM public.fabricantes WHERE id = OLD.fabricante_id;
    SELECT nome INTO v_fabricante_new FROM public.fabricantes WHERE id = NEW.fabricante_id;
    INSERT INTO public.pedidos_historico_status (pedido_id, tipo, campo, valor_anterior_txt, valor_novo_txt, usuario_id)
    VALUES (NEW.id, 'campo', 'Fabricante', v_fabricante_old, v_fabricante_new, v_usuario_id);
  END IF;

  IF NEW.usuario_id IS DISTINCT FROM OLD.usuario_id THEN
    SELECT nome INTO v_vendedor_old FROM public.usuarios WHERE id = OLD.usuario_id;
    SELECT nome INTO v_vendedor_new FROM public.usuarios WHERE id = NEW.usuario_id;
    INSERT INTO public.pedidos_historico_status (pedido_id, tipo, campo, valor_anterior_txt, valor_novo_txt, usuario_id)
    VALUES (NEW.id, 'campo', 'Vendedor', v_vendedor_old, v_vendedor_new, v_usuario_id);
  END IF;

  IF NEW.obra_id IS DISTINCT FROM OLD.obra_id THEN
    SELECT nome_obra INTO v_obra_old FROM public.obras WHERE id = OLD.obra_id;
    SELECT nome_obra INTO v_obra_new FROM public.obras WHERE id = NEW.obra_id;
    INSERT INTO public.pedidos_historico_status (pedido_id, tipo, campo, valor_anterior_txt, valor_novo_txt, usuario_id)
    VALUES (NEW.id, 'campo', 'Obra', v_obra_old, v_obra_new, v_usuario_id);
  END IF;

  IF NEW.marcador_id IS DISTINCT FROM OLD.marcador_id THEN
    SELECT nome INTO v_marcador_old FROM public.marcadores WHERE id = OLD.marcador_id;
    SELECT nome INTO v_marcador_new FROM public.marcadores WHERE id = NEW.marcador_id;
    INSERT INTO public.pedidos_historico_status (pedido_id, tipo, campo, valor_anterior_txt, valor_novo_txt, usuario_id)
    VALUES (NEW.id, 'campo', 'Marcador', v_marcador_old, v_marcador_new, v_usuario_id);
  END IF;

  IF NEW.data_pedido IS DISTINCT FROM OLD.data_pedido THEN
    INSERT INTO public.pedidos_historico_status (pedido_id, tipo, campo, valor_anterior_txt, valor_novo_txt, usuario_id)
    VALUES (
      NEW.id, 'campo', 'Data do pedido',
      to_char(OLD.data_pedido, 'DD/MM/YYYY'), to_char(NEW.data_pedido, 'DD/MM/YYYY'),
      v_usuario_id
    );
  END IF;

  IF NEW.prazo_resposta IS DISTINCT FROM OLD.prazo_resposta THEN
    INSERT INTO public.pedidos_historico_status (pedido_id, tipo, campo, valor_anterior_txt, valor_novo_txt, usuario_id)
    VALUES (
      NEW.id, 'campo', 'Prazo de resposta',
      to_char(OLD.prazo_resposta, 'DD/MM/YYYY'), to_char(NEW.prazo_resposta, 'DD/MM/YYYY'),
      v_usuario_id
    );
  END IF;

  IF NEW.origem_lead IS DISTINCT FROM OLD.origem_lead THEN
    INSERT INTO public.pedidos_historico_status (pedido_id, tipo, campo, valor_anterior_txt, valor_novo_txt, usuario_id)
    VALUES (NEW.id, 'campo', 'Origem do lead', OLD.origem_lead, NEW.origem_lead, v_usuario_id);
  END IF;

  IF NEW.endereco_entrega IS DISTINCT FROM OLD.endereco_entrega THEN
    INSERT INTO public.pedidos_historico_status (pedido_id, tipo, campo, valor_anterior_txt, valor_novo_txt, usuario_id)
    VALUES (NEW.id, 'campo', 'Endereço de entrega', OLD.endereco_entrega, NEW.endereco_entrega, v_usuario_id);
  END IF;

  IF NEW.observacoes IS DISTINCT FROM OLD.observacoes THEN
    INSERT INTO public.pedidos_historico_status (pedido_id, tipo, campo, valor_anterior_txt, valor_novo_txt, usuario_id)
    VALUES (NEW.id, 'campo', 'Observações', OLD.observacoes, NEW.observacoes, v_usuario_id);
  END IF;

  IF NEW.valor_total IS DISTINCT FROM OLD.valor_total THEN
    INSERT INTO public.pedidos_historico_status (pedido_id, tipo, campo, valor_anterior_txt, valor_novo_txt, usuario_id)
    VALUES (
      NEW.id, 'campo', 'Valor total',
      OLD.valor_total::text, NEW.valor_total::text,
      v_usuario_id
    );
  END IF;

  IF (OLD.pdf_url IS NOT NULL) IS DISTINCT FROM (NEW.pdf_url IS NOT NULL) THEN
    INSERT INTO public.pedidos_historico_status (pedido_id, tipo, campo, valor_anterior_txt, valor_novo_txt, usuario_id)
    VALUES (
      NEW.id, 'campo', 'Anexo (PDF)',
      CASE WHEN OLD.pdf_url IS NOT NULL THEN 'Anexado' END,
      CASE WHEN NEW.pdf_url IS NOT NULL THEN 'Anexado' END,
      v_usuario_id
    );
  END IF;

  -- Campos extras são dinâmicos por empresa (tabela configuracoes_campos) — resolve o
  -- label configurado para cada chave alterada, com fallback para a própria chave.
  v_old_extras := COALESCE(OLD.campos_extras, '{}'::jsonb);
  v_new_extras := COALESCE(NEW.campos_extras, '{}'::jsonb);
  IF v_old_extras IS DISTINCT FROM v_new_extras THEN
    SELECT empresa_id INTO v_empresa_id FROM public.usuarios WHERE id = NEW.usuario_id;

    FOR v_key IN
      SELECT k FROM jsonb_object_keys(v_old_extras) AS k
      UNION
      SELECT k FROM jsonb_object_keys(v_new_extras) AS k
    LOOP
      IF v_old_extras -> v_key IS DISTINCT FROM v_new_extras -> v_key THEN
        SELECT cc.label INTO v_label
        FROM public.configuracoes_campos cc
        WHERE cc.empresa_id = v_empresa_id AND cc.entidade = 'pedidos' AND cc.campo_key = v_key
        LIMIT 1;

        INSERT INTO public.pedidos_historico_status (pedido_id, tipo, campo, valor_anterior_txt, valor_novo_txt, usuario_id)
        VALUES (
          NEW.id, 'campo', COALESCE(v_label, v_key),
          NULLIF(v_old_extras ->> v_key, ''),
          NULLIF(v_new_extras ->> v_key, ''),
          v_usuario_id
        );
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;
