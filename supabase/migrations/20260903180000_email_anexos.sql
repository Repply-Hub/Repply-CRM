-- ============================================================================
-- Anexos no envio de e-mail
-- ============================================================================
--
-- Até aqui o compositor só mandava destinatário, assunto e corpo. Faltava o
-- básico de uma caixa de e-mail: anexar um arquivo. O uso real da representação
-- é anexar catálogo, tabela de preços e proposta em PDF — arquivos de MB, não
-- de KB.
--
-- Os arquivos ficam PRESOS a um rascunho (`email_rascunho_anexos.rascunho_id`),
-- porque a escolha do Lucas foi que fechar e reabrir o rascunho recupere os
-- anexos junto. Quando o e-mail é enviado ou o rascunho descartado, a função
-- `email-enviar` / a tela apagam os arquivos do balde e as linhas.
--
-- Dívida conhecida: rascunho abandonado (nunca enviado, nunca descartado) deixa
-- arquivo no balde. É a mesma situação dos rascunhos hoje, que também não têm
-- faxina automática — fica para um cron depois.
-- ============================================================================

create table public.email_rascunho_anexos (
  id           uuid primary key default gen_random_uuid(),

  -- `on delete cascade`: descartar o rascunho leva as linhas de anexo junto.
  -- Os ARQUIVOS no balde não somem por cascade — quem apaga é a tela/função.
  rascunho_id  uuid not null references public.email_rascunhos(id) on delete cascade,
  empresa_id   uuid not null references public.empresas(id)        on delete cascade,

  -- 🔴 `usuarios(id)`, NÃO `auth.users(id)` — é o mesmo que `email_rascunhos.usuario_id`
  -- espera (`get_my_usuario_id()`). Mandar o outro faz a gravação ser recusada pela
  -- chave estrangeira, em silêncio. Ver CLAUDE.md §4.5.
  usuario_id   uuid not null references public.usuarios(id) on delete cascade,

  nome_arquivo text   not null,
  -- Caminho no balde: `{empresa_id}/{usuario_id}/{rascunho_id}/{uuid}.{ext}`.
  -- As duas primeiras pastas são o que a RLS do balde usa para recusar quem é de
  -- outra empresa/outro usuário — não são organização visual.
  caminho      text   not null unique,
  tamanho      bigint not null,
  mime         text,

  created_at   timestamptz not null default now()
);

create index email_rascunho_anexos_por_rascunho
  on public.email_rascunho_anexos (rascunho_id, created_at);

alter table public.email_rascunho_anexos enable row level security;

-- Anexo de rascunho é PESSOAL, igual ao próprio rascunho: mesmo dentro da mesma
-- empresa ninguém vê o rascunho (nem os anexos) de outro vendedor. `is_admin()`
-- entra pelo mesmo motivo de sempre — suporte/depuração sem trocar de sessão.
create policy email_rascunho_anexos_select on public.email_rascunho_anexos
  for select to authenticated
  using (is_admin() or (empresa_id = get_my_empresa_id() and usuario_id = get_my_usuario_id()));

create policy email_rascunho_anexos_insert on public.email_rascunho_anexos
  for insert to authenticated
  with check (empresa_id = get_my_empresa_id() and usuario_id = get_my_usuario_id());

create policy email_rascunho_anexos_delete on public.email_rascunho_anexos
  for delete to authenticated
  using (is_admin() or (empresa_id = get_my_empresa_id() and usuario_id = get_my_usuario_id()));

comment on table public.email_rascunho_anexos is
  'Arquivos anexados a um rascunho de e-mail. Pessoal (só o dono vê), preso ao rascunho por '
  'FK com cascade. Os binários ficam no balde PRIVADO email-anexos; email-enviar os repassa '
  'ao Nylas via multipart e depois apaga balde + linhas.';

-- ── O balde, PRIVADO desde o nascimento ────────────────────────────────────
--
-- 🔴 Diferente do balde `email-assets` (logo/assinatura), que é público de propósito porque
-- a logo precisa de URL aberta no corpo do e-mail. Anexo é proposta, contrato, tabela de
-- preços — não pode ter URL pública. A leitura para o envio é feita pela função de servidor
-- com a chave de serviço; a tela sobe e remove pela RLS abaixo.
--
-- 20971520 = 20 MB por arquivo. O teto do Nylas para multipart é 25 MB no total do e-mail;
-- 20 por arquivo deixa margem e é o limite que a tela também aplica somando os anexos.
insert into storage.buckets (id, name, public, file_size_limit)
values ('email-anexos', 'email-anexos', false, 20971520)
on conflict (id) do nothing;

-- ── As políticas do balde ──────────────────────────────────────────────────
--
-- Caminho: `{empresa_id}/{usuario_id}/{rascunho_id}/{arquivo}`. As duas primeiras
-- pastas recortam por empresa E por usuário — anexo de rascunho é pessoal, então
-- não basta ser da mesma empresa.
create policy "email_anexos_ler" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'email-anexos'
    and (storage.foldername(name))[1] = get_my_empresa_id()::text
    and (storage.foldername(name))[2] = get_my_usuario_id()::text
  );

create policy "email_anexos_subir" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'email-anexos'
    and (storage.foldername(name))[1] = get_my_empresa_id()::text
    and (storage.foldername(name))[2] = get_my_usuario_id()::text
  );

create policy "email_anexos_apagar" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'email-anexos'
    and (storage.foldername(name))[1] = get_my_empresa_id()::text
    and (storage.foldername(name))[2] = get_my_usuario_id()::text
  );
