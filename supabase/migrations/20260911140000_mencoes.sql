-- 🔴 TRAVAS: TODAS AQUI NO COMEÇO, DA TABELA MAIS FRIA PARA A MAIS QUENTE, 2 s DE ESPERA CADA.
--
-- O PROBLEMA. `add column`, `add constraint`, `create policy` e `create trigger` pedem a trava
-- exclusiva da tabela (ACCESS EXCLUSIVE), que barra leitura e gravação. A chave estrangeira de
-- `mencoes` pede SHARE ROW EXCLUSIVE nas tabelas para onde aponta, que barra gravação. Enquanto
-- um pedido de trava ESPERA, quem chega depois pedindo algo que conflita espera atrás dele; e a
-- trava obtida só é solta no COMMIT.
--
-- O LIMITE. Os papéis da API desistem em 8 s (conferido em `pg_roles.rolconfig` em 14/09/2026:
-- `authenticator` com `lock_timeout=8s` e `statement_timeout=8s`; `authenticated` com
-- `statement_timeout=8s`). Passou disso, a gravação do chat e a do webhook do WhatsApp FALHAM —
-- não esperam.
--
-- POR QUE TUDO AQUI. Com as travas espalhadas pelo arquivo, cada uma esperaria até 2 s com as
-- anteriores já presas: uns 10 s com o chat bloqueado. Pegando todas aqui, depois da última só
-- sobra trabalho de catálogo, em milissegundos: as colunas novas têm default constante, `mencoes`
-- nasce vazia, e a conferência do `link` lê as poucas linhas do sininho. Cada tabela fica
-- bloqueada, no pior caso, pela própria espera somada à espera de cada trava pedida DEPOIS dela.
--
-- A ORDEM, pelas gravações medidas em `pg_stat_user_tables` em 14/09/2026:
--   1. `whatsapp_conversas`, `wapi_instancia_usuarios`, `whatsapp_conversa_responsaveis`, em
--      ACCESS SHARE. Os corpos das funções `language sql` (§3 e §4) são conferidos na criação
--      (`check_function_bodies = on`) e leem essas tabelas. ACCESS SHARE não barra leitura nem
--      gravação de ninguém; só espera por quem tenha travado a tabela inteira (outra migration).
--      Pedida aqui, essa espera acontece ANTES de qualquer tabela quente estar presa.
--   2. `empresas`, `usuarios`, em SHARE ROW EXCLUSIVE (a chave estrangeira de `mencoes`). Barram
--      só gravação, e são as mais frias: dezenas de gravações no período medido. A leitura e a
--      checagem de chave estrangeira do chat e do WhatsApp em `usuarios` (ROW SHARE) passam.
--   3. `notificacoes`: dezenas de gravações.
--   4. `chat_mensagens`: centenas de gravações.
--   5. `whatsapp_mensagens`: dezenas de milhares — o webhook. A MAIS QUENTE, por último.
--
-- PIOR CASO, com cada espera batendo os 2 s:
--   · `whatsapp_mensagens`: bloqueada até 2 s (só a própria espera);
--   · `chat_mensagens`: até 4 s (a própria + a do WhatsApp);
--   · `notificacoes`: até 6 s (a própria + a do chat + a do WhatsApp), leitura do sininho inclusive;
--   · `usuarios`: gravação parada até 8 s (a própria + as três de cima), no limite dos papéis da
--     API. Leitura e checagem de chave estrangeira não param;
--   · `empresas`: gravação parada até 10 s (a própria + a de `usuarios` + as três de cima).
--     Leitura não para. `usuarios` e `empresas` tiveram só dezenas de gravações no período medido;
--   · as três em ACCESS SHARE não param ninguém.
-- Mensagem do chat, mensagem do WhatsApp e sininho ficam abaixo dos 8 s. Esse pior caso pede uma
-- trava longa em cada tabela no mesmo instante; o normal é esperar milissegundos.
-- 🔴 QUEM FALHA É A MIGRATION, NUNCA A MENSAGEM. Espera que passar de 2 s derruba a MIGRATION com
-- erro visível (55P03, `lock_not_available`): a transação desfaz tudo, as gravações que estavam na
-- fila atrás dela seguem na hora, e a migration é rodada de novo.
--
-- `set local`: vale só nesta transação e some no COMMIT, sem ficar grudado na conexão que a
-- aplicou.
set local lock_timeout = '2s';

lock table public.whatsapp_conversas, public.wapi_instancia_usuarios, public.whatsapp_conversa_responsaveis
  in access share mode;
lock table public.empresas, public.usuarios in share row exclusive mode;
lock table public.notificacoes in access exclusive mode;
lock table public.chat_mensagens in access exclusive mode;
lock table public.whatsapp_mensagens in access exclusive mode;

-- Menções (@) no chat interno (Geral e grupos) e nas notas internas do WhatsApp.
-- Spec: docs/superpowers/specs/2026-09-11-busca-config-agenda-mencoes-design.md, Bloco 4.
--
-- COMO FUNCIONA
--   A mensagem guarda QUEM foi escolhido na lista (`mencionados`), não o nome escrito. Um
--   gatilho depois de gravar confere se cada pessoa ENXERGA aquela conversa e só então cria
--   a menção (`mencoes`) e o registro no sininho (`notificacoes`). É o que impede usar
--   menção para mostrar trecho de conversa a quem não tem acesso.
--
-- 🔴 IDS: chat, notas, menções e sininho usam o id INTERNO (`usuarios.id`). O único id de
--    LOGIN deste arquivo é `wapi_instancia_usuarios.usuario_auth_id`, e a ponte é sempre
--    `usuarios.user_id`. Conferido com pg_get_constraintdef em 14/09/2026:
--      chat_mensagens.usuario_id / recipient_id   -> usuarios(id)
--      chat_grupo_membros.usuario_id              -> usuarios(id)
--      whatsapp_mensagens.usuario_id              -> usuarios(id)
--      whatsapp_conversa_responsaveis.usuario_id  -> usuarios(id)
--      notificacoes.usuario_id                    -> usuarios(id)
--      wapi_instancia_usuarios.usuario_auth_id    -> auth.users(id)   <- LOGIN
--    Trocar uma família pela outra não dá erro: dá zero linhas (CLAUDE.md §4.5).
--
-- 🔴 Os gatilhos NUNCA bloqueiam a mensagem: qualquer erro vira aviso no log, com a origem
--    e o id da mensagem, para dar para achar a menção que se perdeu.
--
-- NADA É APAGADO NEM REESCRITO. As mensagens que já existem ganham lista vazia e nenhuma
-- menção: os gatilhos só olham INSERT, e as colunas novas nascem com default constante.
--
-- `search_path = public, pg_temp` em TODAS as funções deste arquivo, nunca só `public`:
-- quando `pg_temp` não é listado, o Postgres procura as tabelas temporárias da sessão
-- PRIMEIRO. Estas funções rodam com os poderes do dono, sem RLS; uma tabela temporária
-- chamada `usuarios` criada por um logado seria lida no lugar da verdadeira. Ver
-- 20260911130000_agenda_avisos_e_lembretes.sql §4.

-- 1. Colunas -----------------------------------------------------------------------
-- Default constante no Postgres 17 é só metadado: as dezenas de milhares de mensagens de
-- WhatsApp não são reescritas, e toda linha antiga lê "ninguém mencionado".
-- 🔴 SEM `not null`, de propósito. O supabase-js, ao gravar várias linhas num pedido só,
-- preenche com `null` a coluna que falta em alguma delas (`defaultToNull`). Com `not null`,
-- essa gravação recusaria a MENSAGEM inteira (erro 23502) por causa da menção — justamente
-- o que este arquivo promete nunca fazer.
-- Nulo vale "ninguém mencionado" em todo lugar que lê estas colunas:
--   · no `when` dos gatilhos (§5 e §6): `cardinality(null) > 0` é nulo, `null or null` é
--     nulo, e `when` nulo não dispara;
--   · dentro das funções: `coalesce` para `'{}'` e `false` antes de qualquer uso;
--   · e mesmo sem o `coalesce`, `u.id = any (null)` dá nulo, que o `where` descarta.
alter table public.chat_mensagens
  add column if not exists mencionados    uuid[]  default '{}',
  add column if not exists menciona_todos boolean default false;

alter table public.whatsapp_mensagens
  add column if not exists mencionados    uuid[]  default '{}',
  add column if not exists menciona_todos boolean default false;

-- Para onde o registro do sininho leva. Até aqui o sininho só sabia abrir negócio.
alter table public.notificacoes add column if not exists link text;

-- 🔴 O link é ROTA INTERNA do site, nunca endereço de fora. Os gatilhos deste arquivo só
-- escrevem '/chat?…' e '/whatsapp?…', montados com chaves do banco. Mas a coluna não é só
-- deles: `notificacoes_update` deixa o dono e qualquer gestor da empresa reescrever a linha,
-- e `notificacoes_insert` deixa o gestor criar registro para um colega. Sem esta trava,
-- gravar 'https://…' — ou '//site', que o navegador também leva para fora — faria o clique
-- no sininho de um colega abrir página de terceiros.
-- A regra: uma barra, seguida de algo que não seja outra barra nem contrabarra.
-- Linhas antigas têm `link` nulo e passam; a conferência não reescreve nada.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.notificacoes'::regclass
       and conname = 'notificacoes_link_rota_interna'
  ) then
    alter table public.notificacoes
      add constraint notificacoes_link_rota_interna
      check (link is null or link ~ '^/[^/\\]');
  end if;
end $$;

-- O registro de menção no sininho é só de quem foi mencionado.
-- Decisão do dono do produto (14/09/2026): "Menção só para quem foi mencionado".
-- Por que é preciso: `notificacoes_select`, `notificacoes_update` e `notificacoes_delete`
-- deixam qualquer gestor da empresa ler, mexer e apagar os registros dos colegas, e o sininho
-- dele os lista (`useNotificacoes` não filtra por dono). O registro de menção leva o lugar
-- ("no grupo X", "numa nota da conversa com Y") e o trecho da mensagem: sem estas travas, o
-- gestor leria trecho de grupo de que não é membro e de nota de número que não atende.
-- Por que RESTRITIVAS: somam com AND às políticas de hoje. Nenhuma permissiva — de hoje,
-- futura ou criada à mão pelo painel — abre o registro de menção de outra pessoa.
-- Por que só `tipo = 'mencao'`: todo outro registro do sininho continua com a visibilidade
-- de hoje, e o gestor segue acompanhando os avisos da equipe.
-- `tipo` é `not null` (conferido em 14/09/2026, zero linhas nulas): `tipo <> 'mencao'` nunca
-- dá nulo, e nenhum registro antigo some da vista de ninguém.
-- Quem grava não passa por elas: os gatilhos deste arquivo rodam como `postgres` e as
-- funções de servidor como `service_role`, os dois com `bypassrls`.
-- Vale também para o tempo real, de propósito: o tempo real respeita a RLS de quem ouve, e com
-- `notificacoes` em `supabase_realtime` (20260914120000_religa_tempo_real_do_chat.sql) o gestor
-- não recebe o evento da menção de um colega.
-- ⚠️ Gestor que tentar apagar a menção de um colega recebe ZERO LINHAS e nenhum erro
-- (CLAUDE.md §4.6).
drop policy if exists notificacoes_mencao_so_do_dono_select on public.notificacoes;
create policy notificacoes_mencao_so_do_dono_select on public.notificacoes
  as restrictive
  for select to authenticated
  using (tipo <> 'mencao' or usuario_id = (select public.get_my_usuario_id()));

-- O `with check` também impede virar um registro alheio em menção: trocar o `tipo` de um
-- aviso de colega para 'mencao' é recusado.
drop policy if exists notificacoes_mencao_so_do_dono_update on public.notificacoes;
create policy notificacoes_mencao_so_do_dono_update on public.notificacoes
  as restrictive
  for update to authenticated
  using (tipo <> 'mencao' or usuario_id = (select public.get_my_usuario_id()))
  with check (tipo <> 'mencao' or usuario_id = (select public.get_my_usuario_id()));

drop policy if exists notificacoes_mencao_so_do_dono_delete on public.notificacoes;
create policy notificacoes_mencao_so_do_dono_delete on public.notificacoes
  as restrictive
  for delete to authenticated
  using (tipo <> 'mencao' or usuario_id = (select public.get_my_usuario_id()));

-- Ninguém do lado de fora cria registro de menção — nem o gestor, que hoje pode criar
-- registro para um colega (`notificacoes_insert`). Sem isto, ele forjaria "Fulano te
-- mencionou", com o trecho que quisesse.
drop policy if exists notificacoes_mencao_so_o_sistema_cria on public.notificacoes;
create policy notificacoes_mencao_so_o_sistema_cria on public.notificacoes
  as restrictive
  for insert to authenticated
  with check (tipo <> 'mencao');

-- 2. A tabela de menções ------------------------------------------------------------
-- `chat_mensagens.lida` é UM booleano por mensagem, compartilhado: no Geral, o primeiro
-- que abre zera para todos. Menção precisa de "lida por mim" — daí a tabela própria.
create table if not exists public.mencoes (
  id               uuid        primary key default gen_random_uuid(),
  empresa_id       uuid        not null references public.empresas(id) on delete cascade,
  mencionado_id    uuid        not null references public.usuarios(id) on delete cascade,
  autor_id         uuid        references public.usuarios(id) on delete set null,
  autor_nome       text,
  origem           text        not null check (origem in ('chat', 'whatsapp_nota')),
  chat_mensagem_id uuid        references public.chat_mensagens(id) on delete cascade,
  wa_mensagem_id   uuid        references public.whatsapp_mensagens(id) on delete cascade,
  conversa_chave   text        not null,  -- 'geral' | 'grupo_<id>' | id da conversa do WhatsApp
  lugar            text        not null,  -- 'no Geral' | 'no grupo X' | 'numa nota da conversa com Y'
  previa           text,
  link             text        not null,
  lida_em          timestamptz,
  created_at       timestamptz not null default now(),
  -- Cada menção aponta para UMA mensagem, e da tabela que a origem diz.
  constraint mencoes_mensagem_da_origem check (
       (origem = 'chat'          and chat_mensagem_id is not null and wa_mensagem_id is null)
    or (origem = 'whatsapp_nota' and wa_mensagem_id is not null and chat_mensagem_id is null)
  ),
  -- Mesma trava do sininho (§1): rota interna, nunca endereço de fora.
  constraint mencoes_link_rota_interna check (link ~ '^/[^/\\]')
);

-- As não lidas de quem está logado: é a consulta da tela (`useMencoesNaoLidas`).
create index if not exists mencoes_nao_lidas
  on public.mencoes (mencionado_id) where lida_em is null;
-- Uma menção por pessoa por mensagem. Os gatilhos gravam com `on conflict do nothing`, então
-- uma pessoa escolhida na lista E coberta pelo @todos não recebe duas. Começam pelo id da
-- mensagem de propósito: apagar mensagem apaga as menções dela (`on delete cascade`), e
-- sem índice por esse id cada exclusão varreria a tabela inteira.
create unique index if not exists mencoes_uma_por_pessoa_no_chat
  on public.mencoes (chat_mensagem_id, mencionado_id) where chat_mensagem_id is not null;
create unique index if not exists mencoes_uma_por_pessoa_na_nota
  on public.mencoes (wa_mensagem_id, mencionado_id) where wa_mensagem_id is not null;

alter table public.mencoes enable row level security;

-- 🔴 Ligar a RLS não basta. Neste banco o `pg_default_acl` do schema `public` entrega toda
-- tabela nova INTEIRA a `anon` e a `authenticated` (conferido em 14/09/2026: `arwdDxtm` para
-- os dois). Sem estes revokes, um logado nasceria podendo INSERIR menção — fabricar "Fulano
-- te mencionou", com a prévia que quisesse, para qualquer colega — e apagar as suas.
-- Quem grava menção é só o gatilho: o dono das funções é `postgres`, que tem `bypassrls`.
-- `service_role` (servidor) mantém o que o padrão deu.
revoke all on table public.mencoes from anon, authenticated;
grant select on table public.mencoes to authenticated;
-- A pessoa só pode marcar como lida — nenhuma outra coluna. É privilégio por COLUNA: um
-- update que tente mexer em `previa`, `link` ou `mencionado_id` é recusado com erro 42501
-- antes de a política ser consultada.
grant update (lida_em) on table public.mencoes to authenticated;

-- `(select …)` em volta da função: o Postgres a calcula uma vez por consulta, e não uma
-- vez por linha — vale também para o tempo real, que confere a política a cada mudança.
drop policy if exists mencoes_select_proprias on public.mencoes;
create policy mencoes_select_proprias on public.mencoes
  for select to authenticated
  using (mencionado_id = (select public.get_my_usuario_id()));

-- 🔴 Update barrado pela política volta ZERO LINHAS e sem erro (CLAUDE.md §4.6): a tela que
-- marca como lidas precisa pedir a contagem. O `with check` impede a menção de mudar de
-- dono; é redundante com o privilégio por coluna e fica de propósito — se um dia alguém
-- conceder mais colunas, a trava continua.
drop policy if exists mencoes_update_proprias on public.mencoes;
create policy mencoes_update_proprias on public.mencoes
  for update to authenticated
  using (mencionado_id = (select public.get_my_usuario_id()))
  with check (mencionado_id = (select public.get_my_usuario_id()));

-- A intenção fica ESCRITA, e não deduzida da falta de política: ninguém do lado de fora
-- cria nem apaga menção. RESTRITIVAS, para que nenhuma política permissiva futura — nem
-- uma criada à mão pelo painel — passe por cima delas.
drop policy if exists mencoes_so_o_sistema_cria on public.mencoes;
create policy mencoes_so_o_sistema_cria on public.mencoes
  as restrictive
  for insert to anon, authenticated
  with check (false);

drop policy if exists mencoes_ninguem_apaga on public.mencoes;
create policy mencoes_ninguem_apaga on public.mencoes
  as restrictive
  for delete to anon, authenticated
  using (false);

-- Tempo real: é por aqui que o aviso "te mencionou" chega na tela (`useAvisoDeMencao`).
-- O tempo real só entrega a quem a política de leitura acima deixa ler — e só porque ela
-- existe, e o privilégio `select` foi dado, é que o canal não vaza menção de colega.
-- Publicação conferida em 14/09/2026: `supabase_realtime`. `alter publication … add table`
-- dá erro se a tabela já está lá, por isso o `if`.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise warning '[mencao] publicação supabase_realtime não existe: o aviso em tempo real de menção não vai chegar';
  elsif not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'mencoes'
  ) then
    alter publication supabase_realtime add table public.mencoes;
  end if;
end $$;

-- 3. Outra pessoa enxerga esta conversa de WhatsApp? --------------------------------
-- Espelha `can_access_wa_conversa` (20260902170000) para um usuário QUALQUER, e não só para
-- quem está logado: o gatilho pergunta por cada mencionado, e a sessão é de quem escreveu.
-- As três cercas, na mesma ordem da original:
--   1. EMPRESA — a pessoa é da empresa da conversa;
--   2. NÚMERO — atende o número. `wapi_instancia_usuarios` guarda o id de LOGIN: a ponte é
--      `u.user_id`, nunca `u.id`;
--   3. DENTRO DO NÚMERO — dono ou gestor, responsável pela conversa, ou conversa sem
--      responsável (`whatsapp_conversa_responsaveis.usuario_id` é o id INTERNO).
-- Duas diferenças, de propósito:
--   · Conversa SEM número (`instancia_id` nulo): aqui é NINGUÉM. A função da RLS a deixa
--     passar para nenhuma conversa sumir; para menção a regra é "só quem atende o número", e
--     sem número não há quem atenda (decisão de 11/09/2026, plano do Bloco 4).
--   · Usuário EXCLUÍDO (`deleted_at`) ou sem login nunca alcança. A da RLS não precisa olhar
--     isso: quem está logado já passou pelo login.
-- Se `can_access_wa_conversa` mudar, esta muda junto: as duas respondem à mesma pergunta.
create or replace function public.usuario_alcanca_wa_conversa(_usuario_id uuid, _conversa_id uuid)
returns boolean
language sql
stable
security definer   -- lê vínculo de número e responsáveis de TERCEIRO, que a RLS não mostra
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from whatsapp_conversas c
      join usuarios u
        on u.id = _usuario_id
       and u.empresa_id = c.empresa_id
       and u.deleted_at is null
       and u.user_id is not null
     where c.id = _conversa_id
       and c.instancia_id is not null
       and exists (
         select 1 from wapi_instancia_usuarios wiu
          where wiu.instancia_id = c.instancia_id
            and wiu.usuario_auth_id = u.user_id
       )
       and (
         u.role in ('empresa', 'gestor')
         or exists (select 1 from whatsapp_conversa_responsaveis r
                     where r.conversa_id = c.id and r.usuario_id = u.id)
         or not exists (select 1 from whatsapp_conversa_responsaveis r2
                         where r2.conversa_id = c.id)
       )
  );
$$;
-- Só as funções deste arquivo a chamam. Aberta, ela responderia a qualquer logado "o colega
-- X atende a conversa Y?" para qualquer par de ids, inclusive de outra empresa.
revoke all on function public.usuario_alcanca_wa_conversa(uuid, uuid) from public, anon, authenticated;

-- 4. A lista do @ na nota ------------------------------------------------------------
-- 🔴 QUEM PERGUNTA sai de `auth.uid()`, nunca de argumento, e precisa ENXERGAR a conversa
-- antes de a lista sair. A função roda sem RLS: sem essa conferência, qualquer logado com o
-- id de uma conversa de outra empresa leria os nomes da equipe que a atende.
-- Três amarras, e as três ficam:
--   · `can_access_wa_conversa` é a regra da RLS de verdade: se o espelho da §3 um dia
--     divergir, a lista continua não saindo para quem não lê a conversa;
--   · `c.empresa_id = eu.empresa_id` amarra a conversa à empresa de quem pergunta;
--   · `eu.deleted_at is null`: quem foi excluído e ainda tem sessão não lista ninguém.
-- Quem aparece passa pelo espelho da §3, que já tira excluído, sem login e conversa sem
-- número (lista vazia). A própria pessoa sai por `u.id <> eu.id`.
create or replace function public.pessoas_mencionaveis_na_conversa(p_conversa_id uuid)
returns table (id uuid, nome text, avatar_url text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.id, coalesce(u.nome, u.email), u.avatar_url
    from usuarios eu
    join whatsapp_conversas c
      on c.id = p_conversa_id
     and c.empresa_id = eu.empresa_id
    join usuarios u
      on u.empresa_id = c.empresa_id
     and u.id <> eu.id
   where eu.user_id = auth.uid()
     and eu.deleted_at is null
     and public.can_access_wa_conversa(p_conversa_id)
     and public.usuario_alcanca_wa_conversa(u.id, p_conversa_id)
   order by 2, 1;
$$;
-- O padrão do banco dá `execute` a `anon` e `authenticated` em toda função nova; aqui só
-- quem está logado chama.
revoke all on function public.pessoas_mencionaveis_na_conversa(uuid) from public, anon, authenticated;
grant execute on function public.pessoas_mencionaveis_na_conversa(uuid) to authenticated;

-- 5. Gatilho do chat -----------------------------------------------------------------
-- Quem ENXERGA a mensagem, conferido na política `chat_select` em 14/09/2026:
--   · Geral (sem grupo, sem destinatário): todos da empresa;
--   · grupo: os membros (`is_member_of_grupo`). O criador que não é membro NÃO lê;
--   · conversa direta: só os dois — e não tem menção (spec 4.1).
-- A lista vem do cliente e é tratada como PALPITE. Um id só vira menção se a pessoa é da
-- empresa da mensagem, não foi excluída, tem login, não é quem escreveu e enxerga aquela
-- conversa pela regra acima. `@todos` é expandido aqui, pela mesma regra.
create or replace function public.chat_anota_mencoes()
returns trigger
language plpgsql
security definer   -- lê membros de grupo e grava em `mencoes` e `notificacoes`, fora da RLS
set search_path = public, pg_temp
as $$
declare
  v_autor       public.usuarios;
  v_grupo       public.chat_grupos;
  v_escolhidos  uuid[];
  v_todos       boolean;
  v_nome        text;
  v_chave       text;
  v_lugar       text;
  v_previa      text;
  v_link        text;
  v_alvos       uuid[];
  v_descartados integer;
begin
  -- Coluna nula é "ninguém mencionado" (§1). Daqui em diante só estas duas são lidas.
  v_escolhidos := coalesce(new.mencionados, '{}');
  v_todos      := coalesce(new.menciona_todos, false);

  -- Repete o `when` do gatilho de propósito: a função não pode depender de quem a liga.
  if new.recipient_id is not null then return null; end if;  -- conversa direta: sem menção
  if cardinality(v_escolhidos) = 0 and not v_todos then return null; end if;

  -- 🔴 TETO DE 50 ESCOLHIDOS. A tela nunca chega perto: a maior equipe tem hoje 13 pessoas
  -- com login, e o @todos viaja em `menciona_todos`, nunca expandido nesta lista
  -- (`mencionadosNoTexto`, src/lib/mencao.ts). Lista maior só vem de gravação feita fora da
  -- tela, e cada id custa comparação com cada pessoa da empresa. Passou do teto: nenhuma
  -- menção, a mensagem grava normalmente e fica o aviso.
  if cardinality(v_escolhidos) > 50 then
    raise warning '[mencao] chat %: recusada — % pessoas escolhidas, acima do teto de 50', new.id, cardinality(v_escolhidos);
    return null;
  end if;

  -- 🔴 QUEM ESCREVEU. `chat_insert` amarra `usuario_id` e `empresa_id` a quem está logado,
  -- mas gravação feita pelo servidor não passa por ela. Com sessão, o autor TEM de ser a
  -- sessão; e nunca alguém excluído ou de outra empresa.
  select * into v_autor
    from usuarios
   where id = new.usuario_id
     and empresa_id = new.empresa_id
     and deleted_at is null;
  if v_autor.id is null
     or (auth.uid() is not null and v_autor.user_id is distinct from auth.uid()) then
    raise warning '[mencao] chat %: recusada — autor excluído, de outra empresa ou diferente de quem está logado', new.id;
    return null;
  end if;

  if new.grupo_id is null then
    v_chave := 'geral';
    v_lugar := 'no Geral';
  else
    -- `chat_insert` não confere o grupo: sem esta amarra, um grupo de OUTRA empresa daria
    -- nome ao "lugar" desta menção.
    select * into v_grupo
      from chat_grupos
     where id = new.grupo_id
       and empresa_id = new.empresa_id;
    if v_grupo.id is null then
      raise warning '[mencao] chat %: recusada — o grupo % não é da empresa da mensagem', new.id, new.grupo_id;
      return null;
    end if;
    -- Pelo mesmo motivo, quem escreve precisa ser membro. Senão quem está fora do grupo o
    -- usaria para mandar "te mencionou" com trecho a quem está dentro.
    if not exists (select 1 from chat_grupo_membros gm
                    where gm.grupo_id = new.grupo_id and gm.usuario_id = v_autor.id) then
      raise warning '[mencao] chat %: recusada — o autor não é membro do grupo %', new.id, new.grupo_id;
      return null;
    end if;
    v_chave := 'grupo_' || new.grupo_id;
    -- O nome vai no título do sininho: numa linha só e com teto de 80. É a mesma normalização
    -- da prévia (qualquer sequência de espaço, quebra de linha ou tabulação vira um espaço).
    v_nome := nullif(btrim(regexp_replace(coalesce(v_grupo.nome, ''), '\s+', ' ', 'g')), '');
    if char_length(v_nome) > 80 then v_nome := rtrim(left(v_nome, 79)) || '…'; end if;
    v_lugar := 'no grupo ' || coalesce(v_nome, 'sem nome');
  end if;

  select coalesce(array_agg(u.id), '{}')
    into v_alvos
    from usuarios u
   where u.empresa_id = new.empresa_id
     and u.deleted_at is null
     and u.user_id is not null
     and u.id <> v_autor.id
     and (v_todos or u.id = any (v_escolhidos))
     and (new.grupo_id is null
          or exists (select 1 from chat_grupo_membros gm
                      where gm.grupo_id = new.grupo_id and gm.usuario_id = u.id));

  -- Prévia de uma linha e curta, só do texto desta mensagem, que quem foi mencionado lê
  -- na própria conversa. Texto só de espaço (mensagem que é só arquivo) vira nulo.
  v_previa := nullif(left(btrim(regexp_replace(new.conteudo, '\s+', ' ', 'g')), 140), '');
  v_link   := '/chat?conversa=' || v_chave;

  -- O sininho leva o mesmo texto e a mesma prévia do aviso na tela ("te mencionou no Geral",
  -- "te mencionou no grupo X"). Quem o lê é só o mencionado: as políticas restritivas da §1
  -- tiram o registro de menção da vista do gestor (decisão de 14/09/2026).

  with gravadas as (
    insert into mencoes (empresa_id, mencionado_id, autor_id, autor_nome, origem,
                         chat_mensagem_id, conversa_chave, lugar, previa, link)
    select new.empresa_id, a.id, v_autor.id, coalesce(v_autor.nome, v_autor.email), 'chat',
           new.id, v_chave, v_lugar, v_previa, v_link
      from unnest(v_alvos) as a(id)
    on conflict do nothing
    returning mencionado_id
  )
  insert into notificacoes (usuario_id, tipo, titulo, mensagem, link)
  select g.mencionado_id, 'mencao',
         coalesce(v_autor.nome, v_autor.email) || ' te mencionou ' || v_lugar,
         v_previa, v_link
    from gravadas g;

  -- Id escolhido que não virou menção. A lista da tela só oferece quem pode, então isso é
  -- lista desatualizada (alguém saiu do grupo com a tela aberta) ou gravação feita fora da
  -- tela. Não bloqueia nada; deixa rastro. Mencionar a si mesmo não conta.
  select count(*) into v_descartados
    from (select distinct m from unnest(v_escolhidos) as m) x
   where x.m is not null
     and x.m <> v_autor.id
     and not (x.m = any (v_alvos));
  if v_descartados > 0 then
    raise warning '[mencao] chat %: % pessoa(s) escolhida(s) sem acesso a esta conversa ficaram de fora', new.id, v_descartados;
  end if;

  return null;
exception when others then
  -- 🔴 Menção é consequência: NUNCA pode impedir a mensagem de gravar. O bloco desfaz só o que
  -- foi gravado aqui dentro (menções e sininho), e a mensagem fica. Origem, id da mensagem e
  -- grupo vão no aviso para dar para achar a conversa e avisar na mão.
  raise warning '[mencao] chat % (grupo %): menção não anotada: % (%)', new.id, new.grupo_id, sqlerrm, sqlstate;
  return null;
end;
$$;
-- Função de gatilho não é chamável direto, mas o `execute` sobra concedido pelo padrão do
-- banco. O Postgres confere esse privilégio ao CRIAR o gatilho, não a cada disparo.
revoke all on function public.chat_anota_mencoes() from public, anon, authenticated;

-- O `when` decide ANTES de entrar na função: mensagem sem menção, que é quase toda, nem abre
-- o bloco de exceção — que no plpgsql custa uma subtransação por linha.
-- Coluna nula não dispara (§1): `cardinality(null) > 0` é nulo, `null or null` é nulo, e
-- `when` nulo é falso. `menciona_todos` nulo com alguém escolhido dá `null or true`, que é
-- verdadeiro, e a função trata o nulo como falso.
drop trigger if exists chat_anota_mencoes on public.chat_mensagens;
create trigger chat_anota_mencoes
  after insert on public.chat_mensagens
  for each row
  when (new.recipient_id is null and (new.menciona_todos or cardinality(new.mencionados) > 0))
  execute function public.chat_anota_mencoes();

-- 6. Gatilho da nota do WhatsApp ------------------------------------------------------
-- Quem enxerga a nota é quem alcança a conversa (`wa_mensagens_access`), e para menção só
-- quem atende o número: o espelho da §3.
create or replace function public.wa_anota_mencoes()
returns trigger
language plpgsql
security definer   -- lê vínculo de número de terceiros e grava em `mencoes` e `notificacoes`
set search_path = public, pg_temp
as $$
declare
  v_conversa    public.whatsapp_conversas;
  v_autor       public.usuarios;
  v_escolhidos  uuid[];
  v_todos       boolean;
  v_nome        text;
  v_lugar       text;
  v_previa      text;
  v_link        text;
  v_alvos       uuid[];
  v_descartados integer;
begin
  -- Coluna nula é "ninguém mencionado" (§1). Daqui em diante só estas duas são lidas.
  v_escolhidos := coalesce(new.mencionados, '{}');
  v_todos      := coalesce(new.menciona_todos, false);

  -- Repete o `when` do gatilho de propósito. O webhook grava muito nesta tabela.
  if not new.is_nota_interna then return null; end if;
  if new.usuario_id is null then return null; end if;
  if cardinality(v_escolhidos) = 0 and not v_todos then return null; end if;

  -- Mesmo teto de 50 escolhidos do chat, pelo mesmo motivo (§5).
  if cardinality(v_escolhidos) > 50 then
    raise warning '[mencao] nota %: recusada — % pessoas escolhidas, acima do teto de 50', new.id, cardinality(v_escolhidos);
    return null;
  end if;

  -- 🔴 A EMPRESA É A DA CONVERSA, não a que veio na linha. `wa_mensagens_access` só pergunta
  -- se quem grava alcança `conversa_id`; `empresa_id` e `usuario_id` da nota vêm do cliente
  -- sem amarra nenhuma.
  select * into v_conversa from whatsapp_conversas where id = new.conversa_id;
  if v_conversa.id is null or v_conversa.empresa_id is distinct from new.empresa_id then
    raise warning '[mencao] nota %: recusada — a empresa da nota não é a da conversa %', new.id, new.conversa_id;
    return null;
  end if;

  -- 🔴 QUEM ESCREVEU. Como a política não amarra `usuario_id` à sessão, uma nota gravada com o
  -- id de um colega sairia "Colega te mencionou". Com sessão, o autor TEM de ser a sessão; e
  -- nunca alguém excluído ou de outra empresa.
  select * into v_autor
    from usuarios
   where id = new.usuario_id
     and empresa_id = v_conversa.empresa_id
     and deleted_at is null;
  if v_autor.id is null
     or (auth.uid() is not null and v_autor.user_id is distinct from auth.uid()) then
    raise warning '[mencao] nota %: recusada — autor excluído, de outra empresa ou diferente de quem está logado', new.id;
    return null;
  end if;

  -- Quem escreve também precisa atender o número. A conversa sem número cai aqui: não há a
  -- quem mencionar, e a lista da tela já sai vazia.
  if not usuario_alcanca_wa_conversa(v_autor.id, v_conversa.id) then
    raise warning '[mencao] nota %: recusada — o autor não atende o número da conversa %, ou ela não tem número', new.id, new.conversa_id;
    return null;
  end if;

  select coalesce(array_agg(u.id), '{}')
    into v_alvos
    from usuarios u
   where u.empresa_id = v_conversa.empresa_id
     and u.id <> v_autor.id
     and (v_todos or u.id = any (v_escolhidos))
     and usuario_alcanca_wa_conversa(u.id, v_conversa.id);

  -- O nome do contato vai no título do sininho, e há nome de contato com quebra de linha: numa
  -- linha só e com teto de 80, pela mesma normalização da prévia logo abaixo. Normaliza ANTES de
  -- decidir se está vazio — um nome que é só quebra de linha cai no telefone, não em "um contato".
  v_nome := nullif(btrim(regexp_replace(coalesce(v_conversa.nome_contato, ''), '\s+', ' ', 'g')), '');
  v_nome := coalesce(v_nome, nullif(btrim(regexp_replace(coalesce(v_conversa.telefone, ''), '\s+', ' ', 'g')), ''));
  if char_length(v_nome) > 80 then v_nome := rtrim(left(v_nome, 79)) || '…'; end if;
  v_lugar  := 'numa nota da conversa com ' || coalesce(v_nome, 'um contato');
  v_previa := nullif(left(btrim(regexp_replace(new.conteudo, '\s+', ' ', 'g')), 140), '');
  v_link   := '/whatsapp?conversaId=' || v_conversa.id || '&mensagemId=' || new.id;

  -- O sininho leva o mesmo texto e a mesma prévia do aviso na tela ("te mencionou numa nota
  -- da conversa com Y"). Quem o lê é só o mencionado: as políticas restritivas da §1 tiram o
  -- registro de menção da vista do gestor, inclusive do gestor que não atende este número.
  with gravadas as (
    insert into mencoes (empresa_id, mencionado_id, autor_id, autor_nome, origem,
                         wa_mensagem_id, conversa_chave, lugar, previa, link)
    select v_conversa.empresa_id, a.id, v_autor.id, coalesce(v_autor.nome, v_autor.email), 'whatsapp_nota',
           new.id, v_conversa.id::text, v_lugar, v_previa, v_link
      from unnest(v_alvos) as a(id)
    on conflict do nothing
    returning mencionado_id
  )
  insert into notificacoes (usuario_id, tipo, titulo, mensagem, link)
  select g.mencionado_id, 'mencao',
         coalesce(v_autor.nome, v_autor.email) || ' te mencionou ' || v_lugar,
         v_previa, v_link
    from gravadas g;

  -- Mesmo rastro do chat (§5): escolhido que não atende o número ficou de fora.
  select count(*) into v_descartados
    from (select distinct m from unnest(v_escolhidos) as m) x
   where x.m is not null
     and x.m <> v_autor.id
     and not (x.m = any (v_alvos));
  if v_descartados > 0 then
    raise warning '[mencao] nota %: % pessoa(s) escolhida(s) sem acesso a esta conversa ficaram de fora', new.id, v_descartados;
  end if;

  return null;
exception when others then
  -- 🔴 Menção é consequência: NUNCA pode impedir a nota de gravar. Origem, id da nota e
  -- conversa vão no aviso para dar para achar o que se perdeu.
  raise warning '[mencao] nota % (conversa %): menção não anotada: % (%)', new.id, new.conversa_id, sqlerrm, sqlstate;
  return null;
end;
$$;
revoke all on function public.wa_anota_mencoes() from public, anon, authenticated;

-- O `when` é o que protege o webhook: mensagem de cliente, que é quase tudo o que entra
-- nesta tabela, não chega a entrar na função. Coluna nula se comporta como no chat (§5):
-- `when` nulo não dispara.
drop trigger if exists wa_anota_mencoes on public.whatsapp_mensagens;
create trigger wa_anota_mencoes
  after insert on public.whatsapp_mensagens
  for each row
  when (new.is_nota_interna and new.usuario_id is not null
        and (new.menciona_todos or cardinality(new.mencionados) > 0))
  execute function public.wa_anota_mencoes();
