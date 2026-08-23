-- Criar, renomear, editar e excluir preset de seções — pela tela de admin
--
-- Mesmo formato das RPCs da tarefa 6: SECURITY DEFINER com `is_admin()` e `RAISE` no corpo.
-- A autorização real fica no banco; a tela só decide se aparece.

-- ---------------------------------------------------------------- criar

-- O preset novo nasce COPIANDO o padrão, e isso não é conveniência: é correção.
--
-- `empresa_tem_secao` resolve "não achei regra" como LIGADA — é o que impede a publicação
-- de tirar todas as seções de todo mundo. O efeito colateral é que um preset SEM linhas
-- liberaria tudo, que é o oposto do que alguém espera ao criar um preset restritivo.
--
-- Copiar o padrão resolve isso de um jeito que não depende de ninguém lembrar: as 12 linhas
-- nascem junto, e o ponto de partida é o conjunto que já foi pensado.
create or replace function public.admin_criar_preset(
  p_nome      text,
  p_descricao text default null
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
begin
  if not is_admin() then
    raise exception 'Apenas o administrador global pode criar preset';
  end if;

  if coalesce(btrim(p_nome), '') = '' then
    raise exception 'O preset precisa de um nome';
  end if;

  insert into secao_presets (nome, descricao, is_padrao)
  values (btrim(p_nome), nullif(btrim(coalesce(p_descricao, '')), ''), false)
  returning id into v_id;

  insert into secao_preset_itens (preset_id, secao, habilitada)
  select v_id, i.secao, i.habilitada
    from secao_preset_itens i
   where i.preset_id = (select id from secao_presets where is_padrao);

  return v_id;
end;
$$;

-- ---------------------------------------------------------------- renomear

create or replace function public.admin_renomear_preset(
  p_preset_id uuid,
  p_nome      text,
  p_descricao text default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not is_admin() then
    raise exception 'Apenas o administrador global pode renomear preset';
  end if;

  if coalesce(btrim(p_nome), '') = '' then
    raise exception 'O preset precisa de um nome';
  end if;

  update secao_presets
     set nome       = btrim(p_nome),
         descricao  = nullif(btrim(coalesce(p_descricao, '')), ''),
         updated_at = now()
   where id = p_preset_id;
end;
$$;

-- ---------------------------------------------------------------- ligar/desligar seção

-- Mexer aqui muda TODAS as empresas que seguem este preset, menos onde houver exceção.
-- A tela avisa quantas antes de confirmar; aqui só se garante que a linha exista, mesmo
-- que o preset tenha nascido antes desta seção existir.
create or replace function public.admin_definir_item_preset(
  p_preset_id  uuid,
  p_secao      text,
  p_habilitada boolean
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not is_admin() then
    raise exception 'Apenas o administrador global pode alterar preset';
  end if;

  insert into secao_preset_itens (preset_id, secao, habilitada)
  values (p_preset_id, p_secao, p_habilitada)
  on conflict (preset_id, secao) do update set habilitada = excluded.habilitada;

  update secao_presets set updated_at = now() where id = p_preset_id;
end;
$$;

-- ---------------------------------------------------------------- excluir

-- Recusa em dois casos, com mensagem que diz o que fazer:
--   · o preset padrão — sem ele, empresa sem preset apontado fica sem regra nenhuma;
--   · preset em uso — a chave estrangeira já barraria, mas com erro que ninguém entende.
create or replace function public.admin_excluir_preset(p_preset_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_em_uso integer;
begin
  if not is_admin() then
    raise exception 'Apenas o administrador global pode excluir preset';
  end if;

  if exists (select 1 from secao_presets where id = p_preset_id and is_padrao) then
    raise exception 'O preset padrão não pode ser excluído: é ele que vale para empresa sem preset apontado';
  end if;

  select count(*) into v_em_uso from empresas where secao_preset_id = p_preset_id;
  if v_em_uso > 0 then
    raise exception 'Este preset está em uso por % empresa(s). Mova-as para outro preset antes de excluir', v_em_uso;
  end if;

  delete from secao_presets where id = p_preset_id;
end;
$$;

-- ---------------------------------------------------------------- listagem para a tela

-- Traz cada preset com quantas empresas o seguem — o número que a tela mostra ANTES de
-- confirmar uma mudança. Sem ele, o admin muda um preset sem saber que mexeu em 6 empresas.
--
-- `empresas_seguindo` conta também quem tem `secao_preset_id` nulo, no caso do padrão: essa
-- empresa segue o padrão na prática, e não contá-la faria o aviso mentir para menos.
create or replace function public.admin_listar_presets()
returns table (
  id                uuid,
  nome              text,
  descricao         text,
  is_padrao         boolean,
  empresas_seguindo bigint,
  secoes_ligadas    bigint
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not is_admin() then
    raise exception 'Apenas o administrador global pode ver os presets';
  end if;

  return query
  select p.id,
         p.nome,
         p.descricao,
         p.is_padrao,
         (select count(*) from empresas e
           where e.secao_preset_id = p.id
              or (e.secao_preset_id is null and p.is_padrao)),
         (select count(*) from secao_preset_itens i
           where i.preset_id = p.id and i.habilitada)
    from secao_presets p
   order by p.is_padrao desc, p.nome;
end;
$$;

revoke all on function public.admin_criar_preset(text, text) from public, anon;
revoke all on function public.admin_renomear_preset(uuid, text, text) from public, anon;
revoke all on function public.admin_definir_item_preset(uuid, text, boolean) from public, anon;
revoke all on function public.admin_excluir_preset(uuid) from public, anon;
revoke all on function public.admin_listar_presets() from public, anon;

grant execute on function public.admin_criar_preset(text, text) to authenticated;
grant execute on function public.admin_renomear_preset(uuid, text, text) to authenticated;
grant execute on function public.admin_definir_item_preset(uuid, text, boolean) to authenticated;
grant execute on function public.admin_excluir_preset(uuid) to authenticated;
grant execute on function public.admin_listar_presets() to authenticated;
