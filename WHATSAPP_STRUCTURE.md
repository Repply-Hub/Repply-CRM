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
