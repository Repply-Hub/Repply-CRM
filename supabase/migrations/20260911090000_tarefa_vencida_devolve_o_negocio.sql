-- ============================================================================
-- TAREFA VENCIDA DEVOLVE O NEGÓCIO À PAUTA DO DONO
-- ============================================================================
--
-- Decisão do dono do produto (11/09/2026). Até aqui, QUALQUER tarefa aberta ligada a um negócio
-- o escondia da pauta — e a tarefa só entra na pauta como compromisso NO DIA do prazo. Resultado:
-- tarefa vencida e não concluída fazia o negócio sumir da pauta do dono por tempo indeterminado,
-- visível só na tela de Tarefas. Com a caixinha "Criar tarefa" do "Retomar depois" marcada por
-- padrão (migration 20260910180000), esse passaria a ser o caminho comum.
--
-- Agora a tarefa VENCIDA deixa de esconder: no dia seguinte ao prazo, o negócio volta a concorrer
-- na pauta como qualquer negócio parado, e a tarefa segue atrasada na tela de Tarefas. Continua
-- uma linha só por assunto: no dia do prazo aparece a tarefa e não o negócio; depois, aparece o
-- negócio e não a tarefa (que só entra no dia do prazo).
--
-- Tarefa SEM prazo continua escondendo: ela não vence nunca — é próxima ação sem data.
--
-- ⚠️ O cartão "Sem Próxima Ação" e a tabela do time NÃO mudam aqui: para eles, tarefa aberta,
-- vencida ou não, ainda é próxima ação. A tabela do time volta a mostrar o negócio pelo outro
-- critério dela ("parado", 7 dias sem movimento). Alinhar os três é outra decisão.
--
-- 🔴 CREATE OR REPLACE, NUNCA DROP: `pauta_do_dia_de` teve `authenticated` revogado de propósito
-- (ela alimenta o e-mail das 7h e é chamada pelo servidor). O REPLACE preserva a `proacl`.
--
-- O corpo abaixo é o que ficou no ar ao aplicar 20260910180000 (md5 do prosrc
-- 11dac45227b849bd248a6ee287937be5, 5652 caracteres). A ÚNICA mudança é a condição de prazo no
-- `not exists` da CTE `candidatos`, e o comentário dela — gerada por troca de texto sobre esse
-- corpo, conferida pelo md5 calculado dentro do banco antes de aplicar.
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
        select 1 from tarefas t
         where t.pedido_id = p.id and coalesce(t.status,'') <> 'concluida'
           and (t.prazo_final is null
                or (t.prazo_final at time zone 'America/Sao_Paulo')::date >= v_hoje)
      )
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
