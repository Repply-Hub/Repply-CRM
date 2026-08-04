-- O administrador global deixa de enxergar o CONTEUDO das empresas.
--
-- Ate aqui, ~40 policies comecavam com `is_admin() OR ...`, o que dava ao admin
-- leitura e escrita sobre negocios, clientes, contatos, tarefas, obras, chat,
-- WhatsApp e a caixa de e-mail de TODAS as empresas. Nao era vazamento entre
-- clientes -- verificado empresa por empresa, cada uma le so o proprio
-- (empresa_id = get_my_empresa_id()) -- mas era acesso irrestrito de um unico
-- papel a correspondencia e a carteira de todos os assinantes.
--
-- O trabalho do admin global e gerir ASSINANTES, nao operar o CRM deles. O
-- painel de CS continua funcionando porque le por RPCs SECURITY DEFINER
-- (admin_empresas_cs, admin_empresa_usuarios, admin_definir_plano), que
-- ignoram RLS por construcao e devolvem so agregados e metadados -- contagens,
-- datas, plano -- nunca o conteudo. Verificado depois desta migration:
--
--   tabela            admin   MD Repr.   TESTE
--   pedidos               0      9.418       0
--   clientes              0      1.304       0
--   contatos              0      1.091       0
--   chat_mensagens        0         55       0
--   email_mensagens       0          0     113
--
-- O que o admin CONTINUA acessando, porque e o oficio dele: empresas, usuarios,
-- empresa_assinaturas, app_erros, configuracoes_wapi e wapi_instancia_usuarios.
--
-- Nenhuma policy tinha is_admin() como condicao UNICA (conferido antes), entao
-- remover o termo sempre deixa a regra por empresa de pe.
-- ALTER POLICY em vez de DROP+CREATE: preserva nome e definicao, e nao abre
-- janela sem policy.

-- ---------- carteira de clientes ----------
ALTER POLICY clientes_select ON public.clientes
  USING ((usuario_id = get_my_usuario_id()) OR usuario_in_my_empresa(usuario_id));
ALTER POLICY clientes_insert ON public.clientes
  WITH CHECK ((usuario_id = get_my_usuario_id()) OR usuario_in_my_empresa(usuario_id));
ALTER POLICY clientes_update ON public.clientes
  USING ((usuario_id = get_my_usuario_id()) OR usuario_in_my_empresa(usuario_id));
ALTER POLICY clientes_delete ON public.clientes
  USING (is_gestor() AND usuario_in_my_empresa(usuario_id));

ALTER POLICY contatos_select ON public.contatos
  USING ((usuario_id = get_my_usuario_id()) OR usuario_in_my_empresa(usuario_id) OR (usuario_id IS NULL));
ALTER POLICY contatos_insert ON public.contatos
  WITH CHECK ((usuario_id = get_my_usuario_id()) OR usuario_in_my_empresa(usuario_id));
ALTER POLICY contatos_update ON public.contatos
  USING ((usuario_id = get_my_usuario_id()) OR usuario_in_my_empresa(usuario_id));
ALTER POLICY contatos_delete ON public.contatos
  USING (is_gestor() AND usuario_in_my_empresa(usuario_id));

-- ---------- negocios ----------
ALTER POLICY pedidos_select ON public.pedidos
  USING ((usuario_id = get_my_usuario_id()) OR usuario_in_my_empresa(usuario_id));
ALTER POLICY pedidos_insert ON public.pedidos
  WITH CHECK ((usuario_id = get_my_usuario_id()) OR (is_gestor() AND usuario_in_my_empresa(usuario_id)));
ALTER POLICY pedidos_update ON public.pedidos
  USING ((usuario_id = get_my_usuario_id()) OR (is_gestor() AND usuario_in_my_empresa(usuario_id)));
ALTER POLICY pedidos_delete ON public.pedidos
  USING (is_gestor() AND usuario_in_my_empresa(usuario_id));

ALTER POLICY itens_pedido_select ON public.itens_pedido
  USING (EXISTS (SELECT 1 FROM pedidos p
                 WHERE p.id = itens_pedido.pedido_id AND usuario_in_my_empresa(p.usuario_id)));
ALTER POLICY itens_pedido_insert ON public.itens_pedido
  WITH CHECK (EXISTS (SELECT 1 FROM pedidos p
                      WHERE p.id = itens_pedido.pedido_id
                        AND ((p.usuario_id = get_my_usuario_id()) OR (is_gestor() AND usuario_in_my_empresa(p.usuario_id)))));
ALTER POLICY itens_pedido_update ON public.itens_pedido
  USING (EXISTS (SELECT 1 FROM pedidos p
                 WHERE p.id = itens_pedido.pedido_id
                   AND ((p.usuario_id = get_my_usuario_id()) OR (is_gestor() AND usuario_in_my_empresa(p.usuario_id)))));
ALTER POLICY itens_pedido_delete ON public.itens_pedido
  USING (EXISTS (SELECT 1 FROM pedidos p
                 WHERE p.id = itens_pedido.pedido_id
                   AND ((p.usuario_id = get_my_usuario_id()) OR (is_gestor() AND usuario_in_my_empresa(p.usuario_id)))));

ALTER POLICY pedidos_historico_status_select ON public.pedidos_historico_status
  USING (EXISTS (SELECT 1 FROM pedidos p
                 WHERE p.id = pedidos_historico_status.pedido_id
                   AND ((p.usuario_id = get_my_usuario_id()) OR usuario_in_my_empresa(p.usuario_id))));

-- ---------- tarefas e obras ----------
ALTER POLICY tarefas_select ON public.tarefas
  USING ((usuario_id = get_my_usuario_id()) OR usuario_in_my_empresa(usuario_id) OR (usuario_id IS NULL));
ALTER POLICY tarefas_insert ON public.tarefas
  WITH CHECK ((usuario_id = get_my_usuario_id()) OR (is_gestor() AND usuario_in_my_empresa(usuario_id)));
ALTER POLICY tarefas_update ON public.tarefas
  USING ((usuario_id = get_my_usuario_id()) OR (is_gestor() AND usuario_in_my_empresa(usuario_id)));
ALTER POLICY tarefas_delete ON public.tarefas
  USING (is_gestor() AND usuario_in_my_empresa(usuario_id));

ALTER POLICY obras_select ON public.obras
  USING (EXISTS (SELECT 1 FROM clientes c
                 WHERE c.id = obras.cliente_id AND usuario_in_my_empresa(c.usuario_id)));
ALTER POLICY obras_insert ON public.obras
  WITH CHECK (EXISTS (SELECT 1 FROM clientes c
                      WHERE c.id = obras.cliente_id AND usuario_in_my_empresa(c.usuario_id)));
ALTER POLICY obras_update ON public.obras
  USING (EXISTS (SELECT 1 FROM clientes c
                 WHERE c.id = obras.cliente_id AND usuario_in_my_empresa(c.usuario_id)));
ALTER POLICY obras_delete ON public.obras
  USING (is_gestor() AND EXISTS (SELECT 1 FROM clientes c
                                 WHERE c.id = obras.cliente_id AND usuario_in_my_empresa(c.usuario_id)));

-- ---------- historicos ----------
ALTER POLICY historico_contatos_select ON public.historico_contatos
  USING (EXISTS (SELECT 1 FROM pedidos p
                 WHERE p.id = historico_contatos.pedido_id AND usuario_in_my_empresa(p.usuario_id)));
ALTER POLICY historico_contatos_insert ON public.historico_contatos
  WITH CHECK (EXISTS (SELECT 1 FROM pedidos p
                      WHERE p.id = historico_contatos.pedido_id
                        AND ((p.usuario_id = get_my_usuario_id()) OR (is_gestor() AND usuario_in_my_empresa(p.usuario_id)))));
ALTER POLICY historico_contatos_update ON public.historico_contatos
  USING (EXISTS (SELECT 1 FROM pedidos p
                 WHERE p.id = historico_contatos.pedido_id
                   AND ((p.usuario_id = get_my_usuario_id()) OR (is_gestor() AND usuario_in_my_empresa(p.usuario_id)))));
ALTER POLICY historico_contatos_delete ON public.historico_contatos
  USING (is_gestor() AND EXISTS (SELECT 1 FROM pedidos p
                                 WHERE p.id = historico_contatos.pedido_id AND usuario_in_my_empresa(p.usuario_id)));

ALTER POLICY historico_alteracoes_select ON public.historico_alteracoes
  USING (is_gestor() AND (empresa_id = get_my_empresa_id()));
ALTER POLICY historico_alteracoes_insert ON public.historico_alteracoes
  WITH CHECK ((usuario_id = get_my_usuario_id()) AND (empresa_id = get_my_empresa_id()));

-- ---------- e-mail (o motivo imediato desta migration) ----------
ALTER POLICY email_contas_select ON public.email_contas
  USING (empresa_id = get_my_empresa_id());
ALTER POLICY email_mensagens_select ON public.email_mensagens
  USING (empresa_id = get_my_empresa_id());
ALTER POLICY email_mensagens_update ON public.email_mensagens
  USING (empresa_id = get_my_empresa_id())
  WITH CHECK (empresa_id = get_my_empresa_id());

-- ---------- WhatsApp (tabela legada) ----------
ALTER POLICY whatsapp_select ON public.mensagens_whatsapp
  USING ((usuario_id = get_my_usuario_id()) OR (is_gestor() AND usuario_in_my_empresa(usuario_id)));
ALTER POLICY whatsapp_insert ON public.mensagens_whatsapp
  WITH CHECK (usuario_id = get_my_usuario_id());
ALTER POLICY whatsapp_delete ON public.mensagens_whatsapp
  USING (is_gestor() AND usuario_in_my_empresa(usuario_id));

-- ---------- notificacoes ----------
ALTER POLICY notificacoes_select ON public.notificacoes
  USING ((usuario_id = get_my_usuario_id()) OR (is_gestor() AND usuario_in_my_empresa(usuario_id)));
ALTER POLICY notificacoes_insert ON public.notificacoes
  WITH CHECK (is_gestor() AND usuario_in_my_empresa(usuario_id));
ALTER POLICY notificacoes_update ON public.notificacoes
  USING ((usuario_id = get_my_usuario_id()) OR (is_gestor() AND usuario_in_my_empresa(usuario_id)));
ALTER POLICY notificacoes_delete ON public.notificacoes
  USING ((usuario_id = get_my_usuario_id()) OR (is_gestor() AND usuario_in_my_empresa(usuario_id)));

-- ---------- chat interno ----------
ALTER POLICY chat_select ON public.chat_mensagens
  USING ((empresa_id = get_my_empresa_id())
         AND (((grupo_id IS NULL) AND (recipient_id IS NULL))
              OR (usuario_id = get_my_usuario_id())
              OR (recipient_id = get_my_usuario_id())
              OR ((grupo_id IS NOT NULL) AND is_member_of_grupo(grupo_id))));
ALTER POLICY chat_delete ON public.chat_mensagens
  USING ((usuario_id = get_my_usuario_id())
         OR EXISTS (SELECT 1 FROM usuarios
                    WHERE usuarios.user_id = auth.uid() AND usuarios.role = 'empresa'));
ALTER POLICY chat_update_lida ON public.chat_mensagens
  USING ((empresa_id = get_my_empresa_id()) AND (usuario_id <> get_my_usuario_id())
         AND (((grupo_id IS NULL) AND (recipient_id IS NULL))
              OR (recipient_id = get_my_usuario_id())
              OR ((grupo_id IS NOT NULL) AND EXISTS (SELECT 1 FROM chat_grupo_membros gm
                                                     WHERE gm.grupo_id = chat_mensagens.grupo_id
                                                       AND gm.usuario_id = get_my_usuario_id()))))
  WITH CHECK ((empresa_id = get_my_empresa_id()) AND (usuario_id <> get_my_usuario_id())
         AND (((grupo_id IS NULL) AND (recipient_id IS NULL))
              OR (recipient_id = get_my_usuario_id())
              OR ((grupo_id IS NOT NULL) AND EXISTS (SELECT 1 FROM chat_grupo_membros gm
                                                     WHERE gm.grupo_id = chat_mensagens.grupo_id
                                                       AND gm.usuario_id = get_my_usuario_id()))));

ALTER POLICY chat_grupos_select ON public.chat_grupos
  USING ((empresa_id = get_my_empresa_id())
         AND ((criado_por = get_my_usuario_id()) OR is_member_of_grupo(id)));
ALTER POLICY chat_grupos_delete ON public.chat_grupos
  USING ((criado_por = get_my_usuario_id())
         OR EXISTS (SELECT 1 FROM usuarios
                    WHERE usuarios.user_id = auth.uid()
                      AND usuarios.role = ANY (ARRAY['empresa'::text, 'gestor'::text])
                      AND usuarios.empresa_id = chat_grupos.empresa_id));

ALTER POLICY chat_grupo_membros_select ON public.chat_grupo_membros
  USING (EXISTS (SELECT 1 FROM chat_grupos g
                 WHERE g.id = chat_grupo_membros.grupo_id
                   AND g.empresa_id = get_my_empresa_id()
                   AND ((g.criado_por = get_my_usuario_id()) OR is_member_of_grupo(g.id))));

ALTER POLICY chat_mensagens_leituras_select ON public.chat_mensagens_leituras
  USING (EXISTS (SELECT 1 FROM chat_mensagens m
                 WHERE m.id = chat_mensagens_leituras.mensagem_id
                   AND m.empresa_id = get_my_empresa_id()
                   AND (((m.grupo_id IS NULL) AND (m.recipient_id IS NULL))
                        OR (m.usuario_id = get_my_usuario_id())
                        OR (m.recipient_id = get_my_usuario_id())
                        OR ((m.grupo_id IS NOT NULL) AND EXISTS (SELECT 1 FROM chat_grupo_membros gm
                                                                 WHERE gm.grupo_id = m.grupo_id
                                                                   AND gm.usuario_id = get_my_usuario_id())))));

ALTER POLICY chat_geral_config_select ON public.chat_geral_config
  USING (empresa_id = get_my_empresa_id());
ALTER POLICY chat_geral_config_insert ON public.chat_geral_config
  WITH CHECK (is_gestor() AND (empresa_id = get_my_empresa_id()));
ALTER POLICY chat_geral_config_update ON public.chat_geral_config
  USING (is_gestor() AND (empresa_id = get_my_empresa_id()));
