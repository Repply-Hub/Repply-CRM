-- Leitura e escrita do controle de seções, para a tela de admin.
--
-- SECURITY DEFINER com is_admin() + RAISE dentro do corpo, seguindo o padrão de
-- `admin_definir_plano` (use-admin-cs.ts): a autorização real fica no banco, e o frontend
-- só decide se mostra a tela. Esconder o botão nunca protegeu nada.
--
-- Estas funções são ADITIVAS: não mudam política de tabela existente nem tocam em dado de
-- ninguém. O que elas fazem é dar à tela de admin um jeito de ler o quadro completo e de
-- criar/remover exceção.
--
-- ORDEM: esta migration vem ANTES da guarda de rota e da trava do Portal, de propósito.
-- Como nenhuma exceção nasceu por migration (decisão de produto de 21/08), a MD só recupera
-- o Portal quando alguém apertar o botão na tela — então a tela precisa existir primeiro,
-- senão a MD passa um intervalo sem Portal.

-- ---------------------------------------------------------------- leitura

-- Uma linha por (empresa × seção), já resolvida, dizendo DE ONDE veio a resposta.
-- A origem não é enfeite: sem ela ninguém entende por que duas empresas com o mesmo
-- preset divergem.
create or replace function public.admin_secoes_por_empresa()
returns table (
  empresa_id   uuid,
  empresa_nome text,
  usuarios     bigint,
  preset_id    uuid,
  preset_nome  text,
  secao        text,
  habilitada   boolean,
  origem       text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not is_admin() then
    raise exception 'Apenas o administrador global pode ver o controle de seções';
  end if;

  return query
  select e.id,
         e.nome,
         (select count(*) from usuarios u where u.empresa_id = e.id),
         p.id,
         p.nome,
         s.secao,
         coalesce(x.habilitada, i.habilitada, true),
         case when x.habilitada is not null then 'excecao'
              when i.habilitada is not null then 'preset'
              else 'padrao' end
    from empresas e
    cross join (
      select unnest(array[
        'dashboard','pipeline','clientes','obras','fabricantes','portal',
        'calendario','tarefas','chat','whatsapp','emails','configuracoes'
      ]) as secao
    ) s
    left join secao_presets p
           on p.id = coalesce(e.secao_preset_id,
                              (select id from secao_presets where is_padrao))
    left join secao_preset_itens i on i.preset_id = p.id and i.secao = s.secao
    left join secao_excecoes     x on x.empresa_id = e.id and x.secao = s.secao
   order by e.nome, s.secao;
end;
$$;

-- ---------------------------------------------------------------- escrita

-- Cria, atualiza ou REMOVE a exceção. p_habilitada null = remover, e a empresa volta a
-- seguir o preset. Sem esse terceiro estado, "voltar ao padrão" viraria uma exceção
-- gravada com o mesmo valor do preset — e no dia em que o preset mudasse, aquela empresa
-- ficaria para trás sem ninguém entender por quê.
create or replace function public.admin_definir_excecao_secao(
  p_empresa_id uuid,
  p_secao      text,
  p_habilitada boolean
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not is_admin() then
    raise exception 'Apenas o administrador global pode alterar o acesso a seções';
  end if;

  if p_habilitada is null then
    delete from secao_excecoes where empresa_id = p_empresa_id and secao = p_secao;
  else
    insert into secao_excecoes (empresa_id, secao, habilitada, criada_por)
    values (p_empresa_id, p_secao, p_habilitada, auth.uid())
    on conflict (empresa_id, secao)
      do update set habilitada = excluded.habilitada,
                    criada_em  = now(),
                    criada_por = auth.uid();
  end if;
end;
$$;

create or replace function public.admin_definir_preset_da_empresa(
  p_empresa_id uuid,
  p_preset_id  uuid
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not is_admin() then
    raise exception 'Apenas o administrador global pode alterar o preset de uma empresa';
  end if;
  update empresas set secao_preset_id = p_preset_id where id = p_empresa_id;
end;
$$;

revoke all on function public.admin_secoes_por_empresa() from public;
revoke all on function public.admin_definir_excecao_secao(uuid, text, boolean) from public;
revoke all on function public.admin_definir_preset_da_empresa(uuid, uuid) from public;
grant execute on function public.admin_secoes_por_empresa() to authenticated;
grant execute on function public.admin_definir_excecao_secao(uuid, text, boolean) to authenticated;
grant execute on function public.admin_definir_preset_da_empresa(uuid, uuid) to authenticated;
