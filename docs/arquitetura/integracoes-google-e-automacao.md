# Integrações Google e configuração de automação

Cobre três assuntos que nasceram juntos nesta investigação: o **Google Maps** (removido em
08/2026 — hoje o mapa é Leaflet + OpenStreetMap), o **Gmail OAuth** (hoje legado) e a tabela
**`configuracoes_automacao`** depois da consolidação multi-empresa.

> ⚠️ **Atualização de 19/08/2026 — o Gmail não é mais o provedor de e-mail.** O sistema
> migrou para o **Nylas** em agosto de 2026. Tudo que este documento diz sobre `gmail_*`
> descreve **código legado que ainda está no repositório**, não o caminho ativo. O provedor
> atual está em [`docs/modulos/email.md`](../modulos/email.md).
>
> ⚠️ **Atualização de 24/08/2026 — o Google Maps também saiu.** O mapa de obras e a
> geocodificação passaram a usar **Leaflet + OpenStreetMap / Nominatim**, sem chave de API.
> Tudo que este documento diz sobre Maps é registro histórico.
>
> O que continua válido: a seção de **`configuracoes_automacao`**
> e as três divergências apontadas na seção 8 — que já foram corrigidas em
> [`integracoes-externas.md`](integracoes-externas.md).

> Documento gerado a partir de leitura direta do código em `supabase/functions/`, `supabase/migrations/` e
> `src/` nesta data (2026-07-07). Todas as afirmações abaixo citam o arquivo e a linha de onde foram
> extraídas. Não reutiliza conteúdo de `INTEGRATION_AUDIT.md` ou de documentos anteriores sem
> reconfirmação — divergências encontradas em relação a esse documento estão sinalizadas na seção 8.

> ⚠️ **Alerta de segurança (atualizado em 24/08/2026)**: uma chave real de
> `VITE_GOOGLE_MAPS_API_KEY` circulou em texto plano no `INTEGRATION_AUDIT.md` (arquivo que já
> saiu do repositório) e nos commits antigos do histórico do git. A chave foi rotacionada e o
> valor literal foi removido também deste documento — mas o histórico do git continua expondo
> a antiga, que deve seguir tratada como comprometida.

## 1. Visão geral

Existem duas integrações Google independentes neste projeto:

- **Gmail OAuth2** — autenticação por usuário individual (não há conexão "compartilhada por empresa").
  Cada `usuario` conecta sua própria conta Gmail para enviar e-mails e sincronizar a caixa de entrada
  dentro do CRM. **Não existe** roteamento por tipo de conexão (pessoal vs. empresa): a fase de
  consolidação multi-tenant do Gmail (schema dual `gmail_tokens` com `empresa_id`/`tipo`) **não foi
  aplicada** — ver seção 4 e seção 8 para o estado exato.
- **Google Maps** — usada apenas no frontend, para exibir o mapa de obras (`MapaObras.tsx`) e para
  geocodificação de endereços (`use-geocode-obras.ts`). Sem componente server-side.

## 2. Pré-requisitos no Google Cloud Console

Não houve mudança de código nesta área — segue o que já era necessário:

- Um projeto no Google Cloud Console com as APIs **Gmail API** e **Maps JavaScript API** / **Geocoding
  API** habilitadas.
- Credenciais **OAuth 2.0 Client ID** (tipo "Web application") para o Gmail, com uma **Redirect URI**
  autorizada apontando para `https://<SUPABASE_URL>/functions/v1/gmail-callback` (ver seção 5).
- Uma **API Key** de Maps (sem OAuth, chave simples) com restrição de domínio recomendada.

## 3. Variáveis de ambiente / secrets

### Secrets do Supabase (Edge Functions), confirmados por `grep -rn "Deno.env.get" supabase/functions/`:

| Secret | Onde é consumido |
|---|---|
| `GOOGLE_CLIENT_ID` | `gmail-auth-url/index.ts:23`, `gmail-callback/index.ts:23`, `gmail-send/index.ts:57`, `gmail-sync-inbox/index.ts:45,103`, `gmail-debug/index.ts:67` |
| `GOOGLE_CLIENT_SECRET` | `gmail-callback/index.ts:24`, `gmail-send/index.ts:58`, `gmail-sync-inbox/index.ts:46,104`, `gmail-debug/index.ts:68` |
| `SUPABASE_URL` | usado para montar o `redirect_uri` do OAuth em `gmail-auth-url/index.ts:24` e `gmail-callback/index.ts:25`; também usado (com `SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_ANON_KEY`) para criar o client Supabase nas 5 funções |
| `SUPABASE_SERVICE_ROLE_KEY` | client admin em `gmail-callback`, `gmail-send`, `gmail-sync-inbox`, `gmail-debug` (bypassa RLS para ler/gravar `gmail_tokens`) |
| `SUPABASE_ANON_KEY` | client de usuário em `gmail-debug/index.ts:17`, usado só para validar o JWT do chamador via `auth.getUser()` |
| `APP_URL` | consumido **apenas** em `gmail-callback/index.ts:68-70`, para montar o redirect final de volta ao app após o OAuth. **Não tem mais fallback hardcoded**: se ausente, a função lança `Error('APP_URL não configurado')` antes do redirect. |

Não há `GOOGLE_MAPS_API_KEY` (server-side) em nenhuma Edge Function — Maps é 100% client-side.

### Variáveis `VITE_` (frontend)

| Variável | Onde é consumida |
|---|---|
| `VITE_GOOGLE_MAPS_API_KEY` | **Não existe mais (08/2026).** Era consumida por `MapaObras.tsx` e `use-geocode-obras.ts`; os dois passaram a usar Leaflet + OpenStreetMap/Nominatim, sem chave. |

## 4. Estrutura de `gmail_tokens` (estado atual)

A tabela foi criada em [`20260430170853_98772703-...sql`](../supabase/migrations/20260430170853_98772703-d3ad-489e-a062-051d06d444d0.sql):

```sql
CREATE TABLE public.gmail_tokens (
    user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at BIGINT NOT NULL,
    email TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
```

- **PK**: `user_id` (referencia `auth.users(id)`, não `usuarios(id)`) — ou seja, a tabela é 1:1 com o
  usuário do Supabase Auth, e **não tem `empresa_id`**. Não há suporte a "conexão compartilhada por
  empresa": cada linha é uma conta Gmail conectada por um único usuário, sem qualquer coluna de tipo.
- **RLS**: 4 policies (`SELECT`/`INSERT`/`UPDATE`/`DELETE`), todas `USING/WITH CHECK (auth.uid() =
  user_id)` — mesmo arquivo, linhas 16-34. Reconfirmadas (sem alteração de lógica, apenas limpeza/
  reordenação de policies) em `20260506172117_6b826a32-.../index.ts:31-36`.
- Existe uma migration posterior,
  [`20260504172116_d58aba56-...sql:111`](../supabase/migrations/20260504172116_d58aba56-3ac8-4d4c-8aeb-e14b7af32eb9.sql#L111),
  que contém `CREATE TABLE IF NOT EXISTS public.gmail_tokens (id UUID PRIMARY KEY ..., usuario_id UUID
  REFERENCES usuarios(id) UNIQUE, ...)` — uma definição **diferente e conflitante** (coluna `usuario_id`
  em vez de `user_id`, sem `email` obrigatório). Como usa `IF NOT EXISTS` e a tabela já existia desde
  20260430170853, esse `CREATE TABLE` é um **no-op**: nunca substituiu o schema real. É resíduo de um
  script de "bootstrap defensivo" mais amplo naquela migration (que recria dezenas de tabelas com
  `IF NOT EXISTS`) e não reflete a estrutura vigente. `src/integrations/supabase/types.ts:842-870`
  confirma o schema real em produção: coluna `user_id`, sem `usuario_id`, sem `empresa_id`.
- **Trigger**: `update_gmail_tokens_updated_at` mantém `updated_at` em cada `UPDATE` (mesmo arquivo de
  criação, linhas 37-48).

**Conclusão sobre a "fase dual"**: a estrutura dual pessoal/empresa mencionada como possível estado deste
projeto **não foi implementada** — nem no schema, nem nas Edge Functions, nem no frontend. `gmail_tokens`
continua sendo puramente por `user_id` do Supabase Auth.

## 5. Fluxo OAuth2 (estado atual)

1. **Frontend inicia o fluxo** — `src/hooks/useGmail.ts:30-32` chama a function `gmail-auth-url` passando
   `{ userId: user.id, timestamp: ... }`. Não há parâmetro de "tipo" de conexão.
2. **`gmail-auth-url`** (`supabase/functions/gmail-auth-url/index.ts`) monta a URL de consentimento do
   Google:
   - `redirect_uri` = `` `${Deno.env.get('SUPABASE_URL')}/functions/v1/gmail-callback` `` (linha 24) —
     **não é hardcoded**, é derivado do secret `SUPABASE_URL` em runtime.
   - `scope` (linha 26): `gmail.send`, `gmail.readonly`, `userinfo.email`.
   - `state` = `userId` (linha 35) — usado só para carregar o `user_id` de volta no callback; **não
     codifica tipo/empresa**.
3. **Usuário autoriza no Google** → Google redireciona para `gmail-callback` com
   `?code=...&state=<userId>`.
4. **`gmail-callback`** (`supabase/functions/gmail-callback/index.ts`):
   - Lê `code` e `userId` (de `state`) da query string (linhas 15-16); se algum faltar, retorna 400
     (linha 19).
   - Recalcula o mesmo `redirect_uri` via `SUPABASE_URL` (linha 25) — precisa bater exatamente com o
     usado no passo 2 e com o registrado no Google Cloud Console.
   - Troca `code` por tokens na Google (linhas 28-38), busca o e-mail do usuário via
     `userinfo/v2/userinfo` (linhas 44-47).
   - Faz `upsert` em `gmail_tokens` com `user_id`, `access_token`, `refresh_token`, `expires_at`, `email`
     (linhas 55-63) usando o client `SUPABASE_SERVICE_ROLE_KEY` (bypassa RLS).
   - Lê `APP_URL` (linha 68) e **lança erro se estiver ausente** (linha 69) — sem fallback hardcoded para
     nenhum domínio. Se presente, redireciona (303) para `${APP_URL}/configuracoes?tab=perfil` (linha 70).
5. **Roteamento por `tipo`** (pessoal vs. empresa): **ainda não implementado**. Não há parâmetro `tipo` em
   nenhum ponto do fluxo (frontend, `gmail-auth-url`, `gmail-callback`) nem coluna correspondente no
   schema. Se esse roteamento é um requisito planejado, ele ainda não tem nenhum código associado neste
   repositório — não confundir com a fase de consolidação de `configuracoes_automacao` (seção 6), que é
   uma migration diferente e já aplicada.

### Consumo do token nas demais funções

Todas buscam/atualizam por `user_id`, sem qualquer lógica de fallback para nível de empresa:

- **`gmail-send`** — `select('*').eq('user_id', userId)` (linha 26); refresh e `update` também por
  `user_id` (linhas 51-76).
- **`gmail-sync-inbox`** — dois usos: (a) marcar mensagem como lida, busca token por
  `user_id = user.id` do JWT autenticado (linha 34); (b) job de sync geral, itera **todos** os registros
  de `gmail_tokens` sem filtro (`select('*')` na linha 80) — ou seja, sincroniza a inbox de todo usuário
  conectado, não só o chamador.
- **`gmail-debug`** — autentica o chamador via JWT (`supabaseClient.auth.getUser()`, linha 21) e busca o
  token por `user_id = user.id` (linha 38); todo o restante do diagnóstico (refresh, profile, contagem de
  `emails_recebidos`) é escopado a esse único usuário.

Nenhuma dessas três funções foi ajustada para uma eventual fase dual — não há branch de código para
"empresa" em nenhuma delas.

## 6. Estrutura de `configuracoes_automacao` (pós-fix multi-tenant)

Migration
[`20260706190000_configuracoes_automacao_multi_empresa.sql`](../supabase/migrations/20260706190000_configuracoes_automacao_multi_empresa.sql)
(mais recente que toca essa tabela) aplicou a consolidação multi-tenant:

- Adicionou `empresa_id UUID REFERENCES public.empresas(id)` (linha 18), com backfill (linhas 26-46) e
  `NOT NULL` condicional (linhas 50-55) — só vira `NOT NULL` se o backfill conseguiu popular todas as
  linhas (protege projetos recém-provisionados sem nenhuma `empresa` ainda).
- Trocou a constraint `UNIQUE(chave)` global por `UNIQUE(empresa_id, chave)` (linhas 57-61):
  ```sql
  ALTER TABLE public.configuracoes_automacao DROP CONSTRAINT IF EXISTS configuracoes_automacao_chave_key;
  ALTER TABLE public.configuracoes_automacao
    ADD CONSTRAINT configuracoes_automacao_empresa_chave_key UNIQUE (empresa_id, chave);
  ```
- Recriou as 3 policies de RLS usando o padrão `is_admin()` / `is_gestor()` / `get_my_empresa_id()` já em
  uso no resto do schema desde a migration `20260413223933` (linhas 66-79):
  ```sql
  CREATE POLICY "automacao_config_select" ON public.configuracoes_automacao
    FOR SELECT TO authenticated
    USING (is_admin() OR empresa_id = get_my_empresa_id());

  CREATE POLICY "automacao_config_upsert" ON public.configuracoes_automacao
    FOR INSERT TO authenticated
    WITH CHECK (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id()));

  CREATE POLICY "automacao_config_update" ON public.configuracoes_automacao
    FOR UPDATE TO authenticated
    USING (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id()));
  ```
  Isso substitui o estado anterior (`SELECT` com `USING (true)` — leitura global sem isolamento — vindo de
  `20260306171805`), fechando o bloqueador de isolamento entre empresas nessa tabela.

Essa consolidação é **independente** da tabela `gmail_tokens` — não alterou nem referencia
`gmail_tokens`. As duas tabelas seguem em estágios diferentes: `configuracoes_automacao` já é
multi-tenant por empresa; `gmail_tokens` continua puramente por usuário individual (seção 4).

## 7. Checklist de setup para novo ambiente/cliente

**Gmail OAuth2:**
- [ ] Criar (ou reutilizar) projeto no Google Cloud Console com Gmail API habilitada.
- [ ] Criar credencial OAuth 2.0 Client ID, tipo Web application.
- [ ] Registrar a Redirect URI: `https://<novo-SUPABASE_URL>/functions/v1/gmail-callback` (o path é fixo;
  `SUPABASE_URL` é o único componente que muda por ambiente — não há mais domínio hardcoded a ajustar).
- [ ] Configurar secrets no projeto Supabase: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_URL`
  (domínio do frontend do novo cliente — **obrigatório**, a função falha sem ele).
- [ ] Nenhuma migração de dados de `gmail_tokens` é necessária entre clientes — cada usuário reconecta a
  própria conta Gmail pelo fluxo OAuth normal (tokens são por `user_id`, não portáveis entre projetos).
- [ ] Se o requisito de negócio for "conexão Gmail compartilhada por empresa" (um único Gmail usado por
  todos os vendedores de uma empresa), isso **precisa ser desenvolvido do zero** — não existe hoje nem
  como schema, nem como Edge Function, nem como opção de UI.

**Google Maps:** nada a fazer desde 08/2026 — o mapa é Leaflet + OpenStreetMap, sem chave e
sem configuração por cliente.

**`configuracoes_automacao` (multi-tenant):**
- [ ] Nenhuma ação manual necessária num ambiente novo — a tabela já nasce com `empresa_id NOT NULL` e as
  policies corrigidas a partir da migration `20260706190000`. O backfill condicional só é relevante para
  bases que já tinham dados antes dessa migration.

## 8. Divergências encontradas em `INTEGRATION_AUDIT.md`

Comparado ao código lido nesta investigação, `INTEGRATION_AUDIT.md` está desatualizado/incorreto em três
pontos:

1. **Linha 55**: expõe o valor real de `VITE_GOOGLE_MAPS_API_KEY` em texto plano — ver alerta de segurança
   no topo deste documento.
2. **Linha 76** afirma: `APP_URL = ... (redirect URI hardcoded no callback)`. Isso está incorreto para o
   estado atual: o *redirect URI do OAuth* (`redirect_uri` enviado ao Google) é derivado de
   `SUPABASE_URL`, não de `APP_URL` — `APP_URL` só é usado para o redirect final pós-callback de volta ao
   app (seção 5, passo 4). Não há valor hardcoded em nenhum dos dois.
3. **Linha 226** (checklist) menciona "fallback `APP_URL` (linha ~69)" em `gmail-callback/index.ts`. Isso
   também está incorreto: a linha correspondente hoje (68-69) **lança um erro** se `APP_URL` estiver
   ausente — não existe fallback hardcoded para `mdrepresentacoes.grupoclimb.ai` nem para nenhum outro
   domínio.

Recomenda-se atualizar `INTEGRATION_AUDIT.md` para refletir isso e, principalmente, remover a chave real
exposta na linha 55.

