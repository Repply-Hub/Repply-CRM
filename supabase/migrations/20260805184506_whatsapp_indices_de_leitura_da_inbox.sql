-- Dois índices que faltavam, ambos medidos com EXPLAIN (ANALYZE, BUFFERS) em
-- produção, na sessão de um vendedor real.

-- ---------------------------------------------------------------------
-- 1. Abrir uma conversa
-- ---------------------------------------------------------------------
-- A consulta é `where conversa_id = ? order by created_at desc limit 200`, mas
-- os índices existentes são SEPARADOS — `(conversa_id)` e `(created_at)` — então
-- o Postgres pegava todas as mensagens da conversa, rodava a RLS em cada uma e
-- só então ordenava e cortava. Na maior conversa da MD (1.198 mensagens):
--
--   Limit (actual time=649.346..649.398 rows=200)
--     -> Sort (top-N heapsort)
--          -> Bitmap Heap Scan  rows=1198  Filter: can_access_wa_conversa(...)
--   Execution Time: 649.567 ms   Buffers: shared hit=16477
--
-- Depois: 235 ms, 3.226 buffers, e lê exatamente as 200 linhas devolvidas.
CREATE INDEX IF NOT EXISTS idx_whatsapp_mensagens_conversa_data
  ON public.whatsapp_mensagens (conversa_id, created_at DESC);

-- ---------------------------------------------------------------------
-- 2. Busca por texto na inbox
-- ---------------------------------------------------------------------
-- `ilike '%termo%'` não usa índice B-tree, então a busca era varredura
-- sequencial das 29 mil mensagens COM a RLS rodando em cada linha antes do
-- `limit`. Medido com o termo "pedido":
--
--   Seq Scan on whatsapp_mensagens (actual time=99.205..13296.082 rows=820)
--     Rows Removed by Filter: 28668
--   Execution Time: 13302.225 ms   Buffers: shared hit=344837  (~2,7 GB)
--
-- 13,3 s contra um `statement_timeout` de 8 s: na prática a busca MORRIA e
-- voltava como erro na tela — 108 chamadas com média de 5.317 ms e máxima de
-- 7.979 ms, coladas no teto. É a "instabilidade" que o usuário relatava.
--
-- Depois: 1.878 ms, 56.088 buffers. O que sobra é a RLS por linha
-- (`can_access_wa_conversa`, 5 subconsultas cada), que é outro problema e ficou
-- deliberadamente fora deste escopo.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_whatsapp_mensagens_conteudo_trgm
  ON public.whatsapp_mensagens USING GIN (conteudo gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_whatsapp_mensagens_empresa_nota_data
  ON public.whatsapp_mensagens (empresa_id, is_nota_interna, created_at DESC);
