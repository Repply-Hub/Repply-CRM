
CREATE TABLE public.mensagens_whatsapp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id uuid NOT NULL REFERENCES public.vendedores(id) ON DELETE CASCADE,
  pedido_id uuid REFERENCES public.pedidos(id) ON DELETE SET NULL,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  telefone_destino text NOT NULL,
  tipo_mensagem text NOT NULL DEFAULT 'cobranca',
  conteudo text NOT NULL,
  metodo text NOT NULL DEFAULT 'wa_me_link',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mensagens_whatsapp ENABLE ROW LEVEL SECURITY;

CREATE POLICY "whatsapp_select" ON public.mensagens_whatsapp
  FOR SELECT TO authenticated
  USING (vendedor_id = get_my_vendedor_id() OR is_gestor());

CREATE POLICY "whatsapp_insert" ON public.mensagens_whatsapp
  FOR INSERT TO authenticated
  WITH CHECK (vendedor_id = get_my_vendedor_id() OR is_gestor());

CREATE POLICY "whatsapp_delete" ON public.mensagens_whatsapp
  FOR DELETE TO authenticated
  USING (is_gestor());
