-- As 41 regras de acesso do schema public que valiam para PUBLIC passam a valer só para
-- `authenticated`.
--
-- Por quê. Política sem `TO` vale para PUBLIC, e PUBLIC inclui o papel `anon` — quem chama a
-- API só com a chave pública do site. Nenhuma dessas 41 regras devolvia dado a esse papel, mas
-- o banco precisava AVALIAR a regra para ele. Em `whatsapp_mensagens`, a regra chama
-- `can_access_wa_conversa()` linha a linha: um pedido anônimo de uma linha só ocupava o banco
-- (que é um só para todos os assinantes) por ~3 s, até o corte de tempo do papel anon.
--
-- O que muda para quem usa: nada. Usuário logado é `authenticated`, então segue coberto pela
-- mesma regra, com a mesma expressão (ALTER POLICY ... TO não mexe no USING nem no WITH CHECK).
-- As funções do servidor usam a chave de serviço, que não passa por regra de acesso, ou
-- repassam a credencial de quem chamou (conferido nas 26 que usam a chave pública).
-- Nenhuma tela aberta sem login lê estas tabelas.
--
-- Ensaiado em produção em 22/09/2026, em transação desfeita, como um vendedor real:
--   conversas 781 -> 781 · chat 289 -> 289 · anexos 5.484 -> 5.484 · números 2 -> 2
--   pedido anônimo em whatsapp_mensagens: de ~3 s cortado por tempo para 0 linhas em 1 ms
--
-- A lista é explícita, e não "toda regra PUBLIC", para que esta migration faça hoje e amanhã
-- exatamente o que foi ensaiado. Regras que não existirem (algumas só existem em produção)
-- são puladas, para a migration não quebrar num banco montado do zero.
--
-- Regra nova: toda política escrita daqui em diante declara `TO authenticated` (ou o papel
-- certo). Sem o `TO`, ela nasce aberta para o visitante.

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('chat_mensagens',                  'Destinatários podem marcar DMs como lidas'),
      ('chat_mensagens',                  'Membros da empresa podem marcar mensagens de grupo como lidas'),
      ('colunas_customizadas',            'Colunas customizadas são visíveis pela empresa'),
      ('colunas_customizadas',            'Gestores podem gerenciar colunas customizadas'),
      ('configuracoes_tabelas',           'Users can insert settings for their company'),
      ('configuracoes_tabelas',           'Users can update settings for their company'),
      ('configuracoes_tabelas',           'Users can view settings for their company'),
      ('configuracoes_wapi',              'wapi_config_select'),
      ('configuracoes_wapi',              'wapi_config_update'),
      ('emails',                          'Users can manage their own emails'),
      ('emails_recebidos',                'Users can manage their own received emails'),
      ('emails_recebidos',                'Usuários podem atualizar seus próprios e-mails recebidos'),
      ('emails_recebidos',                'Usuários podem ver seus próprios e-mails recebidos'),
      ('evento_avisos',                   'evento_avisos_recusa_tudo'),
      ('evento_lembretes_enviados',       'evento_lembretes_enviados_recusa_tudo'),
      ('gmail_tokens',                    'Users can manage their own gmail tokens'),
      ('linhas_ignoradas_importacao',     'Usuários podem excluir suas próprias linhas ignoradas'),
      ('linhas_ignoradas_importacao',     'Usuários podem inserir suas próprias linhas ignoradas'),
      ('linhas_ignoradas_importacao',     'Usuários podem ver suas próprias linhas ignoradas'),
      ('pedido_anexos',                   'pedido_anexos_delete'),
      ('pedido_anexos',                   'pedido_anexos_insert'),
      ('pedido_anexos',                   'pedido_anexos_select'),
      ('user_domains',                    'Users can delete their own domains'),
      ('user_domains',                    'Users can insert their own domains'),
      ('user_domains',                    'Users can update their own domains'),
      ('user_domains',                    'Users can view their own domains'),
      ('user_integrations',               'Users can insert their own integrations'),
      ('user_integrations',               'Users can manage their own integrations'),
      ('user_integrations',               'Users can update their own integrations'),
      ('user_integrations',               'Users can view their own integrations'),
      ('wapi_instancia_usuarios',         'wapi_iu_select'),
      ('whatsapp_contatos_fotos',         'empresa_own_contatos_fotos'),
      ('whatsapp_conversa_atribuicoes',   'wa_conversa_atribuicoes_select'),
      ('whatsapp_conversa_responsaveis',  'wa_conversa_responsaveis_access'),
      ('whatsapp_conversa_visualizacoes', 'wa_conversa_visualizacoes_insert'),
      ('whatsapp_conversa_visualizacoes', 'wa_conversa_visualizacoes_select'),
      ('whatsapp_conversa_visualizacoes', 'wa_conversa_visualizacoes_update'),
      ('whatsapp_conversas',              'wa_conversas_access'),
      ('whatsapp_figurinhas',             'wa_figurinhas_select'),
      ('whatsapp_figurinhas',             'wa_figurinhas_update'),
      ('whatsapp_mensagens',              'wa_mensagens_access')
    ) as t(tabela, regra)
  loop
    if exists (
      select 1
        from pg_policy p
        join pg_class c on c.oid = p.polrelid
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = r.tabela and p.polname = r.regra
    ) then
      execute format('alter policy %I on public.%I to authenticated', r.regra, r.tabela);
    end if;
  end loop;
end
$$;
