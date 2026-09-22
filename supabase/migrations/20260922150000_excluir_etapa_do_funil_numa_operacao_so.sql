-- Excluir uma etapa do funil e remanejar os negócios dela viram UMA operação, no banco.
--
-- O QUE ACONTECIA (item 39 da dívida técnica, gravidade crítica). A tela fazia duas gravações em
-- sequência, pelo navegador: primeiro o `update` que move os negócios para a etapa de destino,
-- depois o `delete` da coluna. Só a segunda é protegida — `kanban_colunas_delete` exige gestor —,
-- e apagar zero linhas não devolve erro. Um vendedor comum mandava excluir a etapa e:
--   1. o `update` era aceito para os negócios de que ele é responsável (`pedidos_update` deixa);
--   2. o `delete` casava zero linhas e não reclamava;
--   3. a tela dizia "Coluna excluída e negócios remanejados".
-- Depois de recarregar, a coluna continuava lá, com os negócios dos colegas dentro e sem os dele.
--
-- E MEXE NO DINHEIRO: se o destino for Fechamento ou Perdido, o gatilho `fn_set_pedido_fechado_em`
-- carimba a data de fechamento de HOJE em cada negócio movido. Eles passam a contar como vendas
-- fechadas hoje no Faturamento, no Ticket Médio e no Plano de Vendas — podem ser centenas de uma
-- vez, e a data verdadeira se perde.
--
-- POR QUE UMA FUNÇÃO, E NÃO INVERTER A ORDEM NA TELA. Duas gravações separadas sempre deixam uma
-- janela entre elas: apagar a coluna e falhar ao mover deixaria os negócios numa etapa que não
-- existe mais, invisíveis no quadro. Aqui as duas correm na mesma transação — ou acontece tudo,
-- ou não acontece nada.
--
-- `security invoker` de propósito: a regra de acesso de quem chamou é que decide, como manda o
-- CLAUDE.md §6.1. Zero linhas apagadas é RECUSA, não sucesso (§4.6), e vira erro com a frase que
-- diz o que fazer — as duas causas possíveis são falta de permissão e empresa bloqueada por
-- cobrança (a política restritiva do plano também zera as linhas, sem erro).
--
-- Ensaiado em produção em 22/09/2026, em transação desfeita, numa etapa com 48 negócios:
--   vendedor comum -> recusado com 42501, e os 48 continuaram 48 (nada se moveu)
--   gestor         -> moveu os 48 e a coluna saiu, numa operação só

create or replace function public.excluir_etapa_do_funil(p_coluna_id uuid, p_destino text)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_slug text;
  v_funil uuid;
  v_apagadas integer;
  v_movidos integer;
begin
  select slug, funil_id into v_slug, v_funil
    from kanban_colunas where id = p_coluna_id;

  if v_slug is null then
    raise exception 'Esta etapa não existe mais. Recarregue a tela.'
      using errcode = 'no_data_found';
  end if;

  -- O destino tem de existir no mesmo funil: sem isto, um destino errado deixaria os negócios
  -- numa etapa sem coluna, fora do quadro.
  if not exists (select 1 from kanban_colunas where funil_id = v_funil and slug = p_destino) then
    raise exception 'A etapa de destino não existe neste funil.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- A exclusão vem PRIMEIRO, e é ela que decide: quem não pode apagar não move negócio nenhum.
  delete from kanban_colunas where id = p_coluna_id;
  get diagnostics v_apagadas = row_count;

  if v_apagadas = 0 then
    raise exception 'A etapa NÃO foi excluída e nenhum negócio foi movido. Peça a um gestor, ou regularize a assinatura da empresa.'
      using errcode = 'insufficient_privilege';
  end if;

  update pedidos set status = p_destino
   where status = v_slug and funil_id = v_funil;
  get diagnostics v_movidos = row_count;

  return v_movidos;
end
$$;

-- Nasce trancada: só quem tem sessão executa (hábito adotado em 09/2026).
revoke all on function public.excluir_etapa_do_funil(uuid, text) from public, anon;
grant execute on function public.excluir_etapa_do_funil(uuid, text) to authenticated;

comment on function public.excluir_etapa_do_funil(uuid, text) is
  'Apaga a etapa e remanejam os negócios dela para o destino, na mesma transação. Devolve quantos negócios foram movidos. Recusa com 42501 quando a regra de acesso não deixa apagar a etapa — e aí nenhum negócio é movido.';
