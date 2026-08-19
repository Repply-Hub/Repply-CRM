# Estrutura da Integração WhatsApp (uazapi)

Documentação da instância de WhatsApp usada no sistema, baseada na implementação atual do código e nos dados reais da instância no Supabase (projeto `hukeirrmsoiowvvrhivx`).

> Provedor: [uazapi](https://docs.uazapi.com/) — API não oficial de WhatsApp (multi-instância). Toda nova feature de WhatsApp deve ser validada contra a documentação oficial antes de implementar.

---

## 1. Visão geral da arquitetura

```
Frontend (React)                Edge Functions (Supabase)              uazapi (externo)
─────────────────                ───────────────────────              ─────────────────
WhatsAppInbox.tsx        ──►      whatsapp-send                 ──►    POST /send/text
use-whatsapp-inbox.ts             (envia mensagem + grava no DB)       POST /send/media

                          ◄──      whatsapp-webhook               ◄──   eventos: messages,
                                   (recebe e grava no DB)                connection update

ConfigDialog (QR/status)  ──────────────────────────────────────►      POST /instance/connect
                                   (chamada direta do frontend,         GET  /instance/status
                                    sem passar por edge function)      POST /instance/disconnect
```

- **Multi-tenant por empresa**: cada `empresa` tem sua própria instância uazapi, credenciais e conversas (RLS isola por `empresa_id`).
- **Envio** de mensagens passa por uma Edge Function (`whatsapp-send`) que valida o usuário autenticado, busca a config da empresa e chama a uazapi.
- **Recebimento** é feito via webhook público (`whatsapp-webhook`) que a uazapi chama quando há eventos na instância.
- **Conexão/QR/status/disconnect** são chamados **diretamente do navegador** para a uazapi (não passam pela Edge Function), usando a `api_key` da empresa exposta ao client autenticado via RLS.

---

## 2. Banco de dados

Migration: `supabase/migrations/20260608144429_whatsapp_inbox.sql` (+ ajustes posteriores).

### `configuracoes_wapi`
Credenciais da instância uazapi por empresa.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid | PK |
| `empresa_id` | uuid | FK `empresas`, **único** (1 instância por empresa) |
| `instance_url` | text | Base URL da instância uazapi (ex.: `https://climb.uazapi.com`) |
| `api_key` | text | Token (`token` header) da instância |
| `instance_name` | text | Nome lógico da instância (usado para casar o webhook) |
| `api_instance_name` | text | *(coluna adicionada depois da migration inicial)* nome real esperado pela uazapi no `instanceName` do payload de envio — usado quando difere de `instance_name` |
| `status` | text | `connected` \| `disconnected` \| `connecting` |
| `webhook_secret` | text | Reservado para validação do webhook (ainda não validado no código) |
| `created_at` / `updated_at` | timestamptz | |

Dado real hoje (empresa MD Representações):
```
instance_url:      https://climb.uazapi.com
instance_name:      mdrepresentacoes
api_instance_name:  mdepresentacao   ⚠️ (provável typo, ver seção "Pontos de atenção")
status:              disconnected
```

### `whatsapp_conversas`
Uma thread por número de telefone (por empresa).

| Coluna | Descrição |
|---|---|
| `empresa_id`, `telefone` | unique together |
| `nome_contato` | nome enviado pela uazapi (`pushName`) |
| `cliente_id` / `contato_id` | vínculo opcional com CRM interno |
| `ultima_mensagem`, `ultima_mensagem_at` | preview da lista |
| `nao_lidas` | contador de não lidas |
| `arquivada` | usado pelo filtro "Em aberto / Fechado" na UI |

### `whatsapp_mensagens`
Mensagens bidirecionais de uma conversa.

| Coluna | Descrição |
|---|---|
| `direcao` | `entrada` (recebida) \| `saida` (enviada) |
| `tipo` | `texto`, `imagem`, `audio`, `video`, `documento`, `sticker` |
| `media_url` / `media_mime` | arquivo (quando houver), armazenado no Storage |
| `wamid` | id da mensagem na uazapi (usado para deduplicar via `UNIQUE`) |
| `status` | `enviando`, `enviado`, `entregue`, `lido`, `erro` |
| `usuario_id` | quem enviou (mensagens de saída) |
| `lida` | controla badge de não lidas |

### RLS
Todas as 3 tabelas usam a mesma regra: usuário só acessa linhas cujo `empresa_id` corresponde à empresa do seu registro em `usuarios` (`empresa_id IN (SELECT empresa_id FROM usuarios WHERE user_id = auth.uid())`). Isso vale inclusive para `configuracoes_wapi`, ou seja, **o `api_key` da instância é legível pelo client autenticado da própria empresa** (necessário porque o QR/connect/status/disconnect são chamados direto do browser).

### Storage
Bucket `whatsapp-media`: usado para upload de imagens/áudios/vídeos/documentos antes de enviar (`uploadWaMedia` em `use-whatsapp-inbox.ts`), e para servir mídia recebida.

### Tabela auxiliar
`webhook_debug`: inserts de debug fire-and-forget feitos pela função `whatsapp-send` (loga URL chamada, status e resposta da uazapi). Não tem propósito funcional, só depuração.

---

## 3. Edge Functions

### `whatsapp-send` (`supabase/functions/whatsapp-send/index.ts`)
- Recebe `Authorization` do usuário logado, valida via `auth.getUser()`.
- Resolve `empresa_id` do usuário e busca `configuracoes_wapi`.
- Bloqueia envio se `status !== 'connected'`.
- Normaliza telefone para formato `55DDDNNNNNNNNN`.
- Dois fluxos:
  - **Texto** → `POST {instance_url}/send/text` com `{ instanceName, number, text }`.
  - **Mídia** → `POST {instance_url}/send/media` com `{ instanceName, number, to, type, file, caption?, fileName? }` (campo `file` é a URL pública do Storage).
- Usa `config.api_instance_name ?? config.instance_name` como `instanceName` enviado à uazapi.
- Após sucesso, faz upsert da conversa e insere a mensagem (`direcao: 'saida'`) no banco.
- Loga toda chamada (URL, status, corpo de resposta, erro de rede) em `webhook_debug`.

### `whatsapp-webhook` (`supabase/functions/whatsapp-webhook/index.ts`)
- Endpoint público (`verify_jwt` não está em `config.toml` para esta função — confirmar se está realmente desabilitado; ver seção "Pontos de atenção").
- Identifica a instância pelo query param `?instance=` ou header `x-instance-name`, busca `configuracoes_wapi` por `instance_name` para descobrir `empresa_id`.
- Roteia por `EventType`/`event`/`type` do payload:
  - `messages` (ou contém "message") → `handleIncomingMessage`
  - contém "connection" → `handleConnectionUpdate`
- `handleIncomingMessage`:
  - Ignora mensagens `fromMe`, `wasSentByApi` ou de grupo.
  - Extrai telefone do `chatid`/`sender_pn`, tipo de mídia, conteúdo/legenda.
  - Faz upsert da conversa (incrementa `nao_lidas`) e insere a mensagem com `onConflict: wamid, ignoreDuplicates: true` (evita duplicar webhooks reenviados).
- `handleConnectionUpdate`: mapeia estado da uazapi (`open`/`close`/`connecting`) para `status` em `configuracoes_wapi`.

> Não há função `whatsapp-qr` separada — apesar de existir um diretório vazio (`supabase/functions/whatsapp-qr`), o fluxo de QR code é feito **direto do frontend** (ver próxima seção).

---

## 4. Frontend

### Hook `src/hooks/use-whatsapp-inbox.ts`
Centraliza todo o acesso a dados de WhatsApp via TanStack Query + Supabase Realtime:

| Hook | Função |
|---|---|
| `useWaConversas` | lista conversas da empresa + realtime (`INSERT`/`UPDATE` em `whatsapp_conversas`) |
| `useWaMensagens(conversaId)` | mensagens de uma conversa + realtime, com merge inteligente de mensagens otimistas |
| `useWaSendMessage` | invoca a Edge Function `whatsapp-send`, com update otimista da UI |
| `useWaMarcarLida` | zera `nao_lidas` e marca mensagens de entrada como lidas |
| `useWaConfig` / `useWaSaveConfig` | lê/grava `configuracoes_wapi` da empresa **diretamente via client Supabase** (sem Edge Function) |
| `useWaConnect` | `POST {instance_url}/instance/connect` direto da uazapi → retorna QR code (base64) |
| `useWaSyncStatus` | `GET {instance_url}/instance/status` direto da uazapi → atualiza `status` no banco |
| `useWaDisconnect` | `POST {instance_url}/instance/disconnect` direto da uazapi |
| `uploadWaMedia` | upload de arquivo para bucket `whatsapp-media` |
| `useUnreadWaMessages` | contagem global de não lidas (badge no sidebar) + realtime |
| `useWaLimparConversa` / `useWaArquivarConversa` / `useWaNovaConversa` | utilitários de gestão de conversa |

### Página `src/pages/WhatsAppInbox.tsx`
UI tipo "inbox" (estilo WhatsApp Web):
- Sidebar de conversas com filtros (Em aberto/Fechado, Todos/Contatos/Empresa) e busca.
- Área de mensagens com bolhas por tipo (texto, imagem, áudio com player customizado, vídeo, documento), agrupamento por data, status de entrega.
- Envio: texto, múltiplos anexos (upload em paralelo, envio sequencial — uma mensagem por arquivo), gravação de áudio via `MediaRecorder`.
- `ConfigDialog`: tela de conexão — mostra status, gera QR code (`useWaConnect`), faz polling de status a cada 3s (`useWaSyncStatus`) até conectar, e permite desconectar.
- Bloqueia envio se `config.status !== 'connected'`.

---

## 5. Fluxo de conexão de uma instância (passo a passo)

1. Usuário (role `empresa`/`gestor`, presumivelmente) abre **Configurações → WhatsApp** e preenche `instance_url` + `api_key` (e opcionalmente `instance_name`/`api_instance_name`) → `useWaSaveConfig` grava em `configuracoes_wapi`.
2. Na página WhatsApp, clica em **Conectar via QR code** → `useWaConnect` chama `POST /instance/connect` na uazapi com o header `token: api_key` → recebe QR base64.
3. Usuário escaneia o QR no celular.
4. A cada 3s, `useWaSyncStatus` faz `GET /instance/status` até `connected && loggedIn` → atualiza `configuracoes_wapi.status = 'connected'`.
5. Em paralelo, a uazapi também pode notificar a conexão via webhook (`EventType` contendo "connection") → `whatsapp-webhook` atualiza o mesmo campo (redundância client + servidor).
6. A partir daqui, mensagens recebidas chegam via webhook e mensagens enviadas passam pela Edge Function `whatsapp-send`.

---

## 6. Pontos de atenção / inconsistências encontradas

- **`api_instance_name` com possível typo**: o valor atual no banco é `mdepresentacao` (faltando o "r" de "representacao"). Se a uazapi exigir esse nome exato para rotear o envio, mensagens podem falhar silenciosamente. Vale confirmar com a uazapi qual é o nome real da instância.
- **Webhook sem validação de segredo**: `webhook_secret` existe na tabela mas não é verificado em `whatsapp-webhook/index.ts` — qualquer request para o endpoint com `?instance=<nome_existente>` é aceito. Recomendado validar um header (`x-webhook-secret`, já presente no CORS) contra `config.webhook_secret`.
- **`whatsapp-qr` é um diretório vazio**: não há função ali; o fluxo real de QR é client-side direto para a uazapi. Pode ser remanescente de uma abordagem anterior — considerar remover o diretório morto ou documentar a decisão de manter QR no client.
- **Credenciais da uazapi expostas ao client**: `api_key` é lido pelo frontend autenticado (necessário para `connect`/`status`/`disconnect` direto da uazapi). Isso significa que qualquer usuário da empresa com acesso ao DevTools vê o token da instância. Tecnicamente aceitável (escopo é por empresa), mas é uma decisão de design a manter em mente.
- **`verify_jwt` do `whatsapp-webhook`**: ~~não aparece em `supabase/config.toml`~~ **[RESOLVIDO no commit `0715119`]** — confirmado em produção que isso era um bug real, não só uma suspeita. A função não estava listada em `config.toml`, então o default `verify_jwt = true` se aplicava, e o gateway do Supabase rejeitava com 401 **toda** chamada da uazapi antes de chegar ao código (a uazapi não envia JWT em chamadas de webhook). Sintoma observado: instância aparecia `connected` na uazapi mas `configuracoes_wapi.status` continuava `disconnected` no banco, porque `handleConnectionUpdate` nunca era executado. Como o mesmo gateway bloqueia qualquer evento (não só connection update), mensagens recebidas via `handleIncomingMessage` também não chegavam. Corrigido adicionando `[functions.whatsapp-webhook] verify_jwt = false` em `config.toml` e redeployando.
- **`verify_jwt = false` é obrigatório em `whatsapp-webhook`**: a uazapi não envia JWT em chamadas de webhook — sem essa flag, 100% dos eventos são rejeitados com 401 pelo gateway do Supabase antes de chegar ao código (corrigido no commit `0715119`).

---

## 7. Referência externa

Antes de implementar qualquer nova feature de WhatsApp (novos tipos de mensagem, grupos, templates, etc.), consultar a documentação oficial da uazapi: https://docs.uazapi.com/ (site é JS-rendered; usar busca textual/WebSearch quando o fetch direto não renderizar o conteúdo).


---

## 8. Instâncias — provisão, evolução do schema e bugs conhecidos

> Esta seção absorveu `docs/uazapi-instancias-analise.md` (levantado em 01/07/2026).
> **O estado de cada bug foi reconferido em 19/08/2026** — as notas de estado abaixo são
> desta releitura, não do levantamento original.
>
> | Item original | Estado hoje |
> |---|---|
> | 5.1 `wapi_instancia_usuarios` sem migration | ✅ **Resolvido** — `20260701000000_wapi_instancia_usuarios_retroativa.sql` |
> | 5.2 Condição de corrida na reutilização de instância | ⚠️ Em aberto — [dívida §17](../divida-tecnica.md) |
> | 5.3 Limpeza de instância órfã falha em silêncio | ⚠️ Em aberto — [dívida §17](../divida-tecnica.md) |
> | 5.4 `webhook_secret` nunca é conferido | 🔴 **Em aberto e grave** — confirmado no código. [dívida §16](../divida-tecnica.md) |
> | 5.5 a 5.9 | ⚠️ Não reconferidos um a um |

> Gerado em 2026-07-01. Cobre a integração WhatsApp via Uazapi: schema, endpoints, fluxos de provisão, frontend/backend e bugs identificados.

### 1. Visão geral

A integração é dividida em três camadas:

- **Frontend (React/TS)**: `src/hooks/use-whatsapp-inbox.ts`, `src/hooks/use-admin-whatsapp.ts`, `src/pages/AdminWhatsAppInstancias.tsx`
- **Backend (Supabase Edge Functions / Deno)**: `whatsapp-provision`, `whatsapp-admin-provision`, `whatsapp-webhook`, `whatsapp-send`
- **Banco (Postgres/Supabase)**: `configuracoes_wapi`, `whatsapp_conversas`, `whatsapp_mensagens`, e a tabela de vínculo `wapi_instancia_usuarios`

Cada "instância" representa uma sessão do WhatsApp na Uazapi, identificada por um `instance_name` único e autenticada por um `api_key`/token individual.

### 2. Schema do banco

Migrations relevantes: `20260608144429_whatsapp_inbox.sql` (base) e evoluções em `20260616`, `20260618`, `20260620`.

#### `configuracoes_wapi`
```sql
CREATE TABLE configuracoes_wapi (
  id UUID PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  instance_url TEXT NOT NULL,
  api_key TEXT NOT NULL,
  instance_name TEXT NOT NULL,
  status TEXT,               -- 'connected' | 'disconnected' | 'connecting'
  webhook_secret TEXT,
  usuario_id UUID REFERENCES auth.users,  -- nullable
  provisionada BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
UNIQUE (instance_name);
```

Evolução de constraints (histórico relevante para entender o estado atual):
1. `20260608`: `UNIQUE (empresa_id)` — 1 instância por empresa.
2. `20260616`: troca para `UNIQUE (usuario_id)` — múltiplas instâncias por empresa, 1 por usuário.
3. `20260618`: RLS ajustado para permitir `gestor`/`empresa` verem instâncias da própria empresa.
4. `20260620`: `usuario_id` passa a ser nullable e adiciona `UNIQUE (instance_name)` — reflete o modelo atual de "instância desacoplada do usuário", pensado para permitir reutilização por múltiplos usuários da mesma empresa.

#### `whatsapp_conversas`
Threads de conversa por telefone, únicas por `(empresa_id, telefone)`. Guarda `nao_lidas`, `ultima_mensagem`, flag `arquivada`.

#### `whatsapp_mensagens`
Histórico bidirecional (`direcao`: entrada/saida), com `wamid` único, `media_url`/`media_mime`, `status` de entrega.

#### `wapi_instancia_usuarios` (tabela de vínculo N:N usuário↔instância)
**Não existe em nenhuma migration do repositório** (confirmado via grep em todo `supabase/migrations/*.sql`), mas é usada ativamente em:
- `whatsapp-provision/index.ts` (insert de vínculo)
- `whatsapp-admin-provision/index.ts` (link/unlink)
- `whatsapp-send/index.ts` (lookup da instância do usuário)

Isso é o achado mais grave deste relatório — ver seção 5.1.

### 3. Endpoints Uazapi utilizados

| Operação | Endpoint | Header | Usado em |
|---|---|---|---|
| Criar instância | `POST /instance/init` | `admintoken` | `whatsapp-provision`, `whatsapp-admin-provision` |
| Gerar QR / conectar | `POST /instance/connect` | `token` | `use-whatsapp-inbox.ts`, `use-admin-whatsapp.ts` |
| Status | `GET /instance/status` | `token` | idem |
| Configurar webhook | `POST /webhook` | `token` | `whatsapp-provision`, `whatsapp-admin-provision` |
| Enviar texto | `POST /send/text` | `token` | `whatsapp-send` |
| Enviar áudio (PTT) | `POST /send/ptt` | `token` | `whatsapp-send` |
| Enviar mídia | `POST /send/media` | `token` | `whatsapp-send` |
| Deletar instância | `DELETE /instance` | `token` | `whatsapp-provision` (cleanup órfão), `whatsapp-admin-provision` (ação delete) |
| Desconectar | `POST /instance/disconnect` | `token` | `use-admin-whatsapp.ts` |

Variáveis de ambiente (Supabase secrets, não em `.env`):
- `UAZAPI_BASE_URL`
- `UAZAPI_ADMIN_TOKEN`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (funções rodam com service role, ignoram RLS)

### 4. Fluxos de provisão

#### 4.1 `whatsapp-provision` (usuário final)
1. Valida sessão do usuário logado.
2. Verifica idempotência: usuário já tem instância vinculada? Retorna sem recriar.
3. **Reutilização** (a feature do commit `316acf0`): se a empresa já tem uma instância `provisionada=true`, vincula o usuário a ela via `wapi_instancia_usuarios` em vez de criar uma nova na Uazapi.
4. Caso contrário, cria via `/instance/init`, extrai o token da resposta (múltiplos formatos aceitos), registra webhook, salva em `configuracoes_wapi` e vincula o usuário.

#### 4.2 `whatsapp-admin-provision` (admin/gestor/empresa)
Suporta 4 ações: `create`, `link`, `unlink`, `delete`. `delete` chama `DELETE /instance` na Uazapi e remove o registro em `configuracoes_wapi`.

#### 4.3 Fluxo de conexão (QR code)
`connect` → recebe QR base64 → frontend faz polling de `sync-status` a cada 3s → quando `connected/loggedIn = true`, fecha o diálogo. Em paralelo, o webhook da Uazapi também deve notificar `connectionUpdate` e atualizar o status no banco.

### 5. Bugs e riscos identificados

#### 5.1 🔴 Crítico — tabela `wapi_instancia_usuarios` não existe em nenhuma migration
Confirmado por grep em todas as migrations: não há `CREATE TABLE` para `wapi_instancia_usuarios`, embora três Edge Functions façam `insert`/`select` nela. Se isso for real em produção, há duas possibilidades:
- A tabela foi criada manualmente no banco de produção (fora do controle de versão) — risco de drift entre ambientes/dev local e produção, e ninguém consegue recriar o banco do zero a partir das migrations.
- Ou a tabela não existe de fato e todo o fluxo de "múltiplos usuários por instância" está quebrado silenciosamente.

**Ação recomendada**: rodar `\d wapi_instancia_usuarios` direto no banco de produção/staging para confirmar. Se existir, criar uma migration retroativa (`CREATE TABLE IF NOT EXISTS`) documentando o schema real. Sugestão de schema mínimo:
```sql
CREATE TABLE wapi_instancia_usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instancia_id UUID NOT NULL REFERENCES configuracoes_wapi(id) ON DELETE CASCADE,
  usuario_auth_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (instancia_id, usuario_auth_id)
);
```

#### 5.2 🔴 Race condition na reutilização de instância
Em `whatsapp-provision/index.ts`, entre checar se a empresa já tem instância provisionada e inserir o vínculo, não há lock nem transação — dois usuários provisionando ao mesmo tempo podem colidir. É parcialmente mitigado (o código trata erro `duplicate` como sucesso), mas isso é uma rede de segurança, não uma correção real da race condition.

#### 5.3 🔴 Limpeza de instância órfã falha silenciosamente
`deleteOrphanInstance()` em `whatsapp-provision/index.ts` engole qualquer erro (`fetch` falho ou resposta não-ok) e segue em frente. Resultado possível: instância criada na Uazapi mas nunca associada/removida corretamente no banco — instância "fantasma" que continua consumindo uma vaga/licença na Uazapi sem estar rastreada localmente. No mínimo deveria logar em uma tabela de auditoria ou alertar.

#### 5.4 🟡 `webhook_secret` existe no schema mas nunca é usado
Nenhuma validação de assinatura/segredo é feita em `whatsapp-webhook/index.ts` — qualquer requisição que souber a URL (`?instance=<name>`) pode injetar mensagens ou mudar status de conexão de uma instância. Isso é uma lacuna de segurança real: o endpoint do webhook é público por natureza (a Uazapi precisa alcançá-lo), então validar o `webhook_secret` (ou HMAC do payload) fecharia essa porta.

#### 5.5 🟡 Duas rotinas de nomeação de instância divergentes
`whatsapp-provision` gera `instance_name` como `empresa_usuario`; `whatsapp-admin-provision` (ação `create`) gera `empresa_RANDOM`. Isso quebra a previsibilidade do nome e pode dificultar debugging/correlação manual no painel da Uazapi.

#### 5.6 🟡 Parsing "genérico demais" da resposta de `/instance/init`
O token é extraído tentando 4 caminhos diferentes (`token`, `instance.token`, `instance.apikey`, `apikey`) sem validar o formato. Se nenhum bater, a resposta completa (`initData`) é logada — podendo vazar dados sensíveis nos logs da function caso a Uazapi retorne algo inesperado.

#### 5.7 🟡 Status "connecting" nunca é setado pelo webhook
O `statusMap` mapeia `open → connected`, `close → disconnected`, `connecting → connecting`, mas na prática os eventos da Uazapi observados só emitem `open`/`close`. Isso deixa `status='connecting'` como um estado que só existe transitoriamente no frontend (otimista), nunca persistido de volta, o que pode causar UI travada em "conectando..." se o polling falhar.

#### 5.8 🟢 Sem validação de tamanho de mídia no upload
`use-whatsapp-inbox.ts` (uploadWaMedia) não valida tamanho do arquivo antes de subir para o Storage — depende só do limite padrão do Supabase.

#### 5.9 🟢 Sem retry em `whatsapp-send`/`whatsapp-webhook`
Falhas transitórias de rede na Uazapi não são reprocessadas; mensagens podem se perder silenciosamente (apenas logadas em `webhook_debug`).

### 6. Melhorias sugeridas (priorizadas)

1. **Resolver o mistério da tabela `wapi_instancia_usuarios`** (5.1) — prioridade máxima, pois é risco de "banco não reproduzível a partir das migrations".
2. **Validar `webhook_secret`** no endpoint de webhook (HMAC ou comparação simples de token na query string) — fecha uma porta de injeção de mensagens falsas.
3. **Unificar a geração de `instance_name`** entre os dois fluxos de provisão (user vs admin) numa função compartilhada.
4. **Transformar a reutilização de instância em uma operação atômica** (ex: `SELECT ... FOR UPDATE` ou uma função Postgres com `INSERT ... ON CONFLICT DO NOTHING`) em vez de check-then-act em duas etapas.
5. **Registrar falhas de limpeza de instância órfã** em vez de engolir silenciosamente — mínimo: log estruturado com o `instance_name` e token para investigação manual.
6. **Adicionar alerta/monitoramento de status** — hoje a detecção de desconexão depende de polling manual ou do webhook; não há job periódico que sincronize status de instâncias "esquecidas".

### 7. Fluxo ponta a ponta (referência rápida)

**Usuário ativa WhatsApp** → `useWaProvision` → `whatsapp-provision` (cria ou reutiliza) → `useWaConnect` (QR) → polling `useWaSyncStatus` → webhook `connectionUpdate` → `status='connected'`.

**Admin gerencia** → `AdminWhatsAppInstancias.tsx` → `use-admin-whatsapp.ts` (create/link/unlink/delete/connect/disconnect/sync).

**Envio de mensagem** → `useWaSendMessage` → `whatsapp-send` → busca instância via `wapi_instancia_usuarios` → valida `connected` → `/send/text|ptt|media` → grava `wamid` em `whatsapp_mensagens`.

**Recebimento** → Uazapi → `whatsapp-webhook?instance=...` → decripta mídia E2E (AES-256-CBC + HKDF) se houver → upsert `whatsapp_conversas` → insert `whatsapp_mensagens` → Realtime atualiza o frontend.

