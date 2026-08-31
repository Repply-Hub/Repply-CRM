-- ============================================================================
-- Fase 2 de segurança: 4 gaps críticos de isolamento entre usuários/empresas
-- ============================================================================
--
-- Auditoria completa (read-only) e o desenho desta correção estão registrados na
-- conversa que originou esta migration. Resumo de cada item:
--
-- 1) clientes: duas gerações de policy convivendo (item 13 de docs/divida-tecnica.md).
--    "Acesso por empresa" (FOR ALL, maio/2026) não exige papel nenhum e, por ser
--    PERMISSIVE, soma acesso com clientes_delete (is_gestor(), abril/2026) — a soma
--    vale a mais permissiva, então qualquer vendedor autenticado da empresa conseguia
--    excluir qualquer cliente. É o gêmeo exato do bug corrigido em `pedidos` na
--    migration 20260824143000_pedidos_rls_fase_zero.sql; aquela migration já dizia,
--    no próprio cabeçalho, que faltava replicar a correção aqui. clientes_select/
--    insert/update/delete (abril/2026) já são as regras corretas e não precisam ser
--    recriadas — só falta apagar a policy antiga.
--
-- 2) bucket pedido-anexos: leitura pública total (mesmo anônimo) e escrita sem
--    checagem de empresa. Medido em 26/08/2026: 5.175 pedidos com anexo no bucket,
--    5.163 já gravados como "{empresa_id}/..." (fluxo de importação/resolve-pedido-
--    anexo) e 12 como "{uuid-aleatório}/..." (upload manual, anterior a esta correção
--    — ficam acessíveis só a quem enviou, via owner_id).
--
-- 3) função resolve-pedido-anexo: corrigida à parte no código da function (recebe
--    empresaId do corpo da requisição e passa a conferir contra o usuário do JWT).
--    Nada aqui depende de migration.
--
-- 4) bucket email-assets: escrita liberada para qualquer autenticado, sem checar
--    dono/empresa, nas duas convenções de caminho que carregam identidade real
--    (assinaturas/{userId}.png e inline/{empresa_id}/...). O arquivo logo-email.png
--    (único, compartilhado por TODAS as empresas — achado novo, fora do escopo desta
--    fase) fica com o comportamento de hoje, registrado como pendência separada em
--    docs/divida-tecnica.md.
--
-- Leitura pública do bucket email-assets é MANTIDA de propósito: a logo/assinatura
-- vai embutida em <img> de e-mail para o cliente final, que nunca está logado no CRM.
-- ============================================================================

-- ---------- 1. clientes: remove a policy legada que anulava clientes_delete ----------

DROP POLICY IF EXISTS "Acesso por empresa" ON public.clientes;

-- ---------- 2. bucket pedido-anexos: escopo de empresa, leitura deixa de ser pública ----------

DROP POLICY IF EXISTS "Qualquer um pode ver anexos de pedidos" ON storage.objects;
DROP POLICY IF EXISTS "Usuários autenticados podem fazer upload de anexos" ON storage.objects;
DROP POLICY IF EXISTS "Usuários autenticados podem excluir seus próprios anexos" ON storage.objects;

CREATE POLICY "pedido_anexos_select" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'pedido-anexos' AND (
    (storage.foldername(name))[1] = public.get_my_empresa_id()::text
    OR owner_id = auth.uid()::text
    OR public.is_admin()
  )
);

CREATE POLICY "pedido_anexos_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'pedido-anexos'
  AND (storage.foldername(name))[1] = public.get_my_empresa_id()::text
);

CREATE POLICY "pedido_anexos_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'pedido-anexos' AND (
    owner_id = auth.uid()::text
    OR (public.is_gestor() AND (storage.foldername(name))[1] = public.get_my_empresa_id()::text)
    OR public.is_admin()
  )
);

-- ---------- 4. bucket email-assets: escopo de empresa/dono na escrita ----------

DROP POLICY IF EXISTS "Auth Upload" ON storage.objects;
DROP POLICY IF EXISTS "Auth Update" ON storage.objects;
DROP POLICY IF EXISTS "Auth Delete" ON storage.objects;

CREATE POLICY "email_assets_write" ON storage.objects
FOR ALL TO authenticated
USING (
  bucket_id = 'email-assets' AND (
    name = 'logo-email.png'
    OR name = 'assinaturas/' || auth.uid()::text || '.png'
    OR ((storage.foldername(name))[1] = 'inline' AND (storage.foldername(name))[2] = public.get_my_empresa_id()::text)
  )
)
WITH CHECK (
  bucket_id = 'email-assets' AND (
    name = 'logo-email.png'
    OR name = 'assinaturas/' || auth.uid()::text || '.png'
    OR ((storage.foldername(name))[1] = 'inline' AND (storage.foldername(name))[2] = public.get_my_empresa_id()::text)
  )
);
