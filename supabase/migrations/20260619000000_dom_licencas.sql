create table public.dom_licencas (
  id             uuid        primary key default gen_random_uuid(),
  data_edicao    date,
  numero_edicao  text,
  tipo_edicao    text,
  url_pdf        text        not null,
  tipos_licenca  text[]      not null default '{}',
  processo       text,
  texto_bloco    text,
  criado_em      timestamptz default now(),
  unique (url_pdf, texto_bloco)
);

alter table public.dom_licencas enable row level security;

-- Leitura para usuários autenticados (padrão do projeto)
create policy "Authenticated users can read dom_licencas"
  on public.dom_licencas for select
  to authenticated using (true);

-- Sem política de INSERT para authenticated: escrita feita exclusivamente
-- via service_role (GitHub Actions / edge functions com SUPABASE_SERVICE_ROLE_KEY),
-- que bypassa RLS por padrão no Supabase.
