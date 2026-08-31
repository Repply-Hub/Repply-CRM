-- ============================================================================
-- A logo da empresa: um balde com regra por EMPRESA, e não por pessoa.
--
-- 🔴 O QUE ESTAVA ABERTO, medido em 31/08/2026:
--
--   · o balde `branding` já existia (público, 5 MB, VAZIO) mas nasceu pelo painel do Supabase,
--     sem migration nenhuma — o mesmo caminho que produziu o vazamento da `webhook_debug`
--     (CLAUDE.md §6.2). Este arquivo é o que traz ele para o repositório.
--   · a regra de GRAVAÇÃO dele era `bucket_id = 'branding' AND auth.role() = 'authenticated'`.
--     Sem nenhuma condição de caminho: qualquer pessoa logada, de qualquer uma das 10
--     empresas, gravava em qualquer pasta — inclusive plantando um arquivo na pasta de uma
--     empresa que ainda não tinha subido a sua.
--   · as regras de ATUALIZAR e APAGAR usavam a pasta do USUÁRIO (`auth.uid()`), não da
--     empresa. Numa logo de empresa isso é o recorte errado: quem sobe é uma pessoa, mas quem
--     é dono é a empresa, e o gestor seguinte não conseguiria trocar a logo que o anterior
--     subiu.
--
-- E o balde `email-assets` tinha o mesmo furo com nome próprio: `email_assets_write` liberava
-- gravar, atualizar e APAGAR o caminho literal `logo-email.png` para todo mundo logado. Um
-- gestor da JHS apagava a logo da MD num clique. Conferido: esse arquivo nunca chegou a
-- existir — ninguém usou aquele campo —, então tirá-lo daqui não quebra nada.
--
-- 🔴 SÓ PNG ENTRA. O `allowed_mime_types` fecha a porta do SVG, que é XML e pode carregar
-- script — servido de um balde público, num domínio nosso, isso é buraco de segurança. A tela
-- converte o que a pessoa escolher (JPG, WEBP, o que for) para PNG antes de enviar, então a
-- restrição não recusa arquivo legítimo de ninguém.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. O balde, agora no repositório
-- ────────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', true, 5242880, array['image/png'])
on conflict (id) do update
  set public = true,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/png'];

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Leitura pública — e por quê
-- ────────────────────────────────────────────────────────────────────────────
--
-- O PDF é montado NO NAVEGADOR de quem exporta, e a logo precisa entrar nele por uma URL que
-- o `canvas` aceite. Link assinado expira: um relatório salvo hoje e reaberto semana que vem
-- perderia a imagem. E logo de empresa não é segredo comercial — é o que a empresa estampa em
-- catálogo e cartão. A decisão de manter `branding` aberto já estava registrada em
-- `docs/operacao/plano-baldes-privados.md` §8; aqui ela só passa a existir em migration.
drop policy if exists "Logos são acessíveis publicamente" on storage.objects;
create policy "Logos são acessíveis publicamente"
on storage.objects for select to public
using (bucket_id = 'branding');

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Escrita: a pasta é da EMPRESA, e quem escreve é gestor
-- ────────────────────────────────────────────────────────────────────────────
--
-- O caminho é `<empresa_id>/logo.png`, seguindo a convenção que os outros baldes deste projeto
-- já usam (`pedido-anexos`, `whatsapp-media`): identificador da empresa na primeira pasta.
--
-- `is_gestor()` cobre os papéis 'gestor', 'admin' e 'empresa' — os mesmos que veem a aba
-- "Empresa" das configurações. Um vendedor não troca a marca da empresa.

drop policy if exists "Usuários autenticados podem fazer upload de logos" on storage.objects;
drop policy if exists "Usuários podem atualizar seus próprios logos" on storage.objects;
drop policy if exists "Usuários podem deletar seus próprios logos" on storage.objects;

create policy "Gestor grava a logo da propria empresa"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'branding'
  and (
    (
      (storage.foldername(name))[1] = (select public.get_my_empresa_id())::text
      and (select public.is_gestor())
    )
    -- O operador da plataforma também, para conseguir subir a logo de um cliente que pediu
    -- ajuda. É a mesma escapatória que todas as outras políticas deste banco têm.
    or (select public.is_admin())
  )
);

create policy "Gestor troca a logo da propria empresa"
on storage.objects for update to authenticated
using (
  bucket_id = 'branding'
  and (
    (
      (storage.foldername(name))[1] = (select public.get_my_empresa_id())::text
      and (select public.is_gestor())
    )
    -- O operador da plataforma também, para conseguir subir a logo de um cliente que pediu
    -- ajuda. É a mesma escapatória que todas as outras políticas deste banco têm.
    or (select public.is_admin())
  )
)
with check (
  bucket_id = 'branding'
  and (
    (
      (storage.foldername(name))[1] = (select public.get_my_empresa_id())::text
      and (select public.is_gestor())
    )
    -- O operador da plataforma também, para conseguir subir a logo de um cliente que pediu
    -- ajuda. É a mesma escapatória que todas as outras políticas deste banco têm.
    or (select public.is_admin())
  )
);

create policy "Gestor apaga a logo da propria empresa"
on storage.objects for delete to authenticated
using (
  bucket_id = 'branding'
  and (
    (
      (storage.foldername(name))[1] = (select public.get_my_empresa_id())::text
      and (select public.is_gestor())
    )
    -- O operador da plataforma também, para conseguir subir a logo de um cliente que pediu
    -- ajuda. É a mesma escapatória que todas as outras políticas deste banco têm.
    or (select public.is_admin())
  )
);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Tira o caminho global de dentro da regra do balde de e-mail
-- ────────────────────────────────────────────────────────────────────────────
--
-- `logo-email.png` era um caminho único para as 10 empresas. A partir de agora a assinatura de
-- e-mail usa a MESMA logo do PDF (`empresas.logo_url`), então esse caminho deixa de existir —
-- e mantê-lo na regra só preservaria o furo. Os outros dois braços continuam intactos: a
-- assinatura pessoal (`assinaturas/<user_id>.png`) e as imagens embutidas por empresa
-- (`inline/<empresa_id>/...`), que somam os 251 arquivos que o balde tem hoje.
drop policy if exists email_assets_write on storage.objects;
create policy email_assets_write
on storage.objects for all to authenticated
using (
  bucket_id = 'email-assets'
  and (
    name = 'assinaturas/' || (select auth.uid())::text || '.png'
    or (
      (storage.foldername(name))[1] = 'inline'
      and (storage.foldername(name))[2] = (select public.get_my_empresa_id())::text
    )
  )
)
with check (
  bucket_id = 'email-assets'
  and (
    name = 'assinaturas/' || (select auth.uid())::text || '.png'
    or (
      (storage.foldername(name))[1] = 'inline'
      and (storage.foldername(name))[2] = (select public.get_my_empresa_id())::text
    )
  )
);

comment on column public.empresas.logo_url is
  'URL publica da logo da empresa, no balde branding, caminho <empresa_id>/logo.png. Usada no '
  'cabecalho dos PDFs exportados e na assinatura de e-mail. Nula para quem ainda nao subiu.';
