-- Fila de saída da sincronização de calendário (Repply -> Google) + gatilho em `eventos` + cron da
-- volta (Google -> Repply). Complementa 20260923140100 (calendario_contas + evento_sync_externo) e a
-- função de borda `calendario-sincronizar`. A tela fica dormente (SINCRONIZACAO_CALENDARIO_ATIVA)
-- ate a Fase 1 ficar completa. NAO aplicar sem o "pode" do Lucas.

-- Nonce de uso unico do OAuth (guardado entre o "iniciar" e o /retorno do Google) — fecha a janela
-- de CSRF de vinculacao de conta. Vai aqui (nao na 20260923140100, ja publicada; nao se edita
-- migration existente). Nao entram no GRANT de coluna para authenticated: so o service_role le/grava.
alter table public.calendario_contas add column if not exists oauth_nonce text;
alter table public.calendario_contas add column if not exists oauth_nonce_expira timestamptz;

create table if not exists public.calendario_fila (
  id uuid primary key default gen_random_uuid(),
  operacao text not null check (operacao in ('salvar','apagar')),
  user_id uuid not null,
  evento_id uuid,                 -- 'salvar': o evento a empurrar
  calendario_conta_id uuid,       -- 'apagar': por qual conexao
  evento_externo_id text,         -- 'apagar': o id no Google (a etiqueta some por cascata; guardar aqui)
  criado_em timestamptz not null default now(),
  processado_em timestamptz
);

create index if not exists calendario_fila_pendente_idx
  on public.calendario_fila (criado_em) where processado_em is null;

alter table public.calendario_fila enable row level security;
-- Sem policy para anon/authenticated: so o service_role (a funcao de borda) le/escreve, e o gatilho
-- abaixo insere como SECURITY DEFINER. Ninguem mais toca na fila.

-- Enfileira as mudancas de `eventos` que precisam ir para o calendario externo.
create or replace function public.calendario_enfileira()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    -- O evento vai sumir e a etiqueta some junto (cascata de evento_sync_externo). Captura o id
    -- externo AGORA (BEFORE DELETE, a etiqueta ainda existe) e enfileira um 'apagar' por conexao.
    insert into public.calendario_fila (operacao, user_id, calendario_conta_id, evento_externo_id)
    select 'apagar', old.user_id, es.calendario_conta_id, es.evento_externo_id
      from public.evento_sync_externo es
     where es.evento_id = old.id;
    return old;
  end if;

  -- No UPDATE, so enfileira se um campo SINCRONIZADO mudou de fato (titulo/descricao/inicio/fim/
  -- dia_inteiro). Editar responsavel, observacao de visita etc. nao precisa reenviar ao Google —
  -- evita chamada e ruido a toa (e reduz eco).
  if tg_op = 'UPDATE'
     and new.titulo is not distinct from old.titulo
     and new.descricao is not distinct from old.descricao
     and new.inicio is not distinct from old.inicio
     and new.fim is not distinct from old.fim
     and new.dia_inteiro is not distinct from old.dia_inteiro then
    return new;
  end if;

  -- INSERT/UPDATE: so enfileira se o DONO do evento tem calendario Google conectado.
  if exists (
    select 1 from public.calendario_contas c
     where c.user_id = new.user_id and c.provedor = 'google' and c.status = 'conectada'
  ) then
    insert into public.calendario_fila (operacao, user_id, evento_id)
    values ('salvar', new.user_id, new.id);
  end if;
  return new;
end;
$$;
revoke all on function public.calendario_enfileira() from public, anon, authenticated;

drop trigger if exists calendario_enfileira_del on public.eventos;
create trigger calendario_enfileira_del
  before delete on public.eventos
  for each row execute function public.calendario_enfileira();

drop trigger if exists calendario_enfileira_ins on public.eventos;
create trigger calendario_enfileira_ins
  after insert or update on public.eventos
  for each row execute function public.calendario_enfileira();

-- Empurra a fila na hora: quando algo e enfileirado, chama a funcao no modo 'empurrar'.
-- Mesmo padrao de eventos_chama_envio (20260911130000): o cron de 5 min e a rede de seguranca.
create or replace function public.calendario_chama_empurrar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.chamar_edge_function('calendario-sincronizar', jsonb_build_object('modo','empurrar'), 60000, false);
  return null;
exception when others then
  raise warning '[calendario] empurrar nao chamado (o cron de 5 min cobre): %', sqlerrm;
  return null;
end;
$$;
revoke all on function public.calendario_chama_empurrar() from public, anon, authenticated;

drop trigger if exists calendario_chama_empurrar on public.calendario_fila;
create trigger calendario_chama_empurrar
  after insert on public.calendario_fila
  for each statement execute function public.calendario_chama_empurrar();

-- Volta (Google -> Repply): a cada 5 minutos.
select cron.schedule(
  'calendario-sincronizar-puxar',
  '*/5 * * * *',
  $$ select public.chamar_edge_function('calendario-sincronizar', jsonb_build_object('modo','puxar'), 60000, false) $$
);

-- Rede de seguranca da SAIDA: se a chamada imediata do gatilho falhar/for descartada, este cron
-- drena a fila `calendario_fila` a cada 5 min (senao o item ficaria com processado_em null p/ sempre).
select cron.schedule(
  'calendario-sincronizar-empurrar',
  '*/5 * * * *',
  $$ select public.chamar_edge_function('calendario-sincronizar', jsonb_build_object('modo','empurrar'), 60000, false) $$
);

comment on table public.calendario_fila is 'Fila de saida da sincronizacao de calendario (Repply -> Google). So service_role/gatilho.';
