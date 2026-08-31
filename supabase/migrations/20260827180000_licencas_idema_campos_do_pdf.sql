-- licencas_idema: campos ricos extraídos do PDF final da licença
--
-- A função `scrape-licencas-idema` grava, para cada licença NOVA, os dados da
-- listagem (numero_processo, interessado, cnpj, fato_gerador...). Estes quatro
-- campos vêm de um segundo passo: seguir o link "Ver licença"
-- (/validar/?gid=...) até o PDF (pdf_licenca.php) e ler o corpo.
--
--   endereco_empreendimento -> "Endereço do Empreendimento" (≠ do Empreendedor)
--   coordenadas_utm         -> trecho "... mE; ... mN" (Zona/Datum quando presente)
--   cpf_cnpj_formatado      -> o documento já pontuado, como sai no PDF
--   pdf_processado          -> true depois que o PDF foi baixado e lido; fica
--                              false quando o fetch/parse do PDF falhou, para
--                              uma execução futura poder tentar de novo.
--
-- Idempotente: `add column if not exists`. O default constante em pdf_processado
-- não reescreve a tabela (Postgres 11+). As linhas que já existem ficam com
-- pdf_processado = false — nunca tiveram o passo do PDF.

alter table public.licencas_idema
  add column if not exists endereco_empreendimento text,
  add column if not exists coordenadas_utm         text,
  add column if not exists cpf_cnpj_formatado       text,
  add column if not exists pdf_processado           boolean not null default false;

comment on column public.licencas_idema.endereco_empreendimento is
  'Endereço do empreendimento (canteiro/obra), lido do PDF da licença. Diferente do endereço do empreendedor.';
comment on column public.licencas_idema.coordenadas_utm is
  'Coordenadas UTM de referência, como aparecem no PDF (ex: "(Zona 24M), Datum SIRGAS 2000: 711.893,00 mE; 9.285.621,00 mN").';
comment on column public.licencas_idema.cpf_cnpj_formatado is
  'CPF/CNPJ do empreendedor já formatado, como sai no PDF da licença.';
comment on column public.licencas_idema.pdf_processado is
  'true quando o PDF da licença foi baixado e lido. false = ainda não processado ou o fetch/parse falhou.';
