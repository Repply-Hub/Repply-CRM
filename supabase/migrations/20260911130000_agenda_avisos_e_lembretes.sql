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
  add column if not exists lembretes_valem_desde timestamptz,
  add column if not exists avisos_remetente_id uuid references public.usuarios(id) on delete set null;

-- 🔴 `avisos_remetente_id` é o id INTERNO (usuarios.id) de quem ASSINA os avisos deste
-- evento. É carimbado na gravação pelo gatilho da §5 e NUNCA escolhido pelo cliente.
-- Por que uma coluna, e não ler `criado_por` na hora de avisar: `criado_por` é livre — sua
-- única amarra é a chave estrangeira para `auth.users`, que não conhece empresa. O aviso de
-- convite dá para conferir na hora (a sessão ainda existe), mas o do LEMBRETE é anotado
-- depois, pelo robô, quando já não há sessão nenhuma para conferir. Sem este carimbo, quem
-- gravasse o evento com o `criado_por` de um colega faria o lembrete sair assinado por ele.
-- `on delete set null`: excluir uma pessoa não pode travar no evento antigo dela. (Este
-- sistema exclui marcando `deleted_at`, e aí o `on delete` nunca dispara — quem foi excluído
-- assim é tratado na leitura do carimbo, §4 e §5.)

-- O preenchimento abaixo não pode mexer em `updated_at` nem disparar gatilho antigo:
-- é cópia de estrutura, não edição de evento.
alter table public.eventos disable trigger user;

-- 🔴 `lembretes_valem_desde is null` é o que faz esta cópia ser segura numa SEGUNDA rodada
-- do arquivo. Sem ele, uma segunda rodada ressuscitaria o lembrete de quem, na tela nova,
-- tirou todos os lembretes (lista vazia) de um evento antigo que ainda tem `lembrete_minutos`.
-- Por que esta marca prova "só antes da primeira rodada":
--   - antes da primeira rodada a coluna nem existe, então nasce nula em TODA linha;
--   - o `update` logo abaixo, na mesma rodada, preenche TODA linha que ficou nula;
--   - depois disso, nada grava nulo nela: no INSERT o gatilho da §5 carimba `now()`, e no
--     UPDATE ele carimba `now()` ou devolve o valor antigo — o que o cliente mandar é ignorado.
-- Só uma gravação feita com os gatilhos desligados por um administrador escaparia disso.
update public.eventos
   set lembretes_minutos = array[lembrete_minutos]
 where lembrete_minutos is not null
   and lembretes_minutos = '{}'
   and lembretes_valem_desde is null;

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
-- Só o servidor e as funções do sistema leem e gravam.
-- 🔴 Ligar a RLS não basta para que a frase acima seja verdade. Neste banco o padrão do
-- Postgres (`pg_default_acl`) já entrega toda tabela nova do schema `public` inteira a
-- `anon` e a `authenticated` — a RLS filtra as linhas, mas o privilégio de ler e gravar
-- nasce concedido. Sem o revoke, "só o servidor" ficaria valendo só no comentário.
revoke all on table public.evento_lembretes_enviados from anon, authenticated;
-- E a intenção fica ESCRITA no banco, não deduzida da falta de política: uma política que
-- recusa tudo. Quem precisa passar passa por cima dela — `service_role` (o robô) e `postgres`
-- (dono das funções `security definer` deste arquivo) têm `bypassrls`.
drop policy if exists evento_lembretes_enviados_recusa_tudo on public.evento_lembretes_enviados;
create policy evento_lembretes_enviados_recusa_tudo
  on public.evento_lembretes_enviados
  for all
  using (false)
  with check (false);

-- Ponte com o robô ANTIGO durante a publicação. Entre aplicar esta migration e publicar o
-- robô novo, o antigo continua rodando a cada 5 min e marca o que manda SÓ em
-- `eventos.lembrete_enviado`. Sem esta ponte, o robô novo não veria essas marcas e mandaria
-- de novo os mesmos lembretes. A ponte resolve a REPETIÇÃO, não a ORDEM: a publicação
-- continua sendo banco → robô novo → site, nessa ordem e em seguida. Robô antes do banco
-- falha (as funções ainda não existem) e nada sai; site antes do robô grava só
-- `lembretes_minutos`, que o robô antigo não lê — os lembretes desse intervalo não saem,
-- ou saem atrasados quando o robô novo chegar.
-- A chave é exatamente a que o gerador (§8) confere — `(evento_id, minutos)` — com o mesmo
-- `minutos` que o preenchimento logo abaixo usa: `lembrete_minutos`, que o preenchimento da
-- §1 copiou para `lembretes_minutos` como `array[lembrete_minutos]`.
-- Só vale SEM sessão: o robô antigo usa a chave de servidor. Nenhuma tela grava
-- `lembrete_enviado`; se um cliente o ligasse na mão, não seria um lembrete que saiu, e
-- registrá-lo calaria o lembrete de verdade.
-- 🔴 A POSIÇÃO importa. Criado aqui — depois do par `disable/enable trigger user` da §1 e
-- ANTES do preenchimento logo abaixo — ele não pega o preenchimento de estrutura (que, além
-- de rodar com os gatilhos desligados, nem toca `lembrete_enviado`), e não deixa fresta: a
-- marca que o robô antigo gravou antes daqui é lida pelo preenchimento; a que ele gravar
-- depois é pega por este gatilho. `search_path` com `pg_temp` por último: ver a §4.
create or replace function public.eventos_registra_lembrete_do_robo_antigo()
returns trigger
language plpgsql
security definer   -- grava em evento_lembretes_enviados, que só o servidor alcança
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null and new.lembrete_minutos is not null then
    insert into evento_lembretes_enviados (evento_id, minutos)
    values (new.id, new.lembrete_minutos)
    on conflict do nothing;
  end if;
  return null;
exception when others then
  -- Nunca pode derrubar a marca do robô antigo: se ela falhasse, ele reenviaria o mesmo
  -- lembrete a cada 5 min. Perder o registro custa, no pior caso, UM lembrete repetido.
  raise warning '[agenda] lembrete do robô antigo não registrado (evento %): %', new.id, sqlerrm;
  return null;
end;
$$;
revoke all on function public.eventos_registra_lembrete_do_robo_antigo()
  from public, anon, authenticated;

drop trigger if exists eventos_registra_lembrete_do_robo_antigo on public.eventos;
create trigger eventos_registra_lembrete_do_robo_antigo
  after update on public.eventos
  for each row
  when (new.lembrete_enviado and not old.lembrete_enviado)
  execute function public.eventos_registra_lembrete_do_robo_antigo();

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
-- Só o servidor lê e grava — e, pelo mesmo motivo da tabela acima, o privilégio precisa ser
-- retirado na mão e a recusa, escrita. Aqui pesa mais: `dados` guarda título, descrição,
-- obra e os nomes dos participantes de todo evento avisado.
revoke all on table public.evento_avisos from anon, authenticated;
drop policy if exists evento_avisos_recusa_tudo on public.evento_avisos;
create policy evento_avisos_recusa_tudo
  on public.evento_avisos
  for all
  using (false)
  with check (false);

-- 4. Anotar um aviso a partir de uma linha de evento -------------------------------
--
-- 🔴 `search_path = public, pg_temp` em TODAS as funções deste arquivo, nunca só
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

  -- 🔴 FRONTEIRA DE EMPRESA PELA ORIGEM DO EVENTO. `eventos.user_id` não tem chave
  -- estrangeira e a política de UPDATE não conhece empresa: quem pode editar a linha pode
  -- trocar o destinatário por um login de OUTRA empresa. O gatilho da §6 recusa isso quando
  -- há sessão, mas o LEMBRETE é anotado pelo robô, sem sessão — e sem esta trava sairiam
  -- sininho e e-mail, com título e descrição escritos por quem trocou, para gente de fora.
  -- A origem é quem gravou a linha (o carimbo da §5); só linha sem carimbo — anterior a
  -- esta migration e nunca mais salva — cai em `criado_por`. Aqui NÃO se filtra
  -- `deleted_at`: a pergunta é "de que empresa veio", e quem saiu continua tendo vindo dela.
  -- Uma troca de destinatário feita por gravação não consegue escapar: o UPDATE que troca
  -- `user_id` passa pela §5 e sai dela com carimbo — o do autor original, que ele não
  -- consegue trocar, ou, se a linha ainda não tinha, o de quem está trocando. Nos dois casos
  -- é gente da empresa de onde o evento veio, e não da empresa do novo destinatário.
  if p_evento.avisos_remetente_id is not null then
    if not exists (select 1 from usuarios o
                    where o.id = p_evento.avisos_remetente_id
                      and o.empresa_id = v_dest.empresa_id) then
      -- Recusa silenciosa é aviso perdido sem rastro: o gerador já marcou o lembrete como
      -- enviado. O único caso legítimo conhecido é pessoa religada a outra empresa.
      raise warning '[agenda] aviso recusado: o evento veio de outra empresa que a do destinatário (tipo %, grupo %)',
        p_tipo, p_evento.grupo_id;
      return;
    end if;
  elsif not exists (select 1 from usuarios o
                     where o.user_id = p_evento.criado_por
                       and o.empresa_id = v_dest.empresa_id) then
    raise warning '[agenda] aviso recusado: o evento (sem carimbo) veio de outra empresa que a do destinatário (tipo %, grupo %)',
      p_tipo, p_evento.grupo_id;
    return;
  end if;

  -- 🔴 QUEM ASSINA O AVISO SAI DO CARIMBO DA §1, não do `criado_por` que veio junto.
  -- `remetente_id` vira o autor da mensagem direta (`chat_mensagens.usuario_id`) e o
  -- "Organizado por" do e-mail — assinar por outra pessoa não é detalhe.
  -- O carimbo `avisos_remetente_id` foi gravado pelo gatilho com o id interno de quem
  -- escreveu a linha, então serve aos DOIS caminhos: o convite, anotado na hora, e o
  -- lembrete, anotado depois pelo robô, quando já não há sessão para conferir nada.
  --
  -- Quem foi excluído (`deleted_at`) não assina nada. Sem candidato válido, `v_rem` fica
  -- vazio, o chat não sai e o e-mail vai sem o "Organizado por". Falha fechada.
  if p_evento.avisos_remetente_id is not null then
    select * into v_rem
      from usuarios
     where id = p_evento.avisos_remetente_id
       and empresa_id = v_dest.empresa_id
       and deleted_at is null;
    -- Chegar aqui vazio só pode ser uma coisa: a trava de origem acima já provou que o
    -- carimbo é desta empresa, então a pessoa carimbada foi EXCLUÍDA. Com sessão, faz-se o
    -- que se faz com o carimbo nulo: assina quem está agindo agora.
    -- 🔴 SEM sessão (o robô) NÃO se cai em `criado_por`, ao contrário do carimbo nulo. Esta
    -- linha tem carimbo, então não é evento antigo; e o `criado_por` dela pode ter sido
    -- trocado por qualquer um que a editou depois — cair nele devolveria ao robô exatamente a
    -- assinatura forjada que o carimbo existe para impedir.
    if v_rem.id is null and auth.uid() is not null then
      select * into v_rem
        from usuarios
       where user_id = auth.uid()
         and empresa_id = v_dest.empresa_id
         and deleted_at is null;
    end if;
  else
    -- Evento gravado ANTES desta migration: não tem carimbo, e ninguém vai reescrever a
    -- linha só para ganhá-lo. Vale a regra antiga — quem está na sessão, ou o organizador
    -- da linha quando é o robô que chama.
    select * into v_rem
      from usuarios
     where user_id = coalesce(auth.uid(), p_evento.criado_por)
       and empresa_id = v_dest.empresa_id
       and deleted_at is null;
  end if;

  if p_evento.obra_id is not null then
    select nome_obra into v_obra from obras where id = p_evento.obra_id;
  end if;
  -- `grupo_id` vem do cliente e não tem amarra nenhuma; como esta função roda sem RLS,
  -- um grupo forjado listaria gente de outra empresa em `participantes`. E quem foi
  -- excluído não entra na lista, igual à busca do destinatário logo acima.
  -- No CANCELAMENTO esta lista sai sempre vazia, e está certo assim: o gatilho de exclusão
  -- roda no fim do comando, quando as linhas do grupo já saíram. O e-mail esconde a linha
  -- "Participantes" quando a lista é vazia (`htmlDoEmail`), e para um evento que deixou de
  -- existir quem mais iria é informação dispensável. Reconstruir a lista pediria as linhas
  -- apagadas do comando inteiro (tabela de transição), que o Postgres não entrega num
  -- gatilho de três eventos como o da §6 — seria um gatilho a mais só para isso.
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

-- 5. Antes de gravar: quem assina, ponte com a aba antiga e carimbo dos lembretes -----
create or replace function public.eventos_prepara_lembretes()
returns trigger
language plpgsql
security definer   -- apaga em evento_lembretes_enviados, que não tem política
set search_path = public, pg_temp
as $$
declare
  v_quem           uuid := auth.uid();
  v_carimbo_antigo uuid;   -- fica nulo no INSERT: `old` só é tocado no UPDATE
begin
  if tg_op = 'UPDATE' then v_carimbo_antigo := old.avisos_remetente_id; end if;

  -- 🔴 CARIMBO DE QUEM ASSINA. Quem assina os avisos deste evento é quem está GRAVANDO a
  -- linha, e não o `criado_por` que veio no corpo do pedido. O que o cliente mandar nesta
  -- coluna é ignorado: os três ramos abaixo sempre a reescrevem.
  --
  -- (a) Carimbo que já existe prevalece — uma linha carimbada não muda de dono editando.
  --     Exceção: com sessão, se a pessoa carimbada foi EXCLUÍDA (`deleted_at`), a linha é
  --     tratada como sem carimbo e vai para (b). Sem sessão o carimbo nunca muda: o servidor
  --     não tem quem pôr no lugar, e (c) usaria um `criado_por` que alguém pode ter trocado.
  if v_carimbo_antigo is not null
     and (v_quem is null
          or exists (select 1 from usuarios u
                      where u.id = v_carimbo_antigo and u.deleted_at is null)) then
    new.avisos_remetente_id := v_carimbo_antigo;

  -- (b) Com sessão: quem está logado, e NUNCA `criado_por` — nem quando a pessoa logada não
  --     é achada. A ordem do `coalesce`:
  --       1. quem grava, se está ativo;
  --       2. o carimbo antigo (só chega aqui excluído): quem saiu não é trocado por ninguém
  --          que não esteja ativo;
  --       3. quem grava mesmo EXCLUÍDO, como marca de autoria. Ela não assina nada (a §4
  --          ignora quem tem `deleted_at`), mas mantém o carimbo não nulo — e carimbo nulo
  --          faria o robô assinar com o `criado_por` que a própria sessão escreveu.
  elsif v_quem is not null then
    new.avisos_remetente_id := coalesce(
      (select u.id from usuarios u where u.user_id = v_quem and u.deleted_at is null),
      v_carimbo_antigo,
      (select u.id from usuarios u where u.user_id = v_quem)
    );

  -- (c) Sem sessão (gravação feita pelo servidor) e sem carimbo: vale o id interno de
  --     `criado_por`, exatamente como era antes. Nesse caminho não existe usuário logado
  --     para forjar coisa nenhuma, e é o melhor dado disponível. No UPDATE, é a linha
  --     gravada ANTES desta migration ganhando dono na primeira vez que alguém a salva.
  else
    new.avisos_remetente_id :=
      (select u.id from usuarios u where u.user_id = new.criado_por and u.deleted_at is null);
  end if;

  -- Ponte: uma aba aberta antes da publicação ainda grava só `lembrete_minutos`.
  -- No INSERT, a lista nova vazia herda o lembrete único. As rotas de visita mandam
  -- `lembrete_minutos: null` explícito, e só em INSERT — por isso o nulo não mexe em nada.
  if tg_op = 'INSERT' then
    if new.lembretes_minutos = '{}' and new.lembrete_minutos is not null then
      new.lembretes_minutos := array[new.lembrete_minutos];
    end if;
  -- No UPDATE a ponte NÃO pode depender da lista nova estar vazia: depois do preenchimento
  -- da §1, todo evento antigo que tinha lembrete tem a lista preenchida, e a aba antiga que
  -- trocasse 60 por 30 teria a troca jogada fora em silêncio. Vale sempre que a coluna
  -- antiga MUDOU — nenhuma tela nova a grava em UPDATE (`src/hooks/use-eventos.ts`), então
  -- mudança nela só pode vir da aba antiga. Tirar o lembrete na aba antiga (nulo) esvazia a
  -- lista. A aba antiga só enxerga um lembrete; a troca explícita dela ganha, inclusive dos
  -- itens que ela não vê.
  -- A segunda condição protege quem grava as DUAS colunas no mesmo pedido: aí a lista nova
  -- veio escrita de propósito, e a ponte não a atropela.
  elsif new.lembrete_minutos is distinct from old.lembrete_minutos
        and new.lembretes_minutos is not distinct from old.lembretes_minutos then
    new.lembretes_minutos := case
      when new.lembrete_minutos is null then '{}'::integer[]
      else array[new.lembrete_minutos]
    end;
  end if;

  -- A ponte roda ANTES desta comparação de propósito: a lista que ela reescreveu conta como
  -- lista mudada, e o piso é recarimbado pela decisão B logo abaixo.
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
  else
    -- Nada que mexa em lembrete mudou: o piso fica onde estava, venha o que vier do cliente.
    -- Sem isto, uma gravação fora da tela poderia recuar o piso (e fazer sair atrasado o que
    -- a decisão B manda calar) ou anulá-lo (e quebrar a marca de "segunda rodada" da §1).
    new.lembretes_valem_desde := old.lembretes_valem_desde;
  end if;
  -- Os dois ramos de recarimbo não brigam quando horário e lista mudam no mesmo salvamento:
  -- o carimbo é o mesmo `now()`, e quem decide é o do horário, que além de carimbar limpa os
  -- enviados — que é justamente o que a mudança de horário exige.
  return new;
end;
$$;
-- Função de gatilho não é chamável direto, mas o `execute` sobra concedido por padrão; fica
-- retirado como nas outras. O Postgres confere esse privilégio ao CRIAR o gatilho (quem cria
-- é o dono), não a cada disparo — a gravação de quem está logado continua passando.
revoke all on function public.eventos_prepara_lembretes() from public, anon, authenticated;

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
  v_quem         uuid := auth.uid();
  v_resta        boolean;
  v_tipo         text;   -- também para a mensagem de erro lá embaixo saber o que se perdeu
  v_grupo        uuid;   -- idem. `new` não existe no DELETE, por isso o if e não um coalesce
  v_linha        public.eventos;
  v_inicio_antes timestamptz;
  v_fim_antes    timestamptz;
  v_empresa_ator uuid;
begin
  -- Sem sessão = o próprio sistema (limpeza, exclusão de conta): nunca avisa.
  if v_quem is null then return null; end if;

  if tg_op = 'DELETE' then v_grupo := old.grupo_id; else v_grupo := new.grupo_id; end if;

  -- Primeiro decide SE e QUAL aviso; a fronteira de empresa e a anotação vêm depois, num
  -- lugar só, para valerem igual para os três caminhos.
  if tg_op = 'INSERT' then
    -- Convite: evento novo ou participante incluído depois. Quem grava a própria linha
    -- (o organizador) não se convida.
    if new.avisar_participantes and new.user_id <> v_quem and new.inicio > now() then
      v_tipo  := 'convite';
      v_linha := new;
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
      v_tipo  := 'convite';
      v_linha := new;

    -- Mudança de data/hora feita por outra pessoa (o organizador). Título e descrição não avisam.
    elsif new.avisar_participantes and new.user_id <> v_quem
       and (new.inicio is distinct from old.inicio or new.fim is distinct from old.fim)
       and greatest(new.inicio, old.inicio) > now() then
      v_tipo         := 'alteracao';
      v_linha        := new;
      v_inicio_antes := old.inicio;
      v_fim_antes    := old.fim;
    end if;

  elsif tg_op = 'DELETE' then
    -- Participante que sai (apaga a própria linha) não avisa ninguém.
    if old.avisar_participantes and old.user_id <> v_quem and old.inicio > now() then
      -- Gatilho AFTER ROW roda no fim do comando: se o grupo inteiro foi apagado, não resta
      -- ninguém = cancelamento; se ainda resta alguém, esta pessoa foi retirada.
      select exists (select 1 from eventos where grupo_id = old.grupo_id) into v_resta;
      v_tipo  := case when v_resta then 'retirado' else 'cancelamento' end;
      v_linha := old;
    end if;
  end if;

  if v_tipo is null then return null; end if;

  -- 🔴 FRONTEIRA DE EMPRESA PELA SESSÃO. `eventos.user_id` não tem chave estrangeira, e a
  -- política `eventos_update` só pergunta se quem grava é o `user_id` ou o `criado_por` da
  -- linha — não pergunta empresa. Então quem criou um evento pode trocar o `user_id` pelo
  -- login de alguém de OUTRA empresa e ligar a chave: sem esta trava, a pessoa de fora
  -- receberia sininho e e-mail com título e descrição escritos por quem trocou.
  -- A empresa de quem age é resolvida uma vez, aqui, e só se chega aqui quando há aviso a
  -- anotar. Não é `get_my_empresa_id()` porque ela não olha `deleted_at`: quem foi excluído
  -- e ainda tem sessão válida não avisa ninguém. Sem empresa, nada sai — falha fechada.
  select u.empresa_id into v_empresa_ator
    from usuarios u
   where u.user_id = v_quem
     and u.deleted_at is null;

  if v_empresa_ator is null
     or not exists (select 1 from usuarios d
                     where d.user_id = v_linha.user_id
                       and d.deleted_at is null
                       and d.empresa_id = v_empresa_ator) then
    raise warning '[agenda] aviso recusado: quem gravou está sem empresa ou excluído, ou o destinatário é de outra empresa ou foi excluído (tipo %, grupo %)',
      v_tipo, v_grupo;
    return null;
  end if;

  perform anotar_aviso_de_evento(v_linha, v_tipo, null, v_inicio_antes, v_fim_antes);
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
revoke all on function public.eventos_anota_aviso() from public, anon, authenticated;

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
revoke all on function public.eventos_chama_envio() from public, anon, authenticated;

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
      -- Lote entre 1 e 50, sempre. `limit null` em SQL significa "sem limite": chamar com
      -- nulo explícito reservaria a fila inteira de uma vez (por isso o `coalesce`). E
      -- `limit` negativo é erro — o robô inteiro pararia por causa de um número.
      limit greatest(1, least(coalesce(p_limite, 50), 50))
      for update skip locked
   )
  returning a.*;
$$;
revoke all on function public.reservar_avisos_de_evento(integer) from public, anon, authenticated;
grant execute on function public.reservar_avisos_de_evento(integer) to service_role;
