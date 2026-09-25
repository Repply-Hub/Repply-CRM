# Sincronização de calendário — Fase 2: Microsoft 365 (Outlook)

- **Data:** 2026-09-25
- **Estado:** desenho aprovado no brainstorming; aguarda o plano de implementação.
- **Herda:** `docs/superpowers/specs/2026-09-23-sincronizacao-calendario-externo-design.md` (Fase 1,
  Google, já no ar). Este documento só descreve **o que muda** para a Microsoft.

---

## 1. Objetivo

Acrescentar a Microsoft 365 (Outlook) como segundo provedor da sincronização de calendário, **mão
dupla**, reaproveitando todo o motor da Fase 1. O Google (Fase 1) segue igual e no ar.

## 2. Decisões do brainstorming (25/09/2026)

- **Mão dupla**, como o Google.
- **Permissão mais ampla, por necessidade.** A Microsoft **não tem** um escopo estreito equivalente
  ao `calendar.app.created` do Google. A única forma de mão dupla é o escopo **`Calendars.ReadWrite`**
  (ler/escrever os calendários da pessoa). Aceito, **com uma trava no código** (item 4.2): o app só
  opera no calendário dedicado "Repply CRM" que ele cria; recusa qualquer outro. Cifra dos tokens +
  código disciplinado + trava + aviso no consentimento + política de privacidade.
- **Contas aceitas:** pessoais (@outlook/@hotmail) **e** corporativas (Microsoft 365 de empresa) —
  app multi-tenant + contas pessoais. ⚠️ Em alguns tenants corporativos, o **admin de TI** precisa
  consentir apps de terceiros; fora do nosso controle (é política da empresa do cliente).
- **Soltura:** igual ao Google — construir, implantar, testar com conta de teste, e só então abrir a
  todos. A trava de recurso `SINCRONIZACAO_CALENDARIO_ATIVA` já cobre isso (a tela mostra os dois
  provedores quando ligada).

## 3. O que se reaproveita (SEM tocar)

- Tabelas `calendario_contas`, `evento_sync_externo`, `calendario_fila` — com `provedor='microsoft'`.
  A coluna `provedor` já tem `check in ('google','microsoft')` desde a migration `20260923140100`.
  `calendario_externo_id` guarda o id do calendário dedicado; `sync_token` guarda o **delta token**
  da Microsoft; os tokens ficam cifrados (mesma `CALENDARIO_TOKEN_KEY`, mesmas `cifrar`/`decifrar`).
- O **motor** `calendario-sincronizar` (empurrar/puxar) e todas as proteções: só toca no que tem
  etiqueta, conflito (`quemVence`), disjuntor (`excedeDisjuntor`), zero-linhas (`deveTratarComoRecusa`),
  anti-eco (`mesmoConteudo`), captura do id externo antes da cascata, rede de segurança (crons de 5 min).
- A **fila + gatilhos + crons** (migration `20260924120000`) — já disparam para qualquer conexão
  conectada, independente do provedor.

## 4. O que é novo

### 4.1 Adaptador `supabase/functions/_shared/calendario-microsoft.ts`
Mesma **forma** do `calendario-google.ts` (para o motor não saber de qual provedor se trata):
- `urlDeConsentimento(state)`, `trocarCodigoPorToken(code)`, `renovarAccessToken(refreshToken)` —
  OAuth 2.0 da Microsoft (`https://login.microsoftonline.com/common/oauth2/v2.0/authorize` e `/token`),
  escopos `Calendars.ReadWrite offline_access openid email`.
- `criarCalendarioRepply(accessToken)` → `POST https://graph.microsoft.com/v1.0/me/calendars`
  `{ "name": "Repply CRM" }` → devolve o id.
- `criarEvento`/`atualizarEvento`/`apagarEvento` → `/me/calendars/{id}/events` (POST/PATCH/DELETE).
- `listarMudancas(accessToken, calId, deltaToken)` → `/me/calendars/{id}/events/delta` (paginação por
  `@odata.nextLink`, próximo delta em `@odata.deltaLink`); item removido vem com `@removed`.
- Mapeamento evento Repply ↔ **recurso do Microsoft** (formato Graph, diferente do Google):
  - `subject` (título), `body: { contentType: 'text', content }` (descrição),
    `start/end: { dateTime, timeZone }`, `isAllDay`.
  - Dia inteiro: `isAllDay=true`, `start.dateTime`/`end.dateTime` à meia-noite; **o fim é EXCLUSIVO**
    (dia seguinte), como no Google — reusar a matemática de data do núcleo (`somaDias`, âncora local).
  - Mudança removida (`@removed`) equivale ao `status: 'cancelled'` do Google.

### 4.2 🔴 Trava de calendário no código
O adaptador **nunca lista nem toca em outro calendário**: toda operação usa o `calendario_externo_id`
dedicado guardado na conexão. Além disso, uma verificação explícita recusa operar se o alvo não for
esse id. É a defesa a mais que compensa o escopo amplo da Microsoft.

### 4.3 Núcleo: acrescentar o mapeamento da Microsoft (mantendo tudo PURO)
Hoje `_shared/calendario-nucleo.ts` tem `paraGoogle`/`paraRepply` (formato Google) **e** as regras
agnósticas (`quemVence`, `excedeDisjuntor`, `deveTratarComoRecusa`, `somaDias`). Para a Fase 2:
- **O núcleo continua a fonte ÚNICA e PURA** (sem `date-fns`, sem `Deno`, roda no Deno e no Node). Ele
  ganha `paraMicrosoft`/`deMicrosoft` (formato Graph) ao lado de `paraGoogle`/`paraRepply`. As regras
  agnósticas ficam onde estão.
- 🔴 **O mapeamento NÃO vai para os arquivos de adaptador** (`calendario-google.ts`/`-microsoft.ts`):
  eles têm `Deno.env.get(...)` no topo e o `src/lib` reexporta o mapeamento (roda em Node nos testes),
  então pôr o mapeamento lá quebraria os testes. Os adaptadores **importam** o mapeamento do núcleo.
- `src/lib/calendario/*` seguem reexportando do núcleo (o do Google intacto; opcionalmente o da
  Microsoft, só se algum teste em `src/` precisar). Os testes do Google continuam passando; entram
  testes do mapeamento da Microsoft (no `src/lib/calendario/`, contra o núcleo).
> Refatoração mínima e com rede de teste — não muda comportamento do Google.

### 4.4 Motor e login por provedor
- `calendario-sincronizar`: escolhe o adaptador por `conta.provedor` (google → adaptador do Google;
  microsoft → adaptador da Microsoft) via um `adaptadorDe(provedor)`. O resto do fluxo é idêntico.
- `calendario-conectar`: o `state` passa a carregar o **provedor** (`provedor.user_id.nonce`); o
  `/retorno` e o `iniciar` escolhem o adaptador certo. `desconectar` continua por `user_id`+`provedor`.

### 4.5 Tela
`ConexaoCalendarioExterno` + `use-calendario-conexao` passam a tratar **dois provedores**: mostram o
estado por provedor e os botões **"Conectar meu Google"** e **"Conectar meu Microsoft"**. `provedor`
vira parâmetro de `iniciarConexao`/`desconectar`. Mesma estética.

### 4.6 Política de privacidade
Acrescentar, em `/politica-de-privacidade`, um trecho sobre a Microsoft: a permissão concedida é mais
ampla (ler/escrever os calendários), mas o Repply **só** cria e mexe no calendário dedicado "Repply
CRM"; não lê nem altera os demais. Mesmo compromisso de Uso Limitado/segurança do texto atual.

## 5. Segurança

- Tokens da Microsoft cifrados no servidor (mesma chave/rotina do Google), lidos só pelo `service_role`.
- **Trava de calendário (4.2)** — reduz o risco do escopo amplo: o app poderia, mas não usa, os
  outros calendários; o código recusa qualquer alvo fora do "Repply CRM".
- A permissão ampla é **visível ao usuário no consentimento da Microsoft** e descrita na política.
- Segredos no Supabase: `MICROSOFT_CALENDAR_CLIENT_ID`, `MICROSOFT_CALENDAR_CLIENT_SECRET`,
  `MICROSOFT_CALENDAR_REDIRECT_URI` (nunca no repositório).

## 6. Pré-requisito externo (AÇÃO DO LUCAS — no painel da Microsoft/Entra)

Guiado passo a passo, como o Google Cloud:
1. Registrar um aplicativo no **Microsoft Entra (Azure AD)**: tipo de conta **"contas em qualquer
   diretório organizacional e contas pessoais da Microsoft"** (multi-tenant + pessoais).
2. **Redirect URI (Web):** `https://hukeirrmsoiowvvrhivx.supabase.co/functions/v1/calendario-conectar/retorno`
   (o MESMO da função de conexão do Google — a `calendario-conectar` atende os dois provedores, e o
   `state` diz qual é).
3. **Permissões de API (Microsoft Graph, delegadas):** `Calendars.ReadWrite`, `offline_access`,
   `openid`, `email`.
4. Criar um **client secret**. Anotar `client_id` e `client_secret`.
5. Salvar os 3 segredos no Supabase (item 5). (Opcional: **verificação do publicador** — mais leve
   que a do Google — para reduzir avisos de consentimento.)
> Não há a revisão longa do Google. O consentimento é do próprio usuário; contas corporativas podem
> exigir aprovação do admin de TI da empresa.

## 7. Fora de escopo (YAGNI)

- **Escopo estreito na Microsoft** — não existe; por isso a permissão ampla + trava.
- **iCloud "puro" (CalDAV)** — Fase 3.
- **Recorrência**, **importar a agenda inteira** para o Repply — como na Fase 1, NÃO.
- **Webhooks do Graph** (subscriptions) — a volta segue por delta no cron de 5 min, como o Google.

## 8. Como verificar

- **Testes puros** do mapeamento Repply↔Microsoft (com hora, dia-inteiro com fim exclusivo) — como os
  do Google. As regras de conflito/proteção já têm teste (reaproveitadas).
- Teste da **trava de calendário** (recusa alvo diferente do dedicado).
- `tsc` (base atual, não subir), `build`, suíte inteira.
- Ponta a ponta com **conta de teste Microsoft** (pessoal e, se possível, uma corporativa): conectar,
  criar no Repply → aparece no Outlook (calendário "Repply CRM"); mudar/apagar no Outlook → volta em
  até 5 min; e o disjuntor barra exclusão em massa. Confirmar que os outros calendários **não** são
  tocados.

## 9. Riscos

- **Escopo amplo** (mitigado por trava + cifra + consentimento visível + política).
- **Admin-consent corporativo** — alguns tenants exigem; o vendedor pode não conseguir sozinho.
- **Delta token** pode expirar/invalidar — tratar como o 410 do Google (zera e refaz do zero).
- **Formato de evento do Graph** (dia-inteiro, fuso, body) — coberto pelo mapeamento próprio + testes.
