-- A busca da página de Negócios (ver useSearchMatches/resolveSearchMatches em
-- src/hooks/use-pedidos.ts) resolve o termo digitado em ids de cliente/fabricante/obra
-- com três `ilike '%termo%'` separados, e depois filtra `pedidos` por esses ids via
-- `cliente_id.in.(...)`/`fabricante_id.in.(...)`/`obra_id.in.(...)`. Sem índice, cada
-- etapa é uma varredura sequencial:
--
--  1. `ilike '%termo%'` tem wildcard à esquerda — um índice B-tree comum não ajuda,
--     precisa de trigram (pg_trgm) pra virar Bitmap Index Scan.
--  2. Mesmo com os ids já resolvidos, o filtro final em `pedidos.cliente_id`/`obra_id`
--     não tinha índice nenhum (só `usuario_id`, `status`, `fabricante_id`, `data_pedido`,
--     `funil_id`, `marcador_id`, `fechado_em`, `import_hash` — ver
--     20260722100000_dashboard_stats_rpc.sql, 20260722140000_funis.sql,
--     20260731130000_marcadores_negocios.sql, 20260811110000_pedidos_fechado_em.sql).
--
-- A RPC `pedidos_stats` (chamada pelo cabeçalho/contagem a cada busca) faz o mesmo tipo
-- de `ilike` direto nas colunas de texto via LEFT JOIN — os índices trigram abaixo cobrem
-- essa RPC também, sem precisar alterar sua definição.
--
-- pg_trgm já está habilitado neste projeto no schema `extensions` (ver
-- 20260804121322_email_nylas.sql e 20260805184506_whatsapp_indices_de_leitura_da_inbox.sql;
-- confirmado via `select extname, nspname from pg_extension`), mas o `IF NOT EXISTS` mantém
-- esta migration independente/idempotente. `gin_trgm_ops` precisa vir qualificado com o schema
-- porque `extensions` não está no `search_path` da sessão que roda a migration — sem o
-- prefixo, o Postgres não acha a operator class (mesmo com a extensão já instalada).
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE INDEX IF NOT EXISTS idx_clientes_empresa_trgm
  ON public.clientes USING GIN (empresa extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_fabricantes_nome_trgm
  ON public.fabricantes USING GIN (nome extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_obras_nome_obra_trgm
  ON public.obras USING GIN (nome_obra extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_pedidos_cliente_id
  ON public.pedidos (cliente_id);

CREATE INDEX IF NOT EXISTS idx_pedidos_obra_id
  ON public.pedidos (obra_id);
