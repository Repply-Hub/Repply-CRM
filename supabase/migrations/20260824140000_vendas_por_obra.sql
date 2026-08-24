-- O que foi vendido para cada obra
--
-- Última peça do projeto de Obras. Responde, na ficha da obra: quanto já foi GANHO, quanto
-- está EM ABERTO, quais negócios são esses e quais representadas entraram no canteiro.
--
-- DECISÃO DE PRODUTO (24/08/2026): dois números lado a lado, "Ganho" e "Em aberto", em vez de
-- um "vendido" só. Um número único seria ambíguo dos dois jeitos — somar tudo faz orçamento
-- em negociação parecer venda (e o número CAI no dia em que ele vira perdido), e somar só o
-- ganho esconde a oportunidade que ainda está de pé.
--
-- ⚠️ SOMA NO BANCO, NUNCA NO NAVEGADOR (CLAUDE.md §6.4). O molde tentador está a um arquivo
-- de distância: `usePedidosPorCliente` puxa TODOS os negócios do cliente sem paginação
-- (`use-pedidos.ts:637`). Copiado para obra, funciona no teste e quebra em silêncio na obra
-- grande — o PostgREST corta em 1.000 linhas sem avisar.

-- ---------------------------------------------------------------- o que conta como ganho
--
-- `status = 'fechamento'` é a convenção do sistema inteiro, não escolha deste arquivo:
-- `ETAPAS_FINAIS = ['fechamento', 'perdido']` aparece em `use-edit-pedido.ts:8` e em
-- `ImportPedidosDialog.tsx:63`, as duas colunas são `is_sistema` e protegidas contra exclusão
-- (`KanbanColunasDialog.tsx:169`), e todas as funções do Dashboard contam por ela
-- (`20260821120000_dashboard_datas_por_fechamento.sql`).
--
-- Medido na MD em 24/08/2026: fechamento 8.519 · perdido 3.199 · negociacao 181 · enviado 12.
--
-- "Em aberto" é o complemento: nem ganho, nem perdido. Escrito assim, e não como lista de
-- etapas intermediárias, porque as etapas do meio são CONFIGURÁVEIS por empresa — uma lista
-- fixa deixaria de fora qualquer etapa nova que alguém criasse, e o dinheiro sumiria da conta
-- sem ninguém perceber.

-- ---------------------------------------------------------------- SEGURANÇA
--
-- As três funções são SECURITY INVOKER (o padrão, sem `security definer`): a RLS de `obras` e
-- a de `pedidos` continuam valendo para quem chama. Isso importa porque as duas filtram por
-- donos DIFERENTES — obra pelo dono do CLIENTE, negócio pelo dono do NEGÓCIO. Com invoker as
-- duas rodam juntas e ninguém enxerga o que não enxergaria pela tela.
--
-- É por isso também que não há `where empresa_id = ...` aqui: seria uma segunda cerca, mais
-- fraca que a RLS e fácil de esquecer de atualizar.

-- ---------------------------------------------------------------- 1. os dois números

create or replace function public.obra_vendas(p_obra_id uuid)
returns table (
  ganho_qtd     bigint,
  ganho_valor   numeric,
  aberto_qtd    bigint,
  aberto_valor  numeric,
  perdido_qtd   bigint,
  perdido_valor numeric,
  total_qtd     bigint
)
language sql
stable
set search_path to 'public'
as $$
  select
    count(*) filter (where p.status = 'fechamento'),
    coalesce(sum(p.valor_total) filter (where p.status = 'fechamento'), 0),
    count(*) filter (where p.status not in ('fechamento', 'perdido')),
    coalesce(sum(p.valor_total) filter (where p.status not in ('fechamento', 'perdido')), 0),
    count(*) filter (where p.status = 'perdido'),
    coalesce(sum(p.valor_total) filter (where p.status = 'perdido'), 0),
    count(*)
  from pedidos p
  where p.obra_id = p_obra_id;
$$;

-- ---------------------------------------------------------------- 2. as representadas

-- Qual marca entrou naquele canteiro, e quanto. Ordenado pelo ganho, porque é a pergunta que
-- se faz olhando para uma obra: quem de fato vendeu ali.
--
-- `fabricante_id` é NOT NULL em `pedidos`, mas a junção é EXTERNA mesmo assim: fabricante
-- excluído deixaria a linha órfã, e uma junção interna sumiria com o dinheiro dela do total
-- sem avisar. Melhor aparecer como "(sem fabricante)" do que a conta não fechar.
create or replace function public.obra_fabricantes(p_obra_id uuid)
returns table (
  fabricante_id   uuid,
  fabricante_nome text,
  ganho_qtd       bigint,
  ganho_valor     numeric,
  total_qtd       bigint
)
language sql
stable
set search_path to 'public'
as $$
  select
    f.id,
    coalesce(f.nome, '(sem fabricante)'),
    count(*) filter (where p.status = 'fechamento'),
    coalesce(sum(p.valor_total) filter (where p.status = 'fechamento'), 0),
    count(*)
  from pedidos p
  left join fabricantes f on f.id = p.fabricante_id
  where p.obra_id = p_obra_id
  group by f.id, f.nome
  order by 4 desc, 5 desc;
$$;

-- ---------------------------------------------------------------- 3. a lista, paginada

-- `total_count` viaja em toda linha — é a forma de o PostgREST devolver o total junto da
-- página sem uma segunda consulta. A tela lê o valor da primeira linha.
--
-- Página vazia devolve zero linhas e, com isso, zero total: a tela precisa tratar o caso
-- "nenhum negócio" pelo próprio vazio, não pelo `total_count`.
create or replace function public.obra_negocios(
  p_obra_id uuid,
  p_limit   integer default 10,
  p_offset  integer default 0
)
returns table (
  id              uuid,
  negocio_nome    text,
  cliente_nome    text,
  fabricante_nome text,
  responsavel     text,
  status          text,
  etapa_nome      text,
  valor_total     numeric,
  data_pedido     date,
  total_count     bigint
)
language sql
stable
set search_path to 'public'
as $$
  select
    p.id,
    p.nome,
    c.empresa,
    f.nome,
    u.nome,
    p.status,
    -- O nome que a pessoa vê no funil ("Orçamento Enviado"), não o apelido cru gravado na
    -- coluna ("enviado"). A junção é externa e cai no próprio apelido quando a etapa foi
    -- renomeada ou removida — em vez de a célula ficar vazia.
    coalesce(k.nome, p.status),
    p.valor_total,
    p.data_pedido,
    count(*) over ()
  from pedidos p
  -- ⚠️ `clientes.empresa` é o NOME DA EMPRESA CLIENTE, não o inquilino do SaaS. A tabela
  -- não tem coluna `nome` — a ambiguidade está registrada no CLAUDE.md §4 e derrubou a
  -- primeira versão desta função.
  left join clientes    c on c.id = p.cliente_id
  left join fabricantes f on f.id = p.fabricante_id
  left join usuarios    u on u.id = p.usuario_id
  left join kanban_colunas k on k.slug = p.status and k.empresa_id = get_my_empresa_id()
  where p.obra_id = p_obra_id
  order by p.data_pedido desc nulls last, p.id
  limit greatest(p_limit, 1)
  offset greatest(p_offset, 0);
$$;

revoke all on function public.obra_vendas(uuid) from public, anon;
revoke all on function public.obra_fabricantes(uuid) from public, anon;
revoke all on function public.obra_negocios(uuid, integer, integer) from public, anon;

grant execute on function public.obra_vendas(uuid) to authenticated;
grant execute on function public.obra_fabricantes(uuid) to authenticated;
grant execute on function public.obra_negocios(uuid, integer, integer) to authenticated;

-- ---------------------------------------------------------------- por que RPC NOVA
--
-- Acrescentar um parâmetro de obra a `pedidos_stats` seria o caminho curto e já deu errado
-- aqui: uma migration recriou aquela função com assinatura nova e deixou a busca por obra
-- MORTA em produção, e foi preciso um arquivo só para varrer as sobrecargas antigas
-- (20260811120000 e 20260811130000). Função nova não corre esse risco.

-- ---------------------------------------------------------------- o número que NÃO usamos
--
-- "Vendido" aqui é `pedidos.valor_total`, e não a soma de `itens_pedido.preco_total`.
--
-- Os dois divergem POR DECISÃO CONSCIENTE: a tela de editar negócio grava o valor digitado
-- DEPOIS dos itens, de propósito, para vencer o gatilho que recalcula o total — o código
-- chama isso de "LIMITE CONHECIDO" (`use-edit-pedido.ts:153-172`).
--
-- E o desempate é a medição: `itens_pedido` tem **1 linha no banco inteiro**. A importação
-- gravou o valor direto no negócio e nunca criou item. Somar itens entregaria R$ 0,00 em
-- toda obra, sem erro nenhum aparecer.
