-- Fecha o acesso de visitante e de usuário logado à tabela de desfazer do reset da caixa de
-- e-mail de 17/09 (scripts/limpar-caixa-de-email-md-20260917.sql).
--
-- A tabela nasceu por script, fora de migration, sem proteção por linha e com as permissões
-- padrão do schema public. Era a única tabela do banco nessa situação, e o relatório de
-- segurança do Supabase a marcava como ERRO.
--
-- A tabela FICA onde está, com o mesmo nome e as mesmas linhas: ela ainda é a volta do reset,
-- que segue em validação. O comando de desfazer é rodado à mão no painel do banco, pela conta
-- dona da tabela, que não passa pela proteção por linha nem por estas permissões. Nenhuma tela
-- e nenhuma função do banco a lê.
--
-- Ensaiado em produção em 22/09/2026, em transação desfeita: visitante recusado, usuário
-- logado recusado, a conta dona lê as 624 linhas.
--
-- O `if` existe porque a tabela só existe em produção: num banco novo, montado a partir das
-- migrations, ela nunca foi criada, e a migration não pode quebrar por isso.

do $$
begin
  if to_regclass('public.backup_reset_caixa_md_20260917') is not null then
    alter table public.backup_reset_caixa_md_20260917 enable row level security;
    revoke all on table public.backup_reset_caixa_md_20260917 from anon, authenticated;
  end if;
end
$$;
