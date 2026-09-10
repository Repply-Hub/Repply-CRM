-- ============================================================================
-- A FILA DA TELA "HOJE" VOLTA A SER SEMPRE PESSOAL
-- ============================================================================
--
-- Decisão do dono do produto (09/09/2026): a fila mostra só os próprios negócios, para todo
-- mundo. A chave `pauta_de_todos` deixa de ampliar a fila e passa a liberar a TABELA DO TIME,
-- que é o que este trabalho constrói em seguida.
--
-- Três coisas que isto resolve de graça:
--   · O e-mail das 7h volta a ser pessoal. As duas decisões de redação que estavam na mesa do
--     dono do produto ("N coisas esperam você" e "R$ X em jogo" somando a equipe) deixam de
--     existir.
--   · O gestor parava de ver os PRÓPRIOS negócios: o teto de 7 era disputado por valor com os
--     da equipe inteira, e o negócio de R$ 8 mil do gestor perdia a vaga para o de R$ 2 milhões
--     de um colega.
--   · Quem adia negócio alheio passa a fazê-lo pela tabela, deliberadamente, e não por tropeço
--     numa fila que misturava tudo.
--
-- 🔴 CREATE OR REPLACE, NUNCA DROP. Esta função teve `authenticated` revogado de propósito
-- (é só do servidor, alimenta o e-mail das 7h) e um DROP apagaria isso em silêncio.
--
-- A coluna `responsavel` FICA no retorno, mesmo passando a vir sempre nula: é a mesma coluna que
-- o e-mail lê, e o dia em que a fila voltar a ter item de outra pessoa ela volta a servir.
-- ============================================================================
--
-- ----------------------------------------------------------------------------
-- O QUE FOI CONFERIDO NO BANCO ANTES DE ESCREVER (09/09/2026, só SELECT)
-- ----------------------------------------------------------------------------
--   · O corpo abaixo foi COLHIDO com `pg_get_functiondef` e editado a partir do texto vigente,
--     não reescrito de memória. `md5(prosrc)` do texto colhido: 03d4e6f45c6c065aa6f7de69bc66f80c
--     (5.158 caracteres). Fora das três trocas descritas aqui, o texto é o mesmo caractere por
--     caractere — conferido comparando o md5 do corpo novo com o md5 do corpo vigente submetido
--     às mesmas três trocas por `replace()`.
--
--   · São exatamente três trocas, e nenhuma outra:
--       1. some a declaração `v_ve_todos boolean` do bloco `declare`;
--       2. some a linha `v_ve_todos := public.ve_pauta_de_todos(p_usuario_id);`;
--       3. na CTE `gente`, `and (v_ve_todos or u.id = p_usuario_id)` vira `and u.id = p_usuario_id`.
--
--   · `proacl` de `pauta_do_dia_de(uuid)` medida antes desta migration:
--         postgres=X/postgres | service_role=X/postgres
--     Nem `anon`, nem `authenticated`, nem PUBLIC. Como a assinatura não muda, o
--     `CREATE OR REPLACE` preserva a `proacl` inteira. Confira antes e depois — o resultado
--     tem de ser idêntico nas duas medições:
--
--       select p.oid::regprocedure, coalesce(array_to_string(p.proacl,' | '),'(padrao)')
--         from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--        where n.nspname='public' and p.proname like 'pauta_do_dia%';
--
--   · `pauta_do_dia()` NÃO é tocada: o corpo dela inteiro é
--     `select * from public.pauta_do_dia_de(get_my_usuario_id());`. Ela herda a mudança.
--
--   · `public.ve_pauta_de_todos(uuid)` NÃO é removida nem alterada. Ela deixa de ser chamada
--     AQUI, mas continua sendo a leitura da chave `pauta_de_todos` — e é ela que a tabela do
--     time vai consultar na tarefa seguinte. Apagá-la quebraria o passo seguinte.
--
-- ----------------------------------------------------------------------------
-- O EFEITO, MEDIDO POR SIMULAÇÃO NA MD ANTES DE APLICAR (09/09/2026)
-- ----------------------------------------------------------------------------
-- A consulta foi reescrita como SELECT puro, com a CTE `gente` nos dois cenários, e rodada
-- para as 13 pessoas ativas da MD. O cenário "antes" reproduziu exatamente a medição feita
-- chamando a função pessoa a pessoa — foi assim que a simulação se provou fiel.
--
--   pessoa             papel      negócios PRÓPRIOS na fila     de colega     abertos dela
--                                 antes  ->  depois          antes -> depois
--   Fabiola            gestor       0    ->    0                7   ->   0          0
--   Gabriel Medeiros   gestor       0    ->    0                7   ->   0          0
--   Gabriel Pereira    gestor       0    ->    0                7   ->   0          0
--   Igor Morais        gestor       0    ->    3                7   ->   0          3
--   Lucas Ferreira     gestor       0    ->    1                7   ->   0          1
--   José Artur         vendedor     4    ->    4                0   ->   0         21
--   Margley Pontes     vendedor     5    ->    5                0   ->   0         30
--   Daniel Nóbrega     vendedor     7    ->    7                0   ->   0         27
--   Érika Marques      vendedor     7    ->    7                0   ->   0         45
--   Pricila Azevedo    vendedor     7    ->    7                0   ->   0         30
--   Alex, Fernando,    vendedor     0    ->    0                0   ->   0          0
--   Vinícius
--
-- Nenhum vendedor muda uma linha. Os cinco gestores param de receber negócio de colega, e os
-- dois que TÊM negócio aberto passam a ver o próprio — que era justamente o que a disputa por
-- valor lhes tirava.
--
-- 🔴 Os três gestores sem negócio aberto (Fabiola, Gabriel Medeiros, Gabriel Pereira) passam a
-- ver a fila VAZIA, e é o esperado: para eles a tela "Hoje" só volta a ter conteúdo quando a
-- tabela do time entrar, na tarefa seguinte. Aplicar esta migration sozinha deixa três pessoas
-- com a tela vazia no intervalo.
--
-- 🔴 E O EFEITO NÃO PARA NA TELA: QUEM NÃO TEM NEGÓCIO PRÓPRIO DEIXA DE RECEBER O E-MAIL DAS 7h.
-- O resumo diário (`supabase/functions/pauta-resumo-diario/index.ts`, linhas 218-220) PULA a
-- pessoa quando a pauta volta vazia — conta como `pauta_vazia` e segue para a próxima, sem
-- mandar nada e sem registrar erro: a execução termina com `status: ok`. Como a fila passa a ser
-- só a própria, quem não tem negócio aberto sai da lista de quem recebe. Diferente da tela, esse
-- efeito NÃO é do intervalo — ele sobrevive à tabela do time, porque o e-mail lê `pauta_do_dia_de`
-- e mais nada. Medido em `automation_logs`, os três últimos disparos das 7h na MD:
--
--     09/09 → 13 destinatários · 10 enviados · 3 com pauta vazia   ] com a fila ampliada
--     08/09 → 13 destinatários · 10 enviados · 3 com pauta vazia   ]
--     07/09 → 13 destinatários ·  7 enviados · 6 com pauta vazia   ← antes da fila ampliada
--
-- Depois desta migration a conta volta a ser a do dia 07/09: 7 enviados e 6 pautas vazias. As
-- três gestoras acima param de receber, em silêncio. Se isso não for o desejado, a decisão é do
-- dono do produto e precisa ser tomada ANTES de aplicar — não depois, por alguém perguntando
-- "por que parei de receber?".
--
-- Nota: `José Artur` aparece com 7 itens e 4 negócios porque os outros 3 são COMPROMISSOS dele
-- (evento na agenda e tarefa com prazo hoje), não negócio de colega. A fila mistura as duas
-- coisas, e confundi-las faz parecer que há vazamento onde não há.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.pauta_do_dia_de(p_usuario_id uuid)
 RETURNS TABLE(tipo text, referencia_id uuid, selo text, titulo text, detalhe text, valor numeric, quando timestamp with time zone, dias_parado integer, ordem integer, responsavel text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_empresa uuid; v_auth uuid; v_dias int; v_min int; v_max int;
  v_hoje date; v_compromissos int; v_vagas int;
begin
  select u.empresa_id, u.user_id into v_empresa, v_auth
  from usuarios u where u.id = p_usuario_id and u.deleted_at is null;
  if v_empresa is null then return; end if;
  if not empresa_tem_secao_de(v_empresa, 'hoje') then return; end if;
  select coalesce((select (c.valor #>> '{}')::int from configuracoes_automacao c
                    where c.empresa_id = v_empresa and c.chave = 'pauta_dias_parado'), 3),
         coalesce((select (c.valor #>> '{}')::int from configuracoes_automacao c
                    where c.empresa_id = v_empresa and c.chave = 'pauta_min_itens'), 3),
         coalesce((select (c.valor #>> '{}')::int from configuracoes_automacao c
                    where c.empresa_id = v_empresa and c.chave = 'pauta_max_itens'), 7)
    into v_dias, v_min, v_max;
  v_hoje := (now() at time zone 'America/Sao_Paulo')::date;
  select count(*) into v_compromissos
  from (
    select 1 from eventos e
     where e.user_id = v_auth and (e.inicio at time zone 'America/Sao_Paulo')::date = v_hoje
    union all
    select 1 from tarefas t
     where t.usuario_id = p_usuario_id and t.prazo_final is not null
       and (t.prazo_final at time zone 'America/Sao_Paulo')::date = v_hoje
       and coalesce(t.status,'') <> 'concluida'
  ) q;
  v_vagas := greatest(v_max - v_compromissos, 0);
  return query
  with
  gente as (
    select u.id from usuarios u
     where u.empresa_id = v_empresa and u.deleted_at is null
       and u.id = p_usuario_id
  ),
  etapas_abertas as (
    select distinct k.slug from kanban_colunas k
     where k.empresa_id = v_empresa and k.slug not in ('fechamento','perdido')
  ),
  ultima_etapa as (
    select h.pedido_id, max(h.created_at) as em
      from pedidos_historico_status h
     where h.tipo = 'status'
       and h.pedido_id in (select p2.id from pedidos p2 where p2.usuario_id in (select id from gente))
     group by h.pedido_id
  ),
  retorno_marcado as (
    select hc.pedido_id, max(hc.proximo_contato_em) as ate
      from historico_contatos hc
     where hc.proximo_contato_em is not null
     group by hc.pedido_id
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
      (p.usuario_id = p_usuario_id)                             as e_meu
    from pedidos p
    join ultima_etapa ue        on ue.pedido_id = p.id
    join gente g                on g.id = p.usuario_id
    left join usuarios du       on du.id = p.usuario_id
    left join clientes cl       on cl.id = p.cliente_id
    left join fabricantes fa    on fa.id = p.fabricante_id
    left join kanban_colunas k  on k.empresa_id = v_empresa and k.funil_id = p.funil_id and k.slug = p.status
    left join retorno_marcado r on r.pedido_id = p.id
    where p.status in (select slug from etapas_abertas)
      and (r.ate is null or r.ate <= v_hoje)
  ),
  ranqueados as (
    select c.*, row_number() over (order by c.dias_parado desc, c.valor desc) as posicao
    from candidatos c
  ),
  negocios as (
    select r.* from ranqueados r
    where r.dias_parado >= v_dias or r.posicao <= greatest(v_min - v_compromissos, 0)
    order by r.valor desc, r.dias_parado desc
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
         (1000 + row_number() over (order by n.valor desc))::integer,
         case when n.e_meu then null else n.dono end
  from negocios n
  order by 9;
end;
$function$;
