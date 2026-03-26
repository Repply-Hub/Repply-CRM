
CREATE TABLE public.tarefas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  descricao text,
  status text NOT NULL DEFAULT 'pendente',
  prazo_final timestamp with time zone,
  responsavel text,
  criado_por text,
  participantes text,
  observadores text,
  projeto text,
  marcadores text,
  vendedor_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.tarefas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tarefas_select" ON public.tarefas FOR SELECT TO authenticated USING (true);
CREATE POLICY "tarefas_insert" ON public.tarefas FOR INSERT TO authenticated WITH CHECK ((vendedor_id = get_my_vendedor_id()) OR is_gestor());
CREATE POLICY "tarefas_update" ON public.tarefas FOR UPDATE TO authenticated USING ((vendedor_id = get_my_vendedor_id()) OR is_gestor());
CREATE POLICY "tarefas_delete" ON public.tarefas FOR DELETE TO authenticated USING (is_gestor());
