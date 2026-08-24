-- Painel "Radar de Risco" do Dashboard: quais negócios ABERTOS (nem ganhos nem
-- perdidos) estão travados. Fonte da "última atividade" é
-- pedidos_historico_status, não created_at/updated_at crus de `pedidos` —
-- updated_at muda em qualquer edição de campo (ex.: corrigir um telefone), o
-- que faria um negócio parado parecer "mexido hoje" sem ninguém ter avançado
-- nada de verdade. pedidos_historico_status só grava linha quando o status
-- muda (ou na criação), que é a definição real de "teve atividade".
--
-- Negócio criado ANTES da migration 20260730180000 (que introduziu essa
-- tabela) não tem nenhuma linha de histórico — por isso o COALESCE cai para
-- p.created_at nesse caso, em vez de tratar como "sem atividade nunca".
--
-- Dois problemas medidos, que não são a mesma coisa:
--   "parado"          = sem atividade de status há p_dias_parado dias ou mais.
--   "sem_proxima_acao" = nenhuma tarefa em aberto (tarefas.status <> 'concluida')
--                        apontando pro negócio. 'concluida' é o slug de sistema
--                        fixo por empresa (ver 20260708194500_tarefas_kanban_colunas.sql)
--                        — sempre existe, mesmo com colunas customizadas extras.
-- Um negócio pode cair nos dois ao mesmo tempo; por isso "valor em risco total"
-- soma o VALOR ÚNICO dos negócios em qualquer uma das duas condições (união),
-- em vez de somar valor_parados + valor_sem_proxima_acao — que contaria o
-- mesmo negócio duas vezes quando ele é os dois problemas de uma vez.
--
-- p_dias_parado é parâmetro (default 7, o mesmo corte do filtro "Atenção" de
-- Negócios.tsx) para poder ajustar o corte depois sem nova migration.
--
-- Fora de escopo nesta versão, de propósito: nenhum indicador de "próximo do
-- prazo de fechamento" — prazo_resposta hoje é retroativo (data em que o
-- negócio fechou), não existe campo de previsão futura no banco, e inventar
-- essa semântica aqui seria decisão de produto que não foi pedida.
--
-- risco_por_vendedor só sai preenchido para quem é is_gestor() (gestor/admin/
-- empresa) — vendedor comum não pode ver o valor em risco nominal dos colegas,
-- mesma regra que já protege outros pontos do Dashboard (ver
-- Dashboard.tsx: rendimentoVendedor filtrado no cliente por isGestor). Aqui a
-- checagem é feita DENTRO da RPC, não só escondida no front, porque o array
-- viria pronto com nome de cada vendedor dentro do jsonb.
CREATE OR REPLACE FUNCTION public.dashboard_negocios_risco(
  p_usuario_ids uuid[] DEFAULT NULL,
  p_fabricante_ids uuid[] DEFAULT NULL,
  p_funil_id uuid DEFAULT NULL,
  p_dias_parado integer DEFAULT 7
)
RETURNS TABLE (
  qtd_parados bigint,
  valor_parados numeric,
  qtd_sem_proxima_acao bigint,
  valor_sem_proxima_acao numeric,
  valor_risco_total numeric,
  risco_por_vendedor jsonb,
  risco_por_fabricante jsonb
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH abertos AS (
    SELECT
      p.id,
      p.valor_total,
      u.nome AS vendedor_nome,
      f.nome AS fabricante_nome,
      -- LATERAL com ORDER BY created_at DESC LIMIT 1 em vez de subselect com
      -- MAX(created_at): casa direto com o índice existente
      -- idx_pedidos_historico_status_pedido_created (pedido_id, created_at DESC),
      -- então cada negócio resolve a última atividade num Index Scan de 1 linha
      -- em vez de agregar todo o histórico dele.
      COALESCE(uh.ultima_atividade, p.created_at) AS ultima_atividade
    FROM public.pedidos p
    LEFT JOIN public.usuarios u ON u.id = p.usuario_id
    LEFT JOIN public.fabricantes f ON f.id = p.fabricante_id
    LEFT JOIN LATERAL (
      SELECT h.created_at AS ultima_atividade
      FROM public.pedidos_historico_status h
      WHERE h.pedido_id = p.id
      ORDER BY h.created_at DESC
      LIMIT 1
    ) uh ON true
    WHERE p.status NOT IN ('fechamento', 'perdido')
      AND (p_usuario_ids IS NULL OR p.usuario_id = ANY(p_usuario_ids))
      AND (p_fabricante_ids IS NULL OR p.fabricante_id = ANY(p_fabricante_ids))
      AND (p_funil_id IS NULL OR p.funil_id = p_funil_id)
  ),
  marcado AS (
    SELECT
      a.*,
      a.ultima_atividade <= (now() - (p_dias_parado || ' days')::interval) AS parado,
      NOT EXISTS (
        SELECT 1 FROM public.tarefas t
        WHERE t.pedido_id = a.id AND t.status <> 'concluida'
      ) AS sem_proxima_acao
    FROM abertos a
  )
  SELECT
    (SELECT count(*) FROM marcado WHERE parado)::bigint,
    (SELECT coalesce(sum(valor_total), 0) FROM marcado WHERE parado)::numeric,
    (SELECT count(*) FROM marcado WHERE sem_proxima_acao)::bigint,
    (SELECT coalesce(sum(valor_total), 0) FROM marcado WHERE sem_proxima_acao)::numeric,
    (SELECT coalesce(sum(valor_total), 0) FROM marcado WHERE parado OR sem_proxima_acao)::numeric,
    CASE WHEN is_gestor() THEN (
      SELECT coalesce(jsonb_agg(jsonb_build_object('vendedor', vendedor_nome, 'valor', total) ORDER BY total DESC), '[]'::jsonb)
      FROM (
        SELECT vendedor_nome, sum(valor_total) AS total
        FROM marcado
        WHERE (parado OR sem_proxima_acao) AND vendedor_nome IS NOT NULL
        GROUP BY vendedor_nome
      ) rv
    ) ELSE '[]'::jsonb END,
    (
      SELECT coalesce(jsonb_agg(jsonb_build_object('fabrica', fabricante_nome, 'valor', total) ORDER BY total DESC), '[]'::jsonb)
      FROM (
        SELECT fabricante_nome, sum(valor_total) AS total
        FROM marcado
        WHERE (parado OR sem_proxima_acao) AND fabricante_nome IS NOT NULL
        GROUP BY fabricante_nome
      ) rf
    );
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_negocios_risco(uuid[], uuid[], uuid, integer) TO authenticated;
