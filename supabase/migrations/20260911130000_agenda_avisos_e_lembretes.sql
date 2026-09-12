-- Agenda: aviso aos participantes (mensagem direta + e-mail) e vários lembretes por evento.
-- Spec: docs/superpowers/specs/2026-09-11-busca-config-agenda-mencoes-design.md, Bloco 3.
--
-- COMO FUNCIONA
--   O banco ANOTA o que aconteceu (convite, mudança, cancelamento, retirada) na fila
--   `evento_avisos`, venha a mudança de qual tela vier. O robô `eventos-lembrete` gera os
--   lembretes devidos na mesma fila e a esvazia. Um gatilho por comando chama o robô na
--   hora; o agendamento de 5 min é a rede de segurança.
--
-- 🔴 IDS: eventos.user_id / criado_por são o id de LOGIN (auth.users). A fila guarda o id
--    INTERNO (usuarios.id), que é o que chat e sininho usam.
--
-- NADA É APAGADO. `lembrete_minutos` e `lembrete_enviado` continuam existindo; saem num
-- passo futuro, depois deste bloco estável.

-- 1. Colunas novas -----------------------------------------------------------------
alter table public.eventos
  add column if not exists avisar_participantes boolean not null default false,
  add column if not exists lembretes_minutos integer[] not null default '{}',
  add column if not exists lembretes_valem_desde timestamptz;

-- O preenchimento abaixo não pode mexer em `updated_at` nem disparar gatilho antigo:
-- é cópia de estrutura, não edição de evento.
alter table public.eventos disable trigger user;

update public.eventos
   set lembretes_minutos = array[lembrete_minutos]
 where lembrete_minutos is not null
   and lembretes_minutos = '{}';

-- Eventos que já existem: só valem lembretes cujo momento ainda vai chegar. Os que já
-- passaram, o robô antigo mandou.
update public.eventos
   set lembretes_valem_desde = now()
 where lembretes_valem_desde is null;

alter table public.eventos enable trigger user;

-- 2. Lembretes já enviados ---------------------------------------------------------
create table if not exists public.evento_lembretes_enviados (
  evento_id  uuid        not null references public.eventos(id) on delete cascade,
  minutos    integer     not null,
  enviado_em timestamptz not null default now(),
  primary key (evento_id, minutos)
);
alter table public.evento_lembretes_enviados enable row level security;
-- Sem política: só o servidor e as funções do sistema leem e gravam.

-- O que o robô antigo já mandou não sai de novo.
insert into public.evento_lembretes_enviados (evento_id, minutos)
select id, lembrete_minutos
  from public.eventos
 where lembrete_enviado and lembrete_minutos is not null
on conflict do nothing;

-- 3. A fila -----------------------------------------------------------------------
create table if not exists public.evento_avisos (
  id                uuid        primary key default gen_random_uuid(),
  empresa_id        uuid        not null references public.empresas(id) on delete cascade,
  grupo_id          uuid        not null,
  evento_id         uuid,          -- nulo no cancelamento: a linha do evento já não existe
  destinatario_id   uuid        not null references public.usuarios(id) on delete cascade,
  remetente_id      uuid        references public.usuarios(id) on delete set null,
  tipo              text        not null check (tipo in ('convite','alteracao','cancelamento','retirado','lembrete')),
  minutos           integer,
  avisar            boolean     not null,
  dados             jsonb       not null,
  criado_em         timestamptz not null default now(),
  sininho_em        timestamptz,
  chat_em           timestamptz,
  email_em          timestamptz,
  concluido_em      timestamptz,
  tentativas        integer     not null default 0,
  ultimo_erro       text,
  processando_desde timestamptz
);
create index if not exists evento_avisos_pendentes
  on public.evento_avisos (criado_em) where concluido_em is null;
alter table public.evento_avisos enable row level security;
-- Sem política: só o servidor lê e grava.

-- 4. Anotar um aviso a partir de uma linha de evento -------------------------------
create or replace function public.anotar_aviso_de_evento(
  p_evento       public.eventos,
  p_tipo         text,
  p_minutos      integer,
  p_inicio_antes timestamptz,
  p_fim_antes    timestamptz
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dest  public.usuarios;
  v_rem   public.usuarios;
  v_obra  text;
  v_nomes text[];
begin
  select * into v_dest from usuarios where user_id = p_evento.user_id and deleted_at is null;
  if v_dest.id is null or v_dest.empresa_id is null then return; end if;

  -- Empresa com o Calendário desligado: nada sai (mesma regra do robô de hoje).
  if not empresa_tem_secao_de(v_dest.empresa_id, 'calendario') then return; end if;

  select * into v_rem from usuarios where user_id = p_evento.criado_por;
  if p_evento.obra_id is not null then
    select nome_obra into v_obra from obras where id = p_evento.obra_id;
  end if;
  select coalesce(array_agg(coalesce(u.nome, u.email) order by u.nome), '{}')
    into v_nomes
    from eventos e
    join usuarios u on u.user_id = e.user_id
   where e.grupo_id = p_evento.grupo_id;

  insert into evento_avisos (
    empresa_id, grupo_id, evento_id, destinatario_id, remetente_id,
    tipo, minutos, avisar, dados
  ) values (
    v_dest.empresa_id,
    p_evento.grupo_id,
    case when p_tipo in ('cancelamento', 'retirado') then null else p_evento.id end,
    v_dest.id,
    v_rem.id,
    p_tipo,
    p_minutos,
    p_evento.avisar_participantes,
    jsonb_build_object(
      'titulo',        p_evento.titulo,
      'descricao',     p_evento.descricao,
      'inicio',        p_evento.inicio,
      'fim',           p_evento.fim,
      'dia_inteiro',   p_evento.dia_inteiro,
      'inicio_antes',  p_inicio_antes,
      'fim_antes',     p_fim_antes,
      'obra',          v_obra,
      'organizador',   coalesce(v_rem.nome, v_rem.email),
      'participantes', to_jsonb(v_nomes)
    )
  );
end;
$$;
revoke all on function public.anotar_aviso_de_evento(public.eventos, text, integer, timestamptz, timestamptz)
  from public, anon, authenticated;

-- 5. Antes de gravar: ponte com a aba antiga e carimbo dos lembretes ----------------
create or replace function public.eventos_prepara_lembretes()
returns trigger
language plpgsql
security definer   -- apaga em evento_lembretes_enviados, que não tem política
set search_path = public
as $$
begin
  -- Ponte: uma aba aberta antes da publicação ainda grava só `lembrete_minutos`.
  if new.lembretes_minutos = '{}' and new.lembrete_minutos is not null
     and (tg_op = 'INSERT' or new.lembrete_minutos is distinct from old.lembrete_minutos) then
    new.lembretes_minutos := array[new.lembrete_minutos];
  end if;

  if tg_op = 'INSERT' then
    new.lembretes_valem_desde := now();
  elsif new.inicio is distinct from old.inicio then
    -- Horário mudou: lembretes voltam a valer para o horário novo, e só daqui para frente.
    new.lembretes_valem_desde := now();
    delete from evento_lembretes_enviados where evento_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists eventos_prepara_lembretes on public.eventos;
create trigger eventos_prepara_lembretes
  before insert or update on public.eventos
  for each row execute function public.eventos_prepara_lembretes();

-- 6. Depois de gravar: anota o aviso ------------------------------------------------
create or replace function public.eventos_anota_aviso()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quem  uuid := auth.uid();
  v_resta boolean;
begin
  -- Sem sessão = o próprio sistema (limpeza, exclusão de conta): nunca avisa.
  if v_quem is null then return null; end if;

  if tg_op = 'INSERT' then
    -- Convite: evento novo ou participante incluído depois. Quem grava a própria linha
    -- (o organizador) não se convida.
    if new.avisar_participantes and new.user_id <> v_quem and new.inicio > now() then
      perform anotar_aviso_de_evento(new, 'convite', null, null, null);
    end if;

  elsif tg_op = 'UPDATE' then
    -- Mudança de data/hora feita por outra pessoa (o organizador). Título e descrição não avisam.
    if new.avisar_participantes and new.user_id <> v_quem
       and (new.inicio is distinct from old.inicio or new.fim is distinct from old.fim)
       and greatest(new.inicio, old.inicio) > now() then
      perform anotar_aviso_de_evento(new, 'alteracao', null, old.inicio, old.fim);
    end if;

  elsif tg_op = 'DELETE' then
    -- Participante que sai (apaga a própria linha) não avisa ninguém.
    if old.avisar_participantes and old.user_id <> v_quem and old.inicio > now() then
      -- Gatilho AFTER ROW roda no fim do comando: se o grupo inteiro foi apagado, não resta
      -- ninguém = cancelamento; se ainda resta alguém, esta pessoa foi retirada.
      select exists (select 1 from eventos where grupo_id = old.grupo_id) into v_resta;
      perform anotar_aviso_de_evento(
        old, case when v_resta then 'retirado' else 'cancelamento' end, null, null, null);
    end if;
  end if;
  return null;
exception when others then
  -- 🔴 Aviso é consequência: NUNCA pode impedir salvar ou apagar o evento.
  raise warning '[agenda] aviso não anotado: %', sqlerrm;
  return null;
end;
$$;

drop trigger if exists eventos_anota_aviso on public.eventos;
create trigger eventos_anota_aviso
  after insert or update or delete on public.eventos
  for each row execute function public.eventos_anota_aviso();

-- 7. Chama o robô na hora (uma vez por comando) -------------------------------------
create or replace function public.eventos_chama_envio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from evento_avisos
              where concluido_em is null and criado_em > now() - interval '1 minute') then
    -- pg_net envia depois do commit, então o robô já enxerga o que foi anotado.
    perform chamar_edge_function('eventos-lembrete', '{}'::jsonb, 60000, false);
  end if;
  return null;
exception when others then
  raise warning '[agenda] envio não chamado (o agendamento de 5 min cobre): %', sqlerrm;
  return null;
end;
$$;

drop trigger if exists eventos_chama_envio on public.eventos;
create trigger eventos_chama_envio
  after insert or update or delete on public.eventos
  for each statement execute function public.eventos_chama_envio();

-- 8. Lembretes devidos → fila (idempotente) ------------------------------------------
create or replace function public.gerar_lembretes_devidos()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r   record;
  v_n integer := 0;
begin
  for r in
    select e as ev, m.minutos
      from eventos e
      cross join lateral unnest(e.lembretes_minutos) as m(minutos)
      join usuarios u on u.user_id = e.user_id and u.deleted_at is null
     where e.lembretes_minutos <> '{}'
       and e.inicio > now()
       and e.inicio - make_interval(mins => m.minutos) <= now()
       and e.inicio - make_interval(mins => m.minutos) >= coalesce(e.lembretes_valem_desde, e.created_at)
       -- Calendário desligado: pula SEM marcar, para religar não perder o lembrete.
       and empresa_tem_secao_de(u.empresa_id, 'calendario')
       and not exists (select 1 from evento_lembretes_enviados x
                        where x.evento_id = e.id and x.minutos = m.minutos)
  loop
    insert into evento_lembretes_enviados (evento_id, minutos)
    values ((r.ev).id, r.minutos)
    on conflict do nothing;
    if found then
      perform anotar_aviso_de_evento(r.ev, 'lembrete', r.minutos, null, null);
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.gerar_lembretes_devidos() from public, anon, authenticated;
grant execute on function public.gerar_lembretes_devidos() to service_role;

-- 9. O robô reserva itens sem repetir ------------------------------------------------
create or replace function public.reservar_avisos_de_evento(p_limite integer default 50)
returns setof public.evento_avisos
language sql
security definer
set search_path = public
as $$
  update evento_avisos a
     set processando_desde = now(),
         tentativas        = a.tentativas + 1
   where a.id in (
     select id from evento_avisos
      where concluido_em is null
        and tentativas < 5
        and (processando_desde is null or processando_desde < now() - interval '10 minutes')
      order by criado_em
      limit p_limite
      for update skip locked
   )
  returning a.*;
$$;
revoke all on function public.reservar_avisos_de_evento(integer) from public, anon, authenticated;
grant execute on function public.reservar_avisos_de_evento(integer) to service_role;
