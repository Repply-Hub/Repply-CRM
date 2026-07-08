-- Documenta colunas de public.pedidos que ja existiam em producao mas nunca foram
-- versionadas em nenhuma migration (drift confirmado via auditoria read-only em
-- 2026-07-08 contra o projeto hukeirrmsoiowvvrhivx: information_schema.columns
-- ja retornava import_hash, origem_lead, endereco_entrega e pdf_url, e pg_indexes
-- ja retornava idx_pedidos_import_hash, sem nenhum arquivo em supabase/migrations/
-- que os criasse). Idempotente: seguro para rodar em qualquer estado do banco.

ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS import_hash text;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS origem_lead text;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS endereco_entrega text;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS pdf_url text;

CREATE INDEX IF NOT EXISTS idx_pedidos_import_hash ON public.pedidos USING btree (import_hash) WHERE (import_hash IS NOT NULL);
