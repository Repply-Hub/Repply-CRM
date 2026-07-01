# Análise da Estrutura de Instâncias Uazapi

> Gerado em 2026-07-01. Cobre a integração WhatsApp via Uazapi: schema, endpoints, fluxos de provisão, frontend/backend e bugs identificados.

## 1. Visão geral

A integração é dividida em três camadas:

- **Frontend (React/TS)**: `src/hooks/use-whatsapp-inbox.ts`, `src/hooks/use-admin-whatsapp.ts`, `src/pages/AdminWhatsAppInstancias.tsx`
- **Backend (Supabase Edge Functions / Deno)**: `whatsapp-provision`, `whatsapp-admin-provision`, `whatsapp-webhook`, `whatsapp-send`
- **Banco (Postgres/Supabase)**: `configuracoes_wapi`, `whatsapp_conversas`, `whatsapp_mensagens`, e a tabela de vínculo `wapi_instancia_usuarios`

Cada "instância" representa uma sessão do WhatsApp na Uazapi, identificada por um `instance_name` único e autenticada por um `api_key`/token individual.

## 2. Schema do banco

Migrations relevantes: `20260608144429_whatsapp_inbox.sql` (base) e evoluções em `20260616`, `20260618`, `20260620`.

### `configuracoes_wapi`
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

### `whatsapp_conversas`
Threads de conversa por telefone, únicas por `(empresa_id, telefone)`. Guarda `nao_lidas`, `ultima_mensagem`, flag `arquivada`.

### `whatsapp_mensagens`
Histórico bidirecional (`direcao`: entrada/saida), com `wamid` único, `media_url`/`media_mime`, `status` de entrega.

### `wapi_instancia_usuarios` (tabela de vínculo N:N usuário↔instância)
**Não existe em nenhuma migration do repositório** (confirmado via grep em todo `supabase/migrations/*.sql`), mas é usada ativamente em:
- `whatsapp-provision/index.ts` (insert de vínculo)
- `whatsapp-admin-provision/index.ts` (link/unlink)
- `whatsapp-send/index.ts` (lookup da instância do usuário)

Isso é o achado mais grave deste relatório — ver seção 5.1.

## 3. Endpoints Uazapi utilizados

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

## 4. Fluxos de provisão

### 4.1 `whatsapp-provision` (usuário final)
1. Valida sessão do usuário logado.
2. Verifica idempotência: usuário já tem instância vinculada? Retorna sem recriar.
3. **Reutilização** (a feature do commit `316acf0`): se a empresa já tem uma instância `provisionada=true`, vincula o usuário a ela via `wapi_instancia_usuarios` em vez de criar uma nova na Uazapi.
4. Caso contrário, cria via `/instance/init`, extrai o token da resposta (múltiplos formatos aceitos), registra webhook, salva em `configuracoes_wapi` e vincula o usuário.

### 4.2 `whatsapp-admin-provision` (admin/gestor/empresa)
Suporta 4 ações: `create`, `link`, `unlink`, `delete`. `delete` chama `DELETE /instance` na Uazapi e remove o registro em `configuracoes_wapi`.

### 4.3 Fluxo de conexão (QR code)
`connect` → recebe QR base64 → frontend faz polling de `sync-status` a cada 3s → quando `connected/loggedIn = true`, fecha o diálogo. Em paralelo, o webhook da Uazapi também deve notificar `connectionUpdate` e atualizar o status no banco.

## 5. Bugs e riscos identificados

### 5.1 🔴 Crítico — tabela `wapi_instancia_usuarios` não existe em nenhuma migration
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

### 5.2 🔴 Race condition na reutilização de instância
Em `whatsapp-provision/index.ts`, entre checar se a empresa já tem instância provisionada e inserir o vínculo, não há lock nem transação — dois usuários provisionando ao mesmo tempo podem colidir. É parcialmente mitigado (o código trata erro `duplicate` como sucesso), mas isso é uma rede de segurança, não uma correção real da race condition.

### 5.3 🔴 Limpeza de instância órfã falha silenciosamente
`deleteOrphanInstance()` em `whatsapp-provision/index.ts` engole qualquer erro (`fetch` falho ou resposta não-ok) e segue em frente. Resultado possível: instância criada na Uazapi mas nunca associada/removida corretamente no banco — instância "fantasma" que continua consumindo uma vaga/licença na Uazapi sem estar rastreada localmente. No mínimo deveria logar em uma tabela de auditoria ou alertar.

### 5.4 🟡 `webhook_secret` existe no schema mas nunca é usado
Nenhuma validação de assinatura/segredo é feita em `whatsapp-webhook/index.ts` — qualquer requisição que souber a URL (`?instance=<name>`) pode injetar mensagens ou mudar status de conexão de uma instância. Isso é uma lacuna de segurança real: o endpoint do webhook é público por natureza (a Uazapi precisa alcançá-lo), então validar o `webhook_secret` (ou HMAC do payload) fecharia essa porta.

### 5.5 🟡 Duas rotinas de nomeação de instância divergentes
`whatsapp-provision` gera `instance_name` como `empresa_usuario`; `whatsapp-admin-provision` (ação `create`) gera `empresa_RANDOM`. Isso quebra a previsibilidade do nome e pode dificultar debugging/correlação manual no painel da Uazapi.

### 5.6 🟡 Parsing "genérico demais" da resposta de `/instance/init`
O token é extraído tentando 4 caminhos diferentes (`token`, `instance.token`, `instance.apikey`, `apikey`) sem validar o formato. Se nenhum bater, a resposta completa (`initData`) é logada — podendo vazar dados sensíveis nos logs da function caso a Uazapi retorne algo inesperado.

### 5.7 🟡 Status "connecting" nunca é setado pelo webhook
O `statusMap` mapeia `open → connected`, `close → disconnected`, `connecting → connecting`, mas na prática os eventos da Uazapi observados só emitem `open`/`close`. Isso deixa `status='connecting'` como um estado que só existe transitoriamente no frontend (otimista), nunca persistido de volta, o que pode causar UI travada em "conectando..." se o polling falhar.

### 5.8 🟢 Sem validação de tamanho de mídia no upload
`use-whatsapp-inbox.ts` (uploadWaMedia) não valida tamanho do arquivo antes de subir para o Storage — depende só do limite padrão do Supabase.

### 5.9 🟢 Sem retry em `whatsapp-send`/`whatsapp-webhook`
Falhas transitórias de rede na Uazapi não são reprocessadas; mensagens podem se perder silenciosamente (apenas logadas em `webhook_debug`).

## 6. Melhorias sugeridas (priorizadas)

1. **Resolver o mistério da tabela `wapi_instancia_usuarios`** (5.1) — prioridade máxima, pois é risco de "banco não reproduzível a partir das migrations".
2. **Validar `webhook_secret`** no endpoint de webhook (HMAC ou comparação simples de token na query string) — fecha uma porta de injeção de mensagens falsas.
3. **Unificar a geração de `instance_name`** entre os dois fluxos de provisão (user vs admin) numa função compartilhada.
4. **Transformar a reutilização de instância em uma operação atômica** (ex: `SELECT ... FOR UPDATE` ou uma função Postgres com `INSERT ... ON CONFLICT DO NOTHING`) em vez de check-then-act em duas etapas.
5. **Registrar falhas de limpeza de instância órfã** em vez de engolir silenciosamente — mínimo: log estruturado com o `instance_name` e token para investigação manual.
6. **Adicionar alerta/monitoramento de status** — hoje a detecção de desconexão depende de polling manual ou do webhook; não há job periódico que sincronize status de instâncias "esquecidas".

## 7. Fluxo ponta a ponta (referência rápida)

**Usuário ativa WhatsApp** → `useWaProvision` → `whatsapp-provision` (cria ou reutiliza) → `useWaConnect` (QR) → polling `useWaSyncStatus` → webhook `connectionUpdate` → `status='connected'`.

**Admin gerencia** → `AdminWhatsAppInstancias.tsx` → `use-admin-whatsapp.ts` (create/link/unlink/delete/connect/disconnect/sync).

**Envio de mensagem** → `useWaSendMessage` → `whatsapp-send` → busca instância via `wapi_instancia_usuarios` → valida `connected` → `/send/text|ptt|media` → grava `wamid` em `whatsapp_mensagens`.

**Recebimento** → Uazapi → `whatsapp-webhook?instance=...` → decripta mídia E2E (AES-256-CBC + HKDF) se houver → upsert `whatsapp_conversas` → insert `whatsapp_mensagens` → Realtime atualiza o frontend.
