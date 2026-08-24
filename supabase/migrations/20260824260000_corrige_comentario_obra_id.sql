-- ============================================================================
-- Corrige o comentário de `pedidos.obra_id`, que eu mesmo escrevi errado
-- ============================================================================
--
-- A migration anterior (20260824250000) afirmou que a coluna "obra" da planilha vira
-- `campos_extras['Negócio']`. **É meia verdade, e a metade que falta é a principal.**
--
-- Rastreando os dois caminhos:
--
--   src/hooks/use-bulk-import.ts:243   const enderecoEntrega = String(row.obra ?? '').trim();
--   src/hooks/use-bulk-import.ts:271   endereco_entrega: enderecoEntrega || null,
--
--   src/components/pedidos/ImportPedidosDialog.tsx:447-449
--     if (r.negocio)      campos_extras['Negócio'] = r.negocio;
--     else if (r.obra)    campos_extras['Negócio'] = r.obra;
--     else                campos_extras['Negócio'] = r.cliente;
--
-- Ou seja: o destino REAL é `pedidos.endereco_entrega`. O uso em `campos_extras['Negócio']`
-- é só RESERVA para o nome do negócio, e só quando a planilha não traz um nome. Eu tinha
-- achado o segundo caminho e parado ali.
--
-- Não edito o arquivo anterior (`CLAUDE.md` §6.3: nunca editar migration existente). Este
-- reescreve o comentário por cima — `COMMENT ON` substitui, não acumula.
--
-- Nada de estrutura nem de dado muda aqui, igual à anterior.
-- ============================================================================

COMMENT ON COLUMN public.pedidos.obra_id IS
  'NULO nos 11.911 negócios, e a tabela obras tem 0 linhas — a seção Obras nunca foi usada. '
  'A importação NÃO escreve aqui: a coluna "Obra/Endereço" da planilha vai para '
  'pedidos.endereco_entrega (use-bulk-import.ts:243 e 271), e serve de reserva para o nome '
  'do negócio em campos_extras[''Negócio''] quando a planilha não traz nome '
  '(ImportPedidosDialog.tsx:448). A coluna "Obra/Endereço" da lista de Negócios mostra '
  'endereco_entrega com queda para obras.nome_obra — e essa queda nunca acontece hoje, '
  'porque obra_id é nulo em tudo.';
