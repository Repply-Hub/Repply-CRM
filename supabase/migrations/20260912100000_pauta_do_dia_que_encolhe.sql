-- ============================================================================
-- A PAUTA DO DIA É ESCOLHIDA NA VIRADA DO DIA, E SÓ ENCOLHE
-- ============================================================================
--
-- Pedido do dono do produto em 12/09/2026, desenho em
-- `docs/superpowers/specs/2026-09-12-pauta-do-dia-que-encolhe-design.md`:
--
--   · a lista do dia é decidida na virada e vale o dia inteiro; o negócio que recebe retorno
--     sai dela e NADA entra no lugar, até zerar;
--   · a pauta de quem tem a chave `pauta_de_todos` volta a trazer a equipe, com os negócios
--     do próprio dono nas primeiras vagas;
--   · só entra o que está parado — acaba o enchimento por `pauta_min_itens`;
--   · a fila devolve também os negócios JÁ FEITOS hoje, para a tela contar "3 de 7 feitos".
--
-- 🔴 ISTO DESFAZ, DE PROPÓSITO, A MIGRATION `20260909120000_fila_pessoal.sql`. O motivo
-- registrado lá era real — "o teto de 7 era disputado por valor com os da equipe inteira, e o
-- negócio de R$ 8 mil do gestor perdia a vaga para o de R$ 2 milhões de um colega". A ordem
-- nova resolve exatamente isso: os do dono ocupam as primeiras vagas. Quem ler só aquele
-- arquivo vai achar que isto é regressão; não é.
--
-- 🔴 `CREATE OR REPLACE`, NUNCA `DROP` + `CREATE`. Medido em 12/09/2026, `pg_proc.proacl`:
--     pauta_do_dia_de(uuid)  ->  postgres=X/postgres | service_role=X/postgres
-- Nem `anon`, nem `authenticated`, nem PUBLIC — ela é só do servidor, alimenta o e-mail das 7h.
-- Como a assinatura não muda, o `CREATE OR REPLACE` preserva a `proacl` inteira. Confira antes
-- e depois:
--   select p.oid::regprocedure, coalesce(array_to_string(p.proacl,' | '),'(padrao)')
--     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.proname like 'pauta_do_dia%';
--
-- 🔴 O corpo abaixo foi COLHIDO com `pg_get_functiondef` em 12/09/2026 e editado a partir do
-- texto vigente. `md5(prosrc)` do texto colhido: e65e235e52c15d1326ad51d67f43162f (6.217
-- caracteres). Fora das trocas marcadas com 🔴 no corpo, o texto é o mesmo caractere por
-- caractere.
--
-- `pauta_do_dia()` NÃO é tocada: o corpo dela inteiro é
-- `select * from public.pauta_do_dia_de(get_my_usuario_id());`. Ela herda.
--
-- ----------------------------------------------------------------------------
-- O QUE CONTA COMO "DAR RETORNO", E POR QUE EDIÇÃO DE CAMPO NÃO CONTA
-- ----------------------------------------------------------------------------
-- Medido no banco em 12/09/2026: dias de importação escrevem milhares de linhas de histórico
-- de uma vez — um dia com 9.498 edições de campo alcançando 4.637 negócios, outro com 10.063
-- negócios recebendo linha de etapa. Se qualquer mexida contasse como retorno, um dia de
-- importação ZERARIA a pauta da empresa inteira e o sistema diria "dia cumprido" para gente que
-- não trabalhou.
--
-- A separação é limpa e está gravada: nos três dias de carga, as linhas em massa têm TODAS
-- `status_anterior` nulo. Quem move o negócio de verdade grava de onde ele saiu. Por isso:
--
--   · mudança de etapa conta SÓ com `status_anterior is not null` (o que também deixa de fora
--     a criação de um negócio novo — criar não é dar retorno);
--   · contato registrado conta (é onde o "Retomar depois" grava);
--   · tarefa do negócio criada ou concluída hoje conta;
--   · edição de campo solto NÃO conta.
--
-- Quando esta régua errar, ela erra para o lado seguro: o negócio CONTINUA na fila.
--
-- 🔴 FUSO — `historico_contatos.data_contato` é comparada EM UTC. Medido: a coluna guarda
-- meia-noite UTC (o que `registrar_retorno` grava, `(now() at time zone 'America/Sao_Paulo')::date`
-- convertido para timestamptz) e meio-dia UTC (o que as telas de contato gravam). Converter
-- para São Paulo joga o primeiro grupo para o dia ANTERIOR, e o retorno registrado hoje contaria
-- como de ontem. É a armadilha do CLAUDE.md §7.12 vista do lado do banco.
--
-- ----------------------------------------------------------------------------
-- O QUE CONGELA NA VIRADA DO DIA, E POR QUÊ
-- ----------------------------------------------------------------------------
-- Se só a saída dos negócios feitos mudasse, o próximo da fila subiria para a vaga aberta — que
-- é exatamente a recomposição que o pedido derruba. Então quatro entradas passam a ser medidas
-- no começo do dia (`v_inicio`):
--
--   1. `ultima_etapa` — o "há quantos dias está parado" olha só o histórico anterior à virada.
--      É o que mantém o negócio que recebeu ação hoje ocupando o lugar dele na lista.
--   2. `retorno_marcado` — retorno marcado HOJE não tira o negócio da lista de hoje; ele sai
--      como FEITO, e é a partir de amanhã que a data marcada o segura.
--   3. A tarefa que esconde o negócio — vale a que existia na virada. Tarefa criada hoje não
--      esconde (o negócio sai como feito); tarefa concluída hoje não revela (ela escondia o
--      negócio na virada, então ele não era da lista de hoje).
--   4. `v_compromissos`, que desconta vaga — conta os compromissos do dia que já existiam na
--      virada, concluídos ou não. Sem isso, concluir uma tarefa abriria vaga e puxaria um
--      negócio novo, e criar uma tarefa às 10h derrubaria um negócio da lista.
--
-- ⚠️ DUAS SIMPLIFICAÇÕES CONSCIENTES, e as duas erram para o lado de não inventar trabalho:
--
--   · Os COMPROMISSOS desenhados continuam ao vivo. Reunião marcada às 10h para as 15h aparece;
--     esconder um compromisso do dia até amanhã seria defeito, não regra. A consequência aceita:
--     num dia assim a tela pode mostrar mais itens que o teto.
--   · Negócio GANHO OU PERDIDO hoje sai da conta do dia — ele deixa de ser candidato pelo filtro
--     de etapa aberta, que continua ao vivo, e não aparece como "feito". O contador diz "3 de 6"
--     em vez de "3 de 7". A lista continua chegando a zero; o que se perde é o crédito.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.pauta_do_dia_de(p_usuario_id uuid)
 RETURNS TABLE(tipo text, referencia_id uuid, selo text, titulo text, detalhe text, valor numeric, quando timestamp with time zone, dias_parado integer, ordem integer, responsavel text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  -- 🔴 MUDOU: some `v_min` (o piso acabou), entram `v_inicio` (a virada do dia) e `v_ve_todos`.
  v_empresa uuid; v_auth uuid; v_dias int; v_max int;
  v_hoje date; v_inicio timestamptz; v_compromissos int; v_vagas int; v_ve_todos boolean;
begin
  select u.empresa_id, u.user_id into v_empresa, v_auth
  from usuarios u where u.id = p_usuario_id and u.deleted_at is null;
  if v_empresa is null then return; end if;
  if not empresa_tem_secao_de(v_empresa, 'hoje') then return; end if;

  -- 🔴 MUDOU: a chave volta a decidir de quem são os negócios da fila. A leitura é a MESMA que
  -- a tabela do time e o painel de risco usam — uma função só, nunca uma cópia.
  v_ve_todos := public.ve_pauta_de_todos(p_usuario_id);

  -- 🔴 MUDOU: `pauta_min_itens` não é mais lido. A linha continua no banco de quem a salvou;
  -- voltar atrás é reemitir esta função.
  select coalesce((select (c.valor #>> '{}')::int from configuracoes_automacao c
                    where c.empresa_id = v_empresa and c.chave = 'pauta_dias_parado'), 3),
         coalesce((select (c.valor #>> '{}')::int from configuracoes_automacao c
                    where c.empresa_id = v_empresa and c.chave = 'pauta_max_itens'), 7)
    into v_dias, v_max;

  v_hoje := (now() at time zone 'America/Sao_Paulo')::date;
  -- 🔴 NOVO: a virada do dia no calendário brasileiro, em timestamptz. `v_hoje::timestamp` é
  -- meia-noite SEM fuso; `at time zone 'America/Sao_Paulo'` diz que essa meia-noite é de São
  -- Paulo e devolve o instante. Comparar `created_at` com `v_hoje` puro compararia com meia-noite
  -- UTC, três horas antes, e o trabalho feito entre 21h e meia-noite cairia no dia errado.
  v_inicio := (v_hoje::timestamp at time zone 'America/Sao_Paulo');

  -- 🔴 MUDOU: conta os compromissos que já existiam NA VIRADA, concluídos ou não. Antes eram os
  -- abertos agora — e aí concluir uma tarefa abria vaga para um negócio novo entrar.
  select count(*) into v_compromissos
  from (
    select 1 from eventos e
     where e.user_id = v_auth and (e.inicio at time zone 'America/Sao_Paulo')::date = v_hoje
       and e.created_at < v_inicio
    union all
    select 1 from tarefas t
     where t.usuario_id = p_usuario_id and t.prazo_final is not null
       and (t.prazo_final at time zone 'America/Sao_Paulo')::date = v_hoje
       and t.created_at < v_inicio
  ) q;

  v_vagas := greatest(v_max - v_compromissos, 0);

  return query
  with
  gente as (
    select u.id from usuarios u
     where u.empresa_id = v_empresa and u.deleted_at is null
       -- 🔴 MUDOU: era `and u.id = p_usuario_id` (fila sempre pessoal, 09/09/2026).
       and (v_ve_todos or u.id = p_usuario_id)
  ),
  etapas_abertas as (
    select distinct k.slug from kanban_colunas k
     where k.empresa_id = v_empresa and k.slug not in ('fechamento','perdido')
  ),
  ultima_etapa as (
    select h.pedido_id, max(h.created_at) as em
      from pedidos_historico_status h
     where h.tipo = 'status'
       -- 🔴 NOVO: só o histórico anterior à virada. É esta linha que congela a lista do dia.
       and h.created_at < v_inicio
       and h.pedido_id in (select p2.id from pedidos p2 where p2.usuario_id in (select id from gente))
     group by h.pedido_id
  ),
  retorno_marcado as (
    select hc.pedido_id, max(hc.proximo_contato_em) as ate
      from historico_contatos hc
     where hc.proximo_contato_em is not null
       -- 🔴 NOVO: retorno marcado HOJE não tira o negócio da lista de hoje — ele sai como
       -- feito. Ver o aviso de fuso no cabeçalho: a comparação é em UTC.
       and (hc.data_contato at time zone 'UTC')::date < v_hoje
     group by hc.pedido_id
  ),
  agidos_hoje as (
    -- 🔴 NOVO: os negócios que receberam retorno hoje, por QUALQUER pessoa. Ver o cabeçalho
    -- para por que edição de campo e etapa sem anterior ficam de fora.
    select distinct x.pedido_id from (
      select h.pedido_id from pedidos_historico_status h
       where h.created_at >= v_inicio
         and h.tipo = 'status'
         and h.status_anterior is not null
      union all
      select hc.pedido_id from historico_contatos hc
       where (hc.data_contato at time zone 'UTC')::date = v_hoje
      union all
      select t.pedido_id from tarefas t
       where t.pedido_id is not null
         and (t.created_at >= v_inicio
              or (coalesce(t.status,'') = 'concluida' and t.updated_at >= v_inicio))
    ) x
  ),
  candidatos as (
    select p.id,
      coalesce(nullif(trim(p.nome),''),
               nullif(trim(p.campos_extras ->> 'Negócio'),''),
               nullif(trim(cl.empresa),'') || coalesce(' | ' || fa.nome,''),
               'Negócio sem nome')                              as titulo,
      coalesce(k.nome, p.status)                                as etapa_label,
      p.data_pedido,
      coalesce(p.valor_total,0)                                 as valor,
      (v_hoje - (ue.em at time zone 'America/Sao_Paulo')::date) as dias_parado,
      du.nome                                                   as dono,
      (p.usuario_id = p_usuario_id)                             as e_meu,
      -- 🔴 NOVO: a marca que separa pendente de feito, sem tirar o negócio da lista do dia.
      (ah.pedido_id is not null)                                as feito_hoje
    from pedidos p
    join ultima_etapa ue        on ue.pedido_id = p.id
    join gente g                on g.id = p.usuario_id
    left join usuarios du       on du.id = p.usuario_id
    left join clientes cl       on cl.id = p.cliente_id
    left join fabricantes fa    on fa.id = p.fabricante_id
    left join kanban_colunas k  on k.empresa_id = v_empresa and k.funil_id = p.funil_id and k.slug = p.status
    left join retorno_marcado r on r.pedido_id = p.id
    left join agidos_hoje ah    on ah.pedido_id = p.id
    where p.status in (select slug from etapas_abertas)
      and (r.ate is null or r.ate <= v_hoje)
      and not exists (
        -- Uma linha só no dia do retorno. Sem isto a pessoa veria a tarefa (que já entra como
        -- compromisso) E o negócio voltando à fila — duas linhas sobre o mesmo assunto, e a
        -- tarefa ainda comendo uma das vagas.
        -- QUALQUER tarefa aberta esconde, não só a que o "Retomar depois" cria: é o mesmo
        -- critério que o cartão "Sem Próxima Ação" já usa — tarefa aberta é próxima ação, venha
        -- de onde vier.
        -- 🔴 MENOS A VENCIDA (decisão do dono do produto em 11/09/2026): tarefa que passou do
        -- prazo sem ser concluída deixa de esconder, e o negócio volta à pauta no dia seguinte ao
        -- prazo. Tarefa sem prazo continua escondendo: não vence nunca, é próxima ação sem data.
        -- 🔴 MUDOU (12/09/2026): vale a tarefa COMO ELA ESTAVA NA VIRADA DO DIA. Criada hoje não
        -- esconde — o negócio sai como feito, e é assim que criar tarefa conta como retorno.
        -- Concluída hoje não revela — ela escondia o negócio na virada, então ele não era da
        -- lista de hoje; ele volta amanhã se continuar parado.
        select 1 from tarefas t
         where t.pedido_id = p.id
           and t.created_at < v_inicio
           and not (coalesce(t.status,'') = 'concluida' and t.updated_at < v_inicio)
           and (t.prazo_final is null
                or (t.prazo_final at time zone 'America/Sao_Paulo')::date >= v_hoje)
      )
  ),
  do_dia as (
    -- 🔴 MUDOU, e são duas coisas num lugar só:
    --   · era `where r.dias_parado >= v_dias or r.posicao <= greatest(v_min - v_compromissos, 0)`
    --     — o `or` era o enchimento com negócio que NÃO está parado. Saiu.
    --   · era `order by r.valor desc, r.dias_parado desc` — agora os do próprio dono vêm antes
    --     de qualquer negócio da equipe, e entre iguais manda quem está parado há mais tempo.
    -- Os FEITOS continuam aqui dentro: eles ocupam o lugar deles na lista do dia, e é o que faz
    -- a vaga aberta ficar aberta.
    select c.* from candidatos c
    where c.dias_parado >= v_dias
    order by c.e_meu desc, c.dias_parado desc, c.valor desc
    limit v_vagas
  ),
  compromissos as (
    select e.id, e.titulo,
           coalesce(nullif(trim(e.descricao),''),'Compromisso na agenda') as detalhe,
           e.inicio as quando
      from eventos e
     where e.user_id = v_auth and (e.inicio at time zone 'America/Sao_Paulo')::date = v_hoje
    union all
    select t.id, t.titulo,
           coalesce(nullif(trim(t.descricao),''),'Tarefa com prazo hoje') as detalhe,
           t.prazo_final as quando
      from tarefas t
     where t.usuario_id = p_usuario_id and t.prazo_final is not null
       and (t.prazo_final at time zone 'America/Sao_Paulo')::date = v_hoje
       and coalesce(t.status,'') <> 'concluida'
  )
  select 'compromisso'::text, cp.id, 'Hoje'::text, cp.titulo, cp.detalhe,
         null::numeric, cp.quando, null::integer,
         (row_number() over (order by cp.quando))::integer, null::text
  from compromissos cp
  union all
  select 'negocio_parado'::text, n.id, 'Orçamento parado'::text, n.titulo,
         'Em ' || n.etapa_label || ' desde ' || to_char(n.data_pedido,'DD/MM/YYYY'),
         n.valor, null::timestamptz, n.dias_parado,
         -- 🔴 MUDOU: a ordem na tela também põe os do dono na frente.
         (1000 + row_number() over (order by n.e_meu desc, n.valor desc))::integer,
         case when n.e_meu then null else n.dono end
  from do_dia n where not n.feito_hoje
  union all
  -- 🔴 NOVO: os já feitos, atrás de tudo. A tela não os desenha — ela os CONTA, para dizer
  -- "3 de 7 feitos hoje" e para distinguir o dia zerado do dia em que não havia nada.
  select 'negocio_feito'::text, n.id, 'Feito hoje'::text, n.titulo,
         'Em ' || n.etapa_label || ' desde ' || to_char(n.data_pedido,'DD/MM/YYYY'),
         n.valor, null::timestamptz, n.dias_parado,
         (2000 + row_number() over (order by n.valor desc))::integer,
         case when n.e_meu then null else n.dono end
  from do_dia n where n.feito_hoje
  order by 9;
end;
$function$;

COMMIT;
