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
-- caracteres). Fora das trocas marcadas com 🔴 e de linhas em branco, o texto é o mesmo.
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
-- 🔴 FUSO — `historico_contatos.data_contato` é comparada EM UTC. Medido em 13/09/2026, quem grava
-- a coluna e em que formato:
--   · meia-noite UTC — `registrar_retorno` (o "Retomar depois") grava
--     `(now() at time zone 'America/Sao_Paulo')::date`, uma data convertida para timestamptz. São as
--     linhas novas. Converter para São Paulo as jogaria para o dia ANTERIOR, e o retorno registrado
--     hoje contaria como de ontem — a armadilha do CLAUDE.md §7.12 vista do lado do banco;
--   · meio-dia UTC — linhas ANTIGAS, a última de 17/08/2026. Nenhum gravador vivo escreve assim;
--   · o instante real — `src/hooks/use-novo-pedido.ts`, o único gravador de tela, insere o contato
--     agendado na criação do negócio SEM `data_contato`, e a coluna cai no padrão `now()`.
-- Para o que existe no banco hoje, a data em UTC é a certa: meia-noite e meio-dia UTC caem no dia
-- que quem registrou quis dizer. O instante real só erra entre 21h e meia-noite, quando a data UTC
-- já é a de amanhã — ver a borda no bloco RAROS.
--
-- ----------------------------------------------------------------------------
-- O QUE CONGELA NA VIRADA DO DIA, E POR QUÊ
-- ----------------------------------------------------------------------------
-- Se só a saída dos negócios feitos mudasse, o próximo da fila subiria para a vaga aberta — que
-- é exatamente a recomposição que o pedido derruba. Então cinco entradas passam a ser medidas
-- no começo do dia (`v_inicio`):
--
--   1. `ultima_etapa` — o "há quantos dias está parado" olha só o histórico anterior à virada.
--      É o que mantém o negócio que recebeu ação hoje ocupando o lugar dele na lista.
--   2. `retorno_marcado` — retorno marcado HOJE não tira o negócio da lista de hoje; ele sai
--      como FEITO, e é a partir de amanhã que a data marcada o segura.
--   3. A tarefa que esconde o negócio — vale a que existia na virada. Tarefa criada hoje não
--      esconde (o negócio sai como feito); tarefa concluída hoje não revela (ela escondia o
--      negócio na virada, então ele não era da lista de hoje).
--   4. `v_compromissos`, que desconta vaga — conta os compromissos do dia que existiam em aberto na
--      virada, concluídos hoje ou não. Sem isso, concluir uma tarefa abriria vaga e puxaria um
--      negócio novo, e criar uma tarefa às 10h derrubaria um negócio da lista.
--   5. `etapa_na_virada` — negócio GANHO OU PERDIDO hoje continua candidato pela etapa em que
--      estava na virada: a primeira mudança de etapa do dia guarda de onde ele saiu. Ele segura a
--      vaga e sai como FEITO, e o contador diz "3 de 7". Sem isso, o filtro de etapa lido ao vivo
--      tiraria o negócio ganho dos candidatos, e o próximo da fila entraria na vaga dele.
--
-- ⚠️ UMA SIMPLIFICAÇÃO CONSCIENTE, que erra para o lado de mostrar o compromisso que existe:
--
--   · Os COMPROMISSOS desenhados continuam ao vivo. Reunião marcada às 10h para as 15h aparece;
--     esconder um compromisso do dia até amanhã seria defeito, não regra. A consequência aceita:
--     num dia assim a tela pode mostrar mais itens que o teto.
--
-- ----------------------------------------------------------------------------
-- RAROS, ACEITOS, e para que lado erram
-- ----------------------------------------------------------------------------
-- Estas entradas continuam lidas AO VIVO e podem mexer na lista durante o dia. São raras, e selar
-- qualquer uma delas exigiria reconstruir o estado da virada lendo o registro de auditoria, campo
-- por campo — não vale agora. Regra geral: quando uma delas tira um negócio dos candidatos e há
-- mais parados que vagas, o próximo da fila entra no lugar.
--
--   · Editar o VALOR de um negócio perto do corte pode trocar um negócio por outro: a escolha é
--     por valor, e o valor lido é o de agora. Um sai sem crédito, outro entra.
--   · Trocar o DONO move o negócio entre pautas: ele sai da de um (e a vaga abre) e pode entrar
--     na do outro no mesmo dia.
--   · Desativar alguém da equipe no meio do dia (`usuarios.deleted_at`) tira os negócios dessa
--     pessoa da pauta de quem tem a chave `pauta_de_todos`, e os próximos da fila entram.
--   · Excluir um negócio da lista: `pedidos` não tem exclusão reversível, a linha some e o próximo
--     da fila entra no lugar.
--   · Levar para outro dia, ou apagar, um compromisso que existia na virada ABRE vaga: entra um
--     negócio a mais. O contrário — trazer para hoje um compromisso antigo — FECHA uma: um
--     negócio sai sem crédito.
--   · Apagar a tarefa que escondia o negócio na virada, levar o prazo dela para antes de hoje ou
--     trocá-la de negócio faz o negócio REAPARECER, e ele pode entrar na lista. Se essa tarefa
--     também era compromisso de hoje — é o caso do "Retomar depois" no dia do retorno —, apagá-la
--     ou levar o prazo para antes de hoje abre vaga junto, e podem entrar até dois. Concluir a
--     tarefa NÃO tem esse efeito: concluída hoje, ela continua escondendo o negócio e ocupando a
--     vaga.
--   · Reabrir uma tarefa concluída, estender o prazo de uma tarefa vencida ou editar hoje uma
--     tarefa concluída antes da virada ESCONDE o negócio sem crédito. Se o prazo dessa tarefa é
--     hoje, ela também passa a ocupar vaga — a editada, sem aparecer na tela.
--   · Importação que mude a etapa no dia (linha com `status_anterior` nulo) não conta como
--     retorno e não entra em `etapa_na_virada`: se ela fechar o negócio, ele sai pela etapa ao
--     vivo; se reabrir um fechado, ele pode entrar.
--   · `useDeleteTarefaKanbanColuna` (src/hooks/use-tarefas-kanban-colunas.ts) muda o `status` das
--     tarefas SEM mexer em `updated_at`: a tarefa que ele leva para "concluida" deixa de esconder
--     o negócio na hora, sem dar crédito; a concluída que ele leva para uma coluna aberta passa a
--     esconder o negócio.
--   · Contato gravado no instante real, no fim do dia: `use-novo-pedido.ts` deixa `data_contato`
--     no padrão `now()`, e entre 21h e meia-noite a data UTC já é a de amanhã. Com o corte de dias
--     parados em 1 (a tela aceita de 1 a 365; nenhuma empresa usa, o padrão é 3), um negócio criado
--     depois das 21h com próximo contato marcado sairia como FEITO no dia seguinte. Com o padrão,
--     ele nem é candidato nesse dia.
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

  -- 🔴 MUDOU: conta os compromissos que existiam em aberto na virada, concluídos hoje ou não. Antes
  -- eram os abertos agora — e aí concluir uma tarefa abria vaga para um negócio novo entrar. Tarefa
  -- concluída ANTES da virada não conta: é a mesma régua da tarefa que esconde o negócio, e sem ela
  -- uma tarefa com prazo hoje concluída ontem ocuparia vaga sem aparecer na tela.
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
       and not (coalesce(t.status,'') = 'concluida' and t.updated_at < v_inicio)
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
  etapa_na_virada as (
    -- 🔴 NOVO: a etapa em que o negócio estava na virada, para quem mudou de etapa hoje — a primeira
    -- mudança do dia guarda em `status_anterior` de onde ele saiu. Linha de importação (anterior
    -- nulo) fica de fora, como em `agidos_hoje`. É o que faz o negócio GANHO hoje segurar a vaga.
    select distinct on (h.pedido_id) h.pedido_id, h.status_anterior as status
      from pedidos_historico_status h
     where h.tipo = 'status'
       and h.created_at >= v_inicio
       and h.status_anterior is not null
     order by h.pedido_id, h.created_at asc
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
    -- 🔴 NOVO: as duas marcas do dia — `agidos_hoje` separa feito de pendente, e `etapa_na_virada`
    -- diz em que etapa o negócio estava na virada.
    left join agidos_hoje ah    on ah.pedido_id = p.id
    left join etapa_na_virada ev on ev.pedido_id = p.id
    -- 🔴 MUDOU: era `where p.status in (...)`. A primeira mudança de etapa de hoje guarda de onde o
    -- negócio saiu; sem ela, o filtro ao vivo tirava dos candidatos o negócio GANHO (ou perdido)
    -- hoje, e o próximo da fila entrava na vaga dele. Agora ele segura a vaga e sai como
    -- `negocio_feito`.
    where coalesce(ev.status, p.status) in (select slug from etapas_abertas)
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
        -- prazo. Sem isto ele sumia da pauta do dono enquanto a tarefa ficasse aberta, porque a
        -- tarefa só entra como compromisso NO DIA do prazo. Tarefa sem prazo continua escondendo:
        -- não vence nunca, é próxima ação sem data.
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
    -- 🔴 MUDOU, e são três coisas num lugar só:
    --   · era `where r.dias_parado >= v_dias or r.posicao <= greatest(v_min - v_compromissos, 0)`
    --     — o `or` era o enchimento com negócio que NÃO está parado. Saiu.
    --   · era `order by r.valor desc, r.dias_parado desc` — agora os do próprio dono vêm antes de
    --     qualquer negócio da equipe. Entre os parados, continuam entrando os de MAIOR VALOR, como
    --     a função vigente já fazia (decisão do dono do produto em 13/09/2026). Não "os parados há
    --     mais tempo": medido em 13/09/2026, na MD todo candidato mais parado está parado há
    --     exatamente 12 dias — é a data da importação do Bitrix. "Parado há mais tempo" hoje quer
    --     dizer "intocado desde a importação", e essa ordem tiraria da pauta os negócios
    --     trabalhados depois dela.
    --   · `c.id` no fim só desempata: sem ele, dois negócios de mesmo valor e mesmos dias parados
    --     na borda do corte podiam trocar de lugar entre uma recarga e outra.
    -- Os FEITOS continuam aqui dentro: eles ocupam o lugar deles na lista do dia, e é o que faz
    -- a vaga aberta ficar aberta.
    select c.* from candidatos c
    where c.dias_parado >= v_dias
    order by c.e_meu desc, c.valor desc, c.dias_parado desc, c.id
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
         -- 🔴 MUDOU: a ordem na tela também põe os do dono na frente; dias parados e `id` só
         -- desempatam, pelo mesmo motivo do `do_dia`.
         (1000 + row_number() over (order by n.e_meu desc, n.valor desc, n.dias_parado desc, n.id))::integer,
         case when n.e_meu then null else n.dono end
  -- 🔴 MUDOU: era `from negocios n`. Os feitos saem daqui e vão para o bloco de baixo.
  from do_dia n where not n.feito_hoje
  union all
  -- 🔴 NOVO: os já feitos, atrás de tudo. A tela não os desenha — ela os CONTA, para dizer
  -- "3 de 7 feitos hoje" e para distinguir o dia zerado do dia em que não havia nada.
  select 'negocio_feito'::text, n.id, 'Feito hoje'::text, n.titulo,
         'Em ' || n.etapa_label || ' desde ' || to_char(n.data_pedido,'DD/MM/YYYY'),
         n.valor, null::timestamptz, n.dias_parado,
         (2000 + row_number() over (order by n.valor desc, n.id))::integer,
         case when n.e_meu then null else n.dono end
  from do_dia n where n.feito_hoje
  order by 9;
end;
$function$;

COMMIT;
