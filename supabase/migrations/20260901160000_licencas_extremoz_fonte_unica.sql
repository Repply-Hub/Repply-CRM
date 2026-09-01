-- ============================================================================
-- DOM Extremoz: `licencas_extremoz` preparada para o scraper server-side novo.
-- ============================================================================
--
-- Mesmo padrão da migration 20260901120000 (que reformou `licencas_natal`).
-- Investigação: docs/investigacao-dom-pdf.md e a Fase 0 do scraping de Extremoz
-- (teste de bloqueio de IP em 01/09/2026 — servidor de Extremoz respondeu 200 à
-- Edge Function, NÃO há bloqueio; por isso o fluxo é server-side).
--
-- O QUE ESTA MIGRATION FAZ:
--  1. Prepara `licencas_extremoz` para a Edge Function `scrape-extremoz-licencas`:
--     - `bloco_texto_hash` + índice único NÃO parcial → dedupe por conteúdo do bloco;
--     - `pdf_storage_path` → caminho do PDF arquivado no Storage;
--     - `data_edicao` deixa de ser TEXT e vira DATE. Além dos formatos ISO/BR, tenta
--       ler "DD de Mês de AAAA" do próprio valor e do nome do arquivo (é como o
--       scraper client-side antigo gravava). O que não converte vira NULL, com NOTICE,
--       sem apagar nenhuma linha.
--  2. Alinha a RLS com `licencas_natal` / `dom_licencas`: leitura exige a seção
--     'portal'; NÃO há policy de escrita para usuário — só o cron grava, com
--     service_role, que ignora RLS.
--  3. Cria o balde PRIVADO `extremoz-dom` para guardar o PDF de cada edição. SEM
--     pasta por empresa: o diário é documento público, igual para todo assinante —
--     mesmo racional do `empresa_tem_secao('portal')` em vez de `empresa_id`
--     (ver 20260822221102).
--
-- NÃO remove nenhuma tabela (ao contrário da migration do Natal, que aposentou
-- `dom_licencas`). `licencas_extremoz` já era a tabela que a tela lê.
--
-- Idempotente (IF EXISTS / IF NOT EXISTS / guardas por catálogo). Recomenda-se
-- aplicar primeiro dentro de BEGIN; ... ROLLBACK; para conferir os NOTICE.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Colunas novas
-- ────────────────────────────────────────────────────────────────────────────

alter table public.licencas_extremoz add column if not exists bloco_texto_hash text;
alter table public.licencas_extremoz add column if not exists pdf_storage_path  text;

comment on column public.licencas_extremoz.bloco_texto_hash is
  'sha256 (hex) de bloco_texto. Chave de dedupe do scraper: ON CONFLICT (bloco_texto_hash) '
  'DO NOTHING. Índice único não parcial (NULLs não colidem no Postgres).';
comment on column public.licencas_extremoz.pdf_storage_path is
  'Caminho do PDF da edição no balde privado extremoz-dom, no formato {ano}/{mes}/{arquivo}. '
  'Cópia de arquivo — o link mostrado na tela (pdf_link) continua sendo a URL pública do site.';
comment on column public.licencas_extremoz.prioridade is
  'FASE DA OBRA (implantação, instalação, operação...). O nome "prioridade" engana — a tela '
  'rotula "Fase da Obra". Não usar como prioridade de nada. Ver dom-extremoz-licencas.ts.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Dedupe de blocos idênticos ANTES do índice único
-- ────────────────────────────────────────────────────────────────────────────
do $$
declare v_removidas integer;
begin
  with dups as (
    select ctid,
           row_number() over (partition by bloco_texto order by created_at, ctid) as rn
      from public.licencas_extremoz
     where bloco_texto is not null and btrim(bloco_texto) <> ''
  )
  delete from public.licencas_extremoz t
   using dups
   where t.ctid = dups.ctid and dups.rn > 1;
  get diagnostics v_removidas = row_count;
  if v_removidas > 0 then
    raise notice '[licencas_extremoz] % linha(s) duplicada(s) por bloco_texto removida(s) antes do indice unico.', v_removidas;
  end if;
end $$;

update public.licencas_extremoz
   set bloco_texto_hash = encode(extensions.digest(bloco_texto, 'sha256'), 'hex')
 where bloco_texto is not null
   and btrim(bloco_texto) <> ''
   and bloco_texto_hash is null;

-- Índice único NÃO parcial de propósito: NULLs não colidem entre si (linhas sem
-- bloco_texto ficam de fora sem erro), e um índice não parcial é o que o
-- `ON CONFLICT (bloco_texto_hash)` do scraper consegue inferir.
create unique index if not exists licencas_extremoz_bloco_texto_hash_key
  on public.licencas_extremoz (bloco_texto_hash);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. data_edicao: TEXT → DATE
-- ────────────────────────────────────────────────────────────────────────────
--
-- Usa uma coluna auxiliar (_data_iso) porque a conversão de "DD de Mês de AAAA"
-- precisa de um loop por linha, com tratamento de erro individual. No fim troca
-- a coluna. Rodar de novo é no-op (a guarda de tipo pula tudo).
do $$
declare
  r         record;
  v_tipo    text;
  v_meses   jsonb := '{"janeiro":"01","fevereiro":"02","marco":"03","março":"03",
                       "abril":"04","maio":"05","junho":"06","julho":"07","agosto":"08",
                       "setembro":"09","outubro":"10","novembro":"11","dezembro":"12"}'::jsonb;
  v_m       text[];
  v_mes     text;
  v_iso     text;
  v_conv    integer := 0;
  v_semdata integer := 0;
begin
  select data_type into v_tipo
    from information_schema.columns
   where table_schema = 'public' and table_name = 'licencas_extremoz' and column_name = 'data_edicao';

  if v_tipo is distinct from 'text' then
    raise notice '[licencas_extremoz] data_edicao ja nao e text (%) — conversao pulada.', v_tipo;
    return;
  end if;

  alter table public.licencas_extremoz add column if not exists _data_iso date;

  for r in select id, data_edicao, pdf_nome, pdf_link from public.licencas_extremoz loop
    v_iso := null;

    if r.data_edicao ~ '^\d{4}-\d{2}-\d{2}$' then
      v_iso := r.data_edicao;
    elsif r.data_edicao ~ '^\d{2}/\d{2}/\d{4}$' then
      v_iso := substr(r.data_edicao, 7, 4) || '-' || substr(r.data_edicao, 4, 2) || '-' || substr(r.data_edicao, 1, 2);
    else
      v_m := regexp_match(
        lower(coalesce(r.data_edicao, '') || ' ' || coalesce(r.pdf_nome, '') || ' ' || coalesce(r.pdf_link, '')),
        '(\d{1,2})[ _-]+de[ _-]+([a-zç]+)[ _-]+de[ _-]+(\d{4})'
      );
      if v_m is not null then
        v_mes := v_meses ->> v_m[2];
        if v_mes is not null then
          v_iso := v_m[3] || '-' || v_mes || '-' || lpad(v_m[1], 2, '0');
        end if;
      end if;
    end if;

    if v_iso is not null then
      begin
        update public.licencas_extremoz set _data_iso = v_iso::date where id = r.id;
        v_conv := v_conv + 1;
      exception when others then
        v_semdata := v_semdata + 1;
        raise notice '[licencas_extremoz] data_edicao invalida (virou NULL): id=% valor=%', r.id, r.data_edicao;
      end;
    elsif r.data_edicao is not null and btrim(r.data_edicao) <> '' then
      v_semdata := v_semdata + 1;
      raise notice '[licencas_extremoz] data_edicao sem formato reconhecido (virou NULL): id=% valor=%', r.id, r.data_edicao;
    end if;
  end loop;

  raise notice '[licencas_extremoz] data_edicao: % convertida(s), % sem data.', v_conv, v_semdata;

  alter table public.licencas_extremoz drop column data_edicao;
  alter table public.licencas_extremoz rename column _data_iso to data_edicao;
  raise notice '[licencas_extremoz] data_edicao agora e DATE.';
end $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. RLS: lê quem tem a seção; ninguém escreve pela tela
-- ────────────────────────────────────────────────────────────────────────────
alter table public.licencas_extremoz enable row level security;

-- Antes (20260822221102): licencas_extremoz_write permitia a gestor com a seção 'portal'
-- inserir/atualizar/apagar. Ninguém faz isso pela interface (Portal.tsx só lê), e a fonte
-- de verdade passa a ser o cron. Igual a licencas_natal / dom_licencas.
drop policy if exists licencas_extremoz_write  on public.licencas_extremoz;
drop policy if exists licencas_extremoz_select on public.licencas_extremoz;
drop policy if exists licencas_extremoz_insert on public.licencas_extremoz;
drop policy if exists licencas_extremoz_update on public.licencas_extremoz;
drop policy if exists licencas_extremoz_delete on public.licencas_extremoz;

create policy licencas_extremoz_select on public.licencas_extremoz
  for select to authenticated
  using (empresa_tem_secao('portal'));

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Balde privado extremoz-dom (sem pasta por empresa — documento público)
-- ────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('extremoz-dom', 'extremoz-dom', false)
on conflict (id) do nothing;

drop policy if exists "extremoz_dom_ler" on storage.objects;
create policy "extremoz_dom_ler" on storage.objects
  for select to authenticated
  using (bucket_id = 'extremoz-dom' and empresa_tem_secao('portal'));

-- Sem policy de insert/update/delete: só service_role escreve no balde (o cron).
