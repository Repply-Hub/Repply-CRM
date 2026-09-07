-- ============================================================================
-- A PAUTA DECIDE O ALCANCE: OS PRÓPRIOS OU OS DE TODA A EQUIPE
-- ============================================================================
--
-- Quem tem a chave `pauta_de_todos` passa a ver, na fila de "Hoje", os negócios de toda a
-- empresa, com o nome do dono. Sem a chave, continua vendo só os próprios.
--
-- 🔴 A LEITURA DA CHAVE NÃO PODE USAR `has_funcionalidade`. Ela responde "pode" para gestor,
-- admin e empresa SEM OLHAR A LINHA — e a decisão 2 do dono do produto diz que o gestor pode
-- ser configurado pessoa a pessoa. Lemos a configuração direto, com o papel entrando só como
-- PADRÃO na ausência dela.
--
-- 🔴 `pedidos` NÃO TEM COLUNA DE EMPRESA. O recorte por empresa passa por `usuarios`. Sem ele,
-- esta função — que roda com privilégio — mostraria negócio de outra empresa. Não dá erro:
-- simplesmente vaza.
--
-- 🔴 O `DROP` ABAIXO APAGA A REVOGAÇÃO de `pauta_do_dia_de`, que hoje impede o navegador de
-- chamá-la direto. Ela é reemitida no fim deste arquivo. Sem isso, qualquer pessoa logada
-- conseguiria pedir a pauta de qualquer colega, passando um identificador.
--
-- 🔴 A JUNÇÃO COM `kanban_colunas` TAMBÉM GANHA `funil_id`. A chave única da tabela é
-- (empresa_id, funil_id, slug) — três colunas, não duas (migration 20260722140000). Sem
-- `funil_id`, uma empresa com dois funis casa o mesmo slug em duas linhas de kanban_colunas
-- e duplica o negócio na pauta. Hoje ninguém sente porque as 10 empresas têm 1 funil cada;
-- o gatilho é o botão "Novo funil" (KanbanColunasDialog.tsx). Mesmo defeito e mesmo
-- raciocínio da migration 20260905140000_risco_junta_coluna_do_funil_certo.sql, aplicada em
-- dashboard_negocios_risco — aqui não estava corrigido porque esta função não fazia parte
-- daquela revisão.
--
-- Os COMPROMISSOS continuam pessoais: agenda e tarefa do gestor são dele. Só os negócios se
-- ampliam. E eles continuam consumindo vaga no teto de itens.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.pauta_do_dia();
DROP FUNCTION IF EXISTS public.pauta_do_dia_de(uuid);

CREATE FUNCTION public.pauta_do_dia_de(p_usuario_id uuid)
RETURNS TABLE(tipo text, referencia_id uuid, selo text, titulo text, detalhe text,
              valor numeric, quando timestamptz, dias_parado integer, ordem integer,
              responsavel text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_empresa uuid; v_auth uuid; v_dias int; v_min int; v_max int;
  v_hoje date; v_compromissos int; v_vagas int; v_ve_todos boolean;
begin
  select u.empresa_id, u.user_id into v_empresa, v_auth
  from usuarios u where u.id = p_usuario_id and u.deleted_at is null;
  if v_empresa is null then return; end if;

  if not empresa_tem_secao_de(v_empresa, 'hoje') then return; end if;

  -- A chave, lida direto. Papel só como padrão. Ver o comentário do cabeçalho.
  select coalesce(
    (select (pu.funcionalidades ->> 'pauta_de_todos')::boolean
       from permissoes_usuario pu
      where pu.usuario_id = p_usuario_id and pu.modulo = 'pedidos'
        and pu.funcionalidades ? 'pauta_de_todos'),
    (select u.role in ('gestor','admin','empresa') from usuarios u where u.id = p_usuario_id)
  ) into v_ve_todos;

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
  -- 🔴 A cerca de empresa. `pedidos` não tem empresa_id; ela vem por aqui.
  gente as (
    select u.id from usuarios u
     where u.empresa_id = v_empresa and u.deleted_at is null
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
    -- 🔴 As três colunas da chave única de kanban_colunas (empresa_id, funil_id, slug), não
    -- duas: sem `funil_id`, empresa com dois funis casa o mesmo slug em duas linhas e
    -- duplica o negócio na pauta. Ver o cabeçalho desta migration.
    left join kanban_colunas k  on k.empresa_id = v_empresa and k.funil_id = p.funil_id and k.slug = p.status
    left join retorno_marcado r on r.pedido_id = p.id
    where p.status in (select slug from etapas_abertas)
      and (r.ate is null or r.ate < v_hoje)
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
         -- Só quando NÃO é meu: escrever o próprio nome em todo item viraria ruído.
         case when n.e_meu then null else n.dono end
  from negocios n
  order by 9;
end;
$function$;

CREATE FUNCTION public.pauta_do_dia()
RETURNS TABLE(tipo text, referencia_id uuid, selo text, titulo text, detalhe text,
              valor numeric, quando timestamptz, dias_parado integer, ordem integer,
              responsavel text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select * from public.pauta_do_dia_de(get_my_usuario_id());
$function$;

-- 🔴 A revogação volta. O DROP acima a apagou. Sem esta linha, qualquer pessoa logada pede a
-- pauta de qualquer colega passando o identificador dele.
REVOKE ALL ON FUNCTION public.pauta_do_dia_de(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pauta_do_dia_de(uuid) TO service_role;

COMMIT;

-- Confira depois de rodar — a revogação TEM que estar de volta:
--
--   select p.oid::regprocedure, coalesce(array_to_string(p.proacl,' | '),'(padrao)')
--     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.proname like 'pauta_do_dia%';
--
-- Esperado: `pauta_do_dia_de(uuid)` SEM `authenticated=X`. Se aparecer, refaça o REVOKE.
