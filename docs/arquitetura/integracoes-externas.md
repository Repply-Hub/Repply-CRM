# Integrações externas

Inventário de tudo que o Repply CRM depende de fora, e o que trocar ao montar um ambiente
novo.

> **Revisado em 19/08/2026.** O documento original é de 18/06/2026 e tinha três pontos
> vencidos, corrigidos aqui: o provedor de e-mail (era Gmail, hoje é **Nylas**), a
> descrição do `APP_URL`, e a classificação da exposição do token do WhatsApp — que
> **não** era risco aceito pelo dono do produto. Correções assinaladas ao longo do texto.

**Data do levantamento original:** 2026-06-18  
**Projeto:** mdrepresentacoes  
**Objetivo:** Mapear todas as integrações externas que precisam ser substituídas ou reconfiguradas ao fazer deploy para um novo cliente.

---

## Tabela Resumo

| Integração | Arquivo/Local | O que trocar | Escopo |
|---|---|---|---|
| **Supabase** | `src/integrations/supabase/client.ts`, `.env` | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`, `SUPABASE_SERVICE_ROLE_KEY` (Edge Functions) | Por deploy |
| **Google Maps** | `src/hooks/use-geocode-obras.ts`, `src/components/obras/MapaObras.tsx`, `.env` | `VITE_GOOGLE_MAPS_API_KEY` | Por deploy |
| **Nylas (e-mail)** | `supabase/functions/email-*`, `supabase/functions/_shared/nylas.ts` | `NYLAS_API_KEY`, `NYLAS_CLIENT_ID`, `NYLAS_API_BASE` (região, **imutável**), `NYLAS_WEBHOOK_SECRET`, `APP_URL` | Credencial por deploy; caixa por empresa |
| **Gmail OAuth** *(legado)* | `supabase/functions/gmail-*`, tabela `gmail_tokens` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | **Substituído pelo Nylas em ago/2026.** Código ainda no repositório |
| **Stripe** | `supabase/functions/stripe-checkout`, `stripe-portal`, `stripe-webhook` | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Por deploy |
| **uazapi (WhatsApp)** | `supabase/functions/whatsapp-provision/index.ts`, `supabase/functions/whatsapp-send/index.ts`, `supabase/functions/whatsapp-webhook/index.ts`, tabela `configuracoes_wapi` | `UAZAPI_BASE_URL`, `UAZAPI_ADMIN_TOKEN`, URL do webhook (`SUPABASE_URL/functions/v1/whatsapp-webhook`), `api_key` por instância na tabela `configuracoes_wapi` | `UAZAPI_BASE_URL`/`ADMIN_TOKEN` por deploy; `api_key` por instância de cliente |
| **Lovable AI (PDF)** | `supabase/functions/extract-natal-pdf/index.ts` | `LOVABLE_API_KEY` | Por deploy |
| **IDEMA / Portais Gov.** | `supabase/functions/scrape-licencas-idema/index.ts`, `supabase/functions/portal-scraper/index.ts` | URLs hardcoded (`siga.idema.rn.gov.br`, `natal.rn.gov.br`, `extremoz.rn.gov.br`) — substituir se cliente for de outro estado/município | Por deploy / geográfico |
| **Nominatim (OSM)** | `src/hooks/use-geocode-obras.ts` | Nenhum — serviço público, sem credencial | Nenhum |
| **Resend** | Tabelas `user_integrations`, `user_domains` no banco | `resend_api_key`, `resend_from_email`, `resend_domain_id` (armazenados por usuário no banco) | Por usuário (multi-tenant) |

---

## Detalhamento por Integração

### 1. Supabase

**Tipo:** BaaS (banco de dados, autenticação, storage, Edge Functions)  
**Escopo:** Por deploy (um projeto Supabase por ambiente/cliente)

**Credenciais encontradas:**
- `.env` / `src/integrations/supabase/client.ts`
  - `SUPABASE_URL` = `https://hukeirrmsoiowvvrhivx.supabase.co`
  - `SUPABASE_PUBLISHABLE_KEY` = JWT anon key (expira em 2095)
  - `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` (duplicatas para o frontend Vite)
  - `VITE_SUPABASE_PROJECT_ID` = `hukeirrmsoiowvvrhivx`
- Edge Functions (secrets do Supabase):
  - `SUPABASE_SERVICE_ROLE_KEY` — usada internamente pelas funções para operações privilegiadas

**O que fazer ao redeployar para novo cliente:**
1. Criar novo projeto Supabase
2. Atualizar todas as variáveis `SUPABASE_*` e `VITE_SUPABASE_*` no `.env`
3. Rodar todas as migrations
4. Reconfigurar storage bucket `whatsapp-media`
5. Reatualizar secrets das Edge Functions no painel Supabase

---

### 2. Google Maps

**Tipo:** Geocodificação e renderização de mapas  
**Escopo:** Por deploy (uma API Key compartilhada por todos os usuários do cliente)

**Credenciais:**
- `.env`: `VITE_GOOGLE_MAPS_API_KEY` = `[ROTACIONADA — ver Google Cloud Console]` (valor real removido deste arquivo; a chave anterior foi exposta em texto plano no histórico do git e deve ser tratada como comprometida)

**Arquivos:**
- `src/components/obras/MapaObras.tsx` — usa `@react-google-maps/api`
- `src/hooks/use-geocode-obras.ts` — chama `https://maps.googleapis.com/maps/api/geocode/json`

**Observação:** Existe fallback para Nominatim (OpenStreetMap) quando o Google atinge rate limit — não requer credencial.

**O que fazer:** Criar nova API Key no Google Cloud Console com restrições de domínio para o novo cliente. Atualizar `VITE_GOOGLE_MAPS_API_KEY`.

---

### 3. Gmail OAuth 2.0 — LEGADO

> 🔴 **Vencido.** O e-mail migrou para o **Nylas** em agosto de 2026. Esta seção descreve
> **código legado** que ainda está no repositório e não é mais o caminho ativo. O provedor
> atual está em [`docs/modulos/email.md`](../modulos/email.md), e o que ainda sobrou do
> Gmail está listado em [`docs/divida-tecnica.md` §9](../divida-tecnica.md).
>
> Correção adicional: o texto abaixo diz que o `APP_URL` é o *redirect URI* do OAuth. **Não
> é.** O endereço de retorno enviado ao Google deriva de `SUPABASE_URL`; o `APP_URL` só é
> usado no redirecionamento final de volta ao app. E não há valor fixo no código — a função
> lança erro se o `APP_URL` estiver ausente.

**Tipo:** Autenticação OAuth + envio/leitura de e-mails via Gmail API
**Escopo:** Credenciais OAuth por deploy; tokens por usuário (multi-tenant)

**Credenciais:**
- Secrets das Edge Functions:
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
- `APP_URL` = `https://mdrepresentacoes.grupoclimb.ai` (redirect URI hardcoded no callback)

**Edge Functions:**
- `supabase/functions/gmail-auth-url/index.ts` — gera URL de auth, redirect URI: `${SUPABASE_URL}/functions/v1/gmail-callback`
- `supabase/functions/gmail-callback/index.ts` — troca code por tokens, armazena em `gmail_tokens`
- `supabase/functions/gmail-send/index.ts` — envia e-mails, implementa refresh automático
- `supabase/functions/gmail-sync-inbox/index.ts` — sincroniza inbox
- `supabase/functions/gmail-debug/index.ts` — função de debug

**Banco de dados:**
- Tabela `gmail_tokens`: `user_id`, `access_token`, `refresh_token`, `expires_at`, `email`
- Tabela `emails_recebidos`: `gmail_message_id`, `user_id`, `remetente`, `assunto`, `corpo_html`

**O que fazer:**
1. Criar novo projeto no Google Cloud Console para o cliente
2. Configurar OAuth consent screen
3. Criar credenciais OAuth com redirect URI apontando para o novo `SUPABASE_URL`
4. Atualizar secrets `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` nas Edge Functions
5. Atualizar `APP_URL` para o domínio do novo cliente
6. Tokens individuais (`gmail_tokens`) são gerados pelo fluxo OAuth — não precisam ser migrados

---

### 4. uazapi (WhatsApp Business)

**Tipo:** API REST para gerenciar instâncias WhatsApp (envio, recebimento, webhooks)  
**Escopo:** `UAZAPI_BASE_URL` e `UAZAPI_ADMIN_TOKEN` por deploy; `api_key` por instância de usuário

**Credenciais:**
- Secrets das Edge Functions:
  - `UAZAPI_BASE_URL` — URL base do servidor uazapi
  - `UAZAPI_ADMIN_TOKEN` — token administrativo para criar instâncias

**Edge Functions:**
- `supabase/functions/whatsapp-provision/index.ts`
  - POST `${UAZAPI_BASE_URL}/instance/init` — cria instância
  - POST `${UAZAPI_BASE_URL}/webhook` — configura webhook para `${SUPABASE_URL}/functions/v1/whatsapp-webhook?instance=...`
- `supabase/functions/whatsapp-send/index.ts`
  - POST `${baseUrl}/send/text`, `/send/ptt`, `/send/media`
  - Autentica com header `token: config.api_key`
- `supabase/functions/whatsapp-webhook/index.ts`
  - Recebe eventos; armazena em `whatsapp_conversas` e `whatsapp_mensagens`

**Banco de dados:**
- `configuracoes_wapi`: `usuario_id`, `empresa_id`, `instance_url`, `api_key`, `instance_name`, `status`, `webhook_secret`, `provisionada`
- `whatsapp_conversas`, `whatsapp_mensagens`, `whatsapp_conversa_responsaveis`

**Storage:** bucket `whatsapp-media` para mídia recebida/enviada

**O que fazer:**
1. Ter um servidor uazapi rodando (ou usar instância compartilhada)
2. Atualizar `UAZAPI_BASE_URL` e `UAZAPI_ADMIN_TOKEN` nos secrets das Edge Functions
3. Webhook URL se atualiza automaticamente via `SUPABASE_URL` — ok se Supabase for novo
4. Instâncias individuais (`api_key` em `configuracoes_wapi`) são criadas pelo fluxo de provisionamento — não precisam ser migradas manualmente

#### 🔴 Falha em aberto: o token da instância está legível em `webhook_debug`

> **Correção de 19/08/2026.** A versão original desta seção classificava isso como risco
> "mantido por decisão do dono do produto". **O dono do produto confirmou que a decisão não
> foi dele.** Não é risco aceito: é dívida a pagar, e está na fase 1 do roadmap. O item
> completo, com a ordem obrigatória de conserto, está em
> [`docs/divida-tecnica.md` §1](../divida-tecnica.md).

Medido em 05/08/2026.

- `public.webhook_debug` está com **RLS desabilitada** e tem ~61 mil linhas.
- **~1.621 dessas linhas contêm o `api_key` da instância conectada em texto plano** — o valor
  bate exatamente com `configuracoes_wapi.api_key`. A uazapi manda o próprio token dentro do
  payload do webhook, e nós gravamos o payload inteiro.
- Consequência: quem tiver a chave publicável do app (que é pública, vai no bundle do
  navegador) lê o token e passa a poder enviar, ler e desconectar o WhatsApp da empresa
  direto na API da uazapi.
- Relacionado: o frontend também fala direto com a uazapi usando esse token, no fluxo de QR
  (`src/hooks/use-whatsapp-inbox.ts`, `useWaConnect` e vizinhos), então ele trafega no
  navegador de qualquer forma.

Se um dia for corrigir, a ordem importa: remover o token das linhas existentes, parar de
gravá-lo, criar a policy, **e só então** habilitar a RLS — habilitar RLS sem policy tranca
todo mundo, inclusive o diagnóstico.

#### Grupos: o JID é literal

`whatsapp_conversas.telefone` guarda o JID do grupo **sem** o sufixo `@g.us`, e em dois
formatos: moderno (`120363…`, só dígitos) e legado (`5511988345626-1425926780`, com hífen).
Qualquer código que monte o destino **não pode** aplicar `replace(/\D/g,"")` — isso apaga o
hífen e produz um JID inexistente, para o qual a uazapi responde 200 com um chat vazio e
não entrega nada. Foi um bug real, silencioso por meses (corrigido em 05/08/2026).

---

### 5. Lovable AI (Análise de PDF)

**Tipo:** API de IA para extração de dados de PDFs  
**Escopo:** Por deploy

**Credenciais:**
- Secret da Edge Function: `LOVABLE_API_KEY`

**Edge Function:**
- `supabase/functions/extract-natal-pdf/index.ts`
  - POST `https://ai.gateway.lovable.dev/v1/chat/completions`

**O que fazer:** Obter nova API Key Lovable para o cliente e configurar nos secrets do Supabase.

---

### 6. IDEMA e Portais Governamentais (Web Scraping)

**Tipo:** Scraping de dados públicos  
**Escopo:** Por deploy / geográfico (URLs específicas do RN — precisam mudar se o cliente for de outro estado)

**URLs hardcoded:**
- `https://siga.idema.rn.gov.br` (licenças ambientais RN)
- `https://www.natal.rn.gov.br/dom/` (Diário Oficial Municipal de Natal)
- `https://extremoz.rn.gov.br/diario-oficial/diario-oficial-2026/` (Diário Oficial de Extremoz)

**Edge Functions:**
- `supabase/functions/scrape-licencas-idema/index.ts`
- `supabase/functions/portal-scraper/index.ts`

**Banco de dados:**
- `licencas_idema`, `licencas_extremoz`, `licencas_natal`

**O que fazer:** Se cliente for de outro estado/município, substituir as URLs pelos portais equivalentes e adaptar o parser HTML.

---

### 7. Nominatim (OpenStreetMap)

**Tipo:** Geocodificação (fallback do Google Maps)  
**Escopo:** Nenhum — serviço público, sem credencial, sem configuração necessária

**URL:** `https://nominatim.openstreetmap.org/search`  
**Arquivo:** `src/hooks/use-geocode-obras.ts`

**O que fazer:** Nada. Mas atentar para o rate limit de 1 req/segundo implementado no hook.

---

### 8. Resend (E-mail Transacional)

**Tipo:** Envio de e-mails transacionais  
**Escopo:** Por usuário (multi-tenant — cada usuário configura sua própria chave)

**Armazenamento:**
- Tabela `user_integrations`: `resend_api_key`, `resend_from_email`
- Tabela `user_domains`: `resend_domain_id`

**Observação:** Não há Edge Function de envio via Resend identificada na varredura atual — parece ser uma integração preparada no banco mas não completamente implementada no backend, ou configurada via frontend diretamente.

**O que fazer:** Nenhuma credencial fixa de Resend existe no deploy — usuários configuram as próprias chaves via UI.

---

## Checklist para Novo Deploy

### Variáveis de Ambiente (`.env` / Vite)
- [ ] `VITE_SUPABASE_URL`
- [ ] `VITE_SUPABASE_PUBLISHABLE_KEY`
- [ ] `VITE_SUPABASE_PROJECT_ID`
- [ ] `VITE_GOOGLE_MAPS_API_KEY`

### Secrets das Edge Functions (Supabase Dashboard → Settings → Edge Functions)
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `GOOGLE_CLIENT_ID`
- [ ] `GOOGLE_CLIENT_SECRET`
- [ ] `APP_URL` (domínio do novo cliente)
- [ ] `UAZAPI_BASE_URL`
- [ ] `UAZAPI_ADMIN_TOKEN`
- [ ] `LOVABLE_API_KEY`

### Infraestrutura Supabase
- [ ] Novo projeto criado
- [ ] Migrations rodadas
- [ ] Bucket `whatsapp-media` criado com políticas corretas
- [ ] RLS (Row Level Security) verificada nas tabelas críticas
- [ ] **Cron funcionando de verdade** — ver a seção abaixo, não basta agendar

---

## Cron (`pg_cron` + `pg_net`) — quebrado no projeto atual

> O diagnóstico completo, com as três causas empilhadas e os comandos de verificação, vive
> em [`docs/divida-tecnica.md` §4](../divida-tecnica.md). O que segue abaixo é o mesmo
> conteúdo, mantido aqui porque é onde a checklist de novo ambiente precisa dele.

Dois jobs estão agendados: `eventos-lembrete` (5 min) e `email-sync` (15 min).
**Nenhum dos dois jamais executou com sucesso.** Em 05/08/2026 havia 3656
execuções registradas em `cron.job_run_details`, todas com status `failed`,
desde a criação do job em 23/07. Consequência real: os lembretes de evento nunca
foram enviados, e o espelho de marcadores da caixa de e-mail só é atualizado
quando alguém clica em atualizar na tela.

Como conferir em qualquer projeto:

```sql
select j.jobname, d.status, count(*), max(d.start_time), max(d.return_message)
from cron.job_run_details d join cron.job j on j.jobid = d.jobid
group by 1, 2;
```

São três causas empilhadas — a de cima esconde as de baixo:

1. **`cron.use_background_workers = off`** → `job startup timeout`.
   Com o parâmetro desligado, o pg_cron abre conexão libpq em `cron.host` e não
   consegue autenticar. É de contexto `postmaster`: **exige reiniciar o banco**
   (Dashboard → Settings → Database → Custom Postgres Config).

2. **`app.settings.service_role_key` não definida** → HTTP 401.
   O comando monta `Authorization: Bearer ` vazio e a Edge Function recusa.
   Não está nem no `vault.secrets`. Corrigir com:

   ```sql
   ALTER DATABASE postgres SET app.settings.service_role_key = '<service_role>';
   ```

   (a chave está em Dashboard → Settings → API; **nunca** commitar).

3. **Precedência de operador no comando** → `22P02 invalid input syntax for json`.
   `::` liga mais forte que `||`, então `'…' || chave || '"}'::jsonb` converte
   só o `"}`. Já corrigido em
   `20260805123341_corrige_precedencia_jsonb_nos_crons.sql`; o padrão certo é
   envolver a concatenação inteira em parênteses antes do cast.

Depois de resolver 1 e 2, validar disparando na mão e conferindo a resposta:

```sql
select net.http_post(
  url := 'https://<ref>.supabase.co/functions/v1/email-sync',
  headers := ('{"Content-Type":"application/json","Authorization":"Bearer '
              || current_setting('app.settings.service_role_key', true) || '"}')::jsonb,
  body := '{"limit":50}'::jsonb);
-- alguns segundos depois:
select id, status_code, left(content, 200) from net._http_response order by id desc limit 1;
```

### Google Cloud Console
- [ ] Novo projeto OAuth criado (ou credenciais adicionadas ao existente)
- [ ] Redirect URI configurada: `https://<novo-supabase-url>/functions/v1/gmail-callback`
- [ ] API Key do Maps criada com restrição de domínio

### URLs Hardcoded a Revisar
- [ ] `supabase/functions/gmail-callback/index.ts` — fallback `APP_URL` (linha ~69)
- [ ] `supabase/functions/portal-scraper/index.ts` — URLs dos portais governamentais (se mudar de estado)
- [ ] `supabase/functions/scrape-licencas-idema/index.ts` — URL do IDEMA-RN (se mudar de estado)

---

## Hospedagem (Vercel) — `vercel.json`

O arquivo é curto mas cada regra existe por um motivo, e JSON não aceita comentário
(a Vercel **recusa** propriedades desconhecidas como `"//"` dentro das regras e o
deploy falha na validação — já aconteceu).

**`rewrites`** — `/((?!assets/).*) -> /index.html`. É o que faz uma SPA funcionar
com URLs diretas.

A exclusão de `/assets` **não é decoração**. Enquanto o padrão era catch-all
(`/(.*)`), um arquivo inexistente não devolvia 404: devolvia o HTML com status
200. Somado ao cache longo abaixo, isso fazia o navegador guardar **HTML sob a
URL de um `.js`** — e, como o nome do arquivo deriva do conteúdo, um trecho
revertido no futuro voltaria com o mesmo nome e seria servido do cache
envenenado, sem consulta ao servidor e sem conserto por recarregamento. Com a
exclusão, um asset ausente volta a ser 404 de verdade.

> Ao mexer neste padrão, valide antes com `path-to-regexp` contra deep links
> reais (`/clientes`, `/pedidos/:id/editar`): errar aqui faz toda navegação
> direta virar 404 em produção.

**`headers`**:

| Caminho | Cache-Control | Por quê |
|---|---|---|
| `/assets/(.*)` | `max-age=604800` (7 dias) | O Vite põe hash do conteúdo no nome, então o arquivo nunca muda e poderia ser cacheado para sempre. Sem cache nenhum vale o padrão da Vercel (`max-age=0, must-revalidate`) e o navegador revalida ~500 kB de JS a cada carregamento. |
| `/` e `/index.html` | `max-age=0, must-revalidate` | O oposto: é o `index.html` que aponta para os arquivos com hash. Se ele ficar em cache, o navegador continua pedindo os arquivos da versão anterior mesmo depois de um deploy. |

**Por que 7 dias e não `immutable` de 1 ano**, que seria o padrão da indústria para
arquivo com hash: a Vercel aplica o cabeçalho também à resposta **404** de um
asset que sumiu, e não há como condicionar cabeçalho a status. Um 404 guardado
por um ano recria o mesmo problema do cache envenenado. Sete dias cobrem
praticamente todo o ganho de visita repetida e fazem qualquer 404 acidental se
curar sozinho numa semana, em vez de exigir limpar o cache do navegador.
