# Sincronização do calendário com serviços externos — desenho (Fase 1: motor + Google)

- **Data:** 2026-09-23
- **Estado:** desenho aprovado no brainstorming; aguarda escrita do plano de implementação.
- **Escopo deste documento:** a Fase 1 — o *motor* de sincronização de mão dupla, provado com o
  **Google**. Microsoft 365 (Fase 2) e iCloud "puro" (Fase 3) reaproveitam o mesmo motor e ganham
  spec própria depois.

---

## 1. Objetivo e origem

Hoje a agenda do Repply (`/calendario`, tabela `eventos`) não conversa com calendário externo — a
única ponte é importar um arquivo `.ics` uma vez, à mão. O pedido é **sincronizar** a agenda do
vendedor com o calendário que ele usa no dia a dia (Google, Microsoft 365 e, mais adiante, Apple).

Decisão de produto tomada no brainstorming (23/09/2026), com o Lucas:

- **Direção: mão dupla.** Criar/mudar de um lado reflete no outro.
- **O que sincroniza:** os **eventos de verdade** da tabela `eventos` — tanto os **pessoais** do
  vendedor quanto os **da empresa**. **Prazos de negócios e próximos contatos NÃO sincronizam**
  (são projeções read-only montadas de `pedidos`/`historico_contatos`, não dá para editá-los de fora).
- **O que ENTRA (celular → Repply):** **só os eventos que o Repply criou.** A vida pessoal do
  vendedor (médico, família, compromissos de fora) **nunca** entra no CRM. A mão dupla vale apenas
  para o conjunto que o Repply "possui".
- **Motor: integração direta, SEM Nylas** (caminho B). Custo recorrente zero, em troca de mais
  tempo de construção/manutenção. O Nylas (caminho A) foi descartado pelo custo por conta conectada
  e porque as contas de e-mail hoje são caixas *compartilhadas por empresa*, não a agenda pessoal
  de cada vendedor — ver §9.
- **Apple:** Google + Microsoft primeiro. A maioria dos iPhones mostra a agenda do Google/Outlook
  que o vendedor coloca no aparelho; o calendário **nativo do iCloud** (CalDAV) fica para a Fase 3.

---

## 2. Duas travas de segurança do desenho

1. **Calendário separado "Repply CRM".** Os eventos sincronizados vão para um calendário dedicado,
   criado pelo Repply dentro da conta Google do vendedor — nunca misturados no calendário principal
   dele. Ele liga/desliga fácil, e ao desconectar dá para remover aquele calendário inteiro sem
   tocar no resto da agenda dele.

2. **Evento da empresa respeita a permissão que o Repply já tem.** O evento da empresa também é mão
   dupla, mas a regra de segurança atual do Repply só deixa **o organizador (`criado_por`)** — ou o
   dono da linha (`user_id`) — alterar um evento. Então: se o vendedor **for** o organizador, a
   mudança feita no celular volta e vale para todos; se **não for**, a gravação de volta é barrada
   pela RLS e o Repply **mantém a versão oficial** (sem "reverter" de forma brusca e sem comemorar
   uma gravação que na verdade não aconteceu — ver §7). Deixar *qualquer* vendedor alterar o evento
   da empresa pelo celular seria uma mudança de permissão no Repply em si, e está **fora de escopo**.

> ❌ A trava "evento da empresa só de saída" foi **descartada** pelo Lucas — o evento da empresa é
> mão dupla, limitado pela RLS acima.

---

## 3. Onde o vendedor conecta

A conexão do calendário fica **no próprio calendário** (`/calendario`), separada da aba de e-mail.
**Não** há painel unificado de conexões nas configurações (decisão do Lucas). Botões: **"Conectar
meu Google"** (Fase 1), depois **"Conectar meu Microsoft"** (Fase 2), e **"Desconectar"**. A conexão
do e-mail (Nylas) continua exatamente onde está e não se mistura com esta.

---

## 4. Arquitetura (componentes e limites)

O motor é desenhado **agnóstico de provedor**: uma camada comum e um "adaptador" por serviço, para
a Fase 2 (Microsoft) entrar só escrevendo o adaptador dela.

- **Conector (OAuth) — `calendario-conectar` (edge function).** Recebe o retorno do login do Google,
  troca o código pela chave de acesso (refresh/access token), cria o calendário "Repply CRM" na
  conta do vendedor e grava a conexão. Também trata **desconectar** (cancela a chave no Google e,
  opcionalmente, remove o calendário "Repply CRM").
- **Adaptador do provedor — `_shared/calendario-google.ts`.** Traduz entre o evento do Repply e a
  API do Google (criar/editar/apagar; listar mudanças por *sync token*; renovar o token). É o único
  ponto que conhece o Google. A Fase 2 acrescenta `_shared/calendario-microsoft.ts` com a mesma
  interface.
- **Motor de saída (Repply → Google) — na hora.** Ao criar/editar/apagar um `evento`
  sincronizável, um gatilho no banco enfileira a mudança; a edge function `calendario-sincronizar`
  processa a fila e reflete no calendário do vendedor. Padrão igual ao que a agenda já usa para
  avisos (`evento_avisos` + trigger + `chamar_edge_function`).
- **Motor de volta (Google → Repply) — periódico.** A cada poucos minutos, uma tarefa agendada
  (cron, como o `eventos-lembrete` já roda) pergunta ao Google "o que mudou desde a última vez?"
  usando o *sync token* guardado, e aplica de volta **só** as mudanças de eventos que o Repply criou.
- **Proteções (§7).** Camada de regras que decide o que pode ser tocado, resolve conflito e barra
  exclusão em massa. Vale para os dois motores.

Cada peça tem um propósito só e conversa por interface definida (o evento do Repply de um lado, a
"etiqueta" de ligação do outro), então dá para testar o mapeamento e as regras de conflito sem
banco e sem rede.

---

## 5. Modelo de dados (duas tabelas novas, por migration, com RLS no mesmo arquivo)

### 5.1 `calendario_contas` — a conexão de cada vendedor

| coluna | tipo | o que é |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid NOT NULL → `auth.users(id)` | o vendedor dono da conexão (login) |
| `empresa_id` | uuid NOT NULL | inquilino (isolamento multi-empresa) |
| `provedor` | text CHECK (`'google'`,`'microsoft'`) | serviço conectado |
| `conta_email` | text | a conta externa conectada (para exibir "conectado como …") |
| `calendario_externo_id` | text | id do calendário "Repply CRM" criado na conta dele |
| `refresh_token` | text (**cofre/criptografado** — ver §8) | a chave de acesso de longa duração |
| `access_token` | text (criptografado) | chave de curta duração |
| `token_expira_em` | timestamptz | quando renovar o `access_token` |
| `sync_token` | text | marcador "até onde já sincronizei de volta" (incremental do Google) |
| `status` | text (`'conectada'`,`'erro'`,`'desconectada'`) | |
| `ultimo_erro` | text | última falha (para diagnóstico e para avisar o vendedor) |
| `ultima_sync_em` | timestamptz | |
| `criado_em` / `updated_at` | timestamptz | |

**RLS:** o vendedor **lê o status da PRÓPRIA linha** (para a tela mostrar "conectado/erro"), mas
**nunca** as colunas de token — a leitura dos tokens é exclusiva do `service_role` (as edge
functions). SELECT: `user_id = auth.uid()` com os tokens ocultados na camada de leitura (a tela usa
uma view/consulta que não seleciona as colunas de token). INSERT/UPDATE/DELETE de token: só
`service_role`. O vendedor só conecta/desconecta a **própria** conta.

### 5.2 `evento_sync_externo` — a "etiqueta" que liga os dois lados

| coluna | tipo | o que é |
|---|---|---|
| `id` | uuid PK | |
| `evento_id` | uuid NOT NULL → `eventos(id)` ON DELETE CASCADE | o evento do Repply |
| `calendario_conta_id` | uuid NOT NULL → `calendario_contas(id)` ON DELETE CASCADE | por qual conexão |
| `evento_externo_id` | text NOT NULL | o id do evento espelhado no Google |
| `etag_externo` | text | versão do lado do Google (detecta mudança/conflito) |
| `atualizado_repply_em` | timestamptz | `updated_at` do evento na última sincronização (conflito) |
| `ultima_sync_em` | timestamptz | |

Índice único por (`calendario_conta_id`, `evento_externo_id`) e por (`evento_id`,
`calendario_conta_id`). É esta tabela que garante a regra de ouro: **o Repply só toca em evento que
tem etiqueta** — o resto da agenda do vendedor é intocável.

**RLS:** existência sobre `calendario_contas`/`eventos` do próprio usuário; escrita só `service_role`.

---

## 6. Fluxos

**Conectar:** vendedor clica "Conectar meu Google" → consentimento no Google (escopo de gerenciar
eventos) → `calendario-conectar` troca o código, grava `calendario_contas`, cria o calendário
"Repply CRM", faz a **primeira carga** (empurra os eventos sincronizáveis existentes e guarda o
`sync_token` inicial).

**Saída (na hora):** `eventos` muda → gatilho enfileira → `calendario-sincronizar` cria/edita/apaga
o espelho no Google e grava/atualiza a etiqueta (`evento_externo_id`, `etag_externo`,
`atualizado_repply_em`).

**Volta (a cada poucos minutos):** cron chama `calendario-sincronizar` no modo "puxar" → para cada
`calendario_contas` conectada, pede ao Google as mudanças desde `sync_token` → para cada mudança que
**tem etiqueta**, aplica no `eventos` respeitando as proteções do §7; atualiza `sync_token`.

**Desconectar:** para de sincronizar, cancela a chave no Google, pergunta se remove o calendário
"Repply CRM", apaga as etiquetas e marca a conta como `desconectada`. Vendedor removido da empresa →
a conexão é limpa junto.

---

## 7. Conflito, exclusão e a regra do "zero linhas" (o coração da segurança)

- **Só toca no que tem etiqueta.** Nenhuma mudança externa sem `evento_sync_externo` correspondente
  entra no Repply. Os outros compromissos pessoais do vendedor nunca são lidos nem trazidos.
- **Conflito (mudou dos dois lados):** vence a alteração **mais recente** (compara `updated_at` do
  Repply com o `updated`/`etag` do Google, guardados na etiqueta).
- **Nunca apagar em massa (disjuntor).** Se uma passada de volta fosse apagar mais que um limite
  pequeno de eventos de uma vez (sinal de erro — token expirado, calendário trocado, resposta
  parcial), a passada **para e registra** em vez de apagar. Mesma filosofia do "não apagar do lado
  errado" e do "zero linhas não é sucesso" (CLAUDE.md §4.6).
- **Gravação de volta confere a contagem.** Ao aplicar uma mudança externa num `eventos`, usa
  `{ count: 'exact' }` e trata `count === 0` como **recusa** (a RLS barrou — ex.: evento da empresa
  que o vendedor não organiza). Nesse caso **não** finge sucesso: mantém a versão oficial do Repply
  e, na próxima saída, re-empurra a versão oficial para o calendário dele (sem loop: a etiqueta
  guarda a versão para não ficar empurrando à toa).
- **Idempotência.** `evento_externo_id` + `etag_externo` evitam processar a mesma mudança duas vezes.

---

## 8. Segurança dos dados

- **A chave (refresh token) fica só no servidor**, lida apenas pelo `service_role`. **Nem o
  navegador, nem o vendedor dono, nem outro vendedor** conseguem ler. Guardada **criptografada**
  (cofre do Supabase / pgsodium), não em texto puro.
- **O segredo do aplicativo Google** (client secret do Repply) fica nos **segredos do servidor**
  (Supabase function secrets), **nunca** no repositório — que é público (CLAUDE.md §6.5). Não listar
  segredos sem filtro na conversa.
- **Toda** chamada ao Google roda em edge function; o navegador nunca vê token.
- **Isolamento multi-empresa e por vendedor** garantido pela RLS do §5 (`user_id`/`empresa_id`).

---

## 9. Por que não pegar carona na conexão do e-mail

Levantado no brainstorming: "quando conectar o e-mail, já conectar o calendário?". **Não dá, no
caminho B**, por três motivos: (1) o e-mail usa **Nylas** e o calendário é **login direto** —
autorizações e aplicativos diferentes; (2) **IMAP é só e-mail** (sem calendário), e o e-mail do
iCloud também (o calendário do iCloud é CalDAV, Fase 3); (3) as contas de e-mail hoje são **caixas
compartilhadas por empresa** (4 no total, medido em 23/09/2026), não a **agenda pessoal** de cada
vendedor que queremos sincronizar. Ficam separados de propósito.

---

## 10. Fuso horário e "dia inteiro"

- Reusar `src/lib/data-local.ts` (âncora de meio-dia, `hojeLocal`, `formatarDataBR`) e o padrão de
  `timestamptz` que a agenda já usa. Errar aqui joga evento para o dia errado (armadilha conhecida —
  CLAUDE.md §7.12).
- **Cuidado com "dia inteiro":** o Google trata o fim do evento de dia inteiro como **data
  exclusiva** (o dia seguinte), enquanto o Repply grava `T00:00:00`–`T23:59:59`. O adaptador
  converte nos dois sentidos.

---

## 11. Pré-requisito externo (muda o cronograma)

Para o Repply gerenciar o calendário Google de qualquer vendedor (fora dos poucos de teste), o
Google **exige verificar o aplicativo** (política de privacidade, comprovação de domínio, revisão de
segurança do escopo sensível de calendário). **Leva de dias a semanas e depende do Google.** O
código pode ficar pronto e testado antes; só a **liberação geral** depende dessa aprovação. A
Microsoft (Fase 2) tem um cadastro de aplicativo parecido, mais leve.

---

## 12. Fora de escopo (YAGNI)

- **Recorrência** (eventos que se repetem) — a agenda do Repply não tem hoje; não introduzir aqui.
- **Importar a agenda pessoal do vendedor** para dentro do Repply — decidido que NÃO.
- **Prazos de negócios e próximos contatos** — não sincronizam (são projeções read-only).
- **Microsoft 365** — Fase 2 (mesmo motor, outro adaptador).
- **iCloud "puro" (CalDAV)** — Fase 3.
- **Painel unificado de conexões** nas configurações — descartado.

---

## 13. Como verificar (evidência antes de afirmação)

- **Partes puras com teste** (sem banco/rede): o mapeamento evento↔Google (inclusive dia-inteiro e
  fuso), a resolução de conflito (mais recente vence), o disjuntor anti-exclusão-em-massa, e o
  tratamento de `count === 0` na volta.
- `npx tsc --noEmit -p tsconfig.app.json` (base 36, não subir), `npm run build`, `npm run test`
  (suíte inteira, não cair).
- **Testar como vendedor comum**, não só gestor (mexe em RLS): confirmar que um vendedor não lê a
  conexão/tokens de outro, e que a gravação de volta de evento da empresa que ele não organiza é
  barrada sem falso sucesso.
- A conexão real ponta a ponta com o Google só é testável com o aplicativo aprovado (§11) ou com
  contas de teste cadastradas no aplicativo.

---

## 14. Riscos e questões em aberto

- **Aprovação do Google (§11)** — dependência externa, prazo incerto. Começar cedo.
- **Renovação de token** — refresh tokens do Google podem expirar/serem revogados; tratar
  `status='erro'` e avisar o vendedor para reconectar, sem quebrar a agenda.
- **Volume** — a passada de volta percorre todas as conexões; usar `sync_token` (incremental) e
  reservar itens com trava (como o `eventos-lembrete` faz) para não pesar.
- **Escopo do Google** — usar o escopo mais estreito que permita gerenciar o calendário dedicado,
  para facilitar a verificação.
