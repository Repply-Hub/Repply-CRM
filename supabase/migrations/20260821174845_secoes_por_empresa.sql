-- Controle de acesso a seções por empresa
--
-- Até aqui não existia NENHUM controle: nem tabela, nem tela, nem política. O único
-- mecanismo parecido (`sidebar_empresa_padrao`) só desenha o menu — a rota continua
-- alcançável digitando o endereço e os dados continuam chegando. Medido em 21/08/2026:
-- só 2 das 8 empresas tinham menu salvo, então as outras 6 viam o Portal.
--
-- EIXO: este é o controle POR EMPRESA — o que EXISTE para aquele assinante. NÃO confundir
-- com `permissoes_usuario` (128 linhas), `permissao_presets` (32 linhas) e
-- `has_funcionalidade(_usuario_id, _modulo, _funcionalidade)`, que são POR USUÁRIO — quem
-- VÊ, dentro do que existe. Os dois eixos convivem e não se tocam. Daí o prefixo `secao_`.
--
-- DECISÃO DE PRODUTO (21/08/2026): nenhuma exceção nasce aqui. As 8 empresas, MD inclusive,
-- entram no preset padrão (tudo menos o Portal). O dono do produto liga o Portal para a MD
-- pela tela de admin, depois de pronta. Por isso `secao_excecoes` nasce VAZIA — e a trava
-- do Portal (migration separada) só pode entrar DEPOIS disso, senão a MD fica sem Portal
-- e sem caminho de volta que não seja mexer no banco à mão.

-- ---------------------------------------------------------------- presets

create table public.secao_presets (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  descricao   text,
  is_padrao   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Um padrão só. Sem isto, duas linhas marcadas como padrão fariam a resolução depender da
-- ordem de leitura — e o bug só apareceria quando alguém criasse o segundo preset.
create unique index secao_presets_um_padrao_so
  on public.secao_presets (is_padrao) where is_padrao;

create table public.secao_preset_itens (
  preset_id   uuid not null references public.secao_presets(id) on delete cascade,
  secao       text not null,
  habilitada  boolean not null default true,
  primary key (preset_id, secao)
);

-- ---------------------------------------------------------------- empresa → preset

-- Nullable de propósito: empresa sem preset apontado cai no padrão (ver empresa_tem_secao).
-- Não existe estado "sem regra" — empresa criada por um caminho que ninguém previu nasce
-- no comportamento seguro.
alter table public.empresas
  add column if not exists secao_preset_id uuid references public.secao_presets(id);

-- ---------------------------------------------------------------- exceções

create table public.secao_excecoes (
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  secao       text not null,
  habilitada  boolean not null,
  criada_em   timestamptz not null default now(),
  criada_por  uuid references auth.users(id),
  primary key (empresa_id, secao)
);

-- ---------------------------------------------------------------- RLS
-- Escrita: só admin global. Leitura: qualquer autenticado — o app precisa perguntar, e não
-- há segredo aqui (estas tabelas dizem quais telas existem, não conteúdo de ninguém).

alter table public.secao_presets      enable row level security;
alter table public.secao_preset_itens enable row level security;
alter table public.secao_excecoes     enable row level security;

create policy secao_presets_select      on public.secao_presets      for select to authenticated using (true);
create policy secao_presets_write       on public.secao_presets      for all    to authenticated using (is_admin()) with check (is_admin());

create policy secao_preset_itens_select on public.secao_preset_itens for select to authenticated using (true);
create policy secao_preset_itens_write  on public.secao_preset_itens for all    to authenticated using (is_admin()) with check (is_admin());

-- Exceção: cada empresa lê só as suas; só admin escreve.
create policy secao_excecoes_select     on public.secao_excecoes     for select to authenticated
  using (empresa_id = get_my_empresa_id() or is_admin());
create policy secao_excecoes_write      on public.secao_excecoes     for all    to authenticated
  using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------- a pergunta única

-- Resolve na ordem: exceção da empresa → preset da empresa (ou o padrão) → ligada.
--
-- SECURITY DEFINER porque será chamada de dentro de políticas de RLS de OUTRAS tabelas
-- (as do Portal), e ali não pode depender das políticas destas.
--
-- O coalesce final devolve TRUE de propósito. É isso que impede a publicação de tirar as
-- 11 seções de todo mundo enquanto a tabela não estiver preenchida. O preço é que uma
-- seção NOVA esquecida nos presets nasce ligada — a consulta de verificação do plano de
-- execução acusa esse caso, e a regra é: a mesma migration que cria a seção acrescenta a
-- linha dela em todos os presets.
--
-- Admin global não tem empresa: get_my_empresa_id() devolve null, nenhum ramo casa e o
-- coalesce libera. É o comportamento certo — o admin não opera o CRM de ninguém (o
-- ProtectedRoute o manda para /admin/empresas), então liberar aqui não expõe nada.
create or replace function public.empresa_tem_secao(p_secao text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select x.habilitada
       from secao_excecoes x
      where x.empresa_id = get_my_empresa_id()
        and x.secao = p_secao),

    (select i.habilitada
       from secao_preset_itens i
      where i.secao = p_secao
        and i.preset_id = coalesce(
              (select e.secao_preset_id from empresas e where e.id = get_my_empresa_id()),
              (select p.id from secao_presets p where p.is_padrao limit 1))),

    true
  );
$$;

-- Versão em lote, para o app perguntar UMA vez em vez de doze. A cascata consulta em
-- dezenas de pontos de tela; uma chamada por ponto multiplicaria a conta por nada.
create or replace function public.minhas_secoes()
returns table (secao text, habilitada boolean)
language sql
stable
security definer
set search_path to 'public'
as $$
  select s.secao, public.empresa_tem_secao(s.secao)
    from (
      select unnest(array[
        'dashboard','pipeline','clientes','obras','fabricantes','portal',
        'calendario','tarefas','chat','whatsapp','emails','configuracoes'
      ]) as secao
    ) s;
$$;

revoke all on function public.empresa_tem_secao(text) from public;
revoke all on function public.minhas_secoes() from public;
grant execute on function public.empresa_tem_secao(text) to authenticated;
grant execute on function public.minhas_secoes() to authenticated;

-- ---------------------------------------------------------------- o preset padrão

insert into public.secao_presets (nome, descricao, is_padrao)
values ('Padrão', 'Tudo o que o sistema faz hoje, menos o Portal de Consultas.', true);

insert into public.secao_preset_itens (preset_id, secao, habilitada)
select p.id, v.secao, v.habilitada
  from public.secao_presets p,
       (values
          ('dashboard',    true),
          ('pipeline',     true),
          ('clientes',     true),
          ('obras',        true),
          ('fabricantes',  true),
          ('portal',       false),   -- <<< a única desligada
          ('calendario',   true),
          ('tarefas',      true),
          ('chat',         true),
          ('whatsapp',     true),
          ('emails',       true),
          ('configuracoes',true)
       ) as v(secao, habilitada)
 where p.is_padrao;

-- TODAS as empresas, MD inclusive, apontam para o padrão (decisão de produto de 21/08).
update public.empresas
   set secao_preset_id = (select id from public.secao_presets where is_padrao)
 where secao_preset_id is null;

-- `secao_excecoes` fica VAZIA de propósito. A primeira linha dela nasce pela tela de
-- admin, quando o dono do produto ligar o Portal para a MD. Semear aqui pouparia um clique
-- e deixaria o caminho da tela sem ser exercitado antes de virar o único caminho.
