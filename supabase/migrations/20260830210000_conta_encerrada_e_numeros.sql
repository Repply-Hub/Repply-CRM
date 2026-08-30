-- Duas funções de leitura que a tela precisa, e que não cabiam na migration anterior.

-- ── 1. A tela do CLIENTE precisa saber que a conta foi encerrada ──────────────────────
--
-- 🔴 MAS ELA NÃO PODE LER `empresa_exclusoes`. Aquela tabela guarda quem clicou, o motivo
-- anotado internamente e o estado anterior — contabilidade nossa, não dela.
--
-- Esta devolve UM BOOLEANO e nada mais. Não vaza data, não vaza motivo, não vaza quem
-- decidiu. E não aceita parâmetro de propósito: responde sempre sobre a empresa de QUEM
-- CHAMA. Aceitar um `empresa_id` transformaria isto num jeito de sondar o estado das outras.
create or replace function public.minha_empresa_foi_encerrada()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.empresa_exclusoes x
    where x.empresa_id = public.get_my_empresa_id()
      and x.purgada_em is null
  );
$$;

comment on function public.minha_empresa_foi_encerrada() is
  'Um booleano, so sobre a empresa de quem chama. Existe para a tela avisar sem ler o registro da exclusao.';

revoke all on function public.minha_empresa_foi_encerrada() from public, anon;
grant execute on function public.minha_empresa_foi_encerrada() to authenticated;

-- ── 2. Quanto dado a empresa tem, para a confirmação MOSTRAR o que sai de circulação ───
--
-- 🔴 O CAMINHO NÃO É `empresa_id`. Medido em 29/08/2026: `clientes.empresa_id` está NULO nas
-- 1.306 linhas, e `pedidos` e `obras` não têm coluna de empresa nenhuma. O vínculo real é
-- `usuario_id -> usuarios.empresa_id`.
--
-- Contar por `empresa_id` devolveria ZERO para tudo, e a tela mostraria "0 clientes, 0
-- negócios" na hora de excluir a MD — convidando ao clique em vez de impedi-lo. É o mesmo
-- engano que já custou um rótulo mentindo no painel.
create or replace function public.empresa_numeros(p_empresa_id uuid)
returns table (
  usuarios  integer,
  clientes  integer,
  obras     integer,
  negocios  integer,
  mensagens integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from public.usuarios u
      where u.empresa_id = p_empresa_id and u.deleted_at is null)::integer,
    (select count(*) from public.clientes c
      join public.usuarios u on u.id = c.usuario_id
      where u.empresa_id = p_empresa_id)::integer,
    (select count(*) from public.obras o
      join public.clientes c on c.id = o.cliente_id
      join public.usuarios u on u.id = c.usuario_id
      where u.empresa_id = p_empresa_id)::integer,
    (select count(*) from public.pedidos p
      join public.usuarios u on u.id = p.usuario_id
      where u.empresa_id = p_empresa_id)::integer,
    (select count(*) from public.whatsapp_mensagens m
      where m.empresa_id = p_empresa_id)::integer
  -- Devolve ZERO LINHAS para quem não é admin, em vez de erro: quem chama trata ausência
  -- como "não sei", que é a verdade.
  where public.is_admin();
$$;

revoke all on function public.empresa_numeros(uuid) from public, anon;
grant execute on function public.empresa_numeros(uuid) to authenticated;
