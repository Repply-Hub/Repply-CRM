-- Libera o "Usuario teste" na caixa de e-mail da empresa de DEMONSTRAÇÃO.
--
-- PARA QUE SERVE
--   Hoje esse usuário é vendedor e não foi liberado na caixa, então a seção de
--   E-mail mostra "Nenhuma caixa conectada" para ele — e é a conta que uso para
--   conferir as telas. Sem isto, nenhuma mudança na seção de e-mail pode ser
--   verificada na tela; só por teste e por consulta ao banco.
--
-- ONDE MEXE
--   Só na empresa **Repply**, que é a de demonstração (ver a memória do
--   projeto). Uma linha, numa tabela de permissão. Não toca em mensagem, em
--   cliente nem em nada da MD ou da JHS.
--
-- COMO DESFAZER
--   delete from email_conta_usuarios
--    where conta_id = 'bbbbbbbb-0000-4000-8000-000000000001'
--      and usuario_id = 'bd65949c-83bd-428a-a916-28d8d049e230'
--      and pasta_id is null;
--
--   (ou, pelo próprio sistema: E-mails → gerenciar caixa → desmarcar a pessoa)

begin;

-- ---------------------------------------------------------------------------
-- PASSO 0 — travas. Aborta se qualquer peça não for a esperada.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from empresas
    where id = '9b17bfdf-f631-4af6-9471-a68411909a04' and nome = 'Repply'
  ) then
    raise exception 'A empresa de demonstracao nao e a esperada — abortado.';
  end if;

  if not exists (
    select 1 from email_contas
    where id = 'bbbbbbbb-0000-4000-8000-000000000001'
      and empresa_id = '9b17bfdf-f631-4af6-9471-a68411909a04'
      and email = 'comercial@demo.repplyhub.com.br'
  ) then
    raise exception 'A caixa da demonstracao nao e a esperada — abortado.';
  end if;

  if not exists (
    select 1 from usuarios
    where id = 'bd65949c-83bd-428a-a916-28d8d049e230'
      and empresa_id = '9b17bfdf-f631-4af6-9471-a68411909a04'
      and deleted_at is null
  ) then
    raise exception 'O usuario de teste nao esta na empresa de demonstracao — abortado.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- PASSO 1 — a liberação.
--
-- `pasta_id` nulo = a caixa inteira, e não um marcador só.
--
-- 🔴 INSERT com NOT EXISTS, e NÃO `on conflict`: a unicidade de "caixa inteira"
-- é um índice PARCIAL (`... where pasta_id is null`), e índice parcial não é
-- inferível por ON CONFLICT — o Postgres devolve 42P10 e a gravação morre. É a
-- mesma armadilha que está comentada no email-callback.
-- ---------------------------------------------------------------------------
insert into email_conta_usuarios (conta_id, usuario_id, pasta_id, criado_por)
select 'bbbbbbbb-0000-4000-8000-000000000001',
       'bd65949c-83bd-428a-a916-28d8d049e230',
       null,
       'bd65949c-83bd-428a-a916-28d8d049e230'
where not exists (
  select 1 from email_conta_usuarios
  where conta_id = 'bbbbbbbb-0000-4000-8000-000000000001'
    and usuario_id = 'bd65949c-83bd-428a-a916-28d8d049e230'
    and pasta_id is null
);

-- ---------------------------------------------------------------------------
-- PASSO 2 — conferência. Esperado: uma linha, `caixa_inteira` = true.
-- ---------------------------------------------------------------------------
select u.nome, u.role, c.email as caixa,
       (eu.pasta_id is null) as caixa_inteira
from email_conta_usuarios eu
join usuarios u    on u.id = eu.usuario_id
join email_contas c on c.id = eu.conta_id
where eu.conta_id = 'bbbbbbbb-0000-4000-8000-000000000001'
  and eu.usuario_id = 'bd65949c-83bd-428a-a916-28d8d049e230';

commit;
