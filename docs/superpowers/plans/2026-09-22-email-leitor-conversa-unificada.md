# E-mail — Leitor com visualização por conversa (unificada) — Plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o leitor de e-mail do formato híbrido ("mensagem principal por extenso + cards de Nesta conversa") por UMA visualização por conversa unificada, estilo Gmail: lista única mais-recente-primeiro, mensagens recolhíveis (a aberta e as não lidas abertas), ações no topo (alvo = a mais recente) + menu ⋮ por mensagem.

**Architecture:** Um componente novo `MensagemConversa` (recolhível) por mensagem; `LeitorEmail` renderiza a lista inteira com ele e guarda o estado de expandidos; `CorpoEmail` é extraído para arquivo próprio e reusado; a consulta da conversa em `Emails.tsx` traz todas as mensagens da thread com os campos que responder-a-todos/encaminhar precisam; os handlers de ação passam a receber a mensagem-alvo; o corpo é buscado sob demanda ao expandir.

**Tech Stack:** React 18 + Vite + TS, shadcn (DropdownMenu), TanStack Query, Supabase, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-22-email-leitor-conversa-unificada-design.md`

## Global Constraints

- PT-BR em tela/comentário/commit; doc técnico seco.
- Verificação (CLAUDE.md §9): `npx tsc --noEmit -p tsconfig.app.json` no baseline (36, o número não sobe); `npm run test` não cai; `npm run build` compila.
- Sem dado real de cliente/equipe em teste/comentário (§6.9): usar "Ana Souza", "ana@x.com", etc.
- Nada de servidor: é tudo tela. `email-enviar` (v15) já cobre o envio.
- 🔴 Não regredir: a trava de troca-de-modo (`src/lib/troca-compositor.ts`, `inlineParaId`), o encaminhar-com-anexos (D) e o Cc que revela (`CompositorEmail`). Os handlers só ganham o parâmetro de alvo.
- Publicar só os meus commits; `git fetch` antes; nunca `git add -A`. Trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

Âncoras (podem deslocar):
- `LeitorEmail.tsx`: `CorpoEmail` (função interna ~468-586), helpers de pós-processamento (`achatarTexto`, `resolverPosicao`, `colapsarListasDeDestinatarios`, `tornarEnderecosClicaveis`, `REGEX_EMAIL`, `ROTULO_CABECALHO`, `ROTULOS_TRUNCAVEIS`, tipos `RunDeTexto`/`PontoDeTexto`), `separarRemetente`, `itensDeEndereco`, `ListaDeEnderecos`, `tamanhoLegivel`. Tipos `EmailAberto`/`MensagemDaConversa`. Barra de ações (~629-735 depois do D). `compositorInline` renderizado após o h1 (`mb-6`). "Nesta conversa" (~945+).
- `Emails.tsx`: consulta da conversa (~1715-1755, `.eq("nylas_thread_id", …).order("data_mensagem", {ascending:false})`, monta `MensagemDaConversa[]` com `carregarCorpo`); `abrirMensagemDaConversa` (~1770); handlers `iniciarRespostaInline`/`responderMensagem`/`responderATodos`/`encaminharMensagem`; render do `<LeitorEmail>` (~1900+); `marcarNaoLido`, `MoverParaMarcadorDialog`, `deleteEmailMutation`, `setEmailToDelete`.

---

### Task 1: Extrair `CorpoEmail` para arquivo próprio

**Files:**
- Create: `src/components/email/CorpoEmail.tsx`
- Modify: `src/components/email/LeitorEmail.tsx` (remove o `CorpoEmail` interno e os helpers só dele; importa do arquivo novo)

**Interfaces:**
- Produces: `export function CorpoEmail({ html, textoSimples, onClicarEndereco }): JSX` — assinatura idêntica à de hoje. Move junto TODO o aparato que só ele usa: `achatarTexto`, `resolverPosicao`, `colapsarListasDeDestinatarios`, `tornarEnderecosClicaveis`, `ehElementoDeBloco`, `REGEX_EMAIL`, `ROTULO_CABECALHO`, `ROTULOS_TRUNCAVEIS`, `RunDeTexto`, `PontoDeTexto`. Importa `DOMPurify`, `useEffect`, `useMemo`, `useRef`.

- [ ] **Step 1:** Criar `CorpoEmail.tsx` com o conteúdo movido, verbatim (é recorte mecânico — nenhuma mudança de comportamento). Exportar `CorpoEmail`.
- [ ] **Step 2:** Em `LeitorEmail.tsx`, apagar o `CorpoEmail` interno e os helpers movidos; `import { CorpoEmail } from './CorpoEmail';`. Conferir que nada mais em `LeitorEmail` usa os helpers movidos (se usar, mantê-los ou exportá-los também).
- [ ] **Step 3:** `npx tsc --noEmit -p tsconfig.app.json` (baseline 36) e `npm run test` (a bateria de `LeitorEmail`/leitor-acoes não pode cair) — prova que o recorte não mudou nada.
- [ ] **Step 4: Commit** `refactor(email): extrai CorpoEmail para arquivo proprio (reuso na conversa)`.

---

### Task 2: Regra pura "quais mensagens abrem por padrão"

**Files:**
- Create: `src/lib/mensagens-abertas-por-padrao.ts`
- Test: `src/lib/mensagens-abertas-por-padrao.test.ts`

**Interfaces:**
- Produces: `export function idsAbertasPorPadrao(mensagens: {id:string; tipo:'sent'|'received'; lido?:boolean}[], idAberto: string | null | undefined): Set<string>` — devolve os ids que começam expandidos: o `idAberto` (a mensagem que trouxe até a conversa) e toda **recebida não lida**.

- [ ] **Step 1: Teste que falha** (`mensagens-abertas-por-padrao.test.ts`):
```ts
import { idsAbertasPorPadrao } from "./mensagens-abertas-por-padrao";
const M = (id, tipo, lido) => ({ id, tipo, lido });
it("abre a mensagem que foi aberta e as recebidas nao lidas", () => {
  const r = idsAbertasPorPadrao(
    [M("a","received",true), M("b","received",false), M("c","sent",undefined), M("d","received",false)],
    "a",
  );
  expect([...r].sort()).toEqual(["a","b","d"]);
});
it("sem idAberto, ainda abre as nao lidas", () => {
  expect([...idsAbertasPorPadrao([M("a","received",false), M("b","received",true)], null)]).toEqual(["a"]);
});
it("mensagem enviada nunca conta como 'nao lida'", () => {
  expect([...idsAbertasPorPadrao([M("c","sent",undefined)], null)]).toEqual([]);
});
it("idAberto que nao esta na lista e ignorado sem quebrar", () => {
  expect([...idsAbertasPorPadrao([M("a","received",true)], "zzz")]).toEqual([]);
});
```
- [ ] **Step 2:** Rodar, ver falhar.
- [ ] **Step 3: Implementar:**
```ts
export function idsAbertasPorPadrao(mensagens, idAberto) {
  const abertas = new Set<string>();
  const existe = new Set(mensagens.map((m) => m.id));
  if (idAberto && existe.has(idAberto)) abertas.add(idAberto);
  for (const m of mensagens) {
    if (m.tipo === "received" && m.lido === false) abertas.add(m.id);
  }
  return abertas;
}
```
- [ ] **Step 4:** Rodar, ver passar. `tsc`.
- [ ] **Step 5: Commit** `feat(email): regra de quais mensagens da conversa abrem por padrao`.

---

### Task 3: Componente `MensagemConversa` (recolhível)

**Files:**
- Create: `src/components/email/MensagemConversa.tsx`
- Test: `src/components/email/mensagem-conversa.test.tsx`

**Interfaces:**
- Consumes: `CorpoEmail` (Task 1); `DropdownMenu*` (shadcn); `separarRemetente`/`itensDeEndereco`/`ListaDeEnderecos`/`tamanhoLegivel` (hoje em `LeitorEmail`; exportá-los de `LeitorEmail` ou mover para um `email-cabecalho.tsx` compartilhado — escolher no Step 3 e manter DRY).
- Produces: tipo `MensagemDaConversa` (crescido — ver Task 4) e:
```tsx
export function MensagemConversa(props: {
  mensagem: MensagemDaConversa;
  emailDaConta: string | null;
  aberta: boolean;
  carregandoCorpo?: boolean;
  onAlternar: () => void;                 // clique recolhe/expande
  onClicarEndereco?: (e: string) => void;
  onResponder: () => void;
  onResponderATodos?: () => void;         // ausente => item não aparece
  onEncaminhar: () => void;
  onMarcarNaoLido?: () => void;           // só recebida
  onMover?: () => void;
  onExcluir: () => void;
}): JSX.Element
```
"Responder a todos" no ⋮ só aparece quando `onResponderATodos` vier E a mensagem tem >1 destinatário (`(destinatarios?.length ?? 0) + (cc?.length ?? 0) > 1`).

- [ ] **Step 1: Teste que falha** (`mensagem-conversa.test.tsx`): monta uma mensagem RECOLHIDA (`aberta={false}`) e confirma que aparece o remetente e o trecho, e que o corpo (`data-testid` do `CorpoEmail` OU um texto exclusivo do corpo) **não** está no DOM; monta ABERTA e confirma o corpo + o botão "Mais ações" (⋮). Com `destinatarios` de 2 e `onResponderATodos`, abrir o ⋮ mostra "Responder a todos"; com 1, não.
- [ ] **Step 2:** Rodar, ver falhar.
- [ ] **Step 3: Implementar** o componente:
  - **recolhida** (`!aberta`): um `<button>` linha inteira, `onClick={onAlternar}`: avatar/inicial (ou ícone `CornerUpLeft` quando `tipo==='sent'`), nome (ou "Você"), `snippet` truncado, data curta (`format(..., "dd 'de' MMM, HH:mm")`), ponto de não lida quando `tipo==='received' && lido===false`, `Paperclip` quando `mensagem.tem_anexo`. **Não** renderiza `CorpoEmail`.
  - **aberta**: cabeçalho (remetente clicável + "para" com `ListaDeEnderecos` dos `destinatarios`, Cc quando houver, data) num cabeçalho clicável (`onAlternar` para recolher) — mas SEM aninhar elementos interativos dentro do `<button>`; usar o padrão atual de "Nesta conversa" (cabeçalho é botão, corpo fora dele). Corpo = `CorpoEmail`. Anexos (exibição). Um `DropdownMenu` "⋮ Mais ações" com os itens conforme as props (Responder / Responder a todos / Encaminhar / Marcar não lida / Mover / Excluir — Excluir com `text-destructive`).
  - Reusar `separarRemetente`/`itensDeEndereco`/`ListaDeEnderecos`/`tamanhoLegivel` (importados do local escolhido no cabeçalho da Task).
- [ ] **Step 4:** Rodar, ver passar. `tsc`. `build`.
- [ ] **Step 5: Commit** `feat(email): componente MensagemConversa (recolhivel, com menu por mensagem)`.

---

### Task 4: Consulta da conversa enriquecida + tipo `MensagemDaConversa`

**Files:**
- Modify: `src/pages/Emails.tsx` (consulta da conversa; monta a lista com a mensagem aberta INCLUÍDA; corpo sob demanda)
- Modify: `src/components/email/MensagemConversa.tsx` (definição/expansão do tipo `MensagemDaConversa`)

**Interfaces:**
- Produces: `MensagemDaConversa = { id; tipo:'sent'|'received'; remetente:string; destinatarios:EnderecoDoEmail[]; cc:EnderecoDoEmail[]; bcc:EnderecoDoEmail[]; assunto:string|null; data:string|null; snippet:string; gmail_message_id:string|null; lido?:boolean; caixaOrigem?:string|null; tem_anexo?:boolean; html?:string|null; anexos?:{id?;filename?;content_type?;size?}[] }`. `html`/`anexos` só preenchidos quando a mensagem foi carregada (aberta).
- Consumes: `carregarCorpo(id)` de `use-email-empresa.ts` (já devolve `{html, anexos}`).

- [ ] **Step 1:** Crescer a consulta da conversa: `.select("id, direcao, data_mensagem, remetente_nome, remetente_email, destinatarios, cc, bcc, assunto, snippet, lido, nylas_message_id, nylas_thread_id, caixa_origem, tem_anexo")`, `.eq("nylas_thread_id", threadId)`, `.eq("excluido", false)`, `.order("data_mensagem", {ascending:false})`. **Incluir a mensagem aberta** (não filtrar `m.id !== selectedEmail.id`) — a lista é a conversa inteira.
- [ ] **Step 2:** Mapear cada linha para `MensagemDaConversa` (sem `html`/`anexos` — corpo sob demanda): `remetente` = `nome <email>` (ou só email); `destinatarios/cc/bcc` via `normalizarEnderecos`; `tipo` = `direcao==='enviado' ? 'sent' : 'received'`.
- [ ] **Step 3:** Quando a thread tiver só a mensagem aberta e ainda não houver linha na tabela (thread nova), garantir que a própria `selectedEmail` entra na lista (fallback a partir de `selectedEmail`).
- [ ] **Step 4:** `tsc` baseline; `build`.
- [ ] **Step 5: Commit** `feat(email): consulta da conversa traz todas as mensagens da thread com os campos de acao`.

---

### Task 5: `LeitorEmail` renderiza a lista unificada

**Files:**
- Modify: `src/components/email/LeitorEmail.tsx` (novo render: barra topo + h1 + compositorInline + LISTA de `MensagemConversa`; estado `expandidos`; corpo sob demanda ao expandir)
- Modify: `src/pages/Emails.tsx` (props novas passadas ao `<LeitorEmail>`)

**Interfaces:**
- Consumes: `MensagemConversa` (Task 3), `idsAbertasPorPadrao` (Task 2), `CorpoEmail` (Task 1).
- Produces: `LeitorEmail` passa a receber `mensagens: MensagemDaConversa[]` (a conversa inteira, mais recente primeiro), `idAbertoInicial: string`, `onCarregarCorpo: (id:string) => void` (a página busca o corpo e devolve pela lista atualizada), e as ações por mensagem (`onResponder(m)`, `onResponderATodos(m)`, `onEncaminhar(m)`, `onMarcarNaoLido(m)`, `onMover(m)`, `onExcluir(m)`) além das do topo (que a página amarra à mais recente). Sai o par `email`/`mensagensDaConversa`/`onAbrirMensagemDaConversa` do formato antigo.

- [ ] **Step 1:** Estado `const [expandidos, setExpandidos] = useState<Set<string>>(() => idsAbertasPorPadrao(mensagens, idAbertoInicial))`, re-semeado quando a conversa (thread) muda — usar a `nylas_thread_id`/`idAbertoInicial` como dependência de um efeito que reinicia o Set.
- [ ] **Step 2:** `alternar(id)`: adiciona/remove do Set; ao ADICIONAR (expandir) uma mensagem sem `html`, chamar `onCarregarCorpo(id)` (a página busca e re-renderiza a lista com o corpo).
- [ ] **Step 3:** Render: barra de ações no topo (Voltar + Responder/Responder a todos/Encaminhar da MAIS RECENTE — `mensagens[0]`; "Responder a todos" condicional aos destinatários da mais recente); h1 com `mensagens[0]?.assunto`; `compositorInline` (mantido, `mb-6`); depois a lista `mensagens.map((m) => <MensagemConversa key={m.id} mensagem={m} aberta={expandidos.has(m.id)} carregandoCorpo={...} onAlternar={() => alternar(m.id)} ...ações por mensagem />)`. Remover a seção "Nesta conversa" e o "Responder" do rodapé.
- [ ] **Step 4:** Em `Emails.tsx`, montar as props: `mensagens` da consulta (Task 4), `idAbertoInicial = selectedEmail.id`, `onCarregarCorpo` = busca via `carregarCorpo` e injeta `html`/`anexos` na linha correspondente do estado da conversa. As ações por mensagem chamam os handlers da Task 6 com aquela mensagem; as do topo, com `mensagens[0]`.
- [ ] **Step 5:** Ajustar/!mover os testes de `leitor-acoes.test.tsx` para o novo formato (a barra do topo continua tendo Responder/Responder a todos/Encaminhar/⋮? — agora sem ⋮ no topo; o teste passa a checar os 3 botões e que "Responder a todos" reflete a mais recente). `tsc`; `vitest`; `build`.
- [ ] **Step 6: Commit** `feat(email): leitor unifica a conversa numa lista de mensagens recolhiveis`.

---

### Task 6: Handlers de ação com mensagem-alvo

**Files:**
- Modify: `src/pages/Emails.tsx`

**Interfaces:**
- Produces: `responderMensagem(m)`, `responderATodos(m)`, `encaminharMensagem(m)` recebem a **mensagem-alvo** (uma `MensagemDaConversa`), em vez de ler `selectedEmail`. `iniciarRespostaInline(m, ccTexto, titulo)`. O `inlineParaId` passa a ser `m.id`. Marcar não lida/Mover/Excluir por mensagem: `marcarNaoLido(m.id)`, `setMensagensParaMover([m.id])`, `setEmailToDelete({id:m.id, type:m.tipo})`.

- [ ] **Step 1:** Refatorar `iniciarRespostaInline`/`responderMensagem`/`responderATodos`/`encaminharMensagem` para receber a mensagem-alvo `m` e ler dela: `soEndereco(m.remetente)`, `m.destinatarios`, `m.cc`, `m.assunto`, `m.gmail_message_id`, `m.anexos`, `m.html`/`m.snippet`. Manter TODA a lógica de D e da trava (só troca a fonte dos dados de `selectedEmail` para `m`). `setInlineParaId(m.id)`; a comparação `ehTrocaDeModoNaMesmaMensagem(modoCompositor, inlineParaId, m.id)`.
- [ ] **Step 2:** As ações do TOPO (no `LeitorEmail`) chamam com `mensagens[0]` (a mais recente); as do ⋮ de uma mensagem chamam com aquela `m`.
- [ ] **Step 3:** Encaminhar de uma mensagem: `encaminhandoDe = m.anexos?.length ? m.gmail_message_id : null` — como no D, mas por mensagem. Se a mensagem-alvo ainda não teve o corpo carregado (recolhida) e a pessoa encaminha pelo ⋮, garantir que `m.anexos` esteja disponível: expandir/carregar o corpo antes, ou o handler dispara `onCarregarCorpo(m.id)` e usa o resultado (decidir no Step; o ⋮ só existe em mensagem ABERTA, então o corpo já foi carregado — `m.anexos` estará preenchido).
- [ ] **Step 4:** Excluir uma mensagem: reusa `deleteEmailMutation`; no `onSuccess`, se a mensagem excluída era a única visível/da conversa, `setSelectedEmail(null)` (volta à caixa); senão, ela sai da lista da conversa (invalida a consulta da conversa).
- [ ] **Step 5:** `tsc` baseline; `vitest` (troca-compositor e responder-todos seguem válidos); `build`.
- [ ] **Step 6: Commit** `feat(email): acoes da conversa agem na mensagem-alvo (topo = a mais recente, menu = a propria)`.

---

### Task 7: Verificação final e publicação
- [ ] `tsc` 36; `npm run test` não cai; `npm run build` compila; `npm run lint` não sobe.
- [ ] Passar o crivo (AGENTS §3): gestor/vendedor, thread de 1 mensagem, thread longa, mensagem de caixa desconectada (corpo indisponível → mostra prévia), não lida abrindo sozinha, celular.
- [ ] `git fetch`; rebase se a origin andou; reverificar a mistura; `git push origin HEAD:main`.
- [ ] Avisar o Lucas: conferência visual dele (recolher/expandir, ⋮ por mensagem, responder no topo = mais recente, encaminhar uma específica).

## Self-Review (cobertura do spec)
- Lista única mais-recente-primeiro → Task 4 + 5.
- Recolhida × aberta + quais abrem → Task 2 + 3 + 5.
- Corpo sob demanda → Task 4 + 5 (onCarregarCorpo).
- Ações topo (mais recente) + ⋮ por mensagem → Task 3 + 5 + 6.
- Resposta no topo (mantida) → Task 5 (compositorInline com mb-6).
- Não regredir D / trava de troca-de-modo → Task 6 (só troca a fonte para a mensagem-alvo).
- `CorpoEmail` reusável → Task 1.
