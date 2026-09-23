-- ============================================================================
-- VENDEDOR NAO REESCREVE A INSTANCIA DE WHATSAPP (item 74, passo 1 de 3)
-- ============================================================================
-- `configuracoes_wapi` estava com UPDATE liberado na TABELA INTEIRA para `authenticated`, e a
-- regra `wapi_config_update` autoriza quem tiver vinculo com a instancia
-- (`wapi_instancia_usuarios`) — nao so gestor. Resultado: o vendedor que atende o numero
-- reescrevia qualquer coluna.
--
-- 🔴 A PIOR DELAS E `instance_url`. `supabase/functions/whatsapp-send/index.ts:357` monta o
-- endereco da operadora a partir dessa coluna, e `:436` manda a chave verdadeira no cabecalho
-- `token`. Ou seja: o vendedor aponta o campo para um servidor dele e O NOSSO SERVIDOR entrega
-- a chave e o texto das mensagens na mao dele, no proximo envio. Trocar `empresa_id` desvia o
-- WhatsApp que ENTRA para outro inquilino
-- (`supabase/functions/whatsapp-webhook/index.ts:171-185` carimba a empresa por essa coluna).
--
-- O CONSERTO E POR COLUNA, NAO POR REGRA. Ensaiado: estreitar a politica NAO fecha o vendedor
-- vinculado — quem fecha e o privilegio de coluna. Regra de acesso decide a LINHA; quem decide a
-- COLUNA e o GRANT.
--
-- O navegador so grava TRES colunas, em 6 pontos do codigo:
--   status  -> use-whatsapp-inbox.ts:2005 e :2031, use-admin-whatsapp.ts:170 e :199
--   apelido -> use-admin-whatsapp.ts:221
--   cor     -> use-admin-whatsapp.ts:245
-- Nenhum ponto do `src/` grava instance_url, api_key, empresa_id, instance_name ou provisionada.
--
-- `service_role` NAO e tocado: as 12 funcoes de servidor continuam com acesso total, e sao elas
-- que criam e provisionam instancia.
--
-- Ensaiado em producao em transacao desfeita, como um vendedor vinculado sem cargo de chefia:
--   ANTES  -> trocar o endereco do servidor: 2 linhas alteradas; mudar status: 2 linhas
--   DEPOIS -> trocar o endereco: RECUSADO (42501); status: 2 linhas; apelido: 2 linhas
--
-- ⚠️ O QUE ESTE PASSO **NAO** FECHA: a LEITURA da chave. O vendedor vinculado continua lendo
-- `api_key` e `webhook_secret`, porque as 3 chamadas a operadora (conectar, conferir status,
-- desconectar) ainda saem do navegador e precisam do cabecalho. Fechar isso e o passo 2: mover
-- essas 3 chamadas para uma funcao de servidor e so entao revogar o SELECT das duas colunas.
-- Passo 3: `whatsapp-provision` deixa QUALQUER pessoa logada se vincular a instancia da empresa
-- sem conferir cargo (linhas 113-170, caminho sem `target_usuario_id`) — enquanto isso existir,
-- qualquer conserto por vinculo se apoia em areia.
--
-- Rollback: `grant update on public.configuracoes_wapi to authenticated;`
-- 🔴 E SO ISSO. Nao acrescente `select` no rollback: devolveria escrita em todas as colunas.
-- ============================================================================

BEGIN;

REVOKE UPDATE ON public.configuracoes_wapi FROM authenticated;

GRANT UPDATE (status, apelido, cor) ON public.configuracoes_wapi TO authenticated;

COMMIT;
