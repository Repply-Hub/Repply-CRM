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

-- Teto de 5 lembretes, todos positivos. A tela já normaliza a lista
-- (`normalizarLembretes`, em src/lib/lembretes-do-evento.ts), mas tela não é trava:
-- CADA item da lista vira uma linha na fila, ou seja, uma mensagem direta e um e-mail.
-- Sem teto no banco, uma gravação feita fora do formulário dispara quantos e-mails
-- quiser em nome da empresa.
-- `cardinality` em vez de `array_length`: devolve 0 no array vazio (e não nulo) e conta
-- os elementos de verdade — '{{1,2},{3,4}}' são 4, mas `array_length(...,1)` diria 2, e
-- o `unnest` do gerador de lembretes veria os 4.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.eventos'::regclass
       and conname = 'eventos_lembretes_minutos_validos'
  ) then
    alter table public.eventos
      add constraint eventos_lembretes_minutos_validos check (
        cardinality(lembretes_minutos) <= 5
        and array_position(lembretes_minutos, null) is null
        and 0 < all (lembretes_minutos)
      );
  end if;
end $$;

-- 2. Lembretes já enviados ---------------------------------------------------------
create table if not exists public.evento_lembretes_enviados (
  evento_id  uuid        not null references public.eventos(id) on delete cascade,
  minutos    integer     not null,
  enviado_em timestamptz not null default now(),
  primary key (evento_id, minutos)
);
alter table public.evento_lembretes_enviados enable row level security;
-- Sem política: só o servidor e as funções do sistema leem e gravam.
-- 🔴 Ligar a RLS não basta para que a frase acima seja verdade. Neste banco o padrão do
-- Postgres (`pg_default_acl`) já entrega toda tabela nova do schema `public` inteira a
-- `anon` e a `authenticated` — a RLS filtra as linhas, mas o privilégio de ler e gravar
-- nasce concedido. Sem o revoke, "só o servidor" ficaria valendo só no comentário.
revoke all on table public.evento_lembretes_enviados from anon, authenticated;

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
-- Sem política: só o servidor lê e grava — e, pelo mesmo motivo da tabela acima, o
-- privilégio precisa ser retirado na mão. Aqui pesa mais: `dados` guarda título,
-- descrição, obra e os nomes dos participantes de todo evento avisado.
revoke all on table public.evento_avisos from anon, authenticated;

-- 4. Anotar um aviso a partir de uma linha de evento -------------------------------
--
-- 🔴 `search_path = public, pg_temp` em TODAS as funções daqui para baixo, nunca só
--    `public`: quando `pg_temp` não é listado, o Postgres o procura PRIMEIRO assim mesmo.
--    Um usuário logado que criasse uma tabela temporária chamada `usuarios` faria estas
--    funções — que rodam com os poderes do dono, sem RLS — lerem a tabela dele.
--    Listando `pg_temp` por último, ele passa a ser procurado por último.
create or replace function public.anotar_aviso_de_evento(
  p_evento       public.eventos,
  p_tipo         text,
  p_minutos      integer,
  p_inicio_antes timestamptz,
  p_fim_antes    timestamptz
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
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

  -- 🔴 QUEM ASSINA O AVISO É QUEM ESCREVEU A LINHA, não o `criado_por` que veio junto.
  -- `remetente_id` vira o autor da mensagem direta (`chat_mensagens.usuario_id`) e o
  -- "Organizado por" do e-mail. `eventos.criado_por` é escolhido livremente por quem
  -- insere — sua única amarra é a chave estrangeira para `auth.users`, que não conhece
  -- empresa. Sem o filtro abaixo, qualquer pessoa da equipe mandaria chat e e-mail
  -- assinados por um colega, e um id de OUTRA empresa traria nome e e-mail de fora para
  -- dentro de `dados`.
  --
  -- Sem sessão (`auth.uid()` nulo) não há quem assine: é o robô do lembrete chamando esta
  -- função, e aí o organizador gravado na linha é o remetente certo — a spec (§3.2) manda
  -- o lembrete sair por mensagem direta para cada participante, menos o organizador. A
  -- fronteira de empresa vale igual nos dois caminhos; sem candidato válido, `v_rem` fica
  -- vazio, o chat não sai e o e-mail vai sem o "Organizado por".
  select * into v_rem
    from usuarios
   where user_id = coalesce(auth.uid(), p_evento.criado_por)
     and empresa_id = v_dest.empresa_id;

  if p_evento.obra_id is not null then
    select nome_obra into v_obra from obras where id = p_evento.obra_id;
  end if;
  -- `grupo_id` vem do cliente e não tem amarra nenhuma; como esta função roda sem RLS,
  -- um grupo forjado listaria gente de outra empresa em `participantes`. E quem foi
  -- excluído não entra na lista, igual à busca do destinatário logo acima.
  select coalesce(array_agg(coalesce(u.nome, u.email) order by u.nome), '{}')
    into v_nomes
    from eventos e
    join usuarios u on u.user_id = e.user_id
   where e.grupo_id = p_evento.grupo_id
     and u.empresa_id = v_dest.empresa_id
     and u.deleted_at is null;

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
set search_path = public, pg_temp
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
  elsif new.lembretes_minutos is distinct from old.lembretes_minutos then
    -- Decisão do dono do produto (12/09/2026): lembrete cujo momento JÁ PASSOU quando a
    -- lista foi salva não sai atrasado — some calado. Ex.: evento amanhã às 8h; às 18h de
    -- hoje alguém acrescenta "1 dia antes", cujo momento era hoje às 8h.
    -- Carimbar o piso agora resolve sozinho: o gerador (§8) só aceita lembrete cujo momento
    -- seja posterior a `lembretes_valem_desde`, então o que ficou para trás nunca entra.
    -- 🔴 Aqui NÃO se apaga `evento_lembretes_enviados` — só a mudança de horário faz isso.
    -- Mexer na lista não pode fazer o que já foi enviado sair de novo.
    new.lembretes_valem_desde := now();
  end if;
  -- Os dois ramos acima não brigam quando horário e lista mudam no mesmo salvamento: o
  -- carimbo é o mesmo `now()`, e quem decide é o do horário, que além de carimbar limpa os
  -- enviados — que é justamente o que a mudança de horário exige.
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
set search_path = public, pg_temp
as $$
declare
  v_quem  uuid := auth.uid();
  v_resta boolean;
  v_tipo  text;   -- só para a mensagem de erro lá embaixo saber o que se perdeu
  v_grupo uuid;   -- idem. `new` não existe no DELETE, por isso o if e não um coalesce
begin
  -- Sem sessão = o próprio sistema (limpeza, exclusão de conta): nunca avisa.
  if v_quem is null then return null; end if;

  if tg_op = 'DELETE' then v_grupo := old.grupo_id; else v_grupo := new.grupo_id; end if;

  if tg_op = 'INSERT' then
    -- Convite: evento novo ou participante incluído depois. Quem grava a própria linha
    -- (o organizador) não se convida.
    if new.avisar_participantes and new.user_id <> v_quem and new.inicio > now() then
      v_tipo := 'convite';
      perform anotar_aviso_de_evento(new, v_tipo, null, null, null);
    end if;

  elsif tg_op = 'UPDATE' then
    -- Decisão do dono do produto (12/09/2026): LIGAR a chave depois convida. Quem salvava o
    -- evento com a chave desligada e a ligava em seguida não avisava ninguém — a chave
    -- prometia na tela e nada saía. O convite é o mesmo da criação.
    -- 🔴 A trava contra convidar duas vezes é `not old.avisar_participantes`: só a virada
    -- desligada → ligada convida. Salvar de novo com a chave já ligada não reconvida.
    -- Desligar a chave não gera aviso nenhum — ninguém recebe "você não será mais avisado".
    -- O convite ganha do aviso de mudança quando as duas coisas vêm no mesmo salvamento: ele
    -- já leva o evento inteiro, e as duas mensagens juntas seriam uma a mais.
    if new.avisar_participantes and not old.avisar_participantes
       and new.user_id <> v_quem and new.inicio > now() then
      v_tipo := 'convite';
      perform anotar_aviso_de_evento(new, v_tipo, null, null, null);

    -- Mudança de data/hora feita por outra pessoa (o organizador). Título e descrição não avisam.
    elsif new.avisar_participantes and new.user_id <> v_quem
       and (new.inicio is distinct from old.inicio or new.fim is distinct from old.fim)
       and greatest(new.inicio, old.inicio) > now() then
      v_tipo := 'alteracao';
      perform anotar_aviso_de_evento(new, v_tipo, null, old.inicio, old.fim);
    end if;

  elsif tg_op = 'DELETE' then
    -- Participante que sai (apaga a própria linha) não avisa ninguém.
    if old.avisar_participantes and old.user_id <> v_quem and old.inicio > now() then
      -- Gatilho AFTER ROW roda no fim do comando: se o grupo inteiro foi apagado, não resta
      -- ninguém = cancelamento; se ainda resta alguém, esta pessoa foi retirada.
      select exists (select 1 from eventos where grupo_id = old.grupo_id) into v_resta;
      v_tipo := case when v_resta then 'retirado' else 'cancelamento' end;
      perform anotar_aviso_de_evento(old, v_tipo, null, null, null);
    end if;
  end if;
  return null;
exception when others then
  -- 🔴 Aviso é consequência: NUNCA pode impedir salvar ou apagar o evento.
  -- Em compensação, o aviso perdido some sem deixar rastro: o `sqlerrm` sozinho não diz
  -- QUAL aviso se perdeu. Com tipo e grupo dá para achar o evento e reenviar na mão.
  -- `v_tipo` nulo = a falha veio antes de decidir o tipo; aí o comando já ajuda.
  raise warning '[agenda] aviso não anotado (tipo %, grupo %): %',
    coalesce(v_tipo, '?' || tg_op), v_grupo, sqlerrm;
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
set search_path = public, pg_temp
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
set search_path = public, pg_temp
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
set search_path = public, pg_temp
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
      -- `limit null` em SQL significa "sem limite": chamar sem argumento usa o padrão de
      -- 50, mas chamar com nulo explícito reservaria a fila inteira de uma vez.
      limit coalesce(p_limite, 50)
      for update skip locked
   )
  returning a.*;
$$;
revoke all on function public.reservar_avisos_de_evento(integer) from public, anon, authenticated;
grant execute on function public.reservar_avisos_de_evento(integer) to service_role;
