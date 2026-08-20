-- Filtro "data de fechamento" passa a olhar prazo_resposta, não fechado_em
--
-- O PROBLEMA: existiam DOIS campos diferentes chamados "Data de Fechamento" na
-- interface, e o filtro de período usava o que não serve para a base histórica.
--
--   prazo_resposta  -> "Data de Fechamento" na ficha do negócio e no formulário.
--                      Recebe a data de fechamento vinda do Bitrix na importação, e é
--                      sobrescrita com a data de hoje quando o negócio entra na etapa
--                      'fechamento' (useUpdatePedidoStatus / useBulkUpdatePedidos).
--
--   fechado_em      -> "Data de Fechamento" no filtro de período. Mantida só por
--                      trigger, registra quando o negócio entrou numa etapa final
--                      DENTRO do Repply (20260811110000_pedidos_fechado_em.sql).
--
-- Para negócio cadastrado à mão os dois coincidem. Para negócio importado, não: o
-- gatilho carimbou o momento da importação. Medido em 20/08/2026 na MD
-- Representações: dos 11.714 negócios importados com fechado_em preenchido,
-- 11.653 estão em 18/08/2026 e 61 em 19/08/2026 — ou seja, toda a base histórica de
-- 2022 a 2026 aparecia como fechada no dia em que foi importada, enquanto a data real
-- do Bitrix (2022-01-07 a 2026-12-06) estava em prazo_resposta, que o filtro não lia.
--
-- Consequência prática: perguntar "quanto vendemos em agosto" devolvia número errado,
-- porque separava o que veio do Bitrix do que o vendedor cadastrou. São a mesma venda.
--
-- A DECISÃO (dono do produto, 20/08/2026): a data de fechamento é uma só, com o mesmo
-- significado nas duas origens. prazo_resposta é o único campo que já atende isso.
-- fechado_em continua existindo como registro interno de transição de etapa, mas deixa
-- de sustentar o filtro.
--
-- COMPATIBILIDADE: o valor 'fechado_em' continua aceito e passa a filtrar por
-- prazo_resposta. Isso é de propósito — o front publica na Vercel independente do
-- `supabase db push`, então durante a janela entre os dois deploys um navegador com o
-- bundle antigo ainda manda 'fechado_em'. Aceitar os dois faz a ordem do deploy não
-- importar.
--
-- PERFORMANCE: mantém o padrão de OR de blocos, cada um comparando UMA coluna só.
-- NÃO usar CASE comparando duas colunas: 20260811120000 fez isso e derrubou a RPC de
-- ~4ms para 16-31 SEGUNDOS em produção, porque o PostgREST chama RPC com argumentos
-- nomeados e o Postgres descarta o Index Scan nesse cenário
-- (ver 20260811140000_periodo_filtro_performance_fix.sql).

-- prazo_resposta não tinha índice — data_pedido e fechado_em tinham. Sem isto o filtro
-- novo nasce fazendo varredura completa da tabela.
CREATE INDEX IF NOT EXISTS idx_pedidos_prazo_resposta
  ON public.pedidos (prazo_resposta);

CREATE OR REPLACE FUNCTION public.pedidos_stats(
  p_usuario_ids uuid[] DEFAULT NULL::uuid[],
  p_stages text[] DEFAULT NULL::text[],
  p_fabricante_ids uuid[] DEFAULT NULL::uuid[],
  p_date_from date DEFAULT NULL::date,
  p_date_to date DEFAULT NULL::date,
  p_search text DEFAULT NULL::text,
  p_only_attention boolean DEFAULT false,
  p_funil_id uuid DEFAULT NULL::uuid,
  p_marcador_ids uuid[] DEFAULT NULL::uuid[],
  p_hide_importados boolean DEFAULT false,
  p_date_field text DEFAULT 'data_pedido'::text
)
RETURNS TABLE(total_count bigint, total_valor numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT
    COUNT(*)::bigint AS total_count,
    COALESCE(SUM(p.valor_total), 0)::numeric AS total_valor
  FROM public.pedidos p
  LEFT JOIN public.clientes c ON c.id = p.cliente_id
  LEFT JOIN public.fabricantes f ON f.id = p.fabricante_id
  LEFT JOIN public.obras o ON o.id = p.obra_id
  WHERE (p_usuario_ids IS NULL OR p.usuario_id = ANY(p_usuario_ids))
    AND (p_stages IS NULL OR p.status = ANY(p_stages))
    AND (p_fabricante_ids IS NULL OR p.fabricante_id = ANY(p_fabricante_ids))
    AND (
      -- Data de criação (padrão). Qualquer valor que não seja um dos dois de
      -- fechamento cai aqui, inclusive NULL — mesma tolerância de antes.
      (p_date_field IS DISTINCT FROM 'prazo_resposta'
        AND p_date_field IS DISTINCT FROM 'fechado_em'
        AND (p_date_from IS NULL OR p.data_pedido >= p_date_from)
        AND (p_date_to IS NULL OR p.data_pedido <= p_date_to))
      OR
      -- Data de fechamento. 'fechado_em' é o nome legado e cai no mesmo bloco.
      -- prazo_resposta é DATE puro, então compara direto — sem o ::date que o
      -- fechado_em (timestamptz) exigia.
      ((p_date_field = 'prazo_resposta' OR p_date_field = 'fechado_em')
        AND (p_date_from IS NULL OR p.prazo_resposta >= p_date_from)
        AND (p_date_to IS NULL OR p.prazo_resposta <= p_date_to))
    )
    AND (
      p_search IS NULL OR p_search = '' OR
      c.empresa ILIKE '%' || p_search || '%' OR
      f.nome ILIKE '%' || p_search || '%' OR
      o.nome_obra ILIKE '%' || p_search || '%'
    )
    AND (
      NOT p_only_attention OR (
        p.created_at <= now() - interval '7 days'
        AND p.status NOT IN ('fechamento', 'perdido')
      )
    )
    AND (p_funil_id IS NULL OR p.funil_id = p_funil_id)
    AND (p_marcador_ids IS NULL OR p.marcador_id = ANY(p_marcador_ids))
    AND (NOT p_hide_importados OR p.import_hash IS NULL);
$function$;
