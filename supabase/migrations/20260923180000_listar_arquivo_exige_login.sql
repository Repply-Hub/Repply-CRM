-- Listar arquivo do Storage passa a exigir login — item 43 da divida tecnica.
--
-- ------------------------------------------------------------------ o que estava aberto
--
-- Quatro regras de leitura de `storage.objects` valiam para o papel `public`, que inclui o
-- visitante SEM NENHUMA credencial. Medido em 23/09/2026, assumindo o papel `anon` pelo
-- caminho exato que o `.list()` do JavaScript usa (`storage.search`):
--
--   email-assets    481 arquivos   (2 pastas na raiz)
--   avatars          28 arquivos  (16 pastas na raiz)
--   ajuda-imagens    20 arquivos  (20 na raiz)
--   branding          3 arquivos   (3 pastas na raiz)
--                    ---
--                    532 arquivos, e as pastas sao os `empresa_id`
--
-- 🔴 A DIFERENCA QUE FAZ ISTO IMPORTAR. O plano dos baldes privados descreveu o risco como
-- "quem tem o LINK baixa o arquivo". Listar e outra coisa: nao e preciso ter link nenhum.
-- Pega-se a raiz do balde, leem-se as pastas — que sao os identificadores de empresa — e
-- enumera-se cada uma. Nao e link vazado, e inventario.
--
-- O grosso ja tinha sido fechado: `pedido-anexos` em 27/08 e `whatsapp-media` + `chat-files`
-- em 28/08 (migration 20260828120615). Sobraram os quatro que a §8 daquele plano deixou de
-- fora — mas aquela decisao era sobre o balde ser PUBLICO, que e o eixo do download. A
-- listagem e um eixo separado, e ninguem decidiu deixa-la aberta.
--
-- ------------------------------------------------------------------ por que NAO quebra nada
--
-- Enquanto `public = true`, a porta `/object/public/...` PULA a autorizacao — o link continua
-- abrindo para qualquer um, com ou sem login. Ja existe a prova disso rodando em producao:
-- `pedido-anexos` e publico E tem a leitura so para logados desde 27/08. Medido em 23/09/2026,
-- sem nenhuma credencial:
--
--   pedido-anexos  (publico, leitura so logado)   -> HTTP 200, arquivo baixou
--   branding       (publico, leitura para todos)  -> HTTP 200
--   email-anexos   (privado)                      -> HTTP 400
--
-- Ou seja: a coluna que decide o download e `buckets.public`, e nao se mexe nela aqui. O que
-- muda e so quem consegue PERGUNTAR "o que existe dentro do balde".
--
-- E o que o proprio sistema perde: nada. Nao existe UMA chamada de `.list()` em todo o
-- repositorio (conferido em `src/` e em `supabase/functions/`), e nenhuma das cinco telas sem
-- login (`/`, `/login`, `/cadastro`, `/esqueci-senha`, `/redefinir-senha`) encosta no Storage.
-- A imagem da assinatura de e-mail, que quem busca e o programa de e-mail de quem RECEBE,
-- continua pela porta publica — que nao passa por aqui.
--
-- ------------------------------------------------------------------ as regras de gravar
--
-- As tres do avatar tambem valiam para `public`. Elas ja barravam o visitante, mas por
-- acidente: exigem `(storage.foldername(name))[1] = auth.uid()`, e `auth.uid()` e nulo sem
-- login, entao a comparacao da NULO e nao passa. Defesa que depende de um nulo e uma linha de
-- distancia de deixar de existir. Passam a dizer o que querem dizer.
--
-- Isto completa, no esquema `storage`, o que a migration 20260922140000 fez nas 41 regras do
-- esquema `public`: ela nao alcancou o Storage.

-- ---------------------------------------------------------------- ler: so quem tem login

DROP POLICY IF EXISTS "Avatars are publicly accessible" ON storage.objects;
CREATE POLICY avatars_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Imagens da ajuda sao publicas para leitura" ON storage.objects;
CREATE POLICY ajuda_imagens_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'ajuda-imagens');

DROP POLICY IF EXISTS "Logos são acessíveis publicamente" ON storage.objects;
CREATE POLICY branding_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'branding');

DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY email_assets_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'email-assets');

-- ---------------------------------------------------------------- gravar: o mesmo, dito

DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
CREATE POLICY avatars_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (auth.uid())::text);

DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
CREATE POLICY avatars_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (auth.uid())::text);

DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
CREATE POLICY avatars_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (auth.uid())::text);
