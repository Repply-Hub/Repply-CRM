-- ============================================================================
-- O "RETOMAR DEPOIS" CRIA UMA TAREFA PARA O DONO DO NEGÓCIO
-- ============================================================================
--
-- Decisão do dono do produto (09/09/2026): ao adiar, cria-se uma tarefa — por uma caixinha
-- marcada por padrão que a pessoa pode desmarcar. Prazo no dia do retorno, descrição = o motivo
-- digitado, responsável = O DONO DO NEGÓCIO, não quem clicou.
--
-- 🔴 DROP + CREATE, e não CREATE OR REPLACE: acrescentar parâmetro cria SOBRECARGA, e passariam
-- a existir duas `registrar_retorno`. O DROP apaga as concessões — elas são repostas no fim
-- deste arquivo, e a `proacl` foi medida antes para conferir depois. Medida em 10/09/2026:
--   registrar_retorno(uuid,text,date) -> postgres=X/postgres | authenticated=X/postgres | service_role=X/postgres
--
-- 🔴 `tarefas` tem DOIS campos de quem: `usuario_id` (uuid, é por ele que a fila decide "é
-- minha") e `responsavel` (text, o nome, para exibir). Esta é a primeira tarefa do sistema em
-- que CRIADOR e RESPONSÁVEL são pessoas diferentes — todas as que existem hoje têm os dois
-- iguais. Os três campos são preenchidos, e `usuario_id` é da família `usuarios.id`
-- (CLAUDE.md §4.5).
--
-- 🔴 E aqui errar é PIOR do que o CLAUDE.md descreve: `tarefas.usuario_id` **não tem chave
-- estrangeira** (medido em 10/09/2026 — `tarefas` só tem FK em `cliente_id`, `pedido_id` e
-- `conversa_id`). Mandar um `usuarios.user_id` no lugar de `usuarios.id` não seria recusado
-- por ninguém: a tarefa gravaria em silêncio e simplesmente nunca apareceria na fila de
-- pessoa nenhuma.
--
-- 🔴 O arquivo inteiro está em BEGIN/COMMIT porque há um DROP aqui dentro. Sem transação, um
-- CREATE que falhasse deixaria o DROP de pé sozinho e o "Retomar depois" morreria para todo
-- mundo.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. registrar_retorno — agora com a caixinha, e criando a tarefa do dono
-- ============================================================================

DROP FUNCTION public.registrar_retorno(uuid, text, date);

CREATE FUNCTION public.registrar_retorno(
  p_pedido_id   uuid,
  p_motivo      text,
  p_retorno_em  date,
  p_criar_tarefa boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_eu uuid; v_dono uuid; v_meu_nome text; v_dono_nome text; v_titulo text;
begin
  if p_retorno_em is null then
    raise exception 'Escolha a data em que vale a pena procurar este negócio de novo.';
  end if;

  v_eu := public.get_my_usuario_id();

  if not public.empresa_plano_ativo() then
    raise exception 'O acesso da sua empresa está bloqueado, então nada novo é gravado.'
      using errcode = '42501';
  end if;

  if not public.posso_agir_no_negocio(p_pedido_id) then
    raise exception 'Você não pode adiar este negócio.' using errcode = '42501';
  end if;

  select p.usuario_id, du.nome,
         coalesce(nullif(trim(p.nome),''),
                  nullif(trim(p.campos_extras ->> 'Negócio'),''),
                  nullif(trim(cl.empresa),'') || coalesce(' | ' || fa.nome,''),
                  'Negócio sem nome')
    into v_dono, v_dono_nome, v_titulo
    from public.pedidos p
    left join public.usuarios du    on du.id = p.usuario_id
    left join public.clientes cl    on cl.id = p.cliente_id
    left join public.fabricantes fa on fa.id = p.fabricante_id
   where p.id = p_pedido_id;

  insert into public.historico_contatos
    (pedido_id, usuario_id, tipo, descricao, data_contato, proximo_contato_em)
  values (p_pedido_id, v_eu, 'retorno', p_motivo,
          (now() at time zone 'America/Sao_Paulo')::date, p_retorno_em);

  -- `v_dono is not null` acrescentado aqui de passagem: `null is distinct from <uuid>` é
  -- VERDADEIRO em SQL, então um negócio sem dono entraria neste bloco e tentaria gravar
  -- `notificacoes.usuario_id = null` — coluna NOT NULL, com chave estrangeira para
  -- `usuarios(id)`. Seria um estouro feio no lugar do gesto. Hoje ninguém chega aqui sem
  -- dono, porque `posso_agir_no_negocio` já recusa (as duas pernas dela comparam com
  -- `p.usuario_id`, e nenhuma casa com nulo) — mas a guarda custa nada e a outra é a única
  -- coisa que separa isto de um erro na cara do usuário.
  if v_dono is not null and v_dono is distinct from v_eu then
    select u.nome into v_meu_nome from public.usuarios u where u.id = v_eu;
    v_meu_nome  := coalesce(nullif(trim(v_meu_nome),''),  'Alguém da equipe');
    v_dono_nome := coalesce(nullif(trim(v_dono_nome),''), 'outra pessoa da equipe');
    insert into public.notificacoes (usuario_id, pedido_id, tipo, titulo, mensagem)
    values (v_dono, p_pedido_id, 'retorno_adiado',
            v_meu_nome || ' adiou um negócio de ' || v_dono_nome,
            v_titulo || ' saiu da pauta de ' || v_dono_nome ||
            ' até ' || to_char(p_retorno_em, 'DD/MM/YYYY') ||
            '. Motivo: ' || coalesce(nullif(trim(p_motivo),''), 'sem motivo registrado'));
  end if;

  -- A tarefa vai para o DONO, não para quem clicou: quem adia o negócio de um colega está
  -- marcando trabalho na agenda dele, e é ele que precisa achar isso amanhã.
  --
  -- 🔴 `v_dono is not null` não é paranoia: tarefa com `usuario_id` nulo não é de ninguém —
  -- não apareceria na fila de pessoa alguma e ficaria órfã para sempre. Sem dono, não se cria
  -- tarefa e o resto do gesto acontece normalmente.
  --
  -- 🔴 O PRAZO É ÀS 09:00 DE SÃO PAULO, NÃO `p_retorno_em::timestamptz`. O banco roda em UTC
  -- (medido em 10/09/2026: `TimeZone = UTC`), então `'2026-09-10'::date::timestamptz` vale
  -- `2026-09-10 00:00+00` — que em São Paulo é 09/09 às 21h. A tarefa apareceria na fila UM
  -- DIA ANTES do retorno e, no dia certo, a fila mostraria ZERO linha: o negócio escondido
  -- pela cláusula do passo 2 e a tarefa já vencida. É a armadilha do CLAUDE.md §7.12 vista do
  -- lado do banco. 09:00 de São Paulo = 12:00 UTC é a âncora que as 38 tarefas com prazo já
  -- usam hoje, escrita pela tela de Tarefas.
  if p_criar_tarefa and v_dono is not null then
    select u.nome into v_meu_nome from public.usuarios u where u.id = v_eu;
    insert into public.tarefas
      (titulo, descricao, status, prazo_final, responsavel, criado_por, usuario_id,
       pedido_id, cliente_id)
    select 'Retomar contato ' || v_titulo,
           nullif(trim(p_motivo),''),
           'pendente',
           ((p_retorno_em + time '09:00') at time zone 'America/Sao_Paulo'),
           v_dono_nome,
           coalesce(nullif(trim(v_meu_nome),''), 'Alguém da equipe'),
           v_dono,
           p_pedido_id,
           p.cliente_id
      from public.pedidos p where p.id = p_pedido_id;
  end if;
end;
$function$;

-- ============================================================================
-- 2. pauta_do_dia_de — uma linha só no dia do retorno
-- ============================================================================
--
-- 🔴 CREATE OR REPLACE, NUNCA DROP: esta função teve `authenticated` revogado de propósito
-- (ela alimenta o e-mail das 7h e é chamada pelo servidor, não pelo navegador). Um DROP
-- apagaria a `proacl` e o REPLACE a preserva. Medida em 10/09/2026:
--   pauta_do_dia_de(uuid) -> postgres=X/postgres | service_role=X/postgres
--
-- O corpo abaixo é o que está no ar em 10/09/2026 (md5 do prosrc
-- 539a80d018cf0bff66ced3b15b62d8d8, 5066 caracteres), já com as duas migrations do Plano C
-- aplicadas — a CTE `gente` é pessoal (`u.id = p_usuario_id`) e `v_ve_todos` não existe mais.
-- A ÚNICA mudança é o `not exists` no `where` da CTE `candidatos`.

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
        select 1 from tarefas t
         where t.pedido_id = p.id and coalesce(t.status,'') <> 'concluida'
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

-- ============================================================================
-- 3. Repor as concessões que o DROP apagou
-- ============================================================================
--
-- Só `registrar_retorno` precisa disto: `pauta_do_dia_de` foi CREATE OR REPLACE e manteve a
-- `proacl` dela intacta (inclusive o `authenticated` revogado de propósito).

REVOKE ALL ON FUNCTION public.registrar_retorno(uuid, text, date, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_retorno(uuid, text, date, boolean) TO authenticated;

COMMIT;
