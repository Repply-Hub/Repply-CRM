# Bloco 1 — Barras de busca responsivas: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nenhuma caixa de busca do sistema passa da largura da tela nem fica cortada, em celular (375×812), tablet (768×1024) e computador (1280×720).

**Architecture:** O conserto começa nos três componentes-base que toda busca suspensa usa: `PopoverContent` ganha teto de largura igual à tela; `CommandList` ganha teto de altura igual ao espaço que sobra na tela; `CommandInput` termina texto longo em reticências. Depois, um levantamento real nas três larguras acha o que sobrou, e cada defeito é consertado com uma de cinco receitas fixas (seção "Receitas").

**Tech Stack:** React 18, Tailwind 3.4.17 (conferido: gera `max-height: min(300px,calc(var(--radix-popover-content-available-height,100vh) - 3.5rem))` sem estragar o nome da variável), Radix Popover 1.1 (expõe `--radix-popover-content-available-height` no conteúdo), cmdk 1.1, tailwind-merge 2.6, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-11-busca-config-agenda-mencoes-design.md`, Bloco 1.

## Global Constraints

- Só **tamanho** muda. Nenhum comportamento, texto, ordem ou cor.
- Outra sessão divide a pasta: **nunca** `git add -A` nem `git add .`. Commit sempre com `git commit --only -m "…" -- <arquivos>` (arquivo novo: `git add -- <arquivo>` antes).
- `git push` publica em produção. Publicar **só** os commits deste bloco e o documento com os planos, pelo caminho do worktree (Task 4).
- 🔴 O documento e os planos vão ao ar pela **versão limpa** (o commit que tirou o dado real, CLAUDE.md §6.9). **Nunca** `cherry-pick` de `58c7610a` nem de `7bbd7002`: são as versões com dado real, e o histórico do git é público.
- Não digitar senha em lugar nenhum. Login no navegador do app é feito pelo Lucas.
- Linha de base que não pode piorar: `npm run test` → 1.349 passando em 102 arquivos; `npx tsc --noEmit -p tsconfig.app.json` → 36 erros; `npm run lint` → 427 problemas; `npm run build` → ok.
- Larguras de verificação: **375×812**, **768×1024**, **1280×720**.
- Idioma de tudo que o usuário lê: português do Brasil.

## Arquivos

| arquivo | responsabilidade |
|---|---|
| `src/components/ui/popover.tsx` | teto de largura de todo conteúdo suspenso |
| `src/components/ui/command.tsx` | teto de altura da lista e reticências no campo |
| `src/components/ui/menus-de-busca.test.tsx` (novo) | trava as três regras nos componentes-base |
| `src/components/clientes/ContatoSelector.tsx` | tira a altura local que anularia o teto |
| `docs/superpowers/notas/2026-09-11-auditoria-das-buscas.md` (novo) | tabela do levantamento |
| telas com defeito (Task 3) | consertos pontuais pelas receitas |

---

### Task 1: Tetos nos componentes-base

**Files:**
- Modify: `src/components/ui/popover.tsx:20`
- Modify: `src/components/ui/command.tsx:47` (CommandInput) e `:63` (CommandList)
- Create: `src/components/ui/menus-de-busca.test.tsx`

**Interfaces:**
- Consumes: nada.
- Produces: as classes-base `max-w-[calc(100vw-1rem)]` (PopoverContent), `max-h-[min(300px,calc(var(--radix-popover-content-available-height,100vh)-3.5rem))]` (CommandList) e `text-ellipsis` (CommandInput). A Task 2 remove sobreposições locais que anulariam a de altura.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/components/ui/menus-de-busca.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Command, CommandInput, CommandItem, CommandList } from './command';

/**
 * As três regras que impedem uma busca de sair da tela. Moram nos componentes-base
 * de propósito: são ~40 buscas no sistema, e consertar uma a uma deixaria a próxima
 * busca nova nascer quebrada.
 */
describe('menus de busca cabem na tela', () => {
  it('o conteúdo suspenso nunca passa da largura da tela', () => {
    render(
      <Popover open>
        <PopoverTrigger>abrir</PopoverTrigger>
        <PopoverContent className="w-[400px]">conteúdo</PopoverContent>
      </Popover>,
    );
    const el = screen.getByText('conteúdo');
    expect(el.className).toContain('max-w-[calc(100vw-1rem)]');
    // A largura pedida pela tela continua valendo onde cabe (computador).
    expect(el.className).toContain('w-[400px]');
  });

  it('a lista encolhe quando sobra pouca altura na tela', () => {
    render(
      <Command>
        <CommandInput placeholder="Buscar..." />
        <CommandList data-testid="lista">
          <CommandItem>um</CommandItem>
        </CommandList>
      </Command>,
    );
    expect(screen.getByTestId('lista').className).toContain(
      'max-h-[min(300px,calc(var(--radix-popover-content-available-height,100vh)-3.5rem))]',
    );
  });

  it('texto de ajuda longo termina em reticências em vez de cortar no meio', () => {
    render(
      <Command>
        <CommandInput placeholder="Buscar por nome, empresa, e-mail ou telefone..." />
      </Command>,
    );
    expect(screen.getByPlaceholderText(/buscar por nome/i).className).toContain('text-ellipsis');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/components/ui/menus-de-busca.test.tsx`
Expected: FAIL nos três casos (`expected '…' to contain 'max-w-[calc(100vw-1rem)]'`, idem para `max-h-[min(…)]` e `text-ellipsis`).

- [ ] **Step 3: Implementar**

Em `src/components/ui/popover.tsx`, na string de classes da linha 20, trocar o começo `"z-[1100] w-72 rounded-xl` por:

```ts
        "z-[1100] w-72 max-w-[calc(100vw-1rem)] rounded-xl border bg-popover/95 backdrop-blur-md p-4 text-popover-foreground shadow-2xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
```

e acrescentar, logo acima de `const PopoverContent = …`, o comentário:

```ts
// `max-w-[calc(100vw-1rem)]`: todo conteúdo suspenso cabe na tela. Quem pede
// `w-[400px]` continua com 400 px no computador; no celular de 375 px encolhe
// para caber, em vez de sair pela borda (era o caso da agenda e da rota de visita).
```

Em `src/components/ui/command.tsx`, no `CommandInput` (linha 47), trocar a string por:

```ts
        "flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none text-ellipsis placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
```

e no `CommandList` (linha 63), trocar `cn("max-h-[300px] overflow-y-auto overflow-x-hidden", className)` por:

```ts
    className={cn(
      // Nunca mais alta que o espaço que sobra na tela. Num notebook de 720 px com
      // um diálogo aberto, a lista de 300 px passava do rodapé e o último item sumia.
      // O Radix informa esse espaço em `--radix-popover-content-available-height`;
      // fora de um Popover a variável não existe e vale o `100vh`.
      "max-h-[min(300px,calc(var(--radix-popover-content-available-height,100vh)-3.5rem))] overflow-y-auto overflow-x-hidden",
      className,
    )}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/components/ui/menus-de-busca.test.tsx`
Expected: PASS, 3 testes.

- [ ] **Step 5: Commit**

```bash
git add -- src/components/ui/menus-de-busca.test.tsx
git commit --only -m "fix(busca): menus suspensos nunca passam da largura nem da altura da tela

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -- src/components/ui/popover.tsx src/components/ui/command.tsx src/components/ui/menus-de-busca.test.tsx
```

---

### Task 2: Tirar alturas locais que anulariam o teto

O `tailwind-merge` (dentro de `cn`) deixa a classe da tela vencer a do componente-base. Uma tela que passa `max-h-[300px]` para o `CommandList` apaga o teto da Task 1.

**Files:**
- Modify: `src/components/clientes/ContatoSelector.tsx:127`
- Modify: toda outra ocorrência achada no Step 1

**Interfaces:**
- Consumes: a classe-base de altura da Task 1.
- Produces: nada novo.

- [ ] **Step 1: Listar as sobreposições**

Run (Grep): padrão `CommandList[^>]*className="[^"]*max-h-` em `src/**/*.tsx`.
Expected: ao menos `src/components/clientes/ContatoSelector.tsx:127: <CommandList className="max-h-[300px]">`. Anotar cada ocorrência.

- [ ] **Step 2: Remover as que repetem 300 px**

Em `ContatoSelector.tsx:127`, trocar

```tsx
          <CommandList className="max-h-[300px]">
```

por

```tsx
          <CommandList>
```

Para cada outra ocorrência do Step 1: se o valor for `max-h-[300px]`, remover a classe do mesmo jeito. Se for outro valor (ex.: `max-h-[400px]`), trocar por `max-h-[min(<valor>,calc(var(--radix-popover-content-available-height,100vh)-3.5rem))]`, mantendo o valor da tela.

- [ ] **Step 3: Rodar a suíte inteira**

Run: `npm run test`
Expected: linha de base + 3 (os da Task 1) passando, nenhum falhando.

- [ ] **Step 4: Commit**

```bash
git commit --only -m "fix(busca): o seletor de contato para de anular o teto de altura da lista

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -- src/components/clientes/ContatoSelector.tsx <demais arquivos do Step 2>
```

---

### Task 3: Levantamento nas três larguras e consertos pontuais

Levantamento real: abrir cada busca no navegador do app, nas três larguras, com as Tasks 1 e 2 já aplicadas, e consertar o que sobrou.

**Files:**
- Create: `docs/superpowers/notas/2026-09-11-auditoria-das-buscas.md`
- Modify: as telas com defeito, conforme as receitas

**Interfaces:**
- Consumes: Tasks 1 e 2.
- Produces: a tabela do levantamento (usada no relato final ao Lucas).

- [ ] **Step 1: Abrir o sistema**

`preview_start` com `{ name: "repply-crm" }` (porta 8080, de `.claude/launch.json`). Se aparecer a tela de login, **parar e pedir ao Lucas que entre** — nunca digitar senha.

- [ ] **Step 2: Percorrer a lista, em cada largura**

Para cada largura (`resize_window` com `{ width: 375, height: 812 }`, depois `{ width: 768, height: 1024 }`, depois `{ width: 1280, height: 720 }`), abrir cada busca abaixo, digitar duas letras e conferir quatro coisas:
(a) nada sai pela borda;
(b) o último item da lista é alcançável rolando;
(c) o texto de ajuda não é cortado no meio de uma palavra (reticências são aceitas);
(d) os vizinhos na mesma linha continuam visíveis.

Para medir sem depender do olho, rodar no `javascript_tool` com o menu aberto:

```js
[...document.querySelectorAll('[data-radix-popper-content-wrapper] > *, input[placeholder]')]
  .map(e => { const r = e.getBoundingClientRect(); return { tag: e.tagName, ph: e.getAttribute('placeholder'), esq: Math.round(r.left), dir: Math.round(r.right), baixo: Math.round(r.bottom), tela: innerWidth, alt: innerHeight }; })
  .filter(x => x.esq < 0 || x.dir > x.tela || x.baixo > x.alt)
```

Expected: `[]`. Qualquer linha na resposta é defeito.

| # | onde abrir | busca |
|---|---|---|
| 1 | /clientes → Nova empresa → passo 4 → "Selecionar existente" | `ContatoSelector` (a que o Lucas lembrou) |
| 2 | /clientes/:id → Vincular contato existente | `ContatoSelector` |
| 3 | /clientes, /obras, /tarefas, /fabricantes — busca do topo | `SearchWithRecent` |
| 4 | /calendario → Novo evento → Participantes | `EventDialog.tsx:455` |
| 5 | /obras → Nova rota de visita → Participantes e Obras | `NovaRotaVisitaDialog.tsx:661` e `:728` |
| 6 | /negocios → um negócio → Responsáveis | `CampoDeResponsaveis.tsx:181` |
| 7 | /negocios → novo negócio → Empresa e Fabricante | `EmpresaSelector.tsx:153`, `FabricanteSelector.tsx:115` |
| 8 | /obras → uma obra → Contatos | `SeletorContatosObra.tsx:142` |
| 9 | qualquer filtro com várias escolhas | `MultiSelectSearch.tsx:83` |
| 10 | /whatsapp — busca da lista (três variantes de tela) | `WhatsAppInbox.tsx:1147`, `:7215`, `:7766` |
| 11 | /whatsapp → conversa → transferir, direcionar, editar responsável | `WhatsAppInbox.tsx:4003`, `:5310`, `:7654`, `:7947`, `:8096` |
| 12 | /whatsapp → conversa → buscar mensagem | `WhatsAppInbox.tsx:8169` |
| 13 | /whatsapp → conversa → figurinhas | `FigurinhasPopover.tsx:92` |
| 14 | /whatsapp → enviar contato | `EnviarContatoDialog.tsx:161` |
| 15 | /chat — busca da lista, criar grupo, membros, encaminhar | `Chat.tsx:227`, `CreateGroupDialog.tsx:210`, `Chat.tsx:2137`, `EncaminharMensagemDialog.tsx:110` |
| 16 | /emails — pesquisar, marcadores, mover, gerenciar caixa | `Emails.tsx:2027`, `BarraPastas.tsx:249`, `MoverParaMarcadorDialog.tsx:121`, `GerenciarCaixaDialog.tsx:80` |
| 17 | /obras → enviar rota; /fabricantes → enviar catálogo | `EnviarRotaDialog.tsx:106`, `EnviarCatalogoDialog.tsx:147` |
| 18 | /configuracoes → Usuários (lista e histórico), Empresas, Permissões, WhatsApp | `UsuariosTab.tsx:318`, `:737`, `EmpresasTab.tsx:191`, `PermissaoMatrixEditor.tsx:114`, `WhatsAppInstanciasTab.tsx:143` |
| 19 | /dashboard → Plano de vendas → buscar fábrica | `PlanoVendasSection.tsx:1281` |
| 20 | importação de planilha → mapeamento | `MappingStep.tsx:705` |
| 21 | /admin/empresas, /admin/secoes (conta admin) | `AdminEmpresas.tsx:422`, `AdminSecoes.tsx:249` |
| 22 | /portal | `Portal.tsx:602` |
| 23 | seletor de data → busca de ano | `ui/calendar.tsx:84` |

Linhas que não abrem com a conta logada (ex.: admin, por falta de permissão) entram na tabela como "não verificável com esta conta", e nunca como "ok".

- [ ] **Step 3: Registrar a tabela**

Criar `docs/superpowers/notas/2026-09-11-auditoria-das-buscas.md` com uma linha por busca e largura:

```markdown
# Levantamento das barras de busca — 11/09/2026

Método: navegador do app, com as Tasks 1 e 2 já aplicadas, nas larguras 375×812, 768×1024 e 1280×720.
Critérios: (a) nada sai pela borda; (b) o último item é alcançável; (c) o texto de ajuda não corta
no meio de uma palavra; (d) os vizinhos continuam visíveis.

| # | busca | 375 | 768 | 1280 | defeito | receita | commit |
|---|---|---|---|---|---|---|---|
| 1 | ContatoSelector — nova empresa | … | … | … | … | … | … |
```

Preencher com o que foi **visto**. "ok" só para o que foi aberto e passou.

- [ ] **Step 4: Consertar cada defeito com a receita correspondente**

Um commit por tela, com a mensagem `fix(busca): <tela> cabe no <celular|tablet|notebook>`. Depois de cada conserto, reabrir a busca nas três larguras e rodar de novo o script do Step 2 (resposta esperada: `[]`). Atualizar a tabela.

- [ ] **Step 5: Commit da tabela**

```bash
git add -- docs/superpowers/notas/2026-09-11-auditoria-das-buscas.md
git commit --only -m "docs(busca): levantamento das barras de busca nas tres larguras

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -- docs/superpowers/notas/2026-09-11-auditoria-das-buscas.md
```

#### Receitas

**R1 — menu que não é Popover sai pela borda** (`DropdownMenuContent`, `SelectContent`). Acrescentar `max-w-[calc(100vw-1rem)]` ao `className` do conteúdo:

```tsx
<DropdownMenuContent align="start" className="w-[240px] max-w-[calc(100vw-1rem)] max-h-[300px] overflow-y-auto">
```

**R2 — campo de busca numa barra de ferramentas empurra os vizinhos para fora.** Deixar a linha quebrar e o campo ocupar a linha inteira no celular:

```tsx
<div className="flex flex-wrap items-center gap-2">
  <div className="relative w-full min-w-0 sm:w-auto sm:flex-1">
    {/* ícone + Input como estavam */}
  </div>
  {/* vizinhos como estavam */}
</div>
```

**R3 — largura mínima fixa força a linha a estourar** (ex.: `AdminEmpresas.tsx:422` `min-w-[220px]` numa linha que não quebra). Só vale a partir do tablet:

```tsx
<div className="relative w-full min-w-0 flex-1 sm:min-w-[220px]">
```

**R4 — texto de ajuda de um `<Input>` comum cortado no meio.** Acrescentar `text-ellipsis` ao `className` do `Input`, mantendo as outras classes:

```tsx
<Input className="pl-9 h-10 text-ellipsis bg-muted/50 border-transparent focus-visible:ring-1" placeholder="Buscar por nome, telefone ou mensagem..." />
```

**R5 — menu com largura fixa ainda estreito demais para ler** (ex.: `w-56` com nomes longos, no celular). Trocar a largura fixa por "a do campo, com teto":

```tsx
<PopoverContent className="w-[--radix-popover-trigger-width] min-w-56 p-0" align="start">
```

Se um defeito não couber em nenhuma receita, **parar e descrever o caso ao Lucas antes de mexer**. Pode ser mudança de comportamento, e isso está fora deste bloco.

---

### Task 4: Verificação final e publicação

**Files:** nenhum novo.

**Interfaces:**
- Consumes: todos os commits das Tasks 1–3 e a versão limpa do documento e dos planos.
- Produces: bloco no ar.

- [ ] **Step 1: Suíte completa contra a linha de base**

Run, em sequência:
```bash
npm run test
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "error TS"
npm run lint 2>&1 | tail -3
npm run build
```
Expected: testes = linha de base + 3, 0 falhando; `tsc` ≤ 36; lint ≤ 427 problemas; build ok. Se algum número piorou, achar o arquivo deste bloco responsável e consertar antes de seguir.

- [ ] **Step 2: Separar os commits deste bloco**

```bash
git cherry -v origin/main HEAD
```
Expected: linhas `+` para os commits deste bloco e para os de documentação de 11/09. Os de outra sessão ficam de fora. Anotar os hashes deste bloco, na ordem, e o hash do commit que limpou o dado real do documento e dos planos (`<LIMPO>`).

- [ ] **Step 3: Montar a publicação num worktree limpo**

```bash
git fetch origin
git worktree add ../_publicar-busca origin/main
cd ../_publicar-busca
# o documento e os planos entram pela versão limpa, num commit novo — nunca por cherry-pick
git checkout <LIMPO> -- docs/superpowers/specs/2026-09-11-busca-config-agenda-mencoes-design.md docs/superpowers/plans/2026-09-11-bloco-1-busca-responsiva.md docs/superpowers/plans/2026-09-11-bloco-2-configuracoes.md docs/superpowers/plans/2026-09-11-bloco-3-agenda-avisos-e-lembretes.md docs/superpowers/plans/2026-09-11-bloco-4-mencoes.md
git commit -m "docs: desenho e planos de busca, configuracoes, agenda e mencoes (11/09)"
git cherry-pick <hashes deste bloco, na ordem>
git diff --stat HEAD <HEAD testado da pasta principal> -- src/components/ui/popover.tsx src/components/ui/command.tsx src/components/ui/menus-de-busca.test.tsx src/components/clientes/ContatoSelector.tsx docs/superpowers/notas/2026-09-11-auditoria-das-buscas.md docs/superpowers/specs/2026-09-11-busca-config-agenda-mencoes-design.md <demais arquivos da Task 3>
```
Expected: `git diff --stat` **vazio** — o que vai ao ar é exatamente o que foi testado.

- [ ] **Step 4: Publicar e limpar**

```bash
git push origin HEAD:main
cd -
git worktree remove --force ../_publicar-busca
```

- [ ] **Step 5: Conferir no ar**

```bash
gh api repos/Repply-Hub/Repply-CRM/commits/<último hash publicado>/status --jq .state
```
Expected: `success`. Depois, no navegador do app, abrir `https://crm.repplyhub.com.br/clientes` a 375×812 e repetir a busca nº 1 da tabela: o script do Task 3 Step 2 devolve `[]`. Capturar a tela para o relato ao Lucas.
