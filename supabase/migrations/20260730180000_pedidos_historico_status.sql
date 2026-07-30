-- Histórico de movimentação do negócio no Kanban: uma linha por avanço/troca de
-- etapa (incluindo a etapa inicial na criação), pensado para ser exibido dentro
-- do próprio negócio (qualquer usuário da empresa que enxerga o pedido enxerga
-- seu histórico), diferente de historico_alteracoes que é o log de auditoria
-- genérico restrito a gestor/admin.
--
-- Alimentado só por trigger no Postgres (fonte única de verdade) — cobre tanto o
-- drag-and-drop do Kanban (useUpdatePedidoStatus) quanto a troca de fase pelo
-- formulário de edição (useUpdatePedidoCompleto) e qualquer outra via de escrita.
CREATE TABLE public.pedidos_historico_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  status_anterior TEXT,
  status_novo TEXT NOT NULL,
  usuario_id UUID REFERENCES public.usuarios(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_pedidos_historico_status_pedido_created ON public.pedidos_historico_status(pedido_id, created_at DESC);

ALTER TABLE public.pedidos_historico_status ENABLE ROW LEVEL SECURITY;

-- Mesma regra de visibilidade da tabela pedidos (ver policy "pedidos_select"):
-- admin, dono do negócio, ou qualquer usuário da mesma empresa do dono.
CREATE POLICY "pedidos_historico_status_select" ON public.pedidos_historico_status
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.pedidos p
    WHERE p.id = pedido_id
      AND (is_admin() OR p.usuario_id = get_my_usuario_id() OR usuario_in_my_empresa(p.usuario_id))
  )
);

-- Sem policy de INSERT/UPDATE/DELETE para authenticated: só o trigger (SECURITY
-- DEFINER, roda com privilégio do owner) grava aqui — log append-only.

CREATE OR REPLACE FUNCTION public.fn_log_pedido_historico_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_usuario_id UUID;
BEGIN
  -- Fora de contexto de auth (ex.: edge function de importação rodando com
  -- service role), cai no dono do próprio pedido em vez de ficar sem autor.
  v_usuario_id := COALESCE(public.get_my_usuario_id(), NEW.usuario_id);

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.pedidos_historico_status (pedido_id, status_anterior, status_novo, usuario_id)
    VALUES (NEW.id, NULL, NEW.status, v_usuario_id);
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.pedidos_historico_status (pedido_id, status_anterior, status_novo, usuario_id)
    VALUES (NEW.id, OLD.status, NEW.status, v_usuario_id);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pedidos_historico_status
AFTER INSERT OR UPDATE ON public.pedidos
FOR EACH ROW EXECUTE FUNCTION public.fn_log_pedido_historico_status();
