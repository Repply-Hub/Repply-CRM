-- Comentário manual do usuário sobre um negócio: diferente de `pedidos.observacoes`
-- (descrição fixa, um valor só) e diferente de `pedidos_historico_status` (log
-- automático, append-only, alimentado só por trigger — não serve para texto livre
-- digitado pela pessoa). Cada linha é um comentário, com autor e data.
CREATE TABLE IF NOT EXISTS public.pedidos_comentarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES public.usuarios(id),
  texto TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_pedidos_comentarios_pedido_created
  ON public.pedidos_comentarios(pedido_id, created_at DESC);

ALTER TABLE public.pedidos_comentarios ENABLE ROW LEVEL SECURITY;

-- Mesma regra de visibilidade hoje vigente em pedidos_historico_status_select
-- (depois de 20260804195019 ter tirado is_admin() dali): dono do negócio, ou
-- qualquer usuário da mesma empresa do dono. Sem is_admin() de propósito — o
-- admin global não deve ler conteúdo de negócio de nenhuma empresa.
DROP POLICY IF EXISTS "pedidos_comentarios_select" ON public.pedidos_comentarios;
CREATE POLICY "pedidos_comentarios_select" ON public.pedidos_comentarios
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.pedidos p
    WHERE p.id = pedido_id
      AND (p.usuario_id = get_my_usuario_id() OR usuario_in_my_empresa(p.usuario_id))
  )
);

-- Insere só em nome do próprio usuário logado, e só em negócio que ele já enxerga.
DROP POLICY IF EXISTS "pedidos_comentarios_insert" ON public.pedidos_comentarios;
CREATE POLICY "pedidos_comentarios_insert" ON public.pedidos_comentarios
FOR INSERT TO authenticated
WITH CHECK (
  usuario_id = get_my_usuario_id()
  AND EXISTS (
    SELECT 1 FROM public.pedidos p
    WHERE p.id = pedido_id
      AND (p.usuario_id = get_my_usuario_id() OR usuario_in_my_empresa(p.usuario_id))
  )
);

-- Editar e excluir ficam restritos ao próprio autor do comentário.
DROP POLICY IF EXISTS "pedidos_comentarios_update" ON public.pedidos_comentarios;
CREATE POLICY "pedidos_comentarios_update" ON public.pedidos_comentarios
FOR UPDATE TO authenticated
USING (usuario_id = get_my_usuario_id())
WITH CHECK (usuario_id = get_my_usuario_id());

DROP POLICY IF EXISTS "pedidos_comentarios_delete" ON public.pedidos_comentarios;
CREATE POLICY "pedidos_comentarios_delete" ON public.pedidos_comentarios
FOR DELETE TO authenticated
USING (usuario_id = get_my_usuario_id());
