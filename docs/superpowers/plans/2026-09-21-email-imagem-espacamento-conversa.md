# E-mail — 3 consertos (imagem, espaçamento, conversa) — Plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consertar 3 pontos da seção de E-mail: tamanho de imagem (não chegar gigante), espaçamento entre linhas que some no envio, e a conversa aberta mostrar a mais recente primeiro.

**Architecture:** (A) estender a extensão `Image` do TipTap com um atributo `width` + botões de tamanho + teto ao inserir, tudo em `EditorTextoRico`. (F) helper novo `prepararHtmlParaEmail` que dá espaçamento inline aos parágrafos e preserva linhas em branco, usado no envio. (B) inverter a ordenação da consulta da conversa.

**Tech Stack:** React 18 + Vite + TS, TipTap 2, DOMParser (navegador/jsdom), Vitest.

## Global Constraints

- PT-BR em tela/comentário/commit; doc técnico seco.
- Verificação: `npm run test` não cai; `npx tsc --noEmit -p tsconfig.app.json` no baseline (36); `npm run build` compila. tsc e vitest em sequência (evita flake).
- Publicar só os meus commits, por worktree a partir de `origin/main`; `git fetch` antes; nunca `git add -A`; `git status --short` separado.
- Tamanho de imagem em **px** (não %). Teto ao inserir: 500px. Degraus: Pequena 150, Média 300, Grande 500, Original (sem width).
- Trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

Spec: `docs/superpowers/specs/2026-09-21-email-imagem-espacamento-conversa-design.md`.

---

### Task 1 (B): Conversa — mais recente primeiro

**Files:**
- Modify: `src/pages/Emails.tsx` (a consulta da conversa, `.order("data_mensagem", { ascending: true })` por volta da linha 1673).

- [ ] **Step 1: Localizar** — `grep -n 'ascending: true' src/pages/Emails.tsx` e confirmar que a ocorrência dentro da query da conversa (filtro `.eq("nylas_thread_id", ...)`) é a que ordena "Nesta conversa".
- [ ] **Step 2: Trocar** `ascending: true` por `ascending: false` NESSA consulta (só a da conversa; NÃO tocar nas de Recebidos/Enviados, que já são `false`). Ajustar o comentário ao lado para "mais recente primeiro (pedido da MD, 21/09)".
- [ ] **Step 3: Verificar** — `npx tsc --noEmit -p tsconfig.app.json` no baseline; `npm run build` compila.
- [ ] **Step 4: Commit**
```bash
git add src/pages/Emails.tsx
git commit -m "fix(email): conversa aberta mostra a mensagem mais recente primeiro"
```

---

### Task 2 (F): Espaçamento entre linhas no envio

**Files:**
- Create: `src/lib/html-para-email.ts`
- Test: `src/lib/html-para-email.test.ts`
- Modify: `src/pages/Emails.tsx` (usar no `htmlBody` do envio)

**Interfaces:**
- Produces: `prepararHtmlParaEmail(html: string): string` — dá `margin` inline aos `<p>` e transforma `<p>` vazio em linha em branco com altura; devolve HTML pronto para a caixa de quem recebe.

- [ ] **Step 0 (confirmar causa):** rodar mentalmente/inspecionar o que o editor gera: parágrafo = `<p>...</p>`, linha em branco = `<p></p>`. O envio hoje (`Emails.tsx`, `htmlBody`) NÃO dá margem inline aos `<p>`; caixas de e-mail zeram a margem padrão e colapsam `<p>` vazio. Confirmar que é isso (não `<br>`), abrindo o editor e vendo `editor.getHTML()` no teste do Task; se for outra coisa, ajustar o desenho.

- [ ] **Step 1: Teste que falha** — `src/lib/html-para-email.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { prepararHtmlParaEmail } from "./html-para-email";

describe("prepararHtmlParaEmail", () => {
  it("dá margem inline aos parágrafos", () => {
    const out = prepararHtmlParaEmail("<p>linha 1</p><p>linha 2</p>");
    expect(out).toContain("margin");
    // cada <p> ganhou style com margin
    expect((out.match(/margin/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(out).toContain("linha 1");
    expect(out).toContain("linha 2");
  });

  it("preserva linha em branco (p vazio não colapsa)", () => {
    const out = prepararHtmlParaEmail("<p>a</p><p></p><p>b</p>");
    // o p vazio vira um espaçador com <br> (ou nbsp), não some
    expect(out).toMatch(/<p[^>]*>(<br\s*\/?>|&nbsp;)<\/p>/i);
  });

  it("não inventa conteúdo nem remove o texto", () => {
    const out = prepararHtmlParaEmail("<p>oi <strong>mundo</strong></p>");
    expect(out).toContain("<strong>mundo</strong>");
  });

  it("lida com vazio/nulo", () => {
    expect(prepararHtmlParaEmail("")).toBe("");
    expect(prepararHtmlParaEmail(undefined as unknown as string)).toBe("");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/lib/html-para-email.test.ts` → FAIL (módulo não existe).

- [ ] **Step 3: Implementar** — `src/lib/html-para-email.ts`:
```ts
/**
 * Prepara o HTML do editor para a CAIXA de quem recebe: dá espaçamento inline
 * aos parágrafos (a margem de folha de estilo é descartada pelo Gmail e afins)
 * e preserva as linhas em branco (`<p></p>` vazio colapsa sem isto). É
 * fidelidade, não segurança — a limpeza é do `sanitizarHtmlEmail`.
 */
export function prepararHtmlParaEmail(html: string): string {
  const bruto = html ?? "";
  if (!bruto) return "";
  const doc = new DOMParser().parseFromString(`<body>${bruto}</body>`, "text/html");
  doc.body.querySelectorAll("p").forEach((p) => {
    const vazio = p.textContent?.trim() === "" && p.children.length === 0;
    if (vazio) {
      p.innerHTML = "<br>";
    }
    const estilo = p.getAttribute("style") ?? "";
    if (!/margin/i.test(estilo)) {
      p.setAttribute("style", `${estilo}${estilo && !estilo.endsWith(";") ? ";" : ""}margin:0 0 1em 0`.replace(/^;/, ""));
    }
  });
  return doc.body.innerHTML;
}
```

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run src/lib/html-para-email.test.ts` → PASS (4).

- [ ] **Step 5: Usar no envio** — em `src/pages/Emails.tsx`, no `sendEmailMutation`, o `htmlBody` passa a embrulhar `prepararHtmlParaEmail(sanitizarHtmlEmail(data.corpo))` em vez de só `sanitizarHtmlEmail(data.corpo)`. Importar `prepararHtmlParaEmail`.

- [ ] **Step 6: Verificar** — `tsc` baseline; `build` ok; `npx vitest run src/lib/html-para-email.test.ts`.

- [ ] **Step 7: Commit**
```bash
git add src/lib/html-para-email.ts src/lib/html-para-email.test.ts src/pages/Emails.tsx
git commit -m "fix(email): preserva espacamento entre linhas no e-mail enviado"
```

---

### Task 3 (A): Tamanho da imagem no editor

**Files:**
- Modify: `src/components/shared/EditorTextoRico.tsx` (extensão de imagem com `width`, teto no insert, botões de tamanho)
- Test: `src/components/shared/EditorTextoRico.test.tsx` (extensão renderiza `width`)

**Interfaces:**
- Consumes: TipTap `Image`.
- Produces: imagens com atributo `width` (px) + `style="max-width:100%"`; menu "Tamanho da imagem" (Pequena 150 / Média 300 / Grande 500 / Original) quando `editor.isActive("image")`.

- [ ] **Step 1: Teste que falha** — acrescentar em `src/components/shared/EditorTextoRico.test.tsx` (no bloco headless que já testa fontSize):
```tsx
import Image from "@tiptap/extension-image";
const ImagemComTamanho = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute("width"),
        renderHTML: (attrs: { width?: number | null }) =>
          attrs.width ? { width: attrs.width, style: `width:${attrs.width}px;max-width:100%;height:auto` } : {},
      },
    };
  },
});
// dentro de um it():
const editor = new Editor({ extensions: [StarterKit, ImagemComTamanho] });
editor.chain().setImage({ src: "https://x/i.png", width: 300 }).run();
const html = editor.getHTML();
editor.destroy();
expect(html).toContain('width="300"');
```

- [ ] **Step 2: Rodar e ver falhar** (o `it` novo falha porque o componente ainda não usa a extensão com width — na verdade o teste headless é auto-contido; rode e veja PASSAR nesse teste headless, e falhar a asserção equivalente feita PELO componente se você preferir testar o componente. Decidir na hora: o essencial é provar que a extensão renderiza `width`).

- [ ] **Step 3: Implementar no componente** — em `EditorTextoRico.tsx`:
  1. Substituir `Image.configure({ inline: false, allowBase64: false })` por uma extensão local `ImagemComTamanho` (igual à do teste) `.configure({ inline: false, allowBase64: false })`, adicionando o atributo `width`.
  2. No `aoEscolherImagem`, após obter `url`, medir o tamanho natural e aplicar o teto:
```tsx
const medir = new window.Image();
medir.onload = () => {
  const w = Math.min(medir.naturalWidth || 500, 500);
  editor.chain().focus().setImage({ src: url, width: w }).run();
};
medir.onerror = () => editor.chain().focus().setImage({ src: url, width: 500 }).run();
medir.src = url;
```
  3. Botões de tamanho: quando `editor.isActive("image")`, renderizar na barra um `MenuBarra` "Tamanho da imagem" com itens Pequena(150)/Média(300)/Grande(500)/Original(null), cada um chamando `editor.chain().focus().updateAttributes("image", { width: valor }).run()`.

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run src/components/shared/EditorTextoRico.test.tsx`; depois `tsc` baseline e `build`.

- [ ] **Step 5: Commit**
```bash
git add src/components/shared/EditorTextoRico.tsx src/components/shared/EditorTextoRico.test.tsx
git commit -m "feat(email): tamanho de imagem no editor (teto ao inserir + botoes P/M/G/Original)"
```

---

### Task 4: Verificação final e publicação

- [ ] `npx tsc --noEmit -p tsconfig.app.json` → 36 (baseline); nenhum erro novo nos arquivos tocados.
- [ ] `npm run test` → não cai (baseline + testes novos).
- [ ] `npm run build` → compila.
- [ ] `git fetch origin main`; se andou, `git rebase origin/main` e reverificar a mistura.
- [ ] `git push origin HEAD:main`; confirmar `origin/main`.
- [ ] Avisar o Lucas: conferência visual dele (imagem não chega gigante + botões de tamanho; e-mail com linhas em branco chega com espaçamento; conversa mostra a mais recente logo abaixo do aberto).

## Self-Review (cobertura do spec)
- A (tamanho de imagem, spec §A) → Task 3.
- B (conversa mais recente, spec §B) → Task 1.
- F (espaçamento, spec §F) → Task 2.
- Verificação (spec §Verificação) → em cada task + Task 4.
