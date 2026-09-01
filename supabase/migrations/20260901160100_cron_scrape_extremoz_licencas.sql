-- Agendamento do scraper do DOM Extremoz (LP/LI/LO), server-side, sem Python e sem
-- GitHub Actions. Mesmo mecanismo do IDEMA (20260827181000) e do DOM Natal
-- (20260901120100): pg_cron + pg_net via public.chamar_edge_function, que lê a
-- service_role_key do Vault e manda `Authorization: Bearer <chave>`. A função
-- scrape-extremoz-licencas reconhece esse bearer como chamada servidor-a-servidor e
-- pula a checagem de seção 'portal'.
--
-- PRÉ-REQUISITO DA FASE 0 (conferido em 01/09/2026): o servidor de Extremoz responde
-- 200 para a Edge Function (listagem e PDF), tanto do IP us-west quanto do sa-east.
-- NÃO há bloqueio de IP de datacenter — por isso este fluxo roda no servidor e pode
-- ser agendado (o antigo scrapeExtremoz() rodava no navegador do usuário e não tinha
-- como ter cron).
--
-- CADÊNCIA: DIÁRIA (07:00 UTC = 04:00 em Brasília). A função só processa 3 PDFs por
-- execução — `pdf-parse` é guloso de memória e lote grande estoura o worker com
-- WORKER_RESOURCE_LIMIT (medido em 01/09/2026). O diário de Extremoz sai ~5x/semana,
-- então 3/dia (21/semana) acompanha de sobra. No primeiro backfill (`parcial: true` no
-- retorno, visível em net._http_response) é preciso re-disparar o job manualmente:
--   select public.chamar_edge_function('scrape-extremoz-licencas', '{}'::jsonb, 300000, true);
-- Para um backfill de um ano inteiro:
--   select public.chamar_edge_function('scrape-extremoz-licencas', '{"ano":"2025"}'::jsonb, 300000, true);
--
-- JANELA: a própria função calcula — ano corrente (e o anterior no comecinho de
-- janeiro), fuso de Brasília. Não reprocessa PDF já baixado (dedupe por pdf_link).
--
-- 🔴 PRÉ-REQUISITO (não dá para fazer em migration): o segredo `service_role_key` no
-- Vault. Conferir:  select 1 from vault.decrypted_secrets where name = 'service_role_key';
-- Sem ele, chamar_edge_function só emite RAISE WARNING — o cron não quebra, só não roda.
--
-- Idempotente: desagenda antes de reagendar.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'scrape-extremoz-licencas') then
    perform cron.unschedule('scrape-extremoz-licencas');
  end if;
end $$;

select cron.schedule(
  'scrape-extremoz-licencas',
  '0 7 * * *',   -- todo dia, 07:00 UTC (04:00 em Brasília)
  $$
    select public.chamar_edge_function(
      'scrape-extremoz-licencas',
      '{}'::jsonb,
      300000,
      true
    )
  $$
);
