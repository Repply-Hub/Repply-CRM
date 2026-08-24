-- O Plano de Vendas (card do Dashboard) tinha controle de acesso inteiramente
-- via `isGestor` hardcoded no frontend (role = admin/gestor/empresa), em três
-- níveis nunca diferenciados entre si: visão geral, quebra por fabricante,
-- quebra nominal por vendedor, mais criar/editar meta. Passa a usar a
-- infraestrutura de `permissoes_usuario`/`has_permission`/`has_funcionalidade`
-- já pronta e estável em produção desde abril/2026 (mesma usada por
-- pipeline/clientes/pedidos/etc via o catálogo MODULOS) — frente isolada, sem
-- relação com a Fase 2 de controle de SEÇÃO por EMPRESA
-- (docs/operacao/plano-controle-de-acesso.md).
--
-- Módulo novo: 'plano_vendas'
--   pode_ver              -> nível 1 (visão geral: card "Total do período")
--   pode_criar/pode_editar -> criar/editar (e remover, dentro do mesmo dialog) meta
--   funcionalidades.ver_metas_fabrica  -> nível 2 (quebra por fabricante)
--   funcionalidades.ver_metas_vendedor -> nível 3 (quebra nominal por vendedor)

-- ----------------------------------------------------------------------------
-- 1) Seed: preserva o acesso de quem hoje é gestor/admin/empresa
-- ----------------------------------------------------------------------------
-- Sem isto, o primeiro usuário gestor a abrir o Dashboard depois deste deploy
-- perderia a quebra por fabricante/vendedor: `has_funcionalidade` (diferente
-- de `has_permission`) NÃO libera por padrão quando não há linha — o COALESCE
-- cai pra FALSE (ver supabase/migrations/20260416174744_..._a31dddd34280.sql:75-86).
-- E `has_permission` só libera automaticamente pra role EXATAMENTE 'gestor'
-- (linha 66 da mesma migration) — 'admin'/'empresa' cairiam no COALESCE(...,
-- false) de pode_criar/pode_editar sem esta linha.
--
-- ON CONFLICT DO NOTHING: idempotente e nunca sobrescreve uma restrição que
-- o próprio gestor já tenha aplicado manualmente entre a escrita e a
-- aplicação desta migration.
INSERT INTO public.permissoes_usuario (usuario_id, modulo, pode_ver, pode_criar, pode_editar, pode_excluir, funcionalidades)
SELECT u.id, 'plano_vendas', true, true, true, true,
  jsonb_build_object('ver_metas_fabrica', true, 'ver_metas_vendedor', true)
FROM public.usuarios u
WHERE u.role IN ('gestor', 'admin', 'empresa')
ON CONFLICT (usuario_id, modulo) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2) Endurece plano_vendas_progresso_por_vendedor no banco
-- ----------------------------------------------------------------------------
-- `isGestor` escondia o botão/seção "Por vendedor" no frontend, mas a RPC em
-- si nunca impunha essa regra sozinha (CLAUDE.md §6.1: "esconder botão não
-- protege nada"). Com a permissão granular nova, um gestor pode ter
-- `ver_metas_vendedor` restrito manualmente — e `is_gestor()`/RLS de
-- `metas_vendas` não sabem nada sobre essa funcionalidade, então sem este
-- gate a RPC continuaria devolvendo a quebra nominal completa pra esse
-- gestor (e, por SECURITY INVOKER, teria a mesma leitura de qualquer
-- chamada direta com a sessão dele, fora da UI).
--
-- Mantido SECURITY INVOKER de propósito: é o que já faz `metas_vendas`/
-- `pedidos` escoparem por empresa/dono corretamente (ver comentário original
-- da função). Convertê-la pra SECURITY DEFINER trocaria RLS por privilégio
-- do dono da função — normalmente superusuário no Supabase, que ignora RLS
-- por completo — abrindo vazamento entre empresas nas duas tabelas que ela
-- lê. O gate novo só acrescenta uma condição extra ao SELECT existente;
-- `has_funcionalidade` já é SECURITY DEFINER por si só e não precisa que a
-- função inteira vire DEFINER pra funcionar.
CREATE OR REPLACE FUNCTION public.plano_vendas_progresso_por_vendedor(
  p_date_from date,
  p_date_to date,
  p_usuario_ids uuid[] DEFAULT NULL,
  p_fabricante_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  usuario_id uuid,
  usuario_nome text,
  fabricante_id uuid,
  fabricante_nome text,
  meta_valor numeric,
  vendido_valor numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH periodo AS (
    SELECT
      EXTRACT(YEAR FROM d)::int AS ano,
      EXTRACT(MONTH FROM d)::int AS mes
    FROM generate_series(
      date_trunc('month', COALESCE(p_date_from, p_date_to)::timestamp),
      date_trunc('month', COALESCE(p_date_to, p_date_from)::timestamp),
      INTERVAL '1 month'
    ) AS gs(d)
  ),
  metas AS (
    -- Aqui a soma entre meses é direta: só existe meta individual, sem a regra de
    -- "cai para a meta de equipe" que a função agregada precisa aplicar por mês.
    SELECT m.usuario_id, m.fabricante_id, SUM(m.meta_valor) AS meta_valor
    FROM public.metas_vendas m
    JOIN periodo pr ON pr.ano = m.ano AND pr.mes = m.mes
    WHERE m.usuario_id IS NOT NULL
      AND (p_usuario_ids IS NULL OR m.usuario_id = ANY(p_usuario_ids))
      AND (p_fabricante_ids IS NULL OR m.fabricante_id = ANY(p_fabricante_ids))
    GROUP BY m.usuario_id, m.fabricante_id
    HAVING SUM(m.meta_valor) > 0
  ),
  vendido AS (
    SELECT p.usuario_id, p.fabricante_id, SUM(p.valor_total) AS vendido_valor
    FROM public.pedidos p
    WHERE p.status = 'fechamento'
      AND p.prazo_resposta >= COALESCE(p_date_from, p_date_to)
      AND p.prazo_resposta <= COALESCE(p_date_to, p_date_from)
      AND (p_usuario_ids IS NULL OR p.usuario_id = ANY(p_usuario_ids))
      AND (p_fabricante_ids IS NULL OR p.fabricante_id = ANY(p_fabricante_ids))
    GROUP BY p.usuario_id, p.fabricante_id
  )
  SELECT
    u.id AS usuario_id,
    u.nome AS usuario_nome,
    f.id AS fabricante_id,
    f.nome AS fabricante_nome,
    metas.meta_valor AS meta_valor,
    COALESCE(vendido.vendido_valor, 0) AS vendido_valor
  FROM metas
  JOIN public.usuarios u ON u.id = metas.usuario_id
  JOIN public.fabricantes f ON f.id = metas.fabricante_id
  LEFT JOIN vendido ON vendido.usuario_id = metas.usuario_id AND vendido.fabricante_id = metas.fabricante_id
  LEFT JOIN public.plano_vendas_fabricante_ordem fo
    ON fo.fabricante_id = f.id AND fo.empresa_id = get_my_empresa_id()
  WHERE public.has_funcionalidade(public.get_my_usuario_id(), 'plano_vendas', 'ver_metas_vendedor')
  ORDER BY u.nome, COALESCE(fo.ordem, 2147483647), metas.meta_valor DESC;
$$;
