
-- =============================================
-- TABLES
-- =============================================

CREATE TABLE public.vendedores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  telefone TEXT,
  role TEXT NOT NULL DEFAULT 'vendedor',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.clientes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa TEXT NOT NULL,
  cnpj TEXT UNIQUE,
  endereco TEXT,
  tipo TEXT NOT NULL,
  nome_contato TEXT,
  telefone TEXT,
  email TEXT,
  vendedor_id UUID REFERENCES public.vendedores(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.obras (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  nome_obra TEXT NOT NULL,
  spe_cnpj TEXT,
  endereco_entrega TEXT,
  status TEXT NOT NULL DEFAULT 'em_andamento',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.fabricantes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  cnpj TEXT,
  nome_contato TEXT,
  telefone TEXT,
  ultima_atualizacao_preco TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.tabela_precos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fabricante_id UUID NOT NULL REFERENCES public.fabricantes(id) ON DELETE CASCADE,
  descricao_material TEXT NOT NULL,
  referencia TEXT,
  preco_unitario NUMERIC(12,2) NOT NULL,
  unidade TEXT,
  vigente BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.pedidos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id),
  obra_id UUID REFERENCES public.obras(id),
  fabricante_id UUID NOT NULL REFERENCES public.fabricantes(id),
  vendedor_id UUID NOT NULL REFERENCES public.vendedores(id),
  status TEXT NOT NULL DEFAULT 'novo_lead',
  data_pedido DATE NOT NULL DEFAULT now(),
  valor_total NUMERIC(12,2),
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.itens_pedido (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pedido_id UUID NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  descricao_material TEXT NOT NULL,
  referencia_fabricante TEXT,
  quantidade NUMERIC(10,3) NOT NULL,
  unidade TEXT,
  preco_unitario NUMERIC(12,2) NOT NULL,
  preco_total NUMERIC(12,2) GENERATED ALWAYS AS (quantidade * preco_unitario) STORED
);

CREATE TABLE public.historico_contatos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pedido_id UUID NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  vendedor_id UUID NOT NULL REFERENCES public.vendedores(id),
  tipo TEXT NOT NULL,
  descricao TEXT,
  data_contato TIMESTAMPTZ NOT NULL DEFAULT now(),
  proximo_contato_em TIMESTAMPTZ
);

CREATE TABLE public.automation_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo TEXT NOT NULL,
  pedido_id UUID REFERENCES public.pedidos(id),
  cliente_id UUID REFERENCES public.clientes(id),
  status TEXT,
  detalhes JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- HELPER FUNCTIONS
-- =============================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_gestor()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.vendedores
    WHERE user_id = auth.uid() AND role = 'gestor'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_my_vendedor_id()
RETURNS uuid AS $$
  SELECT id FROM public.vendedores
  WHERE user_id = auth.uid()
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- =============================================
-- TRIGGERS
-- =============================================

CREATE TRIGGER update_clientes_updated_at
  BEFORE UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_pedidos_updated_at
  BEFORE UPDATE ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.recalcular_valor_total_pedido()
RETURNS TRIGGER AS $$
DECLARE
  _pedido_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _pedido_id := OLD.pedido_id;
  ELSE
    _pedido_id := NEW.pedido_id;
  END IF;

  UPDATE public.pedidos
  SET valor_total = (
    SELECT COALESCE(SUM(preco_total), 0)
    FROM public.itens_pedido
    WHERE pedido_id = _pedido_id
  )
  WHERE id = _pedido_id;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_recalcular_valor_total
  AFTER INSERT OR UPDATE OR DELETE ON public.itens_pedido
  FOR EACH ROW EXECUTE FUNCTION public.recalcular_valor_total_pedido();

-- =============================================
-- RLS
-- =============================================

ALTER TABLE public.vendedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fabricantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tabela_precos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens_pedido ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_contatos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_logs ENABLE ROW LEVEL SECURITY;

-- vendedores
CREATE POLICY "vendedores_select" ON public.vendedores FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_gestor());
CREATE POLICY "vendedores_insert" ON public.vendedores FOR INSERT TO authenticated WITH CHECK (public.is_gestor());
CREATE POLICY "vendedores_update" ON public.vendedores FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.is_gestor());
CREATE POLICY "vendedores_delete" ON public.vendedores FOR DELETE TO authenticated USING (public.is_gestor());

-- clientes
CREATE POLICY "clientes_select" ON public.clientes FOR SELECT TO authenticated USING (vendedor_id = public.get_my_vendedor_id() OR public.is_gestor());
CREATE POLICY "clientes_insert" ON public.clientes FOR INSERT TO authenticated WITH CHECK (vendedor_id = public.get_my_vendedor_id() OR public.is_gestor());
CREATE POLICY "clientes_update" ON public.clientes FOR UPDATE TO authenticated USING (vendedor_id = public.get_my_vendedor_id() OR public.is_gestor());
CREATE POLICY "clientes_delete" ON public.clientes FOR DELETE TO authenticated USING (public.is_gestor());

-- obras
CREATE POLICY "obras_select" ON public.obras FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = cliente_id AND (c.vendedor_id = public.get_my_vendedor_id() OR public.is_gestor())));
CREATE POLICY "obras_insert" ON public.obras FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = cliente_id AND (c.vendedor_id = public.get_my_vendedor_id() OR public.is_gestor())));
CREATE POLICY "obras_update" ON public.obras FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = cliente_id AND (c.vendedor_id = public.get_my_vendedor_id() OR public.is_gestor())));
CREATE POLICY "obras_delete" ON public.obras FOR DELETE TO authenticated USING (public.is_gestor());

-- fabricantes
CREATE POLICY "fabricantes_select" ON public.fabricantes FOR SELECT TO authenticated USING (true);
CREATE POLICY "fabricantes_insert" ON public.fabricantes FOR INSERT TO authenticated WITH CHECK (public.is_gestor());
CREATE POLICY "fabricantes_update" ON public.fabricantes FOR UPDATE TO authenticated USING (public.is_gestor());
CREATE POLICY "fabricantes_delete" ON public.fabricantes FOR DELETE TO authenticated USING (public.is_gestor());

-- tabela_precos
CREATE POLICY "tabela_precos_select" ON public.tabela_precos FOR SELECT TO authenticated USING (true);
CREATE POLICY "tabela_precos_insert" ON public.tabela_precos FOR INSERT TO authenticated WITH CHECK (public.is_gestor());
CREATE POLICY "tabela_precos_update" ON public.tabela_precos FOR UPDATE TO authenticated USING (public.is_gestor());
CREATE POLICY "tabela_precos_delete" ON public.tabela_precos FOR DELETE TO authenticated USING (public.is_gestor());

-- pedidos
CREATE POLICY "pedidos_select" ON public.pedidos FOR SELECT TO authenticated USING (vendedor_id = public.get_my_vendedor_id() OR public.is_gestor());
CREATE POLICY "pedidos_insert" ON public.pedidos FOR INSERT TO authenticated WITH CHECK (vendedor_id = public.get_my_vendedor_id() OR public.is_gestor());
CREATE POLICY "pedidos_update" ON public.pedidos FOR UPDATE TO authenticated USING (vendedor_id = public.get_my_vendedor_id() OR public.is_gestor());
CREATE POLICY "pedidos_delete" ON public.pedidos FOR DELETE TO authenticated USING (public.is_gestor());

-- itens_pedido
CREATE POLICY "itens_pedido_select" ON public.itens_pedido FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id = pedido_id AND (p.vendedor_id = public.get_my_vendedor_id() OR public.is_gestor())));
CREATE POLICY "itens_pedido_insert" ON public.itens_pedido FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id = pedido_id AND (p.vendedor_id = public.get_my_vendedor_id() OR public.is_gestor())));
CREATE POLICY "itens_pedido_update" ON public.itens_pedido FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id = pedido_id AND (p.vendedor_id = public.get_my_vendedor_id() OR public.is_gestor())));
CREATE POLICY "itens_pedido_delete" ON public.itens_pedido FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id = pedido_id AND (p.vendedor_id = public.get_my_vendedor_id() OR public.is_gestor())));

-- historico_contatos
CREATE POLICY "historico_contatos_select" ON public.historico_contatos FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id = pedido_id AND (p.vendedor_id = public.get_my_vendedor_id() OR public.is_gestor())));
CREATE POLICY "historico_contatos_insert" ON public.historico_contatos FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id = pedido_id AND (p.vendedor_id = public.get_my_vendedor_id() OR public.is_gestor())));
CREATE POLICY "historico_contatos_update" ON public.historico_contatos FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id = pedido_id AND (p.vendedor_id = public.get_my_vendedor_id() OR public.is_gestor())));
CREATE POLICY "historico_contatos_delete" ON public.historico_contatos FOR DELETE TO authenticated USING (public.is_gestor());

-- automation_logs
CREATE POLICY "automation_logs_select" ON public.automation_logs FOR SELECT TO authenticated USING (public.is_gestor());
CREATE POLICY "automation_logs_insert" ON public.automation_logs FOR INSERT TO authenticated WITH CHECK (public.is_gestor());
