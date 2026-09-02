-- Soma clientes_tipos ao inventario. A tabela tem empresa_id NOT NULL com chave
-- estrangeira para empresas e SEM ON DELETE, igual a marcadores: se ficar de fora,
-- o inventario devolve "zero em tudo" mentindo, e a apagada definitiva esbarra na
-- chave estrangeira. Recriamos a funcao inteira porque CREATE OR REPLACE exige o
-- corpo completo -- nenhuma linha existente foi alterada.
create or replace function public.inventario_da_empresa(p_empresa_id uuid)
returns table (tabela text, linhas bigint, como_se_liga text)
language sql
stable
security definer
set search_path = public
as $$
  with usuarios_da as (
    select id, user_id from public.usuarios where empresa_id = p_empresa_id
  ),
  clientes_da as (
    select c.id from public.clientes c
    where c.usuario_id in (select id from usuarios_da)
  ),
  obras_da as (
    select o.id from public.obras o where o.cliente_id in (select id from clientes_da)
  ),
  pedidos_da as (
    select p.id from public.pedidos p
    where p.usuario_id in (select id from usuarios_da)
       or p.cliente_id in (select id from clientes_da)
  )
  select * from (
    values
      ('usuarios',    (select count(*) from usuarios_da),                                    'empresa_id'),
      ('clientes',    (select count(*) from clientes_da),                                    'pelo vendedor dono'),
      ('obras',       (select count(*) from obras_da),                                       'pelo cliente'),
      ('pedidos',     (select count(*) from pedidos_da),                                     'pelo vendedor ou cliente'),
      ('itens_pedido',(select count(*) from public.itens_pedido i where i.pedido_id in (select id from pedidos_da)), 'pelo negocio'),
      ('contatos',    (select count(*) from public.contatos c
                        where c.cliente_id in (select id from clientes_da)
                           or c.obra_id in (select id from obras_da)
                           or c.criado_por_usuario_id in (select id from usuarios_da)),      'pelo cliente, obra ou quem criou'),
      ('tarefas',     (select count(*) from public.tarefas t where t.usuario_id in (select id from usuarios_da)), 'pelo usuario'),
      ('eventos',     (select count(*) from public.eventos e where e.user_id in (select user_id from usuarios_da)), 'pelo login de quem criou'),
      ('fabricantes', (select count(*) from public.fabricantes f where f.empresa_id = p_empresa_id), 'empresa_id'),
      ('whatsapp_conversas', (select count(*) from public.whatsapp_conversas w where w.empresa_id = p_empresa_id), 'empresa_id'),
      ('whatsapp_mensagens', (select count(*) from public.whatsapp_mensagens w where w.empresa_id = p_empresa_id), 'empresa_id'),
      ('email_mensagens',    (select count(*) from public.email_mensagens m where m.empresa_id = p_empresa_id), 'empresa_id'),
      ('historico_alteracoes',(select count(*) from public.historico_alteracoes h where h.empresa_id = p_empresa_id), 'empresa_id'),
      ('funis',       (select count(*) from public.funis f where f.empresa_id = p_empresa_id), 'empresa_id, SEM chave estrangeira'),
      ('kanban_colunas', (select count(*) from public.kanban_colunas k where k.empresa_id = p_empresa_id), 'empresa_id, SEM chave estrangeira'),
      ('whatsapp_webhook_origem', (select count(*) from public.whatsapp_webhook_origem w where w.empresa_id = p_empresa_id), 'empresa_id, SEM chave estrangeira'),
      ('linhas_ignoradas_importacao', (select count(*) from public.linhas_ignoradas_importacao l where l.usuario_id in (select user_id from usuarios_da)), 'pelo login'),
      ('marcadores',  (select count(*) from public.marcadores m where m.empresa_id = p_empresa_id), 'empresa_id'),
      ('clientes_tipos', (select count(*) from public.clientes_tipos ct where ct.empresa_id = p_empresa_id), 'empresa_id'),
      ('fabricante_arquivos', (select count(*) from public.fabricante_arquivos f where f.empresa_id = p_empresa_id), 'empresa_id')
  ) as t(tabela, linhas, como_se_liga)
  -- Devolve ZERO LINHAS para quem não é admin, em vez de erro.
  where public.is_admin()
  order by linhas desc, tabela;
$$;

revoke all on function public.inventario_da_empresa(uuid) from public, anon;
grant execute on function public.inventario_da_empresa(uuid) to authenticated, service_role;

comment on function public.inventario_da_empresa(uuid) is
  'O que a apagada definitiva alcancaria. SOMENTE LEITURA. Rodar DEPOIS da apagada deve devolver zero em tudo — o que sobrar e lixo que a ordem nao pegou.';
