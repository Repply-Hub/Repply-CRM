-- Remove o card "Velocidade de Resposta por Fábrica" do Dashboard (a pedido do
-- usuário) e sua RPC de suporte. idx_pedidos_historico_status_novo_pedido só existia
-- pra sustentar o filtro `status_novo = 'enviado'` desta RPC (ver
-- 20260806100000_velocidade_fabricante_rpc.sql) — nenhuma outra função usa esse
-- filtro, então cai junto.
DROP FUNCTION IF EXISTS public.dashboard_velocidade_fabricante(uuid[], uuid[], date, date);
DROP INDEX IF EXISTS public.idx_pedidos_historico_status_novo_pedido;
