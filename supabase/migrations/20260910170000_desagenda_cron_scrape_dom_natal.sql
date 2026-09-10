-- O scraper do DOM de Natal saiu da Edge Function e voltou para um GitHub Action.
--
-- A Edge Function `scrape-dom-natal-licencas` foi removida em 10/09/2026: cada edição do
-- diário de Natal tem 60-170 páginas, extrair o texto de uma passa de 256 MB e estoura o
-- worker (WORKER_RESOURCE_LIMIT). Três motores tentados (pdf-parse, pdf.js, MuPDF/WASM),
-- todos acima do teto. A leitura foi para `.github/workflows/scrape-dom-natal.yml`, que
-- executa `scripts/scrape-dom-natal-licencas.ts` num runner com RAM de sobra.
--
-- Aqui só se desagenda o cron que chamava a função (criado em
-- 20260901120100_cron_scrape_dom_natal_licencas.sql). O agendamento agora é o `schedule:`
-- do workflow. O cron do IDEMA e o do Extremoz continuam como estão — as funções deles não
-- foram tocadas.
--
-- Idempotente: só desagenda se o job existir.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'scrape-dom-natal-licencas') then
    perform cron.unschedule('scrape-dom-natal-licencas');
  end if;
end $$;
