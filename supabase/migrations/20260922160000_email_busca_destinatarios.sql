-- Busca por DESTINATÁRIO em e-mails enviados (busca global, estilo Gmail).
--
-- A busca global varre todos os e-mails, mas o campo `destinatarios` é jsonb
-- (array de {name, email}) e o filtro de texto do PostgREST não o alcança: por
-- isso um e-mail ENVIADO só era encontrado por assunto/prévia, nunca por quem
-- recebeu. Uma coluna gerada com o texto dos destinatários deixa o mesmo ILIKE
-- da busca casar também com o destinatário — assim o enviado é achado por quem
-- recebeu, como o recebido já é achado pelo remetente.
--
-- Coluna DERIVADA de `destinatarios` (que já é visível na mesma linha), então
-- não abre superfície de segurança nova: quem lê a linha já via os destinatários.

-- Extrai "nome email nome email …" de um array jsonb de destinatários. IMMUTABLE
-- (depende só do argumento) para poder alimentar uma coluna gerada.
create or replace function public.email_destinatarios_texto(dest jsonb)
returns text
language sql
immutable
parallel safe
as $$
  select coalesce(
    string_agg(coalesce(e->>'name', '') || ' ' || coalesce(e->>'email', ''), ' '),
    ''
  )
  from jsonb_array_elements(coalesce(dest, '[]'::jsonb)) e
$$;

alter table public.email_mensagens
  add column if not exists busca_destinatarios text
  generated always as (public.email_destinatarios_texto(destinatarios)) stored;

comment on column public.email_mensagens.busca_destinatarios is
  'Texto (nome/e-mail) dos destinatários, derivado de `destinatarios`, para a busca global casar e-mails enviados pelo destinatário. Ver migration 20260922160000.';
