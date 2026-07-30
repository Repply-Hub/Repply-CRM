-- tabela_precos nunca teve índice em fabricante_id: toda seleção de fabricante
-- (Fabricantes.tsx, FabricanteSelector em Novo/Editar Pedido) faz um seq scan
-- na tabela inteira de produtos para filtrar por fabricante_id.
CREATE INDEX IF NOT EXISTS idx_tabela_precos_fabricante_id
  ON public.tabela_precos (fabricante_id);

-- Cobre a query de Novo/Editar Pedido, que filtra por fabricante_id + vigente = true.
CREATE INDEX IF NOT EXISTS idx_tabela_precos_fabricante_vigente
  ON public.tabela_precos (fabricante_id, vigente);
