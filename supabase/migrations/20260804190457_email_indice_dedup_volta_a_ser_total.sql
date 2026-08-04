-- URGENTE: o indice parcial da migration anterior (20260804184305) QUEBROU a
-- entrada de e-mail. Esta migration desfaz aquela parte.
--
-- O QUE ACONTECEU
--
-- Os dois caminhos que gravam mensagem usam o mesmo upsert:
--   email-webhook/index.ts:167  .upsert(linha,  { onConflict: "conta_id,nylas_message_id" })
--   email-sync/index.ts:158     .upsert(linhas, { onConflict: "conta_id,nylas_message_id" })
--
-- Isso vira ON CONFLICT (conta_id, nylas_message_id). O Postgres so consegue
-- inferir um indice PARCIAL quando a propria instrucao repete o predicado do
-- indice (ON CONFLICT (...) WHERE conta_id IS NOT NULL) -- e nem o PostgREST nem
-- o supabase-js emitem esse WHERE, porque a API do cliente nem expoe a opcao.
--
-- Reproduzido no banco:
--   ERROR 42P10: there is no unique or exclusion constraint matching the
--   ON CONFLICT specification
--
-- Consequencia: nenhuma mensagem nova era gravada. O webhook ao menos falha
-- bem -- solta a marca de idempotencia e devolve 500, entao o Nylas reentrega e
-- nada se perdeu; o sync acumulava o erro em `erros[]` e a tela dizia
-- "Sincronizado com ressalvas".
--
-- POR QUE O PARCIAL ERA DESNECESSARIO DESDE O INICIO
--
-- A intencao era "declarar" que linhas arquivadas (conta_id NULL) nao colidem
-- entre si. Mas isso ja vale sem clausula nenhuma: num indice unico do Postgres
-- NULLs contam como DISTINTOS, entao varias arquivadas com o mesmo
-- nylas_message_id convivem naturalmente. Verificado nas duas pontas depois
-- desta migration: o upsert volta a atualizar em vez de duplicar, e duas
-- arquivadas com o mesmo id coexistem.
--
-- Licao para a proxima vez: indice parcial e incompativel com o upsert do
-- PostgREST. Se precisar de parcialidade numa tabela que recebe upsert, o
-- caminho e outro (constraint separada, ou a escrita virar RPC).
DROP INDEX IF EXISTS public.uniq_email_mensagens_conta_msg;

CREATE UNIQUE INDEX uniq_email_mensagens_conta_msg
  ON public.email_mensagens (conta_id, nylas_message_id);
