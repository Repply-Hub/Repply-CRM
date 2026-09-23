-- ============================================================================
-- CONTA EXCLUIDA NAO ALCANCA MAIS NADA (item 38) — PARTE 2 de 2
-- ============================================================================
-- A Parte 1 fecha o grosso: com ela, a conta removida vai de 1.314 clientes e 12.148 negocios
-- para ZERO. Mas nao fecha tudo, e o que sobra nao e pouco.
--
-- Varri TODAS as tabelas de `public` assumindo a identidade da conta removida, ja com a Parte 1
-- aplicada (ensaio em transacao desfeita, 23/09/2026). O que ela ainda lia:
--
--     whatsapp_contatos_fotos ... 503   <- TEM TELEFONE DE CLIENTE
--     eventos ................... 109   <- a agenda
--     configuracoes_tabelas .....   7
--     configuracoes_wapi ........   2   <- api_key e webhook_secret da operadora
--     wapi_instancia_usuarios ...   2
--
-- E, do lado da GRAVACAO, ha regras que citam `auth.uid()` direto, sem passar por nenhuma das
-- funcoes consertadas — entao a Parte 1 nao as alcanca: chat_mensagens (alterar),
-- chat_grupos e chat_grupo_membros (inserir), colunas_customizadas (tudo),
-- configuracoes_tabelas (alterar/inserir), configuracoes_wapi (alterar),
-- whatsapp_contatos_fotos (tudo), eventos (alterar/excluir).
--
-- POR QUE REGRA RESTRITIVA, E NAO REMENDAR UMA A UMA: os ramos que sobram nao passam por
-- `usuarios` (`usuario_auth_id = auth.uid()` nos vinculos de WhatsApp, `user_id = auth.uid()`
-- em eventos). So um `AND` por cima alcanca todos de uma vez. O padrao ja e o da casa — e o
-- mesmo desenho das regras `*_exige_plano_*`, que usam `empresa_plano_ativo()`.
--
-- FICAM DE FORA, DE PROPOSITO:
--   * `public.usuarios` — a propria linha e o que sustenta a tela "Conta suspensa". Fechar ali
--     faz o app deslogar em looping (medido).
--   * tabelas de escopo pessoal e inofensivo: sidebar_preferences, app_erros, gmail_tokens,
--     user_domains, user_integrations, linhas_ignoradas_importacao.
--   * catalogos sem dado de cliente: planos, secao_presets, secao_preset_itens, ajuda_imagens,
--     perfis_customizados.
--
-- Ensaiado em 23/09/2026, com as duas partes juntas:
--     conta removida, depois ... 0 0 0 0 0 0 0 0 0   (as 9 tabelas)
--     vendedor vivo, antes ..... 2 2 503 7 0 378 2 22 288
--     vendedor vivo, depois .... 2 2 503 7 0 378 2 22 288   -> IDENTICO
--
-- 🔴 ISTO NAO SUBSTITUI REVOGAR O LOGIN. As 16 funcoes de servidor que consultam `usuarios`
-- rodam com chave de servico e ignoram toda regra do banco — nenhuma migration as alcanca.
-- Enquanto o login viver, quem saiu ainda manda WhatsApp em nome da empresa por esse caminho.
-- Ver o item 38 em docs/divida-tecnica.md.
--
-- `CREATE POLICY` pega bloqueio exclusivo na tabela: aplicar em horario de baixa.
-- Rollback: `drop policy <tabela>_exige_conta_viva on public.<tabela>;` nas 9, e
--           `drop function public.conta_viva();`
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.conta_viva()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios
     WHERE user_id = auth.uid() AND deleted_at IS NULL
  );
$function$;

REVOKE ALL ON FUNCTION public.conta_viva() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.conta_viva() TO authenticated, service_role;

CREATE POLICY configuracoes_wapi_exige_conta_viva ON public.configuracoes_wapi
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.conta_viva()) WITH CHECK (public.conta_viva());

CREATE POLICY wapi_instancia_usuarios_exige_conta_viva ON public.wapi_instancia_usuarios
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.conta_viva()) WITH CHECK (public.conta_viva());

CREATE POLICY whatsapp_contatos_fotos_exige_conta_viva ON public.whatsapp_contatos_fotos
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.conta_viva()) WITH CHECK (public.conta_viva());

CREATE POLICY configuracoes_tabelas_exige_conta_viva ON public.configuracoes_tabelas
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.conta_viva()) WITH CHECK (public.conta_viva());

CREATE POLICY colunas_customizadas_exige_conta_viva ON public.colunas_customizadas
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.conta_viva()) WITH CHECK (public.conta_viva());

CREATE POLICY chat_mensagens_exige_conta_viva ON public.chat_mensagens
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.conta_viva()) WITH CHECK (public.conta_viva());

CREATE POLICY chat_grupos_exige_conta_viva ON public.chat_grupos
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.conta_viva()) WITH CHECK (public.conta_viva());

CREATE POLICY chat_grupo_membros_exige_conta_viva ON public.chat_grupo_membros
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.conta_viva()) WITH CHECK (public.conta_viva());

CREATE POLICY eventos_exige_conta_viva ON public.eventos
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.conta_viva()) WITH CHECK (public.conta_viva());

COMMIT;
