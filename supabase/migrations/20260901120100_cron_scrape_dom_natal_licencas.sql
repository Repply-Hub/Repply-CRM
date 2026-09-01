-- Agendamento do scraper novo do DOM Natal (LP/LI/LO), sem Python e sem GitHub Actions.
--
-- Substitui o cron do arquivo .github/workflows/scrape-dom-natal.yml (removido no mesmo
-- commit da Edge Function). Mesmo mecanismo do IDEMA
-- (20260827181000_cron_scrape_licencas_idema.sql): pg_cron + pg_net via
-- public.chamar_edge_function, que lê a service_role_key do Vault e manda
-- `Authorization: Bearer <chave>`. A função scrape-dom-natal-licencas reconhece esse
-- bearer como chamada servidor-a-servidor e pula a checagem de seção 'portal'.
--
-- CADÊNCIA: MENSAL. Publicação de licença ambiental (LP/LI/LO) no diário MUNICIPAL de
-- Natal é rara — a investigação da Fase 1 varreu 10 edições e achou zero. Não compensa
-- varrer todo dia. A função processa, por execução, um lote grande o bastante para dar
-- conta de um mês de edições; se sobrar (`restantes > 0` no retorno, visível em
-- net._http_response), basta re-disparar o job manualmente:
--   select public.chamar_edge_function('scrape-dom-natal-licencas', '{}'::jsonb, 300000, true);
--
-- JANELA: a própria função calcula — mês corrente + mês anterior, fuso de Brasília. Não
-- reprocessa PDF já baixado (dedupe por pdf_link já gravado).
--
-- 🔴 PRÉ-REQUISITO (não dá para fazer em migration): o segredo `service_role_key` no
-- Vault. Conferir:  select 1 from vault.decrypted_secrets where name = 'service_role_key';
-- Sem ele, chamar_edge_function só emite RAISE WARNING — o cron não quebra, apenas não roda.
--
-- Idempotente: desagenda antes de reagendar.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'scrape-dom-natal-licencas') then
    perform cron.unschedule('scrape-dom-natal-licencas');
  end if;
end $$;

select cron.schedule(
  'scrape-dom-natal-licencas',
  '0 8 1 * *',   -- dia 1 de cada mês, 08:00 UTC (05:00 em Brasília)
  $$
    select public.chamar_edge_function(
      'scrape-dom-natal-licencas',
      '{}'::jsonb,
      300000,
      true
    )
  $$
);
