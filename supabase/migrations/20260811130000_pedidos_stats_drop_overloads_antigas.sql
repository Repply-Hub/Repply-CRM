-- A migration anterior (20260811120000) só derrubou as 2 assinaturas de pedidos_stats
-- que apareciam nos arquivos de migration mais recentes (9 e 10 parâmetros). Uma
-- consulta direta ao banco (pg_proc) depois do db push mostrou que sobraram MAIS DUAS
-- assinaturas antigas, de quando a função ainda nem tinha p_funil_id/p_marcador_ids —
-- nenhuma migration desde 20260702000000 chegou a dar DROP na versão anterior antes de
-- recriar com uma assinatura diferente, então foram se acumulando. Com isso, hoje
-- coexistem no banco a versão canônica nova (com p_date_field) e duas relíquias mortas
-- (nunca chamadas pelo frontend, que sempre manda todos os parâmetros nomeados) — não
-- são um risco funcional imediato, mas é lixo de overload que só cresce a cada mudança
-- de assinatura se não for limpo agora.
DROP FUNCTION IF EXISTS public.pedidos_stats(uuid[], text[], uuid[], date, date, text, boolean);
DROP FUNCTION IF EXISTS public.pedidos_stats(uuid[], text[], uuid[], date, date, text, boolean, uuid);
