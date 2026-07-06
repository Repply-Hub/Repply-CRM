# Configuração das integrações Gmail (OAuth2 por usuário) e Google Maps

> Documento gerado a partir da leitura direta do código-fonte deste repositório (hooks, Edge Functions,
> migrations e `INTEGRATION_AUDIT.md`) em 2026-07-06. Nenhum valor real de chave/segredo é citado — apenas
> nomes de variáveis, com o path do arquivo onde cada uma é consumida.
>
> ⚠️ **Alerta de segurança encontrado durante a investigação**: `INTEGRATION_AUDIT.md` (versionado no git)
> contém o valor real da `VITE_GOOGLE_MAPS_API_KEY` em texto plano. Essa chave deve ser considerada
> comprometida — rotacione-a no Google Cloud Console e remova o valor literal desse arquivo (o histórico do
> git também deve ser tratado, já que a chave permanece nos commits antigos).

## 1. Visão geral das duas integrações

### Gmail OAuth2 por usuário
Cada usuário do CRM pode conectar sua própria conta Gmail para enviar e-mails e sincronizar mensagens
recebidas diretamente pela interface do sistema (página `Emails` e card `GmailSettings` em Configurações).
O fluxo é o clássico OAuth2 "Authorization Code" do Google:

1. Frontend chama a Edge Function `gmail-auth-url`, que monta a URL de consentimento do Google.
2. Usuário autoriza no Google; o Google redireciona para a Edge Function `gmail-callback`, que troca o
   `code` por `access_token`/`refresh_token` e persiste na tabela `gmail_tokens`, associados ao usuário.
3. As Edge Functions `gmail-send` e `gmail-sync-inbox` usam o `refresh_token` salvo para renovar o
   `access_token` automaticamente quando expira, e chamam a Gmail API para enviar/ler mensagens.

Como é "por usuário", cada usuário da empresa tem sua própria linha em `gmail_tokens` — as credenciais
OAuth (`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`) são únicas por deploy/projeto Google Cloud, mas os tokens
de acesso são individuais.

### Google Maps
Usado para exibir um mapa de obras (canteiros de obra/construction sites) e para geocodificar endereços
digitados pelo usuário (converter texto de endereço em latitude/longitude). É uma integração "por deploy":
uma única API Key compartilhada por todos os usuários do cliente, consumida inteiramente no frontend
(nunca em Edge Functions). Há fallback automático para Nominatim/OpenStreetMap (sem credencial) quando o
Google atinge rate limit.

## 2. Pré-requisitos no Google Cloud Console

| Integração | API a habilitar | Tipo de credencial |
|---|---|---|
| Gmail OAuth2 | **Gmail API** | OAuth Client ID (tipo "Web application") |
| Google Maps (renderização) | **Maps JavaScript API** | API Key restrita por referrer HTTP |
| Google Maps (geocodificação) | **Geocoding API** | Mesma API Key acima (restrita também a essa API) |

**Places API não é usada** — a investigação no código não encontrou nenhuma referência a
`places.googleapis.com`, `Autocomplete` ou `PlacesService`. Não é necessário habilitá-la.

Ambas as APIs de Maps (JavaScript + Geocoding) podem compartilhar a mesma API Key, desde que ela seja
autorizada para as duas no console.

## 3. Variáveis de ambiente / secrets necessárias

### Frontend (`.env`, prefixo `VITE_`, expostas no bundle do navegador)

| Variável | Onde é consumida |
|---|---|
| `VITE_GOOGLE_MAPS_API_KEY` | [src/components/obras/MapaObras.tsx](../src/components/obras/MapaObras.tsx) (linhas 33 e 119), [src/hooks/use-geocode-obras.ts](../src/hooks/use-geocode-obras.ts) (linha 29) |
| `VITE_SUPABASE_URL` | cliente Supabase (`src/integrations/supabase/client.ts`) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | cliente Supabase |
| `VITE_SUPABASE_PROJECT_ID` | cliente Supabase |

Não há variável de frontend para o Gmail — todo o fluxo OAuth do Gmail roda em Edge Functions (o frontend só
chama `supabase.functions.invoke(...)` via [src/hooks/useGmail.ts](../src/hooks/useGmail.ts)).

### Backend (Supabase secrets — configurados via `supabase secrets set NOME=valor`)

| Secret | Onde é consumido |
|---|---|
| `GOOGLE_CLIENT_ID` | [supabase/functions/gmail-auth-url/index.ts](../supabase/functions/gmail-auth-url/index.ts), [supabase/functions/gmail-callback/index.ts](../supabase/functions/gmail-callback/index.ts), [supabase/functions/gmail-send/index.ts](../supabase/functions/gmail-send/index.ts), [supabase/functions/gmail-sync-inbox/index.ts](../supabase/functions/gmail-sync-inbox/index.ts), [supabase/functions/gmail-debug/index.ts](../supabase/functions/gmail-debug/index.ts) |
| `GOOGLE_CLIENT_SECRET` | mesmas Edge Functions acima |
| `APP_URL` | [supabase/functions/gmail-callback/index.ts](../supabase/functions/gmail-callback/index.ts) (linha ~69) — usada para redirecionar o usuário de volta ao app após o consentimento. Tem fallback hardcoded para `https://mdrepresentacoes.grupoclimb.ai` se a secret não estiver definida |
| `SUPABASE_URL` | todas as Edge Functions `gmail-*` |
| `SUPABASE_SERVICE_ROLE_KEY` | todas as Edge Functions `gmail-*` (necessário para ler/gravar `gmail_tokens` ignorando RLS) |
| `SUPABASE_ANON_KEY` | apenas [supabase/functions/gmail-debug/index.ts](../supabase/functions/gmail-debug/index.ts) (usada para validar o JWT do usuário que chama a função de debug) |

Não existe um `GOOGLE_MAPS_API_KEY` (sem prefixo `VITE_`) — a chave do Maps nunca é usada no backend.

### ⚠️ Redirect URI hardcoded no código (não é uma env var)

As Edge Functions `gmail-auth-url` (linha 24) e `gmail-callback` (linha 25) têm o redirect URI **escrito
diretamente no código-fonte**, não lido de uma variável de ambiente:

```
https://hukeirrmsoiowvvrhivx.supabase.co/functions/v1/gmail-callback
```

Isso significa que, ao clonar este projeto para um novo cliente/deploy com um projeto Supabase diferente,
essas duas linhas **precisam ser editadas manualmente no código** (não basta trocar secrets) para apontar
para o novo `SUPABASE_URL`. Vale considerar migrar isso para `Deno.env.get('SUPABASE_URL')` em uma correção
futura, mas isso está fora do escopo deste documento (que não altera código).

## 4. OAuth Consent Screen — escopos usados hoje

Os únicos escopos solicitados pelo sistema, definidos em
[supabase/functions/gmail-auth-url/index.ts](../supabase/functions/gmail-auth-url/index.ts) (linha 26):

- `https://www.googleapis.com/auth/gmail.send` — enviar e-mails em nome do usuário
- `https://www.googleapis.com/auth/gmail.readonly` — ler mensagens da caixa de entrada
- `https://www.googleapis.com/auth/userinfo.email` — obter o e-mail da conta conectada

Esses escopos (`gmail.send`, `gmail.readonly`) são classificados pelo Google como **escopos restritos/
sensíveis**, o que normalmente exige passar pelo processo de **verificação de app** do Google (incluindo,
para uso em produção com muitos usuários, uma avaliação de segurança CASA).

**Possível inconsistência de escopo identificada no código**: a Edge Function `gmail-sync-inbox`
(linha ~62) chama `POST .../messages/{id}/modify` com `removeLabelIds: ['UNREAD']` para marcar mensagens
como lidas — essa é uma operação de escrita que tipicamente exige o escopo `gmail.modify`, não apenas
`gmail.readonly`. Vale confirmar em produção se essa chamada funciona (o código não trata explicitamente um
possível erro dessa chamada) ou se é necessário adicionar `gmail.modify` ao consent screen e reautorizar os
usuários já conectados.

Ao configurar a tela de consentimento no Google Cloud Console, adicione exatamente os três escopos acima
(mais `gmail.modify` se a inconsistência acima for corrigida no futuro).

## 5. Redirect URIs necessárias

| Ambiente | Redirect URI a cadastrar no OAuth Client (Google Cloud Console) |
|---|---|
| Produção (atual) | `https://hukeirrmsoiowvvrhivx.supabase.co/functions/v1/gmail-callback` |
| Novo deploy/cliente | `https://<SEU-PROJECT-REF>.supabase.co/functions/v1/gmail-callback` — **e** editar manualmente essa string no código das duas Edge Functions citadas na seção 3 |

Não há um redirect URI separado para "dev" no código — como o callback é uma Edge Function hospedada no
Supabase (não localhost), o mesmo redirect URI de produção do projeto Supabase é usado mesmo durante testes
locais do frontend (o `npm run dev` do frontend não intercepta o callback OAuth).

A variável `APP_URL` (seção 3) controla apenas para onde o usuário é levado *depois* que o backend já
processou o callback — ou seja, é o destino final de UX (`{APP_URL}/configuracoes?tab=perfil`), não o
redirect URI do OAuth em si.

## 6. Status da verificação do app junto ao Google

A investigação no repositório (código, migrations, `README.md`, `INTEGRATION_AUDIT.md`) **não encontrou
nenhum registro** sobre o status atual do processo de verificação do app OAuth no Google — não há menção a
"app verificado", "unverified app warning", limite de usuários de teste, branding verification, domínio
verificado no Search Console, ou política de privacidade vinculada ao projeto GCP.

`INTEGRATION_AUDIT.md` apenas instrui genericamente "Configurar OAuth consent screen" como passo de setup,
sem detalhar se isso deve ser feito em modo de teste ou produção.

**Não invente esse status.** Se este documento for consultado para decidir se novos usuários podem se
conectar sem ver a tela de aviso "app não verificado" do Google, confirme diretamente no
[Google Cloud Console → APIs & Services → OAuth consent screen](https://console.cloud.google.com/) do
projeto em uso, já que essa informação não existe documentada neste repositório.

## 7. Restrições recomendadas para a API Key do Google Maps

A chave (`VITE_GOOGLE_MAPS_API_KEY`) é injetada no bundle JavaScript do frontend e fica **publicamente
visível** no navegador de qualquer usuário. A mitigação correta — já recomendada em
`INTEGRATION_AUDIT.md`, mas não verificável a partir do código se está de fato aplicada no console — é:

- Restringir a chave por **HTTP referrer**, autorizando apenas os domínios legítimos, por exemplo:
  - `https://mdrepresentacoes.grupoclimb.ai/*` (produção)
  - `http://localhost:8080/*` (dev local, porta padrão do Vite neste projeto)
  - qualquer domínio de preview/staging usado
- Restringir a chave às APIs efetivamente usadas: **Maps JavaScript API** e **Geocoding API** apenas
  (não habilitar Places API ou outras, já que não são usadas — reduz superfície de abuso caso a chave
  vaze).
- Definir cota diária (quota) razoável no console para conter custos em caso de uso indevido da chave
  vazada.

Isso vale tanto para a chave já exposta (que deve ser rotacionada, ver alerta no topo do documento) quanto
para qualquer chave nova criada para um novo deploy.

## 8. Checklist final de setup para um novo ambiente

Use esta lista ao dar onboarding a um novo dev ou ao clonar o sistema para um novo cliente/deploy.

### Google Cloud Console
- [ ] Criar (ou reusar) um projeto no Google Cloud Console
- [ ] Habilitar **Gmail API**
- [ ] Habilitar **Maps JavaScript API**
- [ ] Habilitar **Geocoding API**
- [ ] Configurar **OAuth consent screen** com os escopos: `gmail.send`, `gmail.readonly`,
      `userinfo.email` (ver seção 4 sobre possível necessidade de `gmail.modify`)
- [ ] Verificar/decidir o status de publicação do consent screen (teste vs. produção vs. verificado —
      ver seção 6, esta decisão não está documentada no repo e precisa ser tomada manualmente)
- [ ] Criar **OAuth Client ID** (tipo "Web application") e cadastrar o redirect URI
      `https://<SEU-PROJECT-REF>.supabase.co/functions/v1/gmail-callback` (seção 5)
- [ ] Criar **API Key** para Maps, restrita por HTTP referrer aos domínios do deploy e às duas APIs de
      Maps habilitadas (seção 7)

### Código (apenas se for um novo deploy/projeto Supabase — não altera este PR)
- [ ] Atualizar o redirect URI hardcoded em
      [supabase/functions/gmail-auth-url/index.ts](../supabase/functions/gmail-auth-url/index.ts) (linha 24)
      e [supabase/functions/gmail-callback/index.ts](../supabase/functions/gmail-callback/index.ts)
      (linha 25) para o novo `SUPABASE_URL`

### Supabase secrets (backend)
- [ ] `supabase secrets set GOOGLE_CLIENT_ID=...`
- [ ] `supabase secrets set GOOGLE_CLIENT_SECRET=...`
- [ ] `supabase secrets set APP_URL=https://<dominio-do-novo-cliente>`
- [ ] Confirmar que `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já estão disponíveis (normalmente
      provisionadas automaticamente pelo Supabase para toda Edge Function)

### `.env` do frontend (não versionado — `.gitignore` já ignora `.env`/`.env.*`)
- [ ] `VITE_GOOGLE_MAPS_API_KEY=...`
- [ ] `VITE_SUPABASE_URL=...`
- [ ] `VITE_SUPABASE_PUBLISHABLE_KEY=...`
- [ ] `VITE_SUPABASE_PROJECT_ID=...`

### Banco de dados
- [ ] Confirmar que a migration que cria `gmail_tokens`
      (`supabase/migrations/20260430170853_98772703-d3ad-489e-a062-051d06d444d0.sql`) foi aplicada
      (`user_id`, `access_token`, `refresh_token`, `expires_at`, `email`, RLS habilitado)
- [ ] Confirmar que `emails_recebidos` existe com as colunas usadas por `gmail-sync-inbox`
      (`gmail_message_id`, `user_id`, `remetente`, `assunto`, `corpo_html`, `lido`)

### Segurança
- [ ] Rotacionar a `VITE_GOOGLE_MAPS_API_KEY` atual (valor real está exposto em `INTEGRATION_AUDIT.md`
      versionado no git — ver alerta no topo deste documento)
- [ ] Remover o valor literal da chave de `INTEGRATION_AUDIT.md` após a rotação
