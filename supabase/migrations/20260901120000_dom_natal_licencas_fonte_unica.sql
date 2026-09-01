-- ============================================================================
-- DOM Natal: `licencas_natal` vira a única fonte de verdade. `dom_licencas` sai.
-- ============================================================================
--
-- CONTEXTO (investigação em docs/investigacao-dom-pdf.md):
--
--  · A tela (src/pages/Portal.tsx) SEMPRE leu `licencas_natal`.
--  · O scraper Python + GitHub Actions escrevia em `dom_licencas` — uma tabela que
--    NENHUM código do frontend consulta. A coleta nunca chegava na tela.
--  · `dom_licencas` ainda tinha 5 colunas (acao, atividade, endereco, renovacao,
--    requerente) que nenhuma migration criou — foram postas à mão no banco.
--
-- O QUE ESTA MIGRATION FAZ:
--  1. Prepara `licencas_natal` para o scraper novo (Edge Function scrape-dom-natal-licencas):
--     - coluna de hash do bloco, com índice único → dedupe por conteúdo, não por processo;
--     - coluna do caminho do PDF arquivado no Storage;
--     - `data_edicao` deixa de ser TEXT e vira DATE (as linhas com data ilegível viram
--       NULL e são reportadas por NOTICE, nenhuma linha é apagada por causa disso).
--  2. Alinha a RLS de `licencas_natal` com a de `dom_licencas`: leitura exige a seção
--     'portal'; NÃO há policy de escrita para usuário — só o cron grava, com service_role,
--     que ignora RLS.
--  3. Cria o balde PRIVADO `dom-natal` para guardar o PDF de cada edição. SEM pasta por
--     empresa: o diário é documento público, igual para todo assinante — mesmo racional
--     do `empresa_tem_secao('portal')` em vez de `empresa_id` (ver 20260822221102).
--  4. Remove `dom_licencas`.
--
-- É idempotente (IF EXISTS / IF NOT EXISTS / guardas por catálogo). Rodar duas vezes não
-- muda o resultado. Recomenda-se aplicar primeiro dentro de BEGIN; ... ROLLBACK; para
-- conferir os NOTICE de conversão de data.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Colunas novas em licencas_natal
-- ────────────────────────────────────────────────────────────────────────────

alter table public.licencas_natal add column if not exists bloco_texto_hash text;
alter table public.licencas_natal add column if not exists pdf_storage_path  text;

comment on column public.licencas_natal.bloco_texto_hash is
  'sha256 (hex) de bloco_texto. Chave de dedupe do scraper: ON CONFLICT (bloco_texto_hash) '
  'DO NOTHING. Índice único parcial (só quando não nulo).';
comment on column public.licencas_natal.pdf_storage_path is
  'Caminho do PDF da edição no balde privado dom-natal, no formato {ano}/{mes}/{arquivo}. '
  'Cópia de arquivo — o link mostrado na tela (pdf_link) continua sendo a URL pública do '
  'site da Prefeitura.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Dedupe de blocos idênticos ANTES do índice único
-- ────────────────────────────────────────────────────────────────────────────
--
-- Se já houver duas linhas com o mesmo bloco_texto, o índice único no hash não pode ser
-- criado. Mantém a mais antiga de cada grupo (por created_at) e remove as demais.
do $$
declare v_removidas integer;
begin
  with dups as (
    select ctid,
           row_number() over (partition by bloco_texto order by created_at, ctid) as rn
      from public.licencas_natal
     where bloco_texto is not null and btrim(bloco_texto) <> ''
  )
  delete from public.licencas_natal t
   using dups
   where t.ctid = dups.ctid and dups.rn > 1;
  get diagnostics v_removidas = row_count;
  if v_removidas > 0 then
    raise notice '[licencas_natal] % linha(s) duplicada(s) por bloco_texto removida(s) antes do indice unico.', v_removidas;
  end if;
end $$;

update public.licencas_natal
   set bloco_texto_hash = encode(extensions.digest(bloco_texto, 'sha256'), 'hex')
 where bloco_texto is not null
   and btrim(bloco_texto) <> ''
   and bloco_texto_hash is null;

-- Índice único NÃO parcial de propósito: no Postgres NULLs não colidem entre si (linhas
-- antigas sem bloco_texto ficam de fora sem erro), e um índice não parcial é o que o
-- `ON CONFLICT (bloco_texto_hash)` do scraper consegue inferir — um índice parcial faria
-- o upsert falhar com "no unique or exclusion constraint matching".
create unique index if not exists licencas_natal_bloco_texto_hash_key
  on public.licencas_natal (bloco_texto_hash);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. data_edicao: TEXT → DATE  (só quando ainda é text; reporta o que não converte)
-- ────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_tipo    text;
  r         record;
  v_falhas  integer := 0;
begin
  select data_type into v_tipo
    from information_schema.columns
   where table_schema = 'public'
     and table_name   = 'licencas_natal'
     and column_name  = 'data_edicao';

  if v_tipo is distinct from 'text' then
    raise notice '[licencas_natal] data_edicao ja nao e text (% ) — conversao pulada.', v_tipo;
    return;
  end if;

  for r in
    select id, data_edicao
      from public.licencas_natal
     where data_edicao is not null
       and btrim(data_edicao) <> ''
       and data_edicao !~ '^\d{4}-\d{2}-\d{2}$'
       and data_edicao !~ '^\d{2}/\d{2}/\d{4}$'
  loop
    raise notice '[licencas_natal] data_edicao sem formato reconhecido (virara NULL): id=% valor=%', r.id, r.data_edicao;
    v_falhas := v_falhas + 1;
  end loop;
  raise notice '[licencas_natal] % linha(s) com data_edicao nao convertivel.', v_falhas;

  alter table public.licencas_natal
    alter column data_edicao type date
    using (
      case
        when data_edicao ~ '^\d{4}-\d{2}-\d{2}$' then to_date(data_edicao, 'YYYY-MM-DD')
        when data_edicao ~ '^\d{2}/\d{2}/\d{4}$' then to_date(data_edicao, 'DD/MM/YYYY')
        else null
      end
    );
  raise notice '[licencas_natal] data_edicao convertida para DATE.';
end $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. RLS espelhando dom_licencas: lê quem tem a seção; ninguém escreve pela tela
-- ────────────────────────────────────────────────────────────────────────────
alter table public.licencas_natal enable row level security;

-- Antes (20260822221102): licencas_natal_write permitia a gestor com a seção 'portal'
-- inserir/atualizar/apagar. Ninguém faz isso pela interface (Portal.tsx só lê), e a fonte
-- de verdade passa a ser o cron. Igual a dom_licencas, que nunca teve policy de escrita.
drop policy if exists licencas_natal_write  on public.licencas_natal;
drop policy if exists licencas_natal_select on public.licencas_natal;

create policy licencas_natal_select on public.licencas_natal
  for select to authenticated
  using (empresa_tem_secao('portal'));

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Balde privado dom-natal (sem pasta por empresa — documento público)
-- ────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('dom-natal', 'dom-natal', false)
on conflict (id) do nothing;

drop policy if exists "dom_natal_ler" on storage.objects;
create policy "dom_natal_ler" on storage.objects
  for select to authenticated
  using (bucket_id = 'dom-natal' and empresa_tem_secao('portal'));

-- Sem policy de insert/update/delete: só service_role escreve no balde (o cron).

-- ────────────────────────────────────────────────────────────────────────────
-- 6. Fora dom_licencas
-- ────────────────────────────────────────────────────────────────────────────
--
-- Conferido por grep em 01/09/2026: nada em src/ nem em outra Edge Function consulta esta
-- tabela. Os únicos consumidores eram o scraper Python e o próprio arquivo de tipos — os
-- dois saem no mesmo commit desta migration.
drop table if exists public.dom_licencas;
