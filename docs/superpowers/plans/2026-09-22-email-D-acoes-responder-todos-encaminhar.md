# E-mail D — Menu de ações (Gmail) + Responder a todos + Encaminhar com anexos — Plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No e-mail aberto, um menu de ações estilo Gmail — Responder / Responder a todos / Encaminhar em botões + "⋮ mais" (marcar não lida, mover, excluir) — com responder-a-todos e encaminhar novos, e encaminhar levando os anexos do original.

**Architecture:** `LeitorEmail` ganha os botões + o menu ⋮ (props opcionais). `Emails.tsx` ganha `responderATodos` e `encaminharMensagem` (moldados no `responderMensagem` que já existe), que abrem a caixa inline. Encaminhar carrega anexos: o cliente propaga os anexos do original (que hoje são descartados) e o servidor (`email-enviar`) baixa cada anexo do Nylas e reanexa no envio.

**Tech Stack:** React 18 + Vite + TS, shadcn (DropdownMenu), Supabase Edge Function (Deno) + Nylas v3, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-21-email-reforma-compositor-acoes-autocompletar-design.md` (seção D).

## Global Constraints

- PT-BR em tela/comentário/commit; doc técnico seco.
- Verificação: `npm run test` não cai; `npx tsc --noEmit -p tsconfig.app.json` no baseline (36); `npm run build` compila.
- 🔴 **Função de servidor é OUTRO caminho** (CLAUDE.md §16): `email-enviar` sobe à parte do `git push` (deploy da edge function). Mexe no ENVIO de e-mail de cliente pagante — cuidado redobrado; não quebrar o envio comum (sem anexo de encaminhar).
- Sem dado real em teste/comentário (§6.9).
- Publicar só os meus commits (worktree a partir de `origin/main`); `git fetch` antes; nunca `git add -A`.
- Trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

Achados do mapa (âncoras, podem deslocar):
- Barra de ações: `LeitorEmail.tsx:629-675` (grupo à direita, `ml-auto`); props `onResponder`/`onExcluir` (obrig.), `onMarcarNaoLido?`/`onMover?` (opc., render condicional). 2º "Responder" no rodapé `:946-951`.
- `responderMensagem`: `Emails.tsx:1371-1417` (Para=remetente, "Re:", Cc/Cco zerados, citação do snippet, `respondendoA=nylas_message_id`, `setModoCompositor("inline")`).
- `selectedEmail` (`EmailAberto`, `LeitorEmail.tsx:22-66`): `remetente`, `destinatarios?[]`, `cc?[]` (formato `{name?,email?}`), `assunto`, `html`/`corpo`/`snippet`, `gmail_message_id` (=nylas_message_id), `anexos?[{filename,size}]` (HOJE nunca preenchido).
- `connectedEmail` = e-mail da caixa da empresa (`Emails.tsx:1895`), o endereço a tirar do Cc no reply-all.
- `email-enviar` (`supabase/functions/email-enviar/index.ts`): lê anexos do rascunho (`email_rascunho_anexos`, bucket `email-anexos`), monta multipart (`:281-309`); payload `{to,subject,body,cc,bcc, reply_to_message_id?}` (`:211-272`); envio `POST /v3/grants/{grant}/messages/send` (`:311-321`).
- Nylas baixar anexo: `GET /v3/grants/{grant}/attachments/{attachmentId}/download?message_id={nylasMessageId}` via `baixarAnexoNylas` (`_shared/nylas.ts:342-358`, devolve bytes). Anexos do original em `email_mensagens.anexos` (jsonb `{id,filename,content_type,size}`), gravado ao ABRIR (`email-mensagem/index.ts:234-253`).

---

### Task 1: Menu de ações no leitor (botões + ⋮)

**Files:**
- Modify: `src/components/email/LeitorEmail.tsx` (props novas + botões + DropdownMenu ⋮).
- Modify: `src/pages/Emails.tsx` (passar as props novas — handlers vêm na Task 2).
- Test: `src/components/email/leitor-acoes.test.tsx` (novo).

**Interfaces:**
- Produces: `LeitorEmail` ganha props `onResponderATodos?: () => void`, `onEncaminhar?: () => void`. "Responder a todos" só aparece quando `onResponderATodos` vier E houver mais de um destinatário (`(destinatarios?.length ?? 0) + (cc?.length ?? 0) > 1`). Marcar não lida / Mover / Excluir migram para um `DropdownMenu` "⋮" (import `@/components/ui/dropdown-menu`, padrão de `WhatsAppInbox.tsx:114`).

- [ ] **Step 1: Teste que falha** — `leitor-acoes.test.tsx`: renderiza `LeitorEmail` (com props mínimas + `onResponderATodos`, `onEncaminhar`, `destinatarios` com 2 endereços) e confirma botões "Responder", "Responder a todos", "Encaminhar"; e que o "⋮ mais" existe (botão com aria-label /mais/). Com `destinatarios` de 1 só, "Responder a todos" não aparece.

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar** — em `LeitorEmail.tsx`, na barra `:635`:
  - Manter "Responder" (botão). Add "Responder a todos" (ícone `ReplyAll` do lucide) — condicional. Add "Encaminhar" (ícone `Forward`).
  - Trocar os ícones soltos de Marcar não lido / Mover / Excluir por um `DropdownMenu`:
```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="ghost" size="icon" aria-label="Mais ações"><MoreVertical className="h-4 w-4" /></Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    {onMarcarNaoLido && <DropdownMenuItem onClick={onMarcarNaoLido}><MailOpen .../>Marcar como não lida</DropdownMenuItem>}
    {onMover && <DropdownMenuItem onClick={onMover}><Tag .../>Mover para marcador</DropdownMenuItem>}
    <DropdownMenuItem onClick={onExcluir} className="text-destructive focus:text-destructive"><Trash2 .../>Excluir</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```
  - O 2º "Responder" do rodapé (`:946-951`) pode virar um trio Responder/Responder a todos/Encaminhar OU ficar só "Responder" (manter simples: deixa só Responder no rodapé).
  - Em `Emails.tsx:1893-1924` (render do `<LeitorEmail>`), passar `onResponderATodos={responderATodos}` e `onEncaminhar={encaminharMensagem}` (definidos na Task 2).

- [ ] **Step 4: Rodar e ver passar; `tsc` baseline; `build`.**

- [ ] **Step 5: Commit** `feat(email): menu de acoes no e-mail aberto (responder a todos e encaminhar + menu de tres pontos)`.

---

### Task 2: Handlers `responderATodos` e `encaminharMensagem`

**Files:**
- Modify: `src/pages/Emails.tsx` (dois handlers novos + helper de endereços).
- Test: `src/pages/email-responder-encaminhar.test.ts` (novo, funções puras extraídas) — ver Step 1.

**Interfaces:**
- Consumes: `selectedEmail` (remetente, destinatarios, cc, assunto, html/snippet), `connectedEmail`, `abrirCompositorProtegido`, `montarCorpoInicial`, `escaparHtml`, `soEndereco`, `assinaturaParaCorpo`.
- Produces: `responderATodos()` e `encaminharMensagem()` (abrem inline via `abrirCompositorProtegido`). Helper puro `montarCcResponderATodos(remetente, destinatarios, cc, euEmail): string`.

- [ ] **Step 1: Teste que falha** — extrair a lógica de endereços num util PURO testável, `src/lib/responder-todos.ts` → `montarCcResponderATodos(remetenteEmail: string, destinatarios: {name?:string;email?:string}[], cc: {name?:string;email?:string}[], euEmail: string): string`. Teste `src/lib/responder-todos.test.ts`:
```ts
// junta destinatarios+cc, tira o remetente e o "eu", dedupe por email minúsculo,
// preserva "Nome <email>" quando há nome, devolve string separada por ", ".
expect(montarCcResponderATodos("ana@x.com",
  [{name:"Ana",email:"ana@x.com"},{name:"Bia",email:"bia@x.com"}],
  [{email:"caio@x.com"}], "eu@x.com")).toBe("Bia <bia@x.com>, caio@x.com");
expect(montarCcResponderATodos("ana@x.com", [{email:"ana@x.com"}], [], "eu@x.com")).toBe("");
```

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar** `src/lib/responder-todos.ts`:
```ts
export function montarCcResponderATodos(remetenteEmail, destinatarios = [], cc = [], euEmail = "") {
  const excluir = new Set([remetenteEmail, euEmail].map((e) => (e || "").toLowerCase()).filter(Boolean));
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const e of [...destinatarios, ...cc]) {
    const email = (e?.email || "").trim();
    if (!email) continue;
    const chave = email.toLowerCase();
    if (excluir.has(chave) || vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push(e.name ? `${e.name} <${email}>` : email);
  }
  return saida.join(", ");
}
```
  E em `Emails.tsx`, ao lado de `responderMensagem`:
  - `responderATodos()`: igual ao `responderMensagem`, mas `cc: montarCcResponderATodos(soEndereco(selectedEmail.remetente), selectedEmail.destinatarios, selectedEmail.cc, connectedEmail ?? "")`. Envolver em `abrirCompositorProtegido(...)` e `setModoCompositor("inline")`.
  - `encaminharMensagem()`: `Para` vazio; assunto `Enc: …` (se não começar com "enc:"/"fwd:"); corpo = `montarCorpoInicial(assinaturaParaCorpo, citacaoEncaminhar)` onde `citacaoEncaminhar` é um cabeçalho ESCAPADO (De/Data/Assunto/Para) + o HTML original embutido (NÃO escapar o `selectedEmail.html`, que já é sanitizado; usar `html || corpo || snippet`). `respondendoA` NÃO é setado (encaminhar não é resposta). `setModoCompositor("inline")`. Guardar o original para o envio levar os anexos (Task 3/4): `setEncaminhandoDe({ nylasMessageId: selectedEmail.gmail_message_id, anexos: selectedEmail.anexos ?? [] })`.

- [ ] **Step 4: Rodar e ver passar; `tsc`; `build`.**

- [ ] **Step 5: Commit** `feat(email): responder a todos e encaminhar (pre-preenchimento)`.

---

### Task 3: Propagar os anexos do original para o leitor

**Files:**
- Modify: `src/hooks/use-email-empresa.ts` (`carregarCorpo` devolve `anexos`).
- Modify: `src/pages/Emails.tsx` (`abrirComCorpo` guarda `anexos` no `selectedEmail`).
- Modify: `src/components/email/LeitorEmail.tsx` (tipo `EmailAberto.anexos` ganha `id`/`content_type`).

**Interfaces:**
- Produces: `selectedEmail.anexos: {id, filename, content_type, size}[]` preenchido ao abrir (hoje vem vazio).

- [ ] **Step 1:** `carregarCorpo` (`use-email-empresa.ts:~239`) hoje devolve só `data?.corpo_html`. Passar a devolver `{ html: data?.corpo_html, anexos: data?.anexos ?? [] }` (a function `email-mensagem` já grava/retorna `anexos`). Ajustar o tipo de retorno e o chamador.
- [ ] **Step 2:** `abrirComCorpo` (`Emails.tsx:~1600-1611`): ao receber o corpo, também `setSelectedEmail((a) => a && { ...a, html, anexos })`.
- [ ] **Step 3:** `EmailAberto.anexos` em `LeitorEmail.tsx:62` → `{ id?: string; filename?: string; content_type?: string; size?: number }[]`.
- [ ] **Step 4:** `tsc`; `build`; a seção de anexos do leitor (`:832-855`) passa a poder listar os anexos (só exibir; download pode continuar indisponível por agora — fora do escopo do D).
- [ ] **Step 5: Commit** `feat(email): leitor recebe os anexos do original (para encaminhar levar junto)`.

---

### Task 4: `email-enviar` leva os anexos do original no encaminhar (servidor)

**Files:**
- Modify: `supabase/functions/email-enviar/index.ts` (novo param `encaminhar_de`; baixa do Nylas e reanexa).
- Modify: `src/hooks/use-email-empresa.ts` (`enviarEmail`/`sendEmail` repassam `encaminhar_de`).
- Modify: `src/pages/Emails.tsx` (`sendEmailMutation` inclui `encaminhar_de` quando encaminhando).

**Interfaces:**
- Produces: envio aceita `encaminhar_de?: { nylas_message_id: string; anexos: {id:string; filename?:string; content_type?:string}[] }`. Para cada anexo, o servidor baixa do Nylas (`baixarAnexoNylas(grant, id, nylas_message_id)`) e inclui no multipart junto com os do rascunho.

- [ ] **Step 1: Confirmar o Nylas na prática (ensaio de leitura).** Antes de codar, confirmar que `GET /v3/grants/{grant}/attachments/{id}/download?message_id={msg}` devolve os bytes de um anexo NÃO-inline (o `baixarAnexoNylas` já faz isso para inline). Se o Nylas aceitar reanexar por `attachment_id` direto no `send` (sem baixar), preferir isso; senão, baixar+reenviar como binário (caminho já usado para anexo de rascunho). **Decidir aqui, com evidência.**
- [ ] **Step 2: Servidor.** Em `email-enviar/index.ts`, depois de montar os anexos do rascunho, se `body.encaminhar_de` vier: para cada `anexo`, `const bytes = await baixarAnexoNylas(grant, anexo.id, body.encaminhar_de.nylas_message_id)` e empurrar no array de anexos do multipart com `{ filename, content_type, bytes }`. Preservar o caminho SEM anexo (JSON puro) quando não houver NENHUM anexo (rascunho nem encaminhado). Erro ao baixar um anexo NÃO deve derrubar o envio inteiro — logar e seguir (o e-mail vai sem aquele anexo, com aviso), OU falhar com mensagem clara — **decidir no Step 1/2 e comentar**.
- [ ] **Step 3: Cliente.** `enviarEmail` (`use-email-empresa.ts`) e o `sendEmail` ganham o param opcional `encaminhar_de` e o repassam no `body`. `sendEmailMutation` (`Emails.tsx`) inclui `encaminhar_de` quando `encaminhandoDe` estiver setado (limpar depois do envio/descartar).
- [ ] **Step 4: Tipos** — atualizar à mão o que precisar; `tsc` baseline; `build`.
- [ ] **Step 5: Publicar a FUNÇÃO** (deploy da edge function `email-enviar`, à parte do git push — §16) e commitar o código. Dizer qual versão do Supabase corresponde ao commit.

---

### Task 5: Verificação final e publicação
- [ ] `tsc` 36; `npm run test` não cai; `build` ok.
- [ ] `git fetch`; rebase se a origin andou; reverificar a mistura.
- [ ] `git push origin HEAD:main`; e (Task 4) deploy da edge function.
- [ ] Avisar o Lucas: conferência dele — responder a todos (Cc certos), encaminhar (assunto "Enc:", corpo citado, e **os anexos chegam**), menu ⋮.

## Self-Review (cobertura da seção D)
- Menu Gmail (3 botões + ⋮) → Task 1.
- Responder a todos (regra do Cc) → Task 2.
- Encaminhar (pré-preenchimento) → Task 2; anexos do original → Task 3 (propagar) + Task 4 (servidor reanexa).
