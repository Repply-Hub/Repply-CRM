-- ============================================================================
-- Pauta do dia — Fase 2: a função que monta a pauta
-- ============================================================================
--
-- Plano: docs/operacao/plano-pauta-do-dia.md §4.
--
-- É o coração da funcionalidade, e é UMA função com DOIS consumidores: a tela "Hoje" e, na
-- fase final, o e-mail das 7h. Se a regra existisse em dois lugares e divergisse, a tela
-- diria "5 orçamentos parados" e o e-mail diria 7 — e ninguém confiaria em nenhum dos dois.
-- Esse tipo de divergência leva meses até alguém notar.
--
-- Nada muda na tela ainda: esta migration só cria a função. Dá para conferir por consulta
-- antes de existir interface.
-- ============================================================================

-- ── 1. O índice que a consulta de retorno vai precisar ─────────────────────
--
-- `historico_contatos` só tem a chave primária hoje. Ela está vazia, mas passa a receber uma
-- linha a cada adiamento — e a pauta a consulta em toda abertura de tela, perguntando "este
-- negócio tem retorno marcado para o futuro?".

create index if not exists idx_historico_contatos_pedido_retorno
  on public.historico_contatos (pedido_id, proximo_contato_em desc)
  where proximo_contato_em is not null;

-- ── 2. O núcleo: a pauta de UMA pessoa ─────────────────────────────────────
--
-- 🔴 `SECURITY DEFINER` passa por cima da RLS. Por isso TODO recorte é explícito aqui
-- dentro: por usuário e, no caso das etapas, pela empresa dele. Não existe "a política me
-- protege" nesta função — ela é a política.
--
-- Só o `service_role` executa esta versão (ver os GRANTs no fim). A tela usa o invólucro
-- `pauta_do_dia()`, que não aceita id de ninguém — assim uma pessoa nunca consegue pedir a
-- pauta de outra.

create or replace function public.pauta_do_dia_de(p_usuario_id uuid)
returns table (
  tipo          text,      -- 'compromisso' | 'negocio_parado'
  referencia_id uuid,
  selo          text,      -- o rótulo colorido do card
  titulo        text,
  detalhe       text,
  valor         numeric,
  quando        timestamptz,  -- hora do compromisso; nulo em negócio
  dias_parado   integer,
  ordem         integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_empresa   uuid;
  v_auth      uuid;
  v_dias      integer;
  v_min       integer;
  v_max       integer;
  v_hoje      date;
  v_compromissos integer;
  v_vagas     integer;
begin
  select u.empresa_id, u.user_id into v_empresa, v_auth
  from usuarios u where u.id = p_usuario_id and u.deleted_at is null;

  -- Pessoa inexistente, excluída ou sem empresa: pauta vazia, sem erro. Quem chama é tela e
  -- robô de e-mail; nenhum dos dois deve quebrar por causa de um usuário desativado.
  if v_empresa is null then return; end if;

  -- 🔴 A SEÇÃO MANDA. Decisão do dono do produto em 24/08/2026: enquanto a seção "Hoje"
  -- estiver desligada para a empresa, não há pauta E não há e-mail. Os dois obedecem a esta
  -- linha, e é por isso que ela mora aqui e não na tela — a tela some, mas o robô do e-mail
  -- continuaria mandando.
  if not empresa_tem_secao_de(v_empresa, 'hoje') then return; end if;

  -- Configuração por empresa, com padrão quando a linha não existe. `configuracoes_automacao`
  -- está vazia hoje: ausência de linha significa "usa o padrão vigente", nunca "desligado".
  select coalesce((select (c.valor #>> '{}')::int from configuracoes_automacao c
                    where c.empresa_id = v_empresa and c.chave = 'pauta_dias_parado'), 3),
         coalesce((select (c.valor #>> '{}')::int from configuracoes_automacao c
                    where c.empresa_id = v_empresa and c.chave = 'pauta_min_itens'), 3),
         coalesce((select (c.valor #>> '{}')::int from configuracoes_automacao c
                    where c.empresa_id = v_empresa and c.chave = 'pauta_max_itens'), 7)
    into v_dias, v_min, v_max;

  -- "Hoje" é hoje em Natal, não em UTC. O banco roda UTC: sem o fuso, um compromisso das 21h
  -- cairia no dia seguinte e sumiria da pauta de quem o marcou. Mesma armadilha do §7.12.
  v_hoje := (now() at time zone 'America/Sao_Paulo')::date;

  -- 🔴 O TETO VALE PARA A PAUTA INTEIRA, não só para os negócios.
  -- Compromisso de hoje é fato: reunião marcada não se corta por teto. Então ele entra
  -- primeiro e CONSOME vaga — o que sobra é o espaço dos negócios parados. Sem isto, um dia
  -- com 6 reuniões abriria com 13 itens, e "a pauta precisa poder zerar hoje" morre no
  -- primeiro dia cheio.
  select count(*) into v_compromissos
  from (
    select 1 from eventos e
     where e.user_id = v_auth
       and (e.inicio at time zone 'America/Sao_Paulo')::date = v_hoje
    union all
    select 1 from tarefas t
     where t.usuario_id = p_usuario_id
       and t.prazo_final is not null
       and (t.prazo_final at time zone 'America/Sao_Paulo')::date = v_hoje
       and coalesce(t.status, '') <> 'concluida'
  ) q;

  v_vagas := greatest(v_max - v_compromissos, 0);

  return query
  with
  -- Etapas abertas = as do funil da empresa que não são as duas terminais. Lido do banco,
  -- não cravado: cada empresa configura o próprio funil, e não existe coluna marcando
  -- "etapa final" — a convenção do sistema inteiro são os apelidos.
  etapas_abertas as (
    select distinct k.slug
    from kanban_colunas k
    where k.empresa_id = v_empresa
      and k.slug not in ('fechamento', 'perdido')
  ),
  -- Quando cada negócio mudou de etapa pela última vez. Confiável a partir de 08/2026; para
  -- os negócios importados o relógio começa na importação (ver §1.5 do plano).
  ultima_etapa as (
    select h.pedido_id, max(h.created_at) as em
    from pedidos_historico_status h
    where h.tipo = 'status'
      and h.pedido_id in (select p2.id from pedidos p2 where p2.usuario_id = p_usuario_id)
    group by h.pedido_id
  ),
  -- Negócio com retorno marcado para o futuro sai da pauta até a data chegar. É o efeito do
  -- botão de adiar: a pessoa registrou motivo e data de retorno em `historico_contatos`.
  retorno_marcado as (
    select hc.pedido_id, max(hc.proximo_contato_em) as ate
    from historico_contatos hc
    where hc.proximo_contato_em is not null
    group by hc.pedido_id
  ),
  candidatos as (
    select
      p.id,
      coalesce(
        nullif(trim(p.nome), ''),
        nullif(trim(p.campos_extras ->> 'Negócio'), ''),
        nullif(trim(cl.empresa), '') || coalesce(' | ' || fa.nome, ''),
        'Negócio sem nome'
      )                                                          as titulo,
      coalesce(k.nome, p.status)                                 as etapa_label,
      p.data_pedido,
      coalesce(p.valor_total, 0)                                 as valor,
      (v_hoje - (ue.em at time zone 'America/Sao_Paulo')::date)  as dias_parado
    from pedidos p
    join ultima_etapa ue          on ue.pedido_id = p.id
    left join clientes cl         on cl.id = p.cliente_id
    left join fabricantes fa      on fa.id = p.fabricante_id
    left join kanban_colunas k    on k.empresa_id = v_empresa and k.slug = p.status
    left join retorno_marcado r   on r.pedido_id = p.id
    where p.usuario_id = p_usuario_id
      and p.status in (select slug from etapas_abertas)
      and (r.ate is null or r.ate < v_hoje)
  ),
  -- O PISO de itens não inventa negócio: ele AFROUXA o corte. Se menos de `v_min` passaram
  -- dos N dias, os mais parados entram mesmo sem ter passado — assim um dia leve mostra 3 em
  -- vez de 1, e a pauta não parece quebrada. O TETO corta em `v_max`.
  ranqueados as (
    select c.*,
           row_number() over (order by c.dias_parado desc, c.valor desc) as posicao
    from candidatos c
  ),
  negocios as (
    select r.*
    from ranqueados r
    -- O piso também conta a pauta inteira: se os compromissos já enchem o mínimo, não há
    -- por que afrouxar o corte dos negócios só para completar número.
    where r.dias_parado >= v_dias or r.posicao <= greatest(v_min - v_compromissos, 0)
    order by r.valor desc, r.dias_parado desc
    limit v_vagas
  ),
  -- Compromissos de hoje: eventos da agenda e tarefas com prazo hoje.
  -- `eventos.user_id` guarda o id de AUTENTICAÇÃO (conferido: 234 de 234 casam com
  -- usuarios.user_id), enquanto `tarefas.usuario_id` guarda `usuarios.id`. Os dois nomes
  -- parecem a mesma coisa e não são.
  compromissos as (
    select e.id, e.titulo,
           coalesce(nullif(trim(e.descricao), ''), 'Compromisso na agenda') as detalhe,
           e.inicio as quando
    from eventos e
    where e.user_id = v_auth
      and (e.inicio at time zone 'America/Sao_Paulo')::date = v_hoje
    union all
    select t.id, t.titulo,
           coalesce(nullif(trim(t.descricao), ''), 'Tarefa com prazo hoje') as detalhe,
           t.prazo_final as quando
    from tarefas t
    where t.usuario_id = p_usuario_id
      and t.prazo_final is not null
      and (t.prazo_final at time zone 'America/Sao_Paulo')::date = v_hoje
      and coalesce(t.status, '') <> 'concluida'
  )
  -- Compromisso vem ANTES de negócio parado, por hora. Reunião das 10h não espera; orçamento
  -- parado há 40 dias espera mais um dia. Dentro de cada grupo: hora para compromisso, valor
  -- para negócio.
  select 'compromisso'::text, cp.id, 'Hoje'::text, cp.titulo, cp.detalhe,
         null::numeric, cp.quando, null::integer,
         (row_number() over (order by cp.quando))::integer
  from compromissos cp
  union all
  select 'negocio_parado'::text, n.id, 'Orçamento parado'::text, n.titulo,
         'Em ' || n.etapa_label || ' desde ' || to_char(n.data_pedido, 'DD/MM/YYYY'),
         n.valor, null::timestamptz, n.dias_parado,
         (1000 + row_number() over (order by n.valor desc))::integer
  from negocios n
  order by 9;
end;
$$;

comment on function public.pauta_do_dia_de(uuid) is
  'Monta a pauta do dia de UMA pessoa. Núcleo compartilhado pela tela "Hoje" e pelo e-mail '
  'de resumo — uma regra só, dois consumidores, impossível divergirem. Devolve vazio quando '
  'a seção "hoje" está desligada para a empresa. Só o service_role executa; a tela usa '
  'pauta_do_dia(), que não aceita id de terceiro.';

-- ── 3. O invólucro que a tela usa ──────────────────────────────────────────

create or replace function public.pauta_do_dia()
returns table (
  tipo          text,
  referencia_id uuid,
  selo          text,
  titulo        text,
  detalhe       text,
  valor         numeric,
  quando        timestamptz,
  dias_parado   integer,
  ordem         integer
)
language sql
stable
security definer
set search_path = public
as $$
  select * from public.pauta_do_dia_de(get_my_usuario_id());
$$;

comment on function public.pauta_do_dia() is
  'A pauta do dia de quem está chamando. Não aceita parâmetro DE PROPÓSITO: sem id na '
  'assinatura, ninguém consegue pedir a pauta de outra pessoa.';

-- ── 4. Quem pode executar o quê ────────────────────────────────────────────
--
-- O núcleo aceita um id qualquer, então NÃO pode ficar ao alcance de quem está logado —
-- seria um jeito de ler a carteira dos colegas passando o id deles. O `public` do Postgres
-- inclui `authenticated`, então revogar dele não basta.

revoke all on function public.pauta_do_dia_de(uuid) from public;
revoke all on function public.pauta_do_dia_de(uuid) from anon;
revoke all on function public.pauta_do_dia_de(uuid) from authenticated;
grant execute on function public.pauta_do_dia_de(uuid) to service_role;

grant execute on function public.pauta_do_dia() to authenticated;
