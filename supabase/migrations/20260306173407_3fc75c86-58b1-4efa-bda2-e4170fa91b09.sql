
-- Audit log for permission changes
CREATE TABLE public.audit_permissoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  vendedor_id uuid NOT NULL REFERENCES public.vendedores(id) ON DELETE CASCADE,
  acao text NOT NULL,
  detalhes jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_permissoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_select" ON public.audit_permissoes
  FOR SELECT TO authenticated USING (is_gestor());

CREATE POLICY "audit_insert" ON public.audit_permissoes
  FOR INSERT TO authenticated WITH CHECK (is_gestor());
