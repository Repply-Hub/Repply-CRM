-- ============================================================================
-- A GRADE DE FIGURINHAS É O QUE SAI DO NÚMERO — E SÓ GESTOR TIRA DE LÁ
-- ============================================================================
--
-- Duas mudanças de regra decididas pelo Lucas em 03/09/2026, sobre a coleção criada em
-- 20260903120000:
--
--   1. A grade se enche SÓ com o que sai do número. Figurinha que um cliente mandou entra
--      apenas quando alguém escolhe "Salvar figurinha" no menu da mensagem.
--   2. Tirar da grade some para TODOS que atendem aquele número, então é de gestor, e a
--      tela pergunta antes.
--
-- ----------------------------------------------------------------------------
-- (a) `salva_em` — separa "como circulou" de "por que está na grade"
-- ----------------------------------------------------------------------------
--
-- 🔴 A coluna `origem` NÃO consegue responder à regra 1, e foi essa confusão que quase
-- virou perda de dado.
--
-- `origem` responde "como esta figurinha circulou": recebida de um contato, ou enviada pelo
-- número. Mas o botão "Salvar figurinha", quando usado numa mensagem recebida, também grava
-- `origem = 'recebida'` — porque é verdade, ela FOI recebida. Ou seja: a mesma marca cobre
-- a figurinha que o robô guardou sozinha e a que uma pessoa escolheu guardar.
--
-- A primeira ideia de conserto era apagar as linhas `origem = 'recebida'` que o webhook
-- tinha criado. Isso levaria junto tudo que alguém tivesse salvo de propósito, sem erro
-- nenhum na tela — a grade só ficaria menor. E o arquivo ainda prometia poder rodar de
-- novo, o que repetiria o estrago dias depois.
--
-- `salva_em` responde a outra pergunta: "alguém escolheu guardar esta figurinha?". Quem
-- grava é só o botão da tela; as funções do servidor nunca a tocam. Com ela, a regra da
-- grade fica exata e **nenhuma linha precisa ser apagada** — as que o robô guardou
-- simplesmente param de aparecer, e voltam sozinhas se um dia alguém salvar ou se a
-- figurinha sair pelo número.
--
-- A grade passa a ler: `removida_em IS NULL AND (origem = 'enviada' OR salva_em IS NOT NULL)`.
--
-- ----------------------------------------------------------------------------
-- (b) A tranca do gestor NÃO pode ser "UPDATE é só de gestor"
-- ----------------------------------------------------------------------------
--
-- "Salvar figurinha" (`useSalvarFigurinha`) não é um INSERT: é um UPSERT com
-- `onConflict: 'instancia_id,media_hash'`. Quando a figurinha já existe — que é o caso
-- comum, porque salvar serve justamente para trazer de volta uma que saiu da grade — o
-- Postgres percorre o caminho DO UPDATE e exige a política de UPDATE. Trancar o comando
-- inteiro no gestor quebraria o SALVAR do vendedor, que é ação aditiva e ninguém pediu
-- para trancar.
--
-- Então a regra olha O QUE A LINHA VIRA, não quem mexeu nela:
--
--   `removida_em` fica NULL  →  é salvar/restaurar  →  qualquer um vinculado ao número
--   `removida_em` fica cheio →  é tirar da grade    →  só empresa/gestor/admin
--
-- O `USING` continua aberto a quem é vinculado: ele decide quais LINHAS a pessoa alcança,
-- e restringi-lo faria o salvar do vendedor falhar calado (zero linhas, sem erro — o modo
-- de falha do PostgREST descrito no CLAUDE.md §4.6). Quem recusa é o `WITH CHECK`, e ele
-- recusa com erro 42501, visível na tela.
--
-- 🔴 `usuarios.user_id` é da família `auth.users` — é `auth.uid()`, nunca
-- `get_my_usuario_id()` (CLAUDE.md §4.5). Trocar não dá erro: passa a não encontrar
-- ninguém e tira a grade de todo mundo, calado. É a mesma dupla de famílias que convive
-- dentro de `can_access_wa_conversa` (20260902170000).
--
-- Os três papéis são os mesmos que `App.tsx` já usa para decidir quem é gestor, de
-- propósito: se o banco e a tela discordassem, o "x" apareceria para alguém que o banco
-- vai recusar. A lista está fixada em teste em `src/lib/figurinha.test.ts`.
--
-- Conferido antes de aplicar: os 6 números em produção têm ao menos um gestor vinculado,
-- então nenhuma grade fica sem quem possa faxinar. E `removida_em` está nulo nas 16 linhas
-- existentes — ninguém perde um hábito que já tivesse.
--
-- ----------------------------------------------------------------------------
-- CAMINHO DE VOLTA — a política de hoje, colhida de `pg_policy` antes de aplicar:
--
--   DROP POLICY IF EXISTS "wa_figurinhas_update" ON public.whatsapp_figurinhas;
--   CREATE POLICY "wa_figurinhas_update" ON public.whatsapp_figurinhas
--     FOR UPDATE
--     USING (
--       empresa_id = public.get_my_empresa_id()
--       AND EXISTS (SELECT 1 FROM public.wapi_instancia_usuarios wiu
--                    WHERE wiu.instancia_id = whatsapp_figurinhas.instancia_id
--                      AND wiu.usuario_auth_id = auth.uid())
--     )
--     WITH CHECK (
--       empresa_id = public.get_my_empresa_id()
--       AND EXISTS (SELECT 1 FROM public.wapi_instancia_usuarios wiu
--                    WHERE wiu.instancia_id = whatsapp_figurinhas.instancia_id
--                      AND wiu.usuario_auth_id = auth.uid())
--     );
--
-- A coluna pode ficar: ninguém quebra por causa dela. Nenhuma figurinha é apagada aqui —
-- só a regra muda. Rodar duas vezes não faz estrago.
-- ============================================================================

BEGIN;

-- (a) Quem escolheu guardar esta figurinha, e quando. Nulo = entrou sozinha pelo servidor.
ALTER TABLE public.whatsapp_figurinhas
  ADD COLUMN IF NOT EXISTS salva_em timestamptz;

COMMENT ON COLUMN public.whatsapp_figurinhas.salva_em IS
  'Preenchida pelo botão "Salvar figurinha" da tela — alguém escolheu guardar esta '
  'figurinha. Nula quando a linha veio sozinha das functions do servidor. A grade mostra '
  'origem = enviada OU salva_em preenchida; nunca uma recebida que ninguém escolheu.';

-- A grade lê por número, não removidas, mais recente primeiro — agora só o que aparece nela.
CREATE INDEX IF NOT EXISTS idx_wa_figurinhas_grade_visivel
  ON public.whatsapp_figurinhas (instancia_id, ultima_vez_em DESC)
  WHERE removida_em IS NULL AND (origem = 'enviada' OR salva_em IS NOT NULL);

-- (b) Só gestor tira da grade.
DROP POLICY IF EXISTS "wa_figurinhas_update" ON public.whatsapp_figurinhas;

CREATE POLICY "wa_figurinhas_update" ON public.whatsapp_figurinhas
  FOR UPDATE
  USING (
    empresa_id = public.get_my_empresa_id()
    AND EXISTS (
      SELECT 1 FROM public.wapi_instancia_usuarios wiu
      WHERE wiu.instancia_id = whatsapp_figurinhas.instancia_id
        AND wiu.usuario_auth_id = auth.uid()
    )
  )
  WITH CHECK (
    empresa_id = public.get_my_empresa_id()
    AND EXISTS (
      SELECT 1 FROM public.wapi_instancia_usuarios wiu
      WHERE wiu.instancia_id = whatsapp_figurinhas.instancia_id
        AND wiu.usuario_auth_id = auth.uid()
    )
    -- Salvar/restaurar: livre. Tirar da grade: só gestor.
    AND (
      removida_em IS NULL
      OR EXISTS (
        SELECT 1 FROM public.usuarios u
        WHERE u.user_id = auth.uid()
          AND u.role IN ('empresa', 'gestor', 'admin')
      )
    )
  );

COMMIT;

-- Confira depois de rodar. A coluna tem de existir, e o WITH CHECK tem de citar `removida_em`:
--
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'whatsapp_figurinhas'
--      and column_name = 'salva_em';
--
--   select polname, pg_get_expr(polwithcheck, polrelid) as com_check
--     from pg_policy p join pg_class c on c.oid = p.polrelid
--    where c.relname = 'whatsapp_figurinhas' and polname = 'wa_figurinhas_update';
