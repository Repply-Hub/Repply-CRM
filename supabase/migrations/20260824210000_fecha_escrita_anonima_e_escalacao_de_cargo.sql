-- ============================================================================
-- Fecha três portas do banco que ninguém vê na tela.
--
-- Nenhum dos três consertos muda comportamento de uso normal: foi tudo medido
-- na produção em 24/08/2026 ANTES de escrever, e o que passa a ser recusado é
-- exatamente o que nenhuma parte do código faz hoje.
--
--   A) `chat-files` aceitava escrita e exclusão ANÔNIMA.
--   B) duas regras de exclusão diziam "seus próprios" e só conferiam o balde.
--   C) um gestor podia gravar 'admin' na linha de outro usuário da equipe.
--
-- O porquê de A e C andarem juntos: os dois são a mesma falha de origem —
-- alguém mexeu direto no painel, sem migration, e o banco ficou diferente do
-- que o repositório diz. Ver CLAUDE.md §6.2 (o caso `webhook_debug`).
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- A) chat-files: derruba a regra anônima e REPÕE as três originais
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Medido em `pg_policies` em 24/08/2026:
--   "Temporary full access to chat files" — cmd=ALL, roles={public},
--   USING e WITH CHECK = apenas `bucket_id = 'chat-files'`. Sem checagem de
--   autenticação nenhuma. Quem descobrisse a URL do projeto gravava e APAGAVA
--   os 215 arquivos de anexo do chat sem nunca ter feito login.
--
-- 🔴 A armadilha: essa regra "temporária" é a ÚNICA regra de escrita que
--    sobrou no balde. As três originais — criadas em
--    `20260413200054_5e75d3d2-07cb-40ab-acd3-01d0a27a9628.sql` (INSERT/SELECT/
--    DELETE) e `20260424231111_e48bde20-2e4a-4cd5-9c69-39628aa67c93.sql`
--    (UPDATE) — NÃO existem mais em `pg_policies`. Foram trocadas por esta,
--    pelo painel. Derrubar sem repor apaga o envio de anexo no chat na hora.
--    Por isso as duas coisas moram no mesmo arquivo: o `drop` e os `create`
--    entram na mesma transação, e não existe instante em que o balde fique
--    sem regra de escrita.
--
-- A condição de dono continua sendo a primeira pasta do caminho, porque é o
-- formato que o código de hoje grava — `${user.id}/...` em todos os quatro
-- pontos de envio (`src/hooks/use-chat.ts:204,332,505` e
-- `src/components/chat/CreateGroupDialog.tsx:99`). Conferido no banco: dos
-- 215 objetos do balde, 215 têm a primeira pasta igual a um usuário de
-- verdade e igual ao `owner_id`. Cobertura de 100%, zero exceção.

drop policy if exists "Temporary full access to chat files" on storage.objects;

-- INSERT. O original conferia só o balde; aqui vai junto a pasta do próprio
-- usuário. Não é invenção: é a mesma forma que o balde `avatars` já usa em
-- produção, e os 215 arquivos existentes já obedecem. O que isso fecha é um
-- usuário logado plantar arquivo dentro da pasta de outro — que é como se
-- forja "anexo enviado por fulano".
drop policy if exists "Authenticated users can upload chat files" on storage.objects;
create policy "Authenticated users can upload chat files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'chat-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- UPDATE. O original não trazia WITH CHECK; o Postgres, nesse caso, reusa o
-- USING como checagem de destino. Está escrito aqui de forma explícita só para
-- que a regra fique legível — o efeito é o mesmo de hoje: ninguém consegue
-- renomear um arquivo para fora da própria pasta.
drop policy if exists "Users can update own chat files" on storage.objects;
create policy "Users can update own chat files"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'chat-files'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'chat-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- DELETE, idêntico ao original.
drop policy if exists "Users can delete own chat files" on storage.objects;
create policy "Users can delete own chat files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'chat-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- A leitura pública ("Public read access for chat files") continua como está.
-- O balde é público e o app monta `getPublicUrl` — mexer nela apagaria as
-- imagens já enviadas nas conversas. Não é o assunto deste arquivo.


-- ─────────────────────────────────────────────────────────────────────────────
-- B) Exclusão entre empresas: `pedido-anexos` e `whatsapp-media`
-- ─────────────────────────────────────────────────────────────────────────────
--
-- As duas regras diziam "seus próprios" no nome e conferiam só `bucket_id`.
-- Na prática: qualquer pessoa logada, de QUALQUER empresa assinante, apagava
-- os 14.997 anexos de negócio e as 6.399 mídias de WhatsApp de todas as
-- outras. É o pior tipo de furo de multi-empresa, porque não vaza dado — some.
--
-- ⚠️ O caminho desses arquivos NÃO segue um formato só. Medido antes de
--    escrever a condição, e é isso que decide a regra:
--
--    pedido-anexos (14.997):
--      · 14.957 em `<empresa_id>/<uuid>-anexo.ext` — vieram da função de
--        borda `resolve-pedido-anexo` (reidratação do Bitrix), que roda como
--        serviço e por isso deixou `owner_id` vazio;
--      ·     22 em `<uuid aleatório>/<nome do arquivo>` — envio pelo app
--        (`NovoNegocioDialog.tsx:358` e `EditarPedido.tsx:324` usam
--        `crypto.randomUUID()` como pasta), com `owner_id` preenchido;
--      ·     18 soltos na raiz, também com `owner_id`.
--
--    whatsapp-media (6.399):
--      · 5.496 em `incoming/<empresa_id>/...` — gravadas pelo webhook
--        (`whatsapp-webhook/index.ts:177`), `owner_id` vazio;
--      ·   903 em `<conversa_id>/...` — envio pelo app
--        (`use-whatsapp-inbox.ts:653`), `owner_id` preenchido.
--
-- 🔴 Ou seja: a pasta do `pedido-anexos` do app é um UUID SORTEADO. Ela não
--    carrega empresa nem usuário. Uma condição só de caminho
--    (`(storage.foldername(name))[1] = ...`) recusaria os 22 arquivos que o
--    app subiu — seria trocar um buraco por uma tela quebrada. Por isso a
--    condição tem dois braços: o dono (`owner_id`) cobre o que veio do app, e
--    a pasta de empresa cobre o que veio do serviço. Conferido: essa dupla
--    cobre 14.997 de 14.997 e 6.398 de 6.399.
--
--    O 1 que sobra é `incoming/c555033c-.../1781712157083-4E11A5AF6A.ogg`,
--    3,7 KB, de 17/06/2026: o `c555033c` não existe mais em `empresas`. É
--    lixo de uma empresa apagada. Fica sem dono e ninguém apaga pela tela —
--    o que é o certo, e é limpeza de serviço, não de política.
--
-- Nada no app apaga desses dois baldes hoje (a única chamada de `.remove()`
-- do repositório inteiro é em `Configuracoes.tsx:323`, e é no balde
-- `email-assets`). Então apertar aqui não tira função nenhuma de ninguém:
-- só fecha o que estava aberto. E `EditarPedido.tsx:145` até documenta que
-- trocar o anexo de um negócio deixa o arquivo antigo no balde de propósito.

drop policy if exists "Usuários autenticados podem excluir seus próprios anexos" on storage.objects;
create policy "Usuários autenticados podem excluir seus próprios anexos"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'pedido-anexos'
  and (
    -- quem subiu pelo app apaga o que subiu
    owner_id = auth.uid()::text
    -- arquivo reidratado fica com a empresa dona da pasta
    or (storage.foldername(name))[1] = public.get_my_empresa_id()::text
    -- o operador da plataforma continua podendo limpar
    or public.is_admin()
  )
);

drop policy if exists "auth_delete_whatsapp_media" on storage.objects;
create policy "auth_delete_whatsapp_media"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'whatsapp-media'
  and (
    owner_id = auth.uid()::text
    or (
      (storage.foldername(name))[1] = 'incoming'
      and (storage.foldername(name))[2] = public.get_my_empresa_id()::text
    )
    or public.is_admin()
  )
);


-- ─────────────────────────────────────────────────────────────────────────────
-- C) Escalada de cargo
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Medido, e reproduzido em transação revertida em 24/08/2026: a gestora
-- Fabiola (role 'gestor', empresa MD Representações) gravou role='admin' na
-- linha de um vendedor da equipe dela, e o banco aceitou.
--
-- O que isso vale: `is_admin()` é usada em 84 políticas de 27 tabelas, e em
-- todas ela aparece como `is_admin() OR (…recorte de empresa…)`. Quer dizer:
-- 'admin' não é "um cargo mais alto dentro da empresa" — é a chave que
-- DESLIGA o recorte por empresa no sistema inteiro. Uma gravação de texto na
-- coluna `role` entrega a carteira de todas as empresas assinantes.
--
-- 🔴 POR QUE NÃO TEM CHECK NEM DOMÍNIO NA COLUNA `role`.
--    A ideia é a primeira que ocorre e ela QUEBRARIA O PRODUTO. Existe uma
--    tela viva — `src/components/configuracoes/PerfilSelect.tsx`, botão
--    "Novo perfil..." — em que o gestor digita o nome de um cargo, o app
--    monta um `slug` (minúsculas, espaço vira `_`), grava em
--    `perfis_customizados` e passa a oferecer aquele valor no seletor de
--    perfil. Não é hipótese: `líder_comercial` nasceu assim, em 02/07/2026, e
--    hoje é o cargo da Érika Marques — 3.772 negócios na conta dela. Uma
--    lista fixa de valores recusaria o PRÓXIMO cargo que qualquer cliente
--    criasse, com erro de banco na cara do usuário. A coluna é texto livre de
--    propósito; o problema nunca foi a liberdade, foi UM valor específico.
--
--    (De quebra, isso mostra o caminho mais curto da escalada hoje: o gestor
--    não precisa nem de SQL — cria um perfil chamado "Admin", o app calcula o
--    slug 'admin', ele escolhe no seletor e pronto. O gatilho abaixo fecha
--    esse caminho junto com os outros, porque ele olha o valor que está sendo
--    gravado, não de onde o valor veio.)
--
-- 🔴 POR QUE UM GATILHO IRMÃO E NÃO UMA REESCRITA DE
--    `impedir_auto_escalacao_usuario`.
--    Aquele gatilho tem duas saídas antecipadas, e as duas são deliberadas:
--
--      1. `auth.uid() IS NULL` → passa direto. Isso é o que deixa o cadastro
--         de conta novo funcionar: `handle_new_user()` roda dentro do INSERT
--         em `auth.users`, sem sessão, e grava role e empresa_id (inclusive
--         num `ON CONFLICT DO UPDATE`). Sem essa saída, ninguém mais se
--         cadastra. Vale para a importação e para as funções de borda também.
--      2. `OLD.user_id <> auth.uid()` → passa direto, porque o trabalho DELE
--         é só "ninguém se promove sozinho". Linha dos outros não é assunto
--         dele.
--
--    A saída nº 2 é justamente onde mora o furo — mas ela não é um bug: é o
--    recorte daquele gatilho. Reescrevê-lo para cuidar das duas coisas mistura
--    duas regras diferentes num `IF` só e faz a nº 1 ficar mais difícil de
--    enxergar. Então este arquivo acrescenta um SEGUNDO gatilho, com a mesma
--    saída nº 1 (que é a que protege o cadastro) e sem a nº 2 (que é a que
--    precisa cair). O de cima cuida da própria linha; o de baixo, da linha
--    dos outros.
--
-- ⚠️ O que este gatilho NÃO faz, de propósito:
--    · não impede gestor de gerir a própria equipe. Promover de 'vendedor'
--      para 'líder_comercial', para 'gestor' ou para 'empresa' continua
--      passando — nenhum desses valores atravessa a fronteira da empresa
--      (`is_gestor()` = role em ('gestor','admin','empresa'), e as políticas
--      de `usuarios` já prendem o gestor em `empresa_id = get_my_empresa_id()`);
--    · não tranca o Admin Master. Ele É o único 'admin' do banco
--      (`user_id 0b721064-ab64-45c5-a23c-02b949639f2c`, sem empresa), e todas
--      as recusas abaixo abrem para `is_admin()`.
--
-- As mesmas três regras já existem, escritas à mão, dentro de
-- `restaurar_usuario_por_email()`. Alguém já tinha acertado num caminho só. O
-- gatilho é o que faz valer no caminho que a tela de usuários usa de verdade
-- (`UsuariosTab.tsx:49`, um `update` direto na tabela).

create or replace function public.impedir_escalacao_cargo_usuario()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  -- Mesma saída antecipada do gatilho irmão, e pelo mesmo motivo: sem sessão
  -- é cadastro de conta, importação ou função de borda. Tirar isso daqui
  -- derruba `handle_new_user()` e, com ele, o cadastro de cliente novo.
  if auth.uid() is null then
    return new;
  end if;

  -- 1) Conceder 'admin' é privilégio de quem já é 'admin'.
  --    O valor comparado é o literal exato, porque é exatamente esse literal
  --    que `is_admin()` procura — 'Admin' ou 'ADMIN' não dão poder nenhum e
  --    não precisam ser barrados.
  if new.role = 'admin'
     and (tg_op = 'INSERT' or old.role is distinct from 'admin')
     and not public.is_admin() then
    raise exception 'Só um administrador da plataforma pode dar o perfil "admin" a alguém.'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    -- 2) Tirar 'admin' de alguém também. Sem isso, o dia em que existir um
    --    admin dentro de uma empresa, o gestor de lá o rebaixa.
    if old.role = 'admin'
       and new.role is distinct from 'admin'
       and not public.is_admin() then
      raise exception 'Só um administrador da plataforma pode tirar o perfil "admin" de alguém.'
        using errcode = '42501';
    end if;

    -- 3) Mudar alguém de empresa. Este é o passo que leva à carteira da
    --    outra empresa, e é o que hoje `is_admin()` sozinho já permitia sem
    --    nenhum recorte. As políticas de `usuarios` já prendem o gestor
    --    (`empresa_id = get_my_empresa_id()` no USING e no WITH CHECK); a
    --    trava aqui é para a regra sobreviver a uma política afrouxada.
    if new.empresa_id is distinct from old.empresa_id
       and not public.is_admin() then
      raise exception 'Só um administrador da plataforma pode mudar um usuário de empresa.'
        using errcode = '42501';
    end if;

    -- 4) Repontar o vínculo de autenticação de OUTRA pessoa. É como se
    --    apoderar da conta dela — `is_admin()`, `is_gestor()` e
    --    `get_my_empresa_id()` todas resolvem por `user_id = auth.uid()`.
    --    Nenhuma tela manda essa coluna: a edição de usuário só envia nome,
    --    email, telefone e perfil (`UsuariosTab.tsx:44`).
    if new.user_id is distinct from old.user_id
       and not public.is_admin() then
      raise exception 'Só um administrador da plataforma pode alterar o vínculo de acesso de outro usuário.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.impedir_escalacao_cargo_usuario() is
  'Irmão de impedir_auto_escalacao_usuario(): aquele cuida da PRÓPRIA linha, '
  'este cuida da linha dos outros. Guarda os quatro movimentos que atravessam '
  'a fronteira da empresa — conceder admin, tirar admin, mudar de empresa e '
  'repontar o vínculo de acesso. Papel comum (vendedor, gestor, empresa e os '
  'perfis criados pelo cliente) não passa por aqui de propósito: a coluna role '
  'é texto livre porque a tela "Novo perfil..." deixa o cliente inventar cargo.';

drop trigger if exists trg_impedir_escalacao_cargo_usuario on public.usuarios;
create trigger trg_impedir_escalacao_cargo_usuario
  before insert or update on public.usuarios
  for each row execute function public.impedir_escalacao_cargo_usuario();
