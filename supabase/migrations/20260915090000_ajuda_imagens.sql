-- ============================================================================
-- IMAGENS DA PÁGINA DE AJUDA: tabela + balde, gerenciados só pelo admin da plataforma
-- ============================================================================
--
-- O conteúdo da Ajuda (`src/content/ajuda-conteudo.ts`) é o MESMO texto para todas as
-- empresas: não é dado de assinante, é documentação do próprio produto. Por isso as
-- imagens também são globais (uma tabela só, sem `empresa_id`), e só quem administra a
-- plataforma grava (`public.is_admin()`) — gestor de empresa não edita a Ajuda, do mesmo
-- jeito que não edita o texto dela, que vive no código.
--
-- `chave` é o identificador estável de cada espaço de imagem, definido em
-- `topico.imagem.chave` (`src/content/ajuda-conteudo.ts`). Trocar a chave de um tópico já
-- publicado deixa a imagem enviada órfã na tabela; ao renomear uma chave, apague a linha
-- antiga junto.

create table public.ajuda_imagens (
  chave          text primary key,
  path           text not null,
  atualizado_em  timestamptz not null default now(),
  -- 🔴 `usuarios(id)`, NÃO `auth.users(id)` — ver CLAUDE.md §4.5. `profile.id` é quem manda.
  atualizado_por uuid references public.usuarios(id)
);

alter table public.ajuda_imagens enable row level security;

-- Leitura: qualquer pessoa logada, de qualquer empresa — a página de Ajuda é a mesma para
-- todo mundo.
create policy ajuda_imagens_select on public.ajuda_imagens
  for select to authenticated
  using (true);

-- Escrita (inserir, atualizar, apagar): só o admin da plataforma.
create policy ajuda_imagens_all_admin on public.ajuda_imagens
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

comment on table public.ajuda_imagens is
  'Um print por espaço reservado da página de Ajuda, identificado por `chave` (ver '
  'topico.imagem.chave em src/content/ajuda-conteudo.ts). Global, não por empresa. Só '
  'is_admin() grava — a Ajuda é documentação do produto, não dado do assinante.';

-- ────────────────────────────────────────────────────────────────────────────
-- O balde de armazenamento
-- ────────────────────────────────────────────────────────────────────────────
--
-- Público, como o `branding` (20260831140000): a imagem é renderizada direto numa página
-- que toda pessoa logada vê, sem ligação com relatório exportável que precisasse de link
-- assinado. Só PNG/JPEG/WEBP — fecha a porta do SVG (é XML, pode carregar script; balde
-- público, domínio nosso: CLAUDE.md §6.2, mesmo motivo do `branding`).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ajuda-imagens', 'ajuda-imagens', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];

create policy "Imagens da ajuda sao publicas para leitura"
on storage.objects for select to public
using (bucket_id = 'ajuda-imagens');

create policy "So o admin da plataforma grava no balde da ajuda"
on storage.objects for insert to authenticated
with check (bucket_id = 'ajuda-imagens' and (select public.is_admin()));

create policy "So o admin da plataforma atualiza no balde da ajuda"
on storage.objects for update to authenticated
using (bucket_id = 'ajuda-imagens' and (select public.is_admin()))
with check (bucket_id = 'ajuda-imagens' and (select public.is_admin()));

create policy "So o admin da plataforma apaga no balde da ajuda"
on storage.objects for delete to authenticated
using (bucket_id = 'ajuda-imagens' and (select public.is_admin()));
