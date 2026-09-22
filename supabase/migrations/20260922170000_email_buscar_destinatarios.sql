-- Autocompletar de destinatário do compositor de e-mail (fichinhas, etapa E).
--
-- Busca pessoas para sugerir em Para/Cc/Cco, unindo três origens da EMPRESA de
-- quem está logado, na ordem equipe → cliente → recente:
--   1. `usuarios` (equipe), 2. `contatos`/`clientes` com e-mail (cliente),
--   3. e-mails distintos dos últimos 300 ENVIADOS (recente).
-- Casa por nome OU e-mail (ilike), dedupa por e-mail minúsculo (equipe vence
-- cliente vence recente) e ordena por origem, depois "começa com o termo".
--
-- SECURITY DEFINER escopada por `get_my_empresa_id()` (a mesma da RLS), search_path
-- fixo, EXECUTE só para `authenticated` (revogado de public/anon) — não vaza entre
-- empresas. Padrão de busca do CLAUDE.md §7.4 (como `wa_buscar_mensagens`); volumes
-- pequenos (usuarios ~39, contatos/clientes ~2k), então `ilike` basta (medido: ~9ms).

create or replace function public.email_buscar_destinatarios(p_termo text, p_limite int default 8)
returns table(nome text, email text, origem text)
language sql
stable
security definer
set search_path = public
as $$
  with emp as (select public.get_my_empresa_id() as id),
  pat as (
    select '%' || coalesce(p_termo, '') || '%' as like_pat,
           coalesce(p_termo, '') || '%' as prefixo
  ),
  cand as (
    select u.nome as nome, lower(u.email) as email, 'equipe' as origem, 0 as ord
    from usuarios u, emp, pat
    where u.empresa_id = emp.id and u.deleted_at is null and coalesce(u.email, '') <> ''
      and (u.nome ilike pat.like_pat or u.email ilike pat.like_pat)
    union all
    select c.nome_contato, lower(c.email), 'cliente', 1
    from contatos c, emp, pat
    where c.empresa_id = emp.id and coalesce(c.email, '') <> ''
      and (coalesce(c.nome_contato, '') ilike pat.like_pat or c.email ilike pat.like_pat)
    union all
    select coalesce(nullif(cl.nome_contato, ''), cl.razao_social), lower(cl.email), 'cliente', 1
    from clientes cl, emp, pat
    where cl.empresa_id = emp.id and coalesce(cl.email, '') <> ''
      and (coalesce(cl.nome_contato, '') ilike pat.like_pat
           or coalesce(cl.razao_social, '') ilike pat.like_pat
           or cl.email ilike pat.like_pat)
    union all
    select d->>'name', lower(d->>'email'), 'recente', 2
    from (
      select destinatarios from email_mensagens
      where empresa_id = (select id from emp) and direcao = 'enviado'
      order by data_mensagem desc
      limit 300
    ) m, jsonb_array_elements(coalesce(m.destinatarios, '[]'::jsonb)) d, pat
    where coalesce(d->>'email', '') <> ''
      and (coalesce(d->>'name', '') ilike pat.like_pat or (d->>'email') ilike pat.like_pat)
  ),
  dedup as (
    select distinct on (email) nome, email, origem, ord
    from cand
    order by email, ord
  )
  select nome, email, origem
  from dedup, pat
  order by ord,
           case when email ilike (select prefixo from pat)
                     or coalesce(nome, '') ilike (select prefixo from pat) then 0 else 1 end,
           coalesce(nome, email)
  limit greatest(1, coalesce(p_limite, 8));
$$;

revoke all on function public.email_buscar_destinatarios(text, int) from public, anon;
grant execute on function public.email_buscar_destinatarios(text, int) to authenticated;
