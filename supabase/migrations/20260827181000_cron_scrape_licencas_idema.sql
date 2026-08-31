-- Agendamento do scraper do IDEMA (SIGA — licenças emitidas), sem n8n.
--
-- Até aqui, `scrape-licencas-idema` só rodava quando alguém abria o Portal e
-- clicava em "Atualizar Dados" na aba IDEMA. Este cron dá a ela o mesmo
-- tratamento que o DOM Natal já tem via GitHub Actions: seg–sex, 09:00 UTC
-- (06:00 em Brasília).
--
-- COMO A CHAMADA SE AUTENTICA
-- `public.chamar_edge_function` (criada em 20260806191500_cron_le_a_chave_do_vault.sql)
-- lê a service_role_key do Vault e manda `Authorization: Bearer <chave>`. A
-- função `scrape-licencas-idema` reconhece esse bearer == service_role_key como
-- chamada servidor-a-servidor confiável e pula a checagem de seção 'portal'
-- (que depende de auth.uid() e seria sempre falsa aqui). A chamada manual pelo
-- Portal continua exigindo a seção, como antes.
--
-- 🔴 PRÉ-REQUISITO (não dá para fazer em migration): o segredo `service_role_key`
-- precisa existir no Vault. Se não existir, `chamar_edge_function` só emite um
-- RAISE WARNING e não chama nada — o cron não quebra, apenas não roda. Conferir:
--   select 1 from vault.decrypted_secrets where name = 'service_role_key';
-- e, se faltar, no SQL Editor do painel:
--   select vault.create_secret('SUA_SERVICE_ROLE_KEY', 'service_role_key',
--     'Usada pelos crons para chamar as Edge Functions');
--
-- JANELA DE DATAS
-- O corpo manda data_inicial/data_final calculadas na hora: 1º dia do mês
-- anterior até hoje, no fuso de Brasília. Mesmo recorte do dom_natal_scraper.py.
-- Não reprocessa o ano inteiro a cada execução, mesmo o upsert por
-- numero_processo absorvendo duplicata.
--
-- Idempotente: desagenda antes de reagendar.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'scrape-licencas-idema') then
    perform cron.unschedule('scrape-licencas-idema');
  end if;
end $$;

select cron.schedule(
  'scrape-licencas-idema',
  '0 9 * * 1-5',
  $$
    select public.chamar_edge_function(
      'scrape-licencas-idema',
      jsonb_build_object(
        'data_inicial',
          to_char(
            date_trunc('month', (now() at time zone 'America/Sao_Paulo')) - interval '1 month',
            'YYYY-MM-DD'
          ),
        'data_final',
          to_char((now() at time zone 'America/Sao_Paulo'), 'YYYY-MM-DD')
      ),
      300000,
      true
    )
  $$
);
