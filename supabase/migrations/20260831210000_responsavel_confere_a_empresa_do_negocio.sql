-- ============================================================================
-- A lista de responsáveis passa a conferir a empresa DO NEGÓCIO, não só a da pessoa.
--
-- 🔴 BURACO ACHADO NO TESTE DA PRÓPRIA MIGRATION ANTERIOR (20260831200000), minutos depois
-- de aplicá-la. Reproduzido com o JWT de um gestor real da MD Representações:
--
--     [6] gestor mexeu em negocio de OUTRA empresa -- ERRADO!
--
-- A política escrita ontem conferia `usuario_in_my_empresa(usuario_id)` — a empresa da PESSOA
-- que está sendo acrescentada. Como essa pessoa é da minha empresa, a checagem passava; e
-- nada olhava de quem era o NEGÓCIO. Um gestor podia pendurar a si mesmo, ou um colega, num
-- negócio de outro assinante.
--
-- 🔴 POR QUE ISSO É PIOR DO QUE UMA LINHA A MAIS NUMA TABELA. `pedidos.usuario_id` É A CHAVE
-- DE EMPRESA deste sistema — não existe `pedidos.empresa_id`. Se a linha intrusa virasse
-- principal, o espelho (`fn_espelha_principal_em_pedidos`, que é SECURITY DEFINER e não passa
-- por RLS) reescreveria `pedidos.usuario_id` com o usuário da MD — e o negócio MUDARIA DE
-- EMPRESA. Hoje o índice parcial de um-principal-só barra o último passo por acidente, e
-- isolamento entre clientes não pode depender de acidente.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- O QUE O PLANO DIZIA, E POR QUE ESTÁ ERRADO AQUI
--
-- `docs/operacao/plano-multi-responsavel.md` §4.6 diz que a política desta tabela não deve
-- consultar `pedidos`, senão "voltaria o problema de §4.5 pelo outro lado". Medi, e as duas
-- direções não são simétricas:
--
--   §4.5 (o problema real) — política de `pedidos` com EXISTS contra a ligação:
--        o Postgres larga o índice e VARRE os 11.911 negócios ......... 29,0 ms · 1.149 buffers
--
--   aqui — política da ligação com busca em `pedidos` pela CHAVE PRIMÁRIA:
--        Index Scan using pedidos_pkey ............................... 1,7 ms ·     4 buffers
--
-- A diferença é o lado da chave. Lá o predicado cita `pedidos.id` dentro de um OR e destrói o
-- plano da tabela grande; aqui é uma busca direta por chave primária, uma por linha da
-- ligação — e a ligação é sempre consultada por negócio, ou seja, um punhado de linhas.
-- ============================================================================

drop policy if exists pedido_responsaveis_select on public.pedido_responsaveis;
create policy pedido_responsaveis_select on public.pedido_responsaveis
  for select to authenticated
  using (
    public.usuario_in_my_empresa(usuario_id)
    and public.usuario_in_my_empresa(
          (select p.usuario_id from public.pedidos p where p.id = pedido_id))
  );

drop policy if exists pedido_responsaveis_escrita on public.pedido_responsaveis;
create policy pedido_responsaveis_escrita on public.pedido_responsaveis
  for all to authenticated
  using (
    public.usuario_in_my_empresa(usuario_id)
    -- 🔴 A LINHA QUE FALTAVA: o NEGÓCIO também precisa ser da minha empresa.
    and public.usuario_in_my_empresa(
          (select p.usuario_id from public.pedidos p where p.id = pedido_id))
    and (public.is_gestor()
         or public.has_permission(public.get_my_usuario_id(), 'pedidos', 'editar'))
  )
  with check (
    public.usuario_in_my_empresa(usuario_id)
    and public.usuario_in_my_empresa(
          (select p.usuario_id from public.pedidos p where p.id = pedido_id))
    and (public.is_gestor()
         or public.has_permission(public.get_my_usuario_id(), 'pedidos', 'editar'))
  );
