-- Exceção com o mesmo valor do preset deixa de ser exceção
--
-- O PROBLEMA, relatado pelo dono do produto em 21/08/2026: ele desligou e religou Obras
-- para a MD, e a linha continuou marcada como "exceção desta empresa" — anunciando uma
-- divergência que não existe, já que o preset também diz `true` para Obras.
--
-- A causa era o desenho anterior: QUALQUER toque no interruptor gravava exceção. Religar
-- criava uma exceção com o mesmo valor do preset, e desfazer exigia um segundo botão
-- ("Voltar a seguir o preset"). O botão continua útil, mas não devia ser obrigatório para
-- desfazer o que a pessoa acabou de fazer.
--
-- A REGRA AGORA: exceção é DIVERGÊNCIA. Se o valor pedido é igual ao que o preset já diz,
-- a linha é removida em vez de gravada. Assim o selo "exceção" na tela significa sempre a
-- mesma coisa — esta empresa foge do preset — e a empresa volta a acompanhar mudanças
-- futuras do preset sem ninguém precisar lembrar de limpar nada.
--
-- Isso importa além do selo: uma exceção esquecida com o valor do preset faz a empresa
-- ficar para trás no dia em que o preset mudar, sem ninguém entender por quê.

create or replace function public.admin_definir_excecao_secao(
  p_empresa_id uuid,
  p_secao      text,
  p_habilitada boolean
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_preset boolean;
begin
  if not is_admin() then
    raise exception 'Apenas o administrador global pode alterar o acesso a seções';
  end if;

  -- null continua significando "remover a exceção, volte a seguir o preset". É o que o
  -- botão da tela usa.
  if p_habilitada is null then
    delete from secao_excecoes where empresa_id = p_empresa_id and secao = p_secao;
    return;
  end if;

  -- O que o preset da empresa (ou o padrão) diz para esta seção.
  select i.habilitada
    into v_preset
    from secao_preset_itens i
   where i.secao = p_secao
     and i.preset_id = coalesce(
           (select e.secao_preset_id from empresas e where e.id = p_empresa_id),
           (select p.id from secao_presets p where p.is_padrao limit 1));

  -- Igual ao preset: não é exceção. Remove a que houver e sai.
  if v_preset is not null and v_preset = p_habilitada then
    delete from secao_excecoes where empresa_id = p_empresa_id and secao = p_secao;
    return;
  end if;

  insert into secao_excecoes (empresa_id, secao, habilitada, criada_por)
  values (p_empresa_id, p_secao, p_habilitada, auth.uid())
  on conflict (empresa_id, secao)
    do update set habilitada = excluded.habilitada,
                  criada_em  = now(),
                  criada_por = auth.uid();
end;
$$;

-- Limpa o que já foi gravado sob a regra antiga.
--
-- Estas linhas não têm efeito nenhum hoje — por definição, o valor delas é igual ao do
-- preset. O que elas causam é o selo errado na tela e o risco de a empresa ficar para trás
-- numa mudança futura de preset. Apagá-las não muda o que ninguém vê no sistema.
delete from public.secao_excecoes x
 where exists (
   select 1
     from public.secao_preset_itens i
    where i.secao = x.secao
      and i.habilitada = x.habilitada
      and i.preset_id = coalesce(
            (select e.secao_preset_id from public.empresas e where e.id = x.empresa_id),
            (select p.id from public.secao_presets p where p.is_padrao limit 1))
 );
