# Editor de texto rico para e-mail — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar à seção de E-mail um editor de texto rico (estilo Gmail) reutilizado no corpo e na configuração de assinatura, com a assinatura inserida dentro do corpo.

**Architecture:** Um componente `EditorTextoRico` (TipTap) que entra/sai em HTML, usado no `CompositorEmail` e no `AssinaturaEmailEditor`. Uploads de imagem vão para o bucket `email-assets` com path único e URL pública. A saída passa por `sanitizarHtmlEmail` (DOMPurify) antes de gravar/enviar. A assinatura é semeada no corpo ao abrir a composição, em vez de anexada no envio.

**Tech Stack:** React 18.3.1 + Vite + TypeScript, TipTap 2 (ProseMirror), DOMPurify (já é dependência), Supabase Storage, shadcn/Radix, Tailwind, Vitest + Testing Library.

## Global Constraints

- Responder e comentar em **PT-BR**; documento técnico seco (sem humanizer).
- Verificação da casa antes de publicar: `npm run test` não cai; `npx tsc --noEmit -p tsconfig.app.json` no baseline (36); `npm run build` compila. Rodar tsc e vitest **em sequência**, não em paralelo (evita flake de I/O).
- Publicar SÓ os meus commits, por worktree a partir de `origin/main` (várias sessões dividem a pasta). `git push` publica em produção.
- **Conjunto Essencial só** (sem tabela, código, citação, editar-HTML, tela cheia).
- Estilos **inline** na saída (e-mail descarta `<style>`/classes). Fonte/tamanho = lista curta e segura.
- Atalhos via `Mod` do ProseMirror (Ctrl no Windows/Linux, Cmd no Mac) — não hardcodar tecla.
- **Sem migration de tabela.** Só possível ajuste de política do bucket `email-assets` (Storage), medido antes e aplicado com o "pode" do Lucas (§ Task 3).
- Nunca `git add -A`; conferir `git status --short` num comando separado; `git fetch` antes de commitar.
- Trailer de commit: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

Referência de desenho: `docs/superpowers/specs/2026-09-18-editor-rico-email-design.md`.

---

### Task 1: Sanitizador de HTML de e-mail

**Files:**
- Create: `src/lib/sanitizar-html-email.ts`
- Test: `src/lib/sanitizar-html-email.test.ts`

**Interfaces:**
- Produces: `sanitizarHtmlEmail(html: string): string` — devolve HTML só com o conjunto Essencial; remove `<script>`, `<style>`, `<iframe>`, `on*`, `javascript:`.

- [ ] **Step 1: Teste que falha** — `src/lib/sanitizar-html-email.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { sanitizarHtmlEmail } from "./sanitizar-html-email";

describe("sanitizarHtmlEmail", () => {
  it("mantém o conjunto Essencial", () => {
    const ok =
      '<p><strong>a</strong> <em>b</em> <u>c</u> <s>d</s> ' +
      '<span style="color: #ff0000; font-size: 18px">e</span> ' +
      '<a href="https://x.com">l</a> <ul><li>i</li></ul> ' +
      '<img src="https://x.com/i.png" alt="x"></p>';
    const out = sanitizarHtmlEmail(ok);
    expect(out).toContain("<strong>");
    expect(out).toContain("color: #ff0000");
    expect(out).toContain('href="https://x.com"');
    expect(out).toContain("<img");
  });

  it("remove script, handlers e javascript:", () => {
    const mau =
      '<p onclick="x()">t</p><script>alert(1)</script>' +
      '<img src="x" onerror="alert(1)"><a href="javascript:alert(1)">j</a>';
    const out = sanitizarHtmlEmail(mau);
    expect(out).not.toContain("<script");
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("onerror");
    expect(out.toLowerCase()).not.toContain("javascript:");
  });

  it("remove style e iframe", () => {
    const out = sanitizarHtmlEmail('<style>b{}</style><iframe src="x"></iframe><p>ok</p>');
    expect(out).not.toContain("<style");
    expect(out).not.toContain("<iframe");
    expect(out).toContain("ok");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/lib/sanitizar-html-email.test.ts` → FAIL (módulo não existe).

- [ ] **Step 3: Implementar** — `src/lib/sanitizar-html-email.ts`:

```ts
import DOMPurify from "dompurify";

/**
 * HTML que o EDITOR gera (corpo e assinatura), limpo para o conjunto Essencial.
 * A leitura de e-mail recebido tem o seu próprio DOMPurify em LeitorEmail.tsx.
 */
export function sanitizarHtmlEmail(html: string): string {
  return DOMPurify.sanitize(html ?? "", {
    ALLOWED_TAGS: [
      "p", "br", "div", "span", "strong", "b", "em", "i", "u", "s",
      "a", "ul", "ol", "li", "img", "h1", "h2", "h3", "blockquote",
    ],
    ALLOWED_ATTR: ["href", "src", "alt", "title", "width", "height", "style"],
    ALLOWED_URI_REGEXP: /^(https?:|mailto:|data:image\/)/i,
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "base", "link"],
    FORBID_ATTR: ["target", "ping", "srcset", "formaction"],
  });
}
```

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run src/lib/sanitizar-html-email.test.ts` → PASS (3).

- [ ] **Step 5: Commit**

```bash
git add src/lib/sanitizar-html-email.ts src/lib/sanitizar-html-email.test.ts
git commit -m "feat(email): sanitizador de HTML do editor (conjunto Essencial)"
```

---

### Task 2: Upload de imagem para o e-mail

**Files:**
- Create: `src/lib/imagem-email.ts`
- Test: `src/lib/imagem-email.test.ts`

**Interfaces:**
- Produces:
  - `caminhoImagemEmail(userId: string, nomeArquivo: string): string` — path único `imagens/{userId}/{uuid}.{ext}` no bucket `email-assets` (puro, testável sem rede).
  - `TIPOS_IMAGEM_ACEITOS: string[]` e `TAMANHO_MAX_IMAGEM: number` (bytes).
  - `enviarImagemEmail(file: File, userId: string): Promise<string>` — valida, sobe para `email-assets`, devolve URL pública. Lança `Error` com frase clara em tipo/tamanho inválido.

- [ ] **Step 1: Teste que falha** — `src/lib/imagem-email.test.ts` (testa o puro + validação; não bate na rede):

```ts
import { describe, it, expect } from "vitest";
import {
  caminhoImagemEmail,
  TIPOS_IMAGEM_ACEITOS,
  TAMANHO_MAX_IMAGEM,
  extensaoValida,
} from "./imagem-email";

describe("caminhoImagemEmail", () => {
  it("gera path único por usuário preservando a extensão", () => {
    const p = caminhoImagemEmail("u1", "foto.PNG");
    expect(p).toMatch(/^imagens\/u1\/[0-9a-f-]{36}\.png$/);
  });
  it("cai para png quando não há extensão conhecida", () => {
    expect(caminhoImagemEmail("u1", "semext")).toMatch(/\.png$/);
  });
  it("dois uploads do mesmo nome não colidem", () => {
    expect(caminhoImagemEmail("u1", "a.png")).not.toBe(caminhoImagemEmail("u1", "a.png"));
  });
});

describe("validação", () => {
  it("aceita png/jpg/gif/webp", () => {
    expect(TIPOS_IMAGEM_ACEITOS).toEqual(
      expect.arrayContaining(["image/png", "image/jpeg", "image/gif", "image/webp"]),
    );
    expect(extensaoValida("image/jpeg")).toBe(true);
    expect(extensaoValida("application/pdf")).toBe(false);
  });
  it("tem teto de tamanho", () => {
    expect(TAMANHO_MAX_IMAGEM).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/lib/imagem-email.test.ts` → FAIL.

- [ ] **Step 3: Implementar** — `src/lib/imagem-email.ts`:

```ts
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "email-assets";
export const TAMANHO_MAX_IMAGEM = 5 * 1024 * 1024; // 5 MB
export const TIPOS_IMAGEM_ACEITOS = [
  "image/png", "image/jpeg", "image/gif", "image/webp",
];
const EXT_POR_TIPO: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp",
};

export function extensaoValida(tipo: string): boolean {
  return TIPOS_IMAGEM_ACEITOS.includes(tipo);
}

export function caminhoImagemEmail(userId: string, nomeArquivo: string): string {
  const bruta = (nomeArquivo.split(".").pop() ?? "").toLowerCase();
  const ext = ["png", "jpg", "jpeg", "gif", "webp"].includes(bruta) ? (bruta === "jpeg" ? "jpg" : bruta) : "png";
  return `imagens/${userId}/${crypto.randomUUID()}.${ext}`;
}

export async function enviarImagemEmail(file: File, userId: string): Promise<string> {
  if (!extensaoValida(file.type)) {
    throw new Error("Formato não aceito. Use PNG, JPG, GIF ou WEBP.");
  }
  if (file.size > TAMANHO_MAX_IMAGEM) {
    throw new Error("Imagem muito grande (máximo 5 MB).");
  }
  const caminho = caminhoImagemEmail(userId, file.name);
  const { error } = await supabase.storage.from(BUCKET).upload(caminho, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(caminho);
  return data.publicUrl;
}
```

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run src/lib/imagem-email.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/imagem-email.ts src/lib/imagem-email.test.ts
git commit -m "feat(email): upload de imagem do e-mail com path único"
```

---

### Task 3: Conferir política do bucket `email-assets` (checkpoint de produção)

**Objetivo:** garantir que o usuário logado consegue gravar em `imagens/{userId}/...` (várias imagens) e que a leitura é pública. Hoje o único uso é o path fixo `assinaturas/{userId}.png`.

- [ ] **Step 1: Medir** (só leitura, MCP Supabase `execute_sql`): listar as policies de `storage.objects` referentes ao bucket `email-assets` e conferir se o INSERT/UPDATE de authenticated está restrito por prefixo de path e se há SELECT público.

```sql
select policyname, cmd, qual, with_check
from pg_policies
where schemaname='storage' and tablename='objects'
  and (qual ilike '%email-assets%' or with_check ilike '%email-assets%' or policyname ilike '%email%');
```

- [ ] **Step 2: Decidir**
  - Se a policy já permite qualquer path do próprio usuário no bucket (ou o bucket todo para authenticated) e SELECT público: **nada a fazer**, marcar Task concluída.
  - Se estiver amarrada ao path fixo `assinaturas/{userId}.png`: preparar migration curta de policy (padrão da casa) que permita `imagens/{auth.uid()}/*` e manter a leitura pública. **PARAR e mostrar o SQL ao Lucas; aplicar só com "pode"** (é mudança de banco/segurança — AGENTS.md §4).

- [ ] **Step 3:** registrar o resultado no PR/commit da Task 6 (sem commit próprio se nada mudou).

---

### Task 4: Componente `EditorTextoRico` (TipTap) + barra responsiva

**Files:**
- Create: `src/components/shared/EditorTextoRico.tsx`
- Test: `src/components/shared/EditorTextoRico.test.tsx`
- Modify: `package.json`, `package-lock.json` (dependências TipTap)

**Interfaces:**
- Produces:
```ts
interface EditorTextoRicoProps {
  value: string;                         // HTML
  onChange: (html: string) => void;      // HTML já sanitizado por sanitizarHtmlEmail
  onEnviarImagem?: (file: File) => Promise<string>; // devolve URL; habilita botão imagem
  placeholder?: string;
  minHeight?: number;                    // px, default 200
  disabled?: boolean;
  "aria-label"?: string;
}
export function EditorTextoRico(props: EditorTextoRicoProps): JSX.Element;
```
- Consumes: `sanitizarHtmlEmail` (Task 1).

- [ ] **Step 1: Instalar dependências** (dentro da worktree — instala na node_modules compartilhada pela junção; o commit leva package.json/lock):

```bash
npm install @tiptap/react@^2 @tiptap/pm@^2 @tiptap/starter-kit@^2 \
  @tiptap/extension-underline@^2 @tiptap/extension-link@^2 @tiptap/extension-image@^2 \
  @tiptap/extension-text-align@^2 @tiptap/extension-text-style@^2 @tiptap/extension-color@^2 \
  @tiptap/extension-font-family@^2
```

Conferir: as versões instaladas batem (todas 2.x) e o `npm run build` ainda compila antes de escrever o componente.

- [ ] **Step 2: Teste que falha** — `src/components/shared/EditorTextoRico.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EditorTextoRico } from "./EditorTextoRico";

describe("EditorTextoRico", () => {
  it("mostra o valor inicial em HTML", () => {
    render(<EditorTextoRico value="<p>oi</p>" onChange={() => {}} aria-label="Corpo" />);
    expect(screen.getByLabelText("Corpo")).toBeInTheDocument();
    expect(screen.getByText("oi")).toBeInTheDocument();
  });

  it("o botão Negrito existe e alterna estado", () => {
    render(<EditorTextoRico value="<p>x</p>" onChange={() => {}} aria-label="Corpo" />);
    expect(screen.getByRole("button", { name: /negrito/i })).toBeInTheDocument();
  });

  it("emite HTML sanitizado no onChange ao digitar", () => {
    const onChange = vi.fn();
    render(<EditorTextoRico value="<p></p>" onChange={onChange} aria-label="Corpo" />);
    const area = screen.getByLabelText("Corpo");
    fireEvent.input(area, { target: { innerHTML: "<p>abc</p>" } });
    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls.at(-1)?.[0]).toContain("abc");
  });
});
```

> Nota de execução: TipTap usa ProseMirror, que precisa de layout no jsdom. Se `fireEvent.input` não disparar o `onUpdate` de forma estável no jsdom, trocar o 3º teste por um teste da função pura de serialização/sanitização exposta pelo componente (ex.: `editor.getHTML()` embrulhado por `sanitizarHtmlEmail`), mantendo os dois primeiros testes de render/toolbar. Decidir na hora, conforme o comportamento real do jsdom — sem enfraquecer a cobertura de "onChange devolve HTML".

- [ ] **Step 3: Rodar e ver falhar** — `npx vitest run src/components/shared/EditorTextoRico.test.tsx` → FAIL.

- [ ] **Step 4: Implementar o componente.** Esqueleto (preencher com a API real da versão instalada):

```tsx
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import FontFamily from "@tiptap/extension-font-family";
import { sanitizarHtmlEmail } from "@/lib/sanitizar-html-email";
// ... botões da barra com lucide-react + DropdownMenu (⋯) para o excedente.

export function EditorTextoRico({ value, onChange, onEnviarImagem, minHeight = 200, ...props }: EditorTextoRicoProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,                 // parágrafo, negrito, itálico, tachado, listas, histórico, Mod+B/I
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
      Image.configure({ inline: false }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyle, Color, FontFamily,
      // extensão de fontSize (mark em TextStyle) — implementar inline se a versão não trouxer
    ],
    content: value || "<p></p>",
    editable: !props.disabled,
    onUpdate: ({ editor }) => onChange(sanitizarHtmlEmail(editor.getHTML())),
  });
  // Toolbar responsiva: ResizeObserver + prioridade fixa; excedente no DropdownMenu (⋯).
  // O <EditorContent> recebe aria-label={props["aria-label"]} e min-height.
  // Botão imagem só aparece quando onEnviarImagem existe; abre <input type=file>,
  //   chama onEnviarImagem(file) e editor.chain().focus().setImage({ src: url }).run().
  return (/* barra + <EditorContent editor={editor} /> */ null as any);
}
```

Requisitos concretos do componente:
  - Botões (nome acessível PT-BR): Negrito, Itálico, Sublinhado, Tachado, Cor do texto, Fonte, Tamanho, Lista com marcador, Lista numerada, Alinhar (esquerda/centro/direita), Link, Imagem (se `onEnviarImagem`), Limpar formatação.
  - Cada botão reflete `editor.isActive(...)` (aria-pressed).
  - `value` externo muda → `editor.commands.setContent(value)` só quando difere do `editor.getHTML()` (evita laço).
  - Fonte: lista curta segura (Padrão, Arial, Georgia, Times New Roman, Courier New, Verdana, Tahoma). Tamanho: Pequeno/Normal/Grande/Enorme → px inline.
  - Barra responsiva: `ResizeObserver`; ordem de prioridade fixa; o que não couber vai para um `DropdownMenu` com ícone `MoreHorizontal` (⋯).

- [ ] **Step 5: Rodar e ver passar** — `npx vitest run src/components/shared/EditorTextoRico.test.tsx` → PASS. Depois `npx tsc --noEmit -p tsconfig.app.json` (baseline) e `npm run build`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/components/shared/EditorTextoRico.tsx src/components/shared/EditorTextoRico.test.tsx
git commit -m "feat(email): editor de texto rico reutilizável (TipTap) com barra responsiva"
```

---

### Task 5: Compositor usa o editor e semeia a assinatura no corpo

**Files:**
- Modify: `src/components/email/CompositorEmail.tsx` (campo do corpo `:174-181`; remover prévia da assinatura `:270-317`; `RascunhoEmail` `:15-19`)
- Modify: `src/pages/Emails.tsx` (estado `:361-365`; semear ao abrir; envio `:1038-1064`; autosave `:604-620`)
- Test: `src/components/email/compositor-assinatura-no-corpo.test.tsx` (ou estender teste existente do compositor, se houver)

**Interfaces:**
- Consumes: `EditorTextoRico` (Task 4), `enviarImagemEmail` (Task 2), `sanitizarHtmlEmail` (Task 1), `usuarios.assinatura_email` (já carregado em `Emails.tsx:387`).
- Produces: composição cujo `corpo` é HTML; ao abrir novo/responder/encaminhar, o corpo já contém a assinatura.

- [ ] **Step 1: Teste que falha** — abrir o compositor para um e-mail novo semeia a assinatura uma vez:

```tsx
// Renderiza o CompositorEmail com value inicial vazio e assinaturaHtml="<p>Fulano</p>";
// espera que o EditorTextoRico receba um value contendo "Fulano" (a assinatura foi semeada),
// e que reabrir/re-render não duplique a assinatura.
```
(Escrever o teste concreto conforme a API real do `CompositorEmail` — props de abertura, `onChange` do corpo. Cobrir: semeia 1×; enviar manda HTML do editor.)

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar**
  - `RascunhoEmail.corpo` continua `string`, agora HTML.
  - Trocar `<Textarea>` (`:174-181`) por `<EditorTextoRico value={valores.corpo} onChange={(html)=>onChange({...valores, corpo: html})} onEnviarImagem={(f)=>enviarImagemEmail(f, userId)} aria-label="Corpo do e-mail" />`.
  - **Remover** o bloco de prévia da assinatura (`:270-317`) e a prop/estado `incluirAssinatura`.
  - Em `Emails.tsx`: ao abrir composição (novo, responder, encaminhar), montar o corpo inicial = `"<p></p>" + assinaturaHtml` (assinatura de `usuarios.assinatura_email`, semeada UMA vez por abertura; para responder/encaminhar, antes do original citado, se houver). Guardar HTML no `formData.corpo`.
  - Envio (`:1059-1064`): remover o `replace(/\n/g,"<br>")` e a concatenação do rodapé; enviar `sanitizarHtmlEmail(formData.corpo)` como `body`. `montarRodapeEmailHtml` sai do caminho de envio.
  - Autosave (`:604-620`): gravar o HTML do corpo em `email_rascunhos.corpo`.

- [ ] **Step 4: Rodar e ver passar** — teste do compositor; depois `tsc` (baseline) e `build`.

- [ ] **Step 5: Commit**

```bash
git add src/components/email/CompositorEmail.tsx src/pages/Emails.tsx src/components/email/compositor-assinatura-no-corpo.test.tsx
git commit -m "feat(email): editor rico no corpo e assinatura inserida no corpo (novo/responder/encaminhar)"
```

---

### Task 6: Configuração da assinatura vira editor único (várias imagens)

**Files:**
- Modify: `src/components/configuracoes/AssinaturaEmailEditor.tsx` (abas `:241-260`, texto `:283-294`, imagem `:296-344`, hidden input `:372`)
- Modify: `src/lib/assinatura-email.ts` (`sanitizarAssinaturaEmail` `:33-45`; `montarRodapeEmailHtml` `:124-171`)
- Test: `src/lib/assinatura-email.test.ts` (já existe — ajustar), `src/components/configuracoes/assinatura-editor.test.tsx`

**Interfaces:**
- Consumes: `EditorTextoRico`, `enviarImagemEmail`, `sanitizarHtmlEmail`.
- Produces: `AssinaturaEmailEditor` como editor único que grava HTML em `assinatura_email`, com N imagens.

- [ ] **Step 1: Ajustar/most­rar o teste** — `assinatura-email.test.ts`: `sanitizarAssinaturaEmail` passa a delegar para `sanitizarHtmlEmail` (mantém negrito/cor/link/img/lista; remove script). Novo teste do componente: montar o editor com value HTML; inserir imagem chama `enviarImagemEmail`; `onChange` grava HTML sanitizado no campo.

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar**
  - Substituir as duas abas por um `<EditorTextoRico value={valorHtml} onChange={setValorHtml} onEnviarImagem={(f)=>enviarImagemEmail(f, userId)} aria-label="Assinatura" />`; o `<input type="hidden" name value>` (`:372`) recebe o HTML sanitizado.
  - Remover a inferência de modo (`ehAssinaturaImagem`) e o uso das colunas `assinatura_imagem_mostrar_nome/empresa` na tela (colunas ficam no banco, sem uso — não editar migration antiga).
  - `sanitizarAssinaturaEmail` delega para `sanitizarHtmlEmail`.
  - `montarRodapeEmailHtml`: deixa de ser anexado no envio; é reaproveitado como **semente** da primeira abertura das Configurações quando `assinatura_email` estiver vazia/legada (continuidade, spec §11).

- [ ] **Step 4: Rodar e ver passar** — testes; `tsc` (baseline); `build`.

- [ ] **Step 5: Commit**

```bash
git add src/components/configuracoes/AssinaturaEmailEditor.tsx src/lib/assinatura-email.ts src/lib/assinatura-email.test.ts src/components/configuracoes/assinatura-editor.test.tsx
git commit -m "feat(email): configuração de assinatura em editor único com várias imagens"
```

---

### Task 7: Verificação final e publicação

- [ ] **Step 1:** `npx tsc --noEmit -p tsconfig.app.json` → 36 (baseline); nenhum erro novo citando os arquivos tocados (fora do herdado 2624 de Emails.tsx).
- [ ] **Step 2:** `npm run test` → não cai (baseline atual 2103, + os testes novos); se algum flake de I/O, rerodar o arquivo isolado.
- [ ] **Step 3:** `npm run build` → compila.
- [ ] **Step 4:** `git fetch origin main`; se andou, `git rebase origin/main` e **reverificar a mistura** (tsc + build + vitest em sequência).
- [ ] **Step 5:** `git push origin HEAD:main` (só os meus commits). Confirmar `origin/main`.
- [ ] **Step 6:** Avisar o Lucas: o que subiu, e que a conferência visual (não consigo logar) é dele — testar escrever com formatação, imagem no corpo, e a assinatura no corpo em novo/responder/encaminhar; e reabrir Configurações para conferir a assinatura no editor novo.

---

## Self-Review (cobertura do spec)

- Editor rico Essencial + atalhos Mod (spec §2,§6.1,§6.3) → Task 4.
- Barra responsiva com ⋯ (spec §2.4,§6.2) → Task 4.
- Imagem no corpo e várias na assinatura (spec §2.2,§6.4,§9) → Task 2 (upload) + Task 4 (inserção) + Task 5 (corpo) + Task 6 (assinatura).
- Assinatura no corpo, sempre; fim da área separada e do rodapé automático (spec §2.3,§8,§11) → Task 5 + Task 6.
- Editor único na config, sem abas (spec §9) → Task 6.
- Sanitização de escrita (spec §6.5,§12) → Task 1, usada em 4/5/6.
- Sem migration de tabela; storage a confirmar (spec §10) → Task 3 (checkpoint).
- Testes (spec §13) → em cada task.
- Continuidade das assinaturas (spec §11) → Task 6 Step 3 (semente por `montarRodapeEmailHtml`).
