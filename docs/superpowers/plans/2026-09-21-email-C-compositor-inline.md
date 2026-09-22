# E-mail C — Compositor não-modal (encaixado + inline) — Plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tirar o compositor de e-mail do pop-up modal: e-mail novo vira um cartão encaixado (flutuante, não trava o fundo, minimizar/fechar) e responder vira uma caixa inline no topo da conversa aberta.

**Architecture:** O `CompositorEmail` deixa de ser `<Dialog>` e ganha uma prop `variante` ("encaixado" | "inline"): "encaixado" = card de posição fixa no canto (com minimizar/fechar; celular = tela cheia); "inline" = bloco em fluxo. O card encaixado é renderizado UMA vez no nível da página (`Emails.tsx`), fora da troca lista↔leitor, para não perder o rascunho ao navegar. A caixa inline é montada no `LeitorEmail`, no topo da conversa. Um rascunho de cada vez: abrir outro com rascunho sujo pergunta salvar/descartar.

**Tech Stack:** React 18 + Vite + TS, shadcn/Radix, Tailwind, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-21-email-reforma-compositor-acoes-autocompletar-design.md` (seção C).

## Global Constraints

- PT-BR em tela/comentário/commit; doc técnico seco.
- Verificação: `npm run test` não cai; `npx tsc --noEmit -p tsconfig.app.json` no baseline (36); `npm run build` compila. tsc e vitest em sequência.
- Publicar só os meus commits, por worktree a partir de `origin/main`; `git fetch` antes; nunca `git add -A`; `git status --short` separado.
- **Só o C** nesta leva. Responder a todos / encaminhar / menu ⋯ / fichinhas são D e E — NÃO fazer aqui. O botão "Responder" que já existe continua, só muda ONDE o compositor aparece (inline, não modal).
- 🔴 `<DialogContent>` cru é proibido (CLAUDE.md §7.11); o card encaixado não é Dialog, é um `<div>` fixo próprio — cuidar do teto de altura/rolagem à mão (cabeçalho e ações fixos, miolo rola), altura em `dvh`.
- Trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: `CompositorEmail` — moldura encaixada/inline (sai o Dialog)

**Files:**
- Modify: `src/components/email/CompositorEmail.tsx` (troca `<Dialog>/<ConteudoDialogo>` por moldura própria; add `variante`/`minimizado`).
- Test: `src/components/email/compositor-moldura.test.tsx` (novo).

**Interfaces:**
- Produces: `CompositorEmail` com novas props:
  - `variante?: "encaixado" | "inline"` (default "encaixado").
  - `minimizado?: boolean` e `onMinimizarChange?: (v: boolean) => void` (só valem no "encaixado").
  - Continua recebendo tudo o que já recebe (`valores`, `onChange`, `onEnviar`, `onDescartar`, `isConnected`, `isEnviando`, `titulo`, `anexos`, `onAnexar`, `onRemoverAnexo`, `anexando`, `onConfigurarAssinatura`, `onEnviarImagemCorpo`). SAI a prop `open`/`onOpenChange` (o pai monta/desmonta para abrir/fechar; `onDescartar`/fechar continuam).

- [ ] **Step 1: Teste que falha** — `compositor-moldura.test.tsx`: renderiza `CompositorEmail` com `variante="encaixado"` e confirma que NÃO é um dialog modal (sem `role="dialog"` do Radix) e que existe botão "Minimizar" e "Fechar"; e com `variante="inline"` que NÃO há botão Minimizar. (Montar com props mínimas; `onEnviar`/`onChange` mocks.)
```tsx
// esboço: render(<CompositorEmail variante="encaixado" ...props/>)
// expect(screen.queryByRole("dialog")).toBeNull();
// expect(screen.getByRole("button", { name: /minimizar/i })).toBeInTheDocument();
// expect(screen.getByRole("button", { name: /fechar/i })).toBeInTheDocument();
// rerender inline → queryByRole("button", { name: /minimizar/i }) === null
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/components/email/compositor-moldura.test.tsx`.

- [ ] **Step 3: Implementar** — em `CompositorEmail.tsx`:
  1. Remover `import { Dialog }` / `ConteudoDialogo`/`CabecalhoDialogo`/`CorpoDialogo` do wrapper e o `<Dialog open=...>`. Manter o FORM inteiro (Para/Cc/Cco, assunto, editor, anexos, rodapé de ações).
  2. Nova estrutura de retorno:
```tsx
const corpoForm = (/* o <form> atual, com o miolo rolável e o rodapé de ações fixo */);
if (variante === "inline") {
  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b bg-muted px-4 py-2">
        <span className="text-sm font-medium">{titulo}</span>
        <Button type="button" variant="ghost" size="icon" onClick={onDescartar} aria-label="Fechar"><X className="h-4 w-4" /></Button>
      </div>
      {corpoForm}
    </div>
  );
}
// encaixado (não-modal, canto inferior; celular = tela cheia):
return (
  <div className={cn(
    "fixed z-50 flex flex-col border bg-card shadow-2xl",
    "bottom-0 right-4 w-[540px] max-w-[calc(100vw-2rem)] max-h-[85dvh] rounded-t-lg",
    "max-sm:inset-0 max-sm:right-0 max-sm:w-full max-sm:max-h-none max-sm:rounded-none",
  )}>
    <div className="flex shrink-0 items-center justify-between border-b bg-muted px-4 py-2">
      <span className="truncate text-sm font-medium">{titulo}</span>
      <div className="flex items-center gap-1">
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => onMinimizarChange?.(!minimizado)} aria-label={minimizado ? "Expandir" : "Minimizar"}>
          {minimizado ? <ChevronUp className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onDescartar} aria-label="Fechar"><X className="h-4 w-4" /></Button>
      </div>
    </div>
    {!minimizado && corpoForm}
  </div>
);
```
  3. `corpoForm` mantém o `<form onSubmit={onEnviar} className="flex min-h-0 flex-1 flex-col">`, com o miolo (campos) `overflow-y-auto` e o rodapé de ações `shrink-0` (o mesmo teto de altura/rolagem que o `ConteudoDialogo` dava, agora à mão). Importar ícones `Minus`, `ChevronUp` do lucide (X já é usado).
  4. Ajustar o `useEffect` que reseta `mostrarCc/mostrarCco`: hoje depende de `open`; passar a resetar na MONTAGEM (o pai remonta ao abrir) — trocar `[open]` por `[]` com os valores iniciais de `valores.cc/cco`.

- [ ] **Step 4: Rodar e ver passar** — o teste; depois `tsc` baseline e `build`.

- [ ] **Step 5: Commit**
```bash
git add src/components/email/CompositorEmail.tsx src/components/email/compositor-moldura.test.tsx
git commit -m "refactor(email): compositor deixa de ser modal (moldura encaixada/inline)"
```

---

### Task 2: `Emails.tsx` — render no nível da página + estado + um-de-cada-vez

**Files:**
- Modify: `src/pages/Emails.tsx` (estado do compositor; render do encaixado no nível da página; abrir encaixado/inline; diálogo salvar/descartar).

**Interfaces:**
- Consumes: `CompositorEmail` (Task 1) com `variante`/`minimizado`.
- Produces: estado `modoCompositor: "fechado" | "encaixado" | "inline"` e `minimizado`; funções `abrirNovo()` (encaixado), e o `responderMensagem` existente passa a abrir INLINE; helper `rascunhoSujo()`.

- [ ] **Step 1: Implementar o estado.** Trocar `isComposeOpen`/`setIsComposeOpen` por:
```tsx
const [modoCompositor, setModoCompositor] = useState<"fechado" | "encaixado" | "inline">("fechado");
const [minimizado, setMinimizado] = useState(false);
const compositorAberto = modoCompositor !== "fechado";
```
  Ajustar todos os pontos que hoje leem/escrevem `isComposeOpen` (abrir/fechar/enviar/descartar) para o novo estado. `escreverNovo`/`enviarPara` → `setModoCompositor("encaixado")`; `responderMensagem` → `setModoCompositor("inline")`; `onSuccess`/descartar do envio → `setModoCompositor("fechado")` + `setMinimizado(false)`.

- [ ] **Step 2: Um de cada vez.** Antes de abrir um compositor novo com outro já ABERTO e sujo, um diálogo. `rascunhoSujo()` = algum campo de `formData` preenchido. Se aberto e sujo, abrir um `<Dialog>` de confirmação com "Salvar rascunho" (mantém o autosave e fecha) / "Descartar" (limpa e fecha) / "Cancelar". Só depois abre o novo. (Reaproveitar o padrão de diálogo de confirmação que já existe no arquivo, se houver — senão um `AlertDialog`.)

- [ ] **Step 3: Render do encaixado no nível da página.** Hoje `{compositor}` é injetado nos dois branches. Passar a:
  - Remover `{compositor}` de dentro dos dois branches para o modo encaixado.
  - Envolver o retorno da página de forma que o card encaixado seja irmão do branch:
```tsx
return (
  <>
    {selectedEmail ? (/* branch leitor */) : (/* branch lista */)}
    {modoCompositor === "encaixado" && (
      <CompositorEmail variante="encaixado" minimizado={minimizado} onMinimizarChange={setMinimizado} ...props/>
    )}
    {/* diálogos auxiliares que precisam existir nos dois branches */}
  </>
);
```
  O compositor INLINE (modoCompositor === "inline") NÃO é renderizado aqui — é montado no leitor (Task 3).

- [ ] **Step 4: Verificar** — `tsc` baseline; `build`. Se houver teste de `Emails` que quebre pela mudança de estado, ajustar.

- [ ] **Step 5: Commit**
```bash
git add src/pages/Emails.tsx
git commit -m "feat(email): compositor renderizado no nivel da pagina (encaixado) e um de cada vez"
```

---

### Task 3: `LeitorEmail` — caixa inline no topo da conversa

**Files:**
- Modify: `src/components/email/LeitorEmail.tsx` (ponto de montagem da caixa inline no topo).
- Modify: `src/pages/Emails.tsx` (passar o compositor inline ao leitor).

**Interfaces:**
- Consumes: `CompositorEmail` (variante "inline"), `modoCompositor` (Task 2).
- Produces: `LeitorEmail` renderiza `props.compositorInline` (um `ReactNode`) logo abaixo do cabeçalho/ações do e-mail aberto, ANTES da seção "Nesta conversa".

- [ ] **Step 1: Prop no leitor.** `LeitorEmail` ganha `compositorInline?: React.ReactNode`. Renderizar `{compositorInline}` num bloco logo depois do corpo do e-mail aberto e ANTES do `{!!mensagensDaConversa?.length && (...)}` ("Nesta conversa"), com um respiro (`mt-4`).

- [ ] **Step 2: Passar do `Emails.tsx`.** No branch do leitor, passar:
```tsx
compositorInline={modoCompositor === "inline" ? (
  <CompositorEmail variante="inline" titulo="Responder" ...props/>
) : null}
```

- [ ] **Step 3: Verificar** — `tsc` baseline; `build`. Teste de fumaça: renderizar `LeitorEmail` com `compositorInline={<div>RESP</div>}` e ver "RESP" na tela, e sem a prop não aparecer.

- [ ] **Step 4: Commit**
```bash
git add src/components/email/LeitorEmail.tsx src/pages/Emails.tsx
git commit -m "feat(email): responder abre caixa inline no topo da conversa"
```

---

### Task 4: Verificação final e publicação

- [ ] `npx tsc --noEmit -p tsconfig.app.json` → 36 (baseline).
- [ ] `npm run test` → não cai.
- [ ] `npm run build` → compila.
- [ ] `git fetch origin main`; se andou, `git rebase origin/main` e reverificar a mistura.
- [ ] `git push origin HEAD:main`; confirmar `origin/main`.
- [ ] Avisar o Lucas: conferência visual dele — escrever novo (cartão encaixado, dá pra rolar o fundo, minimizar/fechar, tela cheia no celular); responder (caixa inline no topo da conversa); trocar de tela sem perder o rascunho; abrir outro com rascunho sujo pergunta salvar/descartar.

## Self-Review (cobertura da seção C do spec)
- Cartão encaixado (novo) + minimizar/fechar + mobile tela cheia → Task 1 + Task 2.
- Caixa inline no topo da conversa (responder) → Task 1 (variante) + Task 3.
- Render no nível da página (não perde rascunho ao navegar) → Task 2.
- Um de cada vez (salvar/descartar) → Task 2.
- Sai o Dialog modal → Task 1.
