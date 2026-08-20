-- webhook_debug: fecha o acesso público
--
-- A tabela foi criada à mão pelo painel do Supabase, fora de migration, e por
-- isso nasceu sem RLS. Com RLS desligada e SELECT concedido a `anon`, qualquer
-- pessoa com a chave publicável do site — que viaja dentro do JavaScript e é
-- pública por natureza — lia a tabela inteira pelo PostgREST, sem sessão.
--
-- Medido em 20/08/2026, imediatamente antes desta migration:
--   71.008 linhas · 74 MB · ~1.200 linhas novas por dia
--    4.725 linhas com o `api_key` da instância uazapi em texto puro
--   53.847 linhas com telefone de cliente
--   Leitura anônima real devolveu HTTP 200 e Content-Range 0-0/71009
--
-- Era o único achado de nível ERROR entre os 197 avisos de segurança do projeto
-- (`rls_disabled_in_public`).
--
-- O padrão correto já existe aqui: `email_webhook_eventos`, `stripe_eventos`,
-- `email_conta_grants` e `email_conexao_estados` estão todas com RLS ligada,
-- ZERO políticas e sem grant para anon/authenticated. Sem política ninguém
-- entra — e as Edge Functions seguem gravando normalmente porque usam a
-- service_role, que passa por cima de RLS por definição.
--
-- Conferido antes de aplicar: nenhum código do app lê esta tabela (só aparece
-- em src/integrations/supabase/types.ts, que é gerado), e nenhuma view ou
-- função do banco depende dela.
--
-- ESCOPO: isto estanca a exposição e nada mais. NÃO apaga o que já está
-- gravado, NÃO impede que a chave continue sendo gravada a cada evento, e NÃO
-- resolve a falta de autenticação do webhook. Ver docs/divida-tecnica.md §1 e §16.

alter table public.webhook_debug enable row level security;

revoke all on public.webhook_debug from anon;
revoke all on public.webhook_debug from authenticated;
