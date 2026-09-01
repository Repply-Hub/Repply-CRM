-- `pedidos_stats` estourava o tempo limite do servidor e a tela girava para sempre.
--
-- 🔴 O QUE ACONTECIA, medido em produção em 01/09/2026 com o usuário real da MD:
--
--   | filtro na tela            | a função levava | resultado                        |
--   |---------------------------|-----------------|----------------------------------|
--   | mês corrente (o padrão)   | ~0,3 s          | ok — por isso ninguém tinha visto |
--   | um ano                    | ~2,0 s          | ok, no limite                     |
--   | TODOS os filtros limpos   | **11,1 s**      | **morta aos 8 s** (erro 57014)    |
--
-- O papel `authenticated` tem `statement_timeout = 8s`. A consulta precisava de 11,1 s, então
-- o servidor a cancelava, o navegador pedia de novo, e o ciclo não terminava nunca: o contador
-- ao lado da busca ficava girando indefinidamente.
--
-- E isso quebrava junto a SELEÇÃO EM MASSA, por um motivo deliberado do código: a caixa do
-- cabeçalho não age enquanto o total é desconhecido (`acaoDaCaixaDoCabecalho` devolve 'nada'
-- quando `totalConhecido` é falso, em `src/lib/selecao-em-massa.ts`). É a decisão certa — melhor
-- calar do que prometer "selecionar todos os 12.790" e apagar outro número. Só que, como o total
-- nunca chegava, a caixa ficava muda para sempre e não havia como selecionar tudo. O Kanban
-- seguia funcionando porque não depende desta contagem.
--
-- 🔴 A CAUSA: três junções que só a BUSCA usa, pagas sempre.
--
-- A função juntava `pedidos` com `clientes`, `fabricantes` e `obras` em toda chamada, mesmo com
-- `p_search` nulo — que é o caso comum. As três só existem para o `ILIKE` da busca por texto.
--
-- O custo não é da junção em si, é da REGRA DE SEGURANÇA das tabelas juntadas: `clientes_select`
-- chama `get_my_usuario_id()` e `usuario_in_my_empresa()`, e `obras_select` roda um `EXISTS`
-- correlacionado por linha. Multiplicado por 12.790 negócios, isso vira quase mil vezes o custo
-- de contar os negócios sozinhos:
--
--   contar `pedidos` sem as junções ......  11 ms
--   a função como estava ................. 11.117 ms   (361.452 blocos lidos)
--
-- O CONSERTO: trocar as três junções por `EXISTS` dentro do próprio bloco da busca. Quando não
-- há busca, o `p_search IS NULL` decide primeiro e o Postgres não encosta nas outras tabelas.
--
--   depois ................................ 24 ms, sem filtro nenhum
--
-- 🔴 MESMO RESULTADO, conferido antes de aplicar. A contagem de hoje foi comparada com a nova em
-- seis casos — sem busca (12.790), "constru" (4.509), "deca" (3.053), "vila" (62), "portobello"
-- (0) e a letra "a" sozinha (12.788), que casa com quase tudo. Idênticas nas seis.
--
-- Por que a troca é segura: as três junções são por CHAVE PRIMÁRIA (`c.id`, `f.id`, `o.id`),
-- então cada negócio casava com no máximo uma linha de cada tabela e a contagem nunca foi
-- multiplicada por elas. E `LEFT JOIN` com o valor nulo produzia `NULL ILIKE ...`, que não é
-- verdadeiro — exatamente o que o `EXISTS` devolve quando não há linha.
--
-- O predicado de data continua na forma de "OU de blocos", com cada bloco citando UMA coluna só
-- (CLAUDE.md §7.9). Não foi tocado aqui: ele não é o gargalo, e mexer nele é outro assunto.

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
SET search_path TO 'public'
AS $function$
  SELECT
    COUNT(*)::bigint AS total_count,
    COALESCE(SUM(p.valor_total), 0)::numeric AS total_valor
  FROM public.pedidos p
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
      -- 🔴 As três tabelas só são tocadas quando há busca. Sem isto, contar os negócios
      -- da empresa inteira levava 11,1 s e o servidor cancelava aos 8 s.
      p_search IS NULL OR p_search = ''
      OR EXISTS (SELECT 1 FROM public.clientes c
                  WHERE c.id = p.cliente_id AND c.empresa ILIKE '%' || p_search || '%')
      OR EXISTS (SELECT 1 FROM public.fabricantes f
                  WHERE f.id = p.fabricante_id AND f.nome ILIKE '%' || p_search || '%')
      OR EXISTS (SELECT 1 FROM public.obras o
                  WHERE o.id = p.obra_id AND o.nome_obra ILIKE '%' || p_search || '%')
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
