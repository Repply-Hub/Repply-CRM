# Aparência de grupo/Geral e "marcar não lida" no WhatsApp — Plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trazer o clique-direito "marcar não lida" para a caixa de WhatsApp, e permitir que grupos e Chat Geral escolham um símbolo + cores ou uma imagem.

**Architecture:** Frontend React/Vite + Supabase. #1 reaproveita as ações de não-lida que a caixa já tem, num `ContextMenu`. #2 acrescenta 3 colunas de texto a `chat_grupos`/`chat_geral_config`, dois catálogos puros (símbolos + cores), um `AvatarDeChat` que centraliza a decisão imagem/símbolo/padrão (hoje repetida em 8 lugares), e um `SeletorDeAparencia` usado na criação e edição.

**Tech Stack:** React 18, TypeScript, Vite, shadcn/Radix, TanStack Query, Supabase (Postgres + RLS + Storage), lucide-react, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-23-aparencia-grupo-e-nao-lida-whatsapp-design.md`

## Global Constraints

- **PT-BR** em interface, comentário e commit. Não traduzir código/banco para inglês.
- 🔴 **Cobrir TODAS as superfícies** (AGENTS §3): o avatar aparece em **8 lugares** (grupo e Geral × trilho recolhido, lista expandida, cabeçalho, ficha lateral); o seletor entra em **3** (criar grupo, editar grupo, editar Geral).
- **Verificação** (§9, os "três não"): `npm run test` a suíte **inteira** (nº não cai) · `npx tsc --noEmit -p tsconfig.app.json` (não sobe da base ~36) · `npm run build` (compila) · `npm run lint` (não sobe).
- **Tabela/coluna nova = migration** (§6.2/6.3); **migration escrita ≠ aplicada** — aplicar em produção **espera o "pode" do Lucas**. `types.ts` é gerado mas atualizado à mão (§6.8).
- **Cores guardadas como hex** (`#RRGGBB`), aplicadas por `style` inline.
- **Git:** `git fetch` antes de commitar; nunca `git add -A`; listar arquivos um a um; commit trailer EXATO `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Sem dado real** de cliente em teste/código (§6.9).

---

## Task 1: Marcar como não lida no WhatsApp (clique direito)

**Files:**
- Modify: `src/pages/WhatsAppInbox.tsx` (import `ContextMenu*`; envolver o `<button>` de `renderConvButton`, ~6696-6785)

**Interfaces:**
- Consumes (já existem no componente): `marcarNaoLida` (`useWaMarcarNaoLida`, `.mutate(conv.id)`), `marcarLida` (`useWaMarcarLida`, `.mutate(conv.id)`), `conversaNaoLida(conv, profile?.id)`.

- [ ] **Step 1: Importar o menu de contexto**

Adicionar ao bloco de imports do topo do arquivo:

```tsx
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem } from '@/components/ui/context-menu';
```

- [ ] **Step 2: Envolver o botão da linha num ContextMenu**

Em `renderConvButton` (~6709), o `return (` hoje devolve `<button key={conv.id} onClick={onSelect} className={...}> ... </button>`. Envolver esse `<button>` inteiro num `ContextMenu`, movendo o `key` para o elemento externo:

```tsx
    return (
      <ContextMenu key={conv.id}>
        <ContextMenuTrigger asChild>
          <button
            onClick={onSelect}
            className={cn(/* …classes iguais… */)}
          >
            {/* …todo o conteúdo do botão, sem mudar nada… */}
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent>
          {conversaNaoLida(conv, profile?.id) ? (
            <ContextMenuItem onClick={() => marcarLida.mutate(conv.id)}>Marcar como lida</ContextMenuItem>
          ) : (
            <ContextMenuItem onClick={() => marcarNaoLida.mutate(conv.id)}>Marcar como não lida</ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>
    );
```

Preserve todas as classes e o conteúdo internos do `<button>`; só remova o `key={conv.id}` de dentro dele (foi para o `ContextMenu`). O trilho recolhido (~7096) NÃO recebe o menu nesta entrega.

- [ ] **Step 3: Verificar**

```bash
npx tsc --noEmit -p tsconfig.app.json   # ≤ 36
npm run build                            # compila
```
(É wiring de tela num arquivo grande, sem teste unitário; a prova é compilar.)

- [ ] **Step 4: Commit**

```bash
git status --short
git add src/pages/WhatsAppInbox.tsx
git commit -m "feat(whatsapp): marcar conversa como nao lida no clique direito da lista

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Catálogos puros de símbolos e cores

**Files:**
- Create: `src/lib/simbolos-de-chat.ts`, `src/lib/cores-de-chat.ts`
- Test: `src/lib/simbolos-de-chat.test.ts`, `src/lib/cores-de-chat.test.ts`

**Interfaces:**
- Produces: `SIMBOLOS_DE_CHAT` (10), `SimboloDeChat`, `simboloDoCatalogo(chave)`; `CORES_DE_CHAT` (8 pares), `ParDeCor`, `COR_FUNDO_PADRAO`, `COR_ICONE_PADRAO`.

- [ ] **Step 1: Testes (falham — arquivos não existem)**

`src/lib/simbolos-de-chat.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SIMBOLOS_DE_CHAT, simboloDoCatalogo } from './simbolos-de-chat';

describe('SIMBOLOS_DE_CHAT', () => {
  it('tem 10 símbolos com chaves únicas', () => {
    expect(SIMBOLOS_DE_CHAT).toHaveLength(10);
    const chaves = SIMBOLOS_DE_CHAT.map((s) => s.chave);
    expect(new Set(chaves).size).toBe(10);
  });
  it('o balão de chat está na lista (padrão do Geral)', () => {
    expect(SIMBOLOS_DE_CHAT.some((s) => s.chave === 'balao')).toBe(true);
  });
  it('chave conhecida devolve o símbolo; desconhecida/nula devolve null', () => {
    expect(simboloDoCatalogo('lampada')?.chave).toBe('lampada');
    expect(simboloDoCatalogo('nao-existe')).toBeNull();
    expect(simboloDoCatalogo(null)).toBeNull();
    expect(simboloDoCatalogo(undefined)).toBeNull();
  });
});
```

`src/lib/cores-de-chat.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CORES_DE_CHAT, COR_FUNDO_PADRAO, COR_ICONE_PADRAO } from './cores-de-chat';

describe('CORES_DE_CHAT', () => {
  it('tem 8 pares com nomes únicos e hex válido', () => {
    expect(CORES_DE_CHAT).toHaveLength(8);
    expect(new Set(CORES_DE_CHAT.map((c) => c.nome)).size).toBe(8);
    for (const c of CORES_DE_CHAT) {
      expect(c.fundo).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(c.icone).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
  it('as cores padrão são hex válido', () => {
    expect(COR_FUNDO_PADRAO).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(COR_ICONE_PADRAO).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/simbolos-de-chat.test.ts src/lib/cores-de-chat.test.ts`
Expected: FAIL (módulos não encontrados).

- [ ] **Step 3: Escrever os catálogos**

`src/lib/simbolos-de-chat.ts`:

```ts
import {
  MessageCircle, Users2, Lightbulb, NotebookPen, Briefcase,
  Target, Megaphone, Calendar, ListChecks, Folder, type LucideIcon,
} from 'lucide-react';

/** Os símbolos que grupo/Geral podem escolher. Puro: chave estável + rótulo + ícone.
 *  Chave que sumir da lista cai no padrão sem erro (como o catálogo de sons). */
export interface SimboloDeChat {
  chave: string;
  rotulo: string;
  Icone: LucideIcon;
}

export const SIMBOLOS_DE_CHAT: readonly SimboloDeChat[] = [
  { chave: 'balao', rotulo: 'Balão de chat', Icone: MessageCircle },
  { chave: 'grupo', rotulo: 'Grupo de pessoas', Icone: Users2 },
  { chave: 'lampada', rotulo: 'Lâmpada', Icone: Lightbulb },
  { chave: 'notas', rotulo: 'Bloco de notas', Icone: NotebookPen },
  { chave: 'maleta', rotulo: 'Maleta', Icone: Briefcase },
  { chave: 'alvo', rotulo: 'Alvo', Icone: Target },
  { chave: 'megafone', rotulo: 'Megafone', Icone: Megaphone },
  { chave: 'agenda', rotulo: 'Agenda', Icone: Calendar },
  { chave: 'checklist', rotulo: 'Checklist', Icone: ListChecks },
  { chave: 'pasta', rotulo: 'Pasta', Icone: Folder },
];

export function simboloDoCatalogo(chave: string | null | undefined): SimboloDeChat | null {
  if (!chave) return null;
  return SIMBOLOS_DE_CHAT.find((s) => s.chave === chave) ?? null;
}
```

`src/lib/cores-de-chat.ts`:

```ts
/** Pares de cor (fundo suave + ícone forte) para a aparência de grupo/Geral.
 *  Preferência por tons claros no fundo, como o das Anotações. Cor livre pode
 *  ajustar fundo e ícone separadamente; estes são os atalhos da paleta. */
export interface ParDeCor {
  nome: string;
  fundo: string;
  icone: string;
}

export const CORES_DE_CHAT: readonly ParDeCor[] = [
  { nome: 'Laranja', fundo: '#FFE9E0', icone: '#FF5A1F' },
  { nome: 'Azul', fundo: '#E3F0FF', icone: '#2563EB' },
  { nome: 'Verde', fundo: '#E4F7EC', icone: '#16A34A' },
  { nome: 'Roxo', fundo: '#F1E9FF', icone: '#7C3AED' },
  { nome: 'Rosa', fundo: '#FFE7F1', icone: '#DB2777' },
  { nome: 'Âmbar', fundo: '#FFF3D6', icone: '#D97706' },
  { nome: 'Teal', fundo: '#DEF7F5', icone: '#0D9488' },
  { nome: 'Cinza', fundo: '#ECEEF1', icone: '#475569' },
];

/** Usadas quando a pessoa escolhe um símbolo mas ainda não mexeu na cor. */
export const COR_FUNDO_PADRAO = '#FFE9E0';
export const COR_ICONE_PADRAO = '#FF5A1F';
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/simbolos-de-chat.test.ts src/lib/cores-de-chat.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/simbolos-de-chat.ts src/lib/simbolos-de-chat.test.ts src/lib/cores-de-chat.ts src/lib/cores-de-chat.test.ts
git commit -m "feat(chat): catalogos de simbolos e cores para aparencia de grupo/Geral

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Extrair `SeletorCorLivre` para peça compartilhada

**Files:**
- Create: `src/components/shared/SeletorCorLivre.tsx`
- Modify: `src/components/configuracoes/WhatsAppInstanciasTab.tsx` (remover a definição local, importar da nova)

**Interfaces:**
- Produces: `SeletorCorLivre` — popover de cor livre (quadrado matiz/saturação + campo hex). Props: `{ hexAtual: string; onEscolher: (hex: string) => void; disabled?: boolean }` (as MESMAS de hoje).

- [ ] **Step 1: Mover o componente**

Em `WhatsAppInstanciasTab.tsx`, localizar a **definição do componente `SeletorCorLivre`** (função/const que renderiza o popover de cor livre). Recortar essa definição inteira para o novo arquivo `src/components/shared/SeletorCorLivre.tsx`, acrescentando `export` e trazendo junto os imports que ela usa (ex.: `Popover*`, `Button`, `Input`, `cn`, qualquer helper de conversão hex/hsl que estiver no mesmo arquivo — mova os helpers usados só por ela também). Mantenha as props e o comportamento idênticos.

- [ ] **Step 2: Importar de volta no Tab**

No topo de `WhatsAppInstanciasTab.tsx`, acrescentar `import { SeletorCorLivre } from '@/components/shared/SeletorCorLivre';` e remover o código que foi movido. O uso existente (`<SeletorCorLivre hexAtual=... onEscolher=... />`) continua igual.

- [ ] **Step 3: Verificar**

```bash
npx tsc --noEmit -p tsconfig.app.json   # ≤ 36
npm run build                            # compila
npx vitest run                            # a suíte inteira nao pode cair (o Tab tem/usa testes?)
```
Expected: compila e nada quebra (é um move, sem mudança de comportamento).

- [ ] **Step 4: Commit**

```bash
git add src/components/shared/SeletorCorLivre.tsx src/components/configuracoes/WhatsAppInstanciasTab.tsx
git commit -m "refactor(cor): extrai SeletorCorLivre para components/shared (reuso no chat)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Componente `AvatarDeChat`

**Files:**
- Create: `src/components/chat/AvatarDeChat.tsx`
- Test: `src/components/chat/AvatarDeChat.test.tsx`

**Interfaces:**
- Consumes: `simboloDoCatalogo` (Task 2), `COR_FUNDO_PADRAO`/`COR_ICONE_PADRAO` (Task 2), `ImagemPrivada`.
- Produces: `AvatarDeChat({ fotoUrl?, icone?, corFundo?, corIcone?, IconePadrao, nome?, className?, tamanhoIcone? })`. Decide imagem → símbolo → padrão.

- [ ] **Step 1: Teste (falha — arquivo não existe)**

`src/components/chat/AvatarDeChat.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Users2 } from 'lucide-react';
import { AvatarDeChat } from './AvatarDeChat';

describe('AvatarDeChat', () => {
  it('mostra a imagem quando há fotoUrl', () => {
    const { container } = render(<AvatarDeChat fotoUrl="blob:x" nome="Grupo" IconePadrao={Users2} />);
    expect(container.querySelector('img')).not.toBeNull();
  });
  it('mostra o símbolo com a cor de fundo escolhida', () => {
    const { container } = render(<AvatarDeChat icone="balao" corFundo="#E3F0FF" corIcone="#2563EB" IconePadrao={Users2} />);
    expect(container.querySelector('img')).toBeNull();
    // a cor de fundo entra por style inline → distingue do padrão (que usa classe bg-primary)
    expect(container.querySelector('[style*="background"]')).not.toBeNull();
  });
  it('mostra o ícone padrão quando não há foto nem símbolo', () => {
    const { container } = render(<AvatarDeChat IconePadrao={Users2} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.querySelector('[style*="background"]')).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/components/chat/AvatarDeChat.test.tsx`
Expected: FAIL (módulo não encontrado).

- [ ] **Step 3: Escrever o componente**

`src/components/chat/AvatarDeChat.tsx`:

```tsx
import type React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ImagemPrivada } from '@/components/shared/ImagemPrivada';
import { simboloDoCatalogo } from '@/lib/simbolos-de-chat';
import { COR_FUNDO_PADRAO, COR_ICONE_PADRAO } from '@/lib/cores-de-chat';

// Esconde a imagem quebrada pra deixar o fallback (ícone) visível.
function esconderQuebrada(e: React.SyntheticEvent<HTMLImageElement>) {
  e.currentTarget.style.display = 'none';
}

/**
 * O avatar de um grupo / Chat Geral. Decisão única (antes repetida em 8 lugares):
 *   1. tem foto → mostra a foto (com o ícone padrão de reserva se a foto quebrar);
 *   2. senão, tem símbolo escolhido → o símbolo com as cores (padrão suave se nulas);
 *   3. senão → o ícone padrão no fundo primário (o de hoje).
 */
export function AvatarDeChat({
  fotoUrl,
  icone,
  corFundo,
  corIcone,
  IconePadrao,
  nome,
  className,
  tamanhoIcone = 'h-4 w-4',
}: {
  fotoUrl?: string | null;
  icone?: string | null;
  corFundo?: string | null;
  corIcone?: string | null;
  IconePadrao: LucideIcon;
  nome?: string;
  className?: string;
  tamanhoIcone?: string;
}) {
  const simbolo = simboloDoCatalogo(icone);

  if (fotoUrl) {
    return (
      <Avatar className={className}>
        <ImagemPrivada src={fotoUrl} alt={nome ?? ''} className="absolute inset-0 h-full w-full object-cover" onError={esconderQuebrada} />
        <AvatarFallback className="bg-primary text-primary-foreground">
          <IconePadrao className={tamanhoIcone} />
        </AvatarFallback>
      </Avatar>
    );
  }

  if (simbolo) {
    const Icone = simbolo.Icone;
    return (
      <Avatar className={className}>
        <AvatarFallback style={{ backgroundColor: corFundo ?? COR_FUNDO_PADRAO, color: corIcone ?? COR_ICONE_PADRAO }}>
          <Icone className={tamanhoIcone} />
        </AvatarFallback>
      </Avatar>
    );
  }

  return (
    <Avatar className={className}>
      <AvatarFallback className="bg-primary text-primary-foreground">
        <IconePadrao className={tamanhoIcone} />
      </AvatarFallback>
    </Avatar>
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/components/chat/AvatarDeChat.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/AvatarDeChat.tsx src/components/chat/AvatarDeChat.test.tsx
git commit -m "feat(chat): AvatarDeChat centraliza imagem/simbolo/padrao do grupo e Geral

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Banco — colunas de aparência (migration + tipos)

> 🔴 **Escreve e commita a migration e os tipos; NÃO aplica no banco.** A aplicação é passo à parte, com "pode" do Lucas. NÃO chame `apply_migration`/`execute_sql`.

**Files:**
- Create: `supabase/migrations/20260923HHMMSS_chat_aparencia_simbolo_cor.sql` (o `HHMMSS` real é decidido na aplicação; use `20260924120000` como nome provisório e avise no report que a versão final é definida ao aplicar)
- Modify: `src/integrations/supabase/types.ts`; `src/hooks/use-chat.ts` (tipos `ChatGrupo` e `ChatGeralConfig`)

**Interfaces:**
- Produces: `chat_grupos` e `chat_geral_config` ganham `icone text`, `cor_fundo text`, `cor_icone text` (anuláveis). `ChatGrupo`/`ChatGeralConfig` ganham os 3 campos.

- [ ] **Step 1: Escrever a migration**

Criar `supabase/migrations/20260924120000_chat_aparencia_simbolo_cor.sql`:

```sql
-- Aparência de grupo / Chat Geral: símbolo escolhido + cor de fundo + cor do ícone.
-- Só ADD COLUMN (anuláveis): as tabelas já têm RLS e políticas de UPDATE (quem pode
-- editar grupo = criador/admin; Geral = gestor/admin), e colunas novas herdam essas
-- políticas — nenhuma política nova. `foto_url` (imagem) continua e tem prioridade na tela.

ALTER TABLE public.chat_grupos       ADD COLUMN IF NOT EXISTS icone text;
ALTER TABLE public.chat_grupos       ADD COLUMN IF NOT EXISTS cor_fundo text;
ALTER TABLE public.chat_grupos       ADD COLUMN IF NOT EXISTS cor_icone text;

ALTER TABLE public.chat_geral_config ADD COLUMN IF NOT EXISTS icone text;
ALTER TABLE public.chat_geral_config ADD COLUMN IF NOT EXISTS cor_fundo text;
ALTER TABLE public.chat_geral_config ADD COLUMN IF NOT EXISTS cor_icone text;
```

- [ ] **Step 2: Tipos gerados (à mão)**

Em `src/integrations/supabase/types.ts`, nos blocos `chat_grupos` e `chat_geral_config` dentro de `Tables`, acrescentar a cada um, em `Row`/`Insert`/`Update`:
```ts
          icone: string | null
          cor_fundo: string | null
          cor_icone: string | null
```
(em `Insert`/`Update` como opcionais: `icone?: string | null` etc.). Cuidado para não quebrar a sintaxe TS ao redor.

- [ ] **Step 3: Tipos do frontend**

Em `src/hooks/use-chat.ts`, na interface `ChatGrupo` (após `foto_url?`):
```ts
  icone?: string | null;
  cor_fundo?: string | null;
  cor_icone?: string | null;
```
E o mesmo na interface `ChatGeralConfig` (após `foto_url?`). Os `select('*')` de `useChatGrupos`/`useChatGeralConfig` já trazem as colunas — nada a mudar ali.

- [ ] **Step 4: Verificar**

```bash
npx tsc --noEmit -p tsconfig.app.json   # ≤ 36
npm run build
```

- [ ] **Step 5: Commit (só arquivos; aplicação depois)**

```bash
git add supabase/migrations/20260924120000_chat_aparencia_simbolo_cor.sql src/integrations/supabase/types.ts src/hooks/use-chat.ts
git commit -m "feat(chat): colunas de aparencia (icone/cor_fundo/cor_icone) em grupo e Geral (migration + tipos)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 6: (Gated) Aplicar em produção — só com o "pode"**

Medir (colunas não existem), ensaiar num `execute_sql` que roda os `ALTER` dentro de uma transação terminando em `RAISE EXCEPTION` para desfazer, apresentar, receber o "pode", `apply_migration` com o conteúdo do arquivo, conferir que as 6 colunas existem. **Não** faça sem autorização.

---

## Task 6: Componente `SeletorDeAparencia`

**Files:**
- Create: `src/components/chat/SeletorDeAparencia.tsx`
- Test: `src/components/chat/SeletorDeAparencia.test.tsx`

**Interfaces:**
- Consumes: `SIMBOLOS_DE_CHAT` (Task 2), `CORES_DE_CHAT`/`COR_*_PADRAO` (Task 2), `SeletorCorLivre` (Task 3), `AvatarDeChat` (Task 4).
- Produces: `SeletorDeAparencia({ valor, onChange, onEscolherImagem, IconePadrao, nome })` — controlado. `valor: { icone: string | null; corFundo: string | null; corIcone: string | null; fotoUrl?: string | null }`. Emite `onChange(novoValor)` ao mexer em símbolo/cor; `onEscolherImagem(file)` ao enviar imagem.

- [ ] **Step 1: Teste (falha — arquivo não existe)**

`src/components/chat/SeletorDeAparencia.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Users2 } from 'lucide-react';
import { SeletorDeAparencia } from './SeletorDeAparencia';

const valor = { icone: null, corFundo: null, corIcone: null, fotoUrl: null };

describe('SeletorDeAparencia', () => {
  it('mostra os 10 símbolos e emite onChange ao escolher um', () => {
    const onChange = vi.fn();
    render(<SeletorDeAparencia valor={valor} onChange={onChange} onEscolherImagem={vi.fn()} IconePadrao={Users2} nome="Grupo" />);
    const botoes = screen.getAllByRole('button', { name: /símbolo/i });
    expect(botoes).toHaveLength(10);
    fireEvent.click(botoes[2]); // 'lampada'
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ icone: 'lampada' }));
  });

  it('escolher uma cor da paleta preenche fundo e ícone', () => {
    const onChange = vi.fn();
    render(<SeletorDeAparencia valor={{ ...valor, icone: 'balao' }} onChange={onChange} onEscolherImagem={vi.fn()} IconePadrao={Users2} nome="Grupo" />);
    fireEvent.click(screen.getAllByRole('button', { name: /cor/i })[0]);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ corFundo: expect.stringMatching(/^#/), corIcone: expect.stringMatching(/^#/) }));
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/components/chat/SeletorDeAparencia.test.tsx`
Expected: FAIL (módulo não encontrado).

- [ ] **Step 3: Escrever o componente**

`src/components/chat/SeletorDeAparencia.tsx`:

```tsx
import { useRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Camera } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AvatarDeChat } from './AvatarDeChat';
import { SIMBOLOS_DE_CHAT } from '@/lib/simbolos-de-chat';
import { CORES_DE_CHAT, COR_FUNDO_PADRAO, COR_ICONE_PADRAO } from '@/lib/cores-de-chat';
import { SeletorCorLivre } from '@/components/shared/SeletorCorLivre';

export interface AparenciaValor {
  icone: string | null;
  corFundo: string | null;
  corIcone: string | null;
  fotoUrl?: string | null;
}

export function SeletorDeAparencia({
  valor, onChange, onEscolherImagem, IconePadrao, nome,
}: {
  valor: AparenciaValor;
  onChange: (v: AparenciaValor) => void;
  onEscolherImagem: (file: File) => void;
  IconePadrao: LucideIcon;
  nome: string;
}) {
  const imgRef = useRef<HTMLInputElement>(null);

  const escolherSimbolo = (chave: string) =>
    onChange({
      ...valor,
      fotoUrl: null,
      icone: chave,
      corFundo: valor.corFundo ?? COR_FUNDO_PADRAO,
      corIcone: valor.corIcone ?? COR_ICONE_PADRAO,
    });

  return (
    <div className="space-y-3">
      {/* Prévia + enviar imagem */}
      <div className="flex items-center gap-3">
        <AvatarDeChat
          className="h-14 w-14 border border-border"
          fotoUrl={valor.fotoUrl}
          icone={valor.icone}
          corFundo={valor.corFundo}
          corIcone={valor.corIcone}
          IconePadrao={IconePadrao}
          nome={nome}
          tamanhoIcone="h-6 w-6"
        />
        <input
          ref={imgRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) onEscolherImagem(f);
          }}
        />
        <button
          type="button"
          onClick={() => imgRef.current?.click()}
          className="flex items-center gap-1.5 text-xs text-primary hover:underline"
        >
          <Camera className="h-3.5 w-3.5" /> Enviar uma imagem
        </button>
      </div>

      {/* Grade de símbolos */}
      <div>
        <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">Ou escolha um símbolo</p>
        <div className="flex flex-wrap gap-1.5">
          {SIMBOLOS_DE_CHAT.map((s) => {
            const Icone = s.Icone;
            const ativo = !valor.fotoUrl && valor.icone === s.chave;
            return (
              <button
                key={s.chave}
                type="button"
                aria-label={`Símbolo ${s.rotulo}`}
                title={s.rotulo}
                onClick={() => escolherSimbolo(s.chave)}
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-md border transition-colors',
                  ativo ? 'border-primary ring-1 ring-primary' : 'border-border hover:bg-muted/50',
                )}
              >
                <Icone className="h-4 w-4" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Cores: paleta clara + cor livre (fundo e ícone) */}
      <div className="space-y-2">
        <p className="text-[11px] font-semibold text-muted-foreground">Cores</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {CORES_DE_CHAT.map((c) => (
            <button
              key={c.nome}
              type="button"
              aria-label={`Cor ${c.nome}`}
              title={c.nome}
              onClick={() => onChange({ ...valor, fotoUrl: null, corFundo: c.fundo, corIcone: c.icone, icone: valor.icone ?? 'balao' })}
              className="h-7 w-7 rounded-full border border-border"
              style={{ backgroundColor: c.fundo, color: c.icone }}
            >
              <span className="text-xs font-bold">A</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          <span className="flex items-center gap-1">Fundo:
            <SeletorCorLivre hexAtual={valor.corFundo ?? COR_FUNDO_PADRAO} onEscolher={(hex) => onChange({ ...valor, fotoUrl: null, corFundo: hex, icone: valor.icone ?? 'balao' })} />
          </span>
          <span className="flex items-center gap-1">Ícone:
            <SeletorCorLivre hexAtual={valor.corIcone ?? COR_ICONE_PADRAO} onEscolher={(hex) => onChange({ ...valor, fotoUrl: null, corIcone: hex, icone: valor.icone ?? 'balao' })} />
          </span>
        </div>
      </div>
    </div>
  );
}
```

> Nota ao implementar: confirme a assinatura real de `SeletorCorLivre` (Task 3) — `hexAtual`/`onEscolher`/`disabled`. Se divergir, ajuste as duas chamadas.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/components/chat/SeletorDeAparencia.test.tsx`
Expected: PASS. (Se `SeletorCorLivre` exigir contexto que o teste não tem, envolva-o num mock leve `vi.mock('@/components/shared/SeletorCorLivre', () => ({ SeletorCorLivre: () => null }))` no topo do teste e mantenha as asserções de símbolo/paleta.)

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/SeletorDeAparencia.tsx src/components/chat/SeletorDeAparencia.test.tsx
git commit -m "feat(chat): SeletorDeAparencia (simbolo + paleta + cor livre + imagem)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Ligar `AvatarDeChat` nas 8 superfícies (e Geral vira balão)

**Files:**
- Modify: `src/pages/Chat.tsx` (import; 8 blocos de avatar de grupo/Geral)

**Interfaces:**
- Consumes: `AvatarDeChat` (Task 4), `MessageCircle` (já importado), `Users2` (já importado).

> Cada bloco hoje é `<Avatar className="…"> {foto_url && <ImagemPrivada .../>} <AvatarFallback className="bg-primary text-primary-foreground"><Users2/Users .../></AvatarFallback> </Avatar>`. Troca por `<AvatarDeChat ... />` passando os campos da entidade. **Localize por conteúdo** (o arquivo é grande e mudou).

- [ ] **Step 1: Import**

```tsx
import { AvatarDeChat } from '@/components/chat/AvatarDeChat';
```

- [ ] **Step 2: Trocar os 4 blocos de GRUPO**

Cada ocorrência recebe os campos do grupo `g` (na lista) ou `activeGrupo` (cabeçalho/ficha). Exemplo — a **ficha lateral do grupo** (hoje ~1722-1729) vira:

```tsx
                            <AvatarDeChat
                              className="h-14 w-14 border border-border"
                              fotoUrl={activeGrupo?.foto_url}
                              icone={activeGrupo?.icone}
                              corFundo={activeGrupo?.cor_fundo}
                              corIcone={activeGrupo?.cor_icone}
                              IconePadrao={Users2}
                              nome={chatHeaderName}
                              tamanhoIcone="h-6 w-6"
                            />
```

Aplicar o mesmo nas outras 3 superfícies do grupo, com a MESMA entidade (`g` na lista/trilho, `activeGrupo` no cabeçalho) e mantendo o `className`/`tamanhoIcone` que o bloco tinha:
- **Trilho recolhido** (~214): `className="h-7 w-7 border border-border"`, `tamanhoIcone="h-3.5 w-3.5"`, `fotoUrl={g.foto_url}` `icone={g.icone}` `corFundo={g.cor_fundo}` `corIcone={g.cor_icone}` `IconePadrao={Users2}` `nome={g.nome}`.
- **Lista expandida** (~371): `className="h-8 w-8 border border-border"`, `tamanhoIcone="h-4 w-4"`, campos de `g`.
- **Cabeçalho** (~1601): `className="h-8 w-8 border border-border"`, `tamanhoIcone="h-4 w-4"`, campos de `activeGrupo`, `nome={chatHeaderName}`.

- [ ] **Step 3: Trocar os 4 blocos de GERAL — e o padrão vira `MessageCircle`**

As 4 superfícies do Geral usam `geralConfig` (`foto_url`/`icone`/`cor_fundo`/`cor_icone`) e **`IconePadrao={MessageCircle}`** (o novo padrão do Geral). Ex.: ficha (~1823) vira `<AvatarDeChat className="h-14 w-14 border border-border" fotoUrl={geralConfig?.foto_url} icone={geralConfig?.icone} corFundo={geralConfig?.cor_fundo} corIcone={geralConfig?.cor_icone} IconePadrao={MessageCircle} nome={geralNome} tamanhoIcone="h-6 w-6" />`. Aplicar nas outras 3 (trilho ~191 `h-7 w-7`/`h-3.5`; lista ~323 `h-8 w-8`/`h-4`; cabeçalho ~1636 `h-8 w-8`/`h-4`), sempre `IconePadrao={MessageCircle}`.

> A prop `geralFotoUrl` passada ao trilho recolhido (~1547) pode ser trocada por passar o `geralConfig` inteiro; se preferir manter a prop, o trilho lê `geralConfig` do mesmo jeito — o importante é o avatar do trilho recolhido virar `AvatarDeChat` com os 4 campos.

- [ ] **Step 4: Verificar**

```bash
npx tsc --noEmit -p tsconfig.app.json   # ≤ 36
npm run build
```
Confirme que os 8 blocos viraram `AvatarDeChat` (busque por `AvatarFallback` remanescente que ainda use `Users2`/`Users` de grupo/Geral — não deve sobrar nenhum nesses 8 pontos; os avatares de MEMBRO/DM com iniciais coloridas NÃO mudam).

- [ ] **Step 5: Commit**

```bash
git add src/pages/Chat.tsx
git commit -m "feat(chat): grupo e Geral desenham imagem/simbolo/cor pelo AvatarDeChat; Geral vira balao

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Editar aparência de grupo e Geral (hooks + fichas)

**Files:**
- Modify: `src/hooks/use-chat.ts` (`useUpdateChatGrupo`, `useUpdateChatGeralConfig`)
- Modify: `src/pages/Chat.tsx` (fichas de edição de grupo ~1706 e Geral ~1807; estados/handlers ~1385-1455)

**Interfaces:**
- Consumes: `SeletorDeAparencia` + `AparenciaValor` (Task 6).
- Produces: `useUpdateChatGrupo`/`useUpdateChatGeralConfig` passam a aceitar `icone?/corFundo?/corIcone?`.

- [ ] **Step 1: Estender `useUpdateChatGrupo`**

Em `use-chat.ts:207`, a assinatura vira `{ grupoId, nome, foto, icone, corFundo, corIcone }` e o objeto `updates` ganha os campos (só quando definidos):

```ts
    mutationFn: async ({ grupoId, nome, foto, icone, corFundo, corIcone }: { grupoId: string, nome?: string, foto?: File | null, icone?: string | null, corFundo?: string | null, corIcone?: string | null }) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Usuário não autenticado');

      const updates: { nome?: string; foto_url?: string; icone?: string | null; cor_fundo?: string | null; cor_icone?: string | null } = {};
      if (nome !== undefined) updates.nome = nome;
      if (icone !== undefined) updates.icone = icone;
      if (corFundo !== undefined) updates.cor_fundo = corFundo;
      if (corIcone !== undefined) updates.cor_icone = corIcone;

      if (foto) {
        /* …bloco de upload IGUAL ao de hoje… */
        updates.foto_url = urlData.publicUrl;
        // escolher imagem zera o símbolo:
        updates.icone = null;
      }

      const { error } = await supabase.from('chat_grupos').update(updates as any).eq('id', grupoId);
      if (error) throw error;
    },
```
(Manter o `onSuccess`/`onError` iguais. O bloco de upload de foto continua idêntico; a única adição no bloco `if (foto)` é `updates.icone = null` — imagem ganha do símbolo.)

- [ ] **Step 2: Estender `useUpdateChatGeralConfig`**

Mesma mudança em `use-chat.ts:332`: assinatura `{ nome, foto, icone, corFundo, corIcone }`, `updates` ganha os 3 campos, e no `if (foto)` acrescentar `updates.icone = null`. O `upsert({ empresa_id, ...updates }, { onConflict: 'empresa_id' })` continua.

- [ ] **Step 3: Substituir o input-de-foto da ficha do GRUPO pelo seletor**

Na ficha do grupo (`Chat.tsx` bloco `target.type === 'grupo'`, ~1708-1733), trocar o `<input type=file>` + botão-avatar-de-foto pelo `SeletorDeAparencia`, guardando o valor num estado e salvando ao mudar:

```tsx
                        <SeletorDeAparencia
                          nome={chatHeaderName}
                          IconePadrao={Users2}
                          valor={{ icone: activeGrupo?.icone ?? null, corFundo: activeGrupo?.cor_fundo ?? null, corIcone: activeGrupo?.cor_icone ?? null, fotoUrl: activeGrupo?.foto_url ?? null }}
                          onChange={(v) => activeGrupoId && updateGrupo.mutate({ grupoId: activeGrupoId, icone: v.icone, corFundo: v.corFundo, corIcone: v.corIcone })}
                          onEscolherImagem={(file) => activeGrupoId && updateGrupo.mutate({ grupoId: activeGrupoId, foto: file })}
                        />
```
O nome (Pencil/Check inline) do grupo permanece ao lado, como hoje. Importar `SeletorDeAparencia` no topo e remover o `grupoFotoInputRef`/`handleGrupoFotoSelect` que ficaram sem uso (ou reaproveitar `handleGrupoFotoSelect` como o corpo de `onEscolherImagem`).

- [ ] **Step 4: Substituir o input-de-foto da ficha do GERAL pelo seletor**

Na ficha do Geral (~1809-1834), o mesmo, com `IconePadrao={MessageCircle}` e as mutações do Geral:

```tsx
                          <SeletorDeAparencia
                            nome={geralNome}
                            IconePadrao={MessageCircle}
                            valor={{ icone: geralConfig?.icone ?? null, corFundo: geralConfig?.cor_fundo ?? null, corIcone: geralConfig?.cor_icone ?? null, fotoUrl: geralConfig?.foto_url ?? null }}
                            onChange={(v) => updateGeralConfig.mutate({ icone: v.icone, corFundo: v.corFundo, corIcone: v.corIcone })}
                            onEscolherImagem={(file) => updateGeralConfig.mutate({ foto: file })}
                          />
```

- [ ] **Step 5: Verificar (banco aplicado + como vendedor comum)**

```bash
npx tsc --noEmit -p tsconfig.app.json   # ≤ 36
npm run build
```
Com o banco aplicado (Task 5 passo 6): editar símbolo/cor de um grupo e do Geral; conferir que salva e reflete nas 8 superfícies; **testar como vendedor comum** que só quem tem permissão edita (o Geral segue exigindo gestor/admin; a mutation mostra a mensagem de erro se a RLS recusar).

- [ ] **Step 6: Commit**

```bash
git add src/hooks/use-chat.ts src/pages/Chat.tsx
git commit -m "feat(chat): editar simbolo/cor/imagem de grupo e Geral pela ficha lateral

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Escolher aparência ao CRIAR o grupo

**Files:**
- Modify: `src/components/chat/CreateGroupDialog.tsx`

**Interfaces:**
- Consumes: `SeletorDeAparencia`/`AparenciaValor` (Task 6).

- [ ] **Step 1: Estado da aparência**

Trocar o estado só-de-foto por aparência completa. Perto de `const [foto, setFoto] = useState...` (linha 44-45), acrescentar:

```tsx
  const [aparencia, setAparencia] = useState<{ icone: string | null; corFundo: string | null; corIcone: string | null }>({ icone: null, corFundo: null, corIcone: null });
```
(Manter `foto`/`fotoPreview` para a imagem enviada.)

- [ ] **Step 2: Trocar o botão-avatar-de-foto pelo seletor**

O bloco do avatar de foto (linhas 157-184) vira o `SeletorDeAparencia`:

```tsx
          <SeletorDeAparencia
            nome={nome || 'Grupo'}
            IconePadrao={Users2}
            valor={{ icone: aparencia.icone, corFundo: aparencia.corFundo, corIcone: aparencia.corIcone, fotoUrl: fotoPreview }}
            onChange={(v) => { setAparencia({ icone: v.icone, corFundo: v.corFundo, corIcone: v.corIcone }); if (v.icone) { setFoto(null); setFotoPreview(null); } }}
            onEscolherImagem={(file) => { setFoto(file); setFotoPreview(URL.createObjectURL(file)); setAparencia((a) => ({ ...a, icone: null })); }}
          />
```
Importar `SeletorDeAparencia` no topo; `handleFotoSelect`/`fotoInputRef` podem sair (o seletor cuida da imagem).

- [ ] **Step 3: Gravar a aparência no insert**

No `handleCreate`, no `insert` de `chat_grupos` (linhas 86-95), acrescentar os campos quando escolhidos:

```tsx
        .insert({
          nome: nome.trim(),
          empresa_id: vendedor.empresa_id!,
          criado_por: vendedor.id,
          icone: aparencia.icone,
          cor_fundo: aparencia.corFundo,
          cor_icone: aparencia.corIcone,
        } as any)
```
O bloco de upload de foto (97-114) continua igual (só roda quando `foto` foi escolhida; nesse caso `aparencia.icone` já está nulo). No reset ao fechar, zerar `aparencia` também.

- [ ] **Step 4: Verificar**

```bash
npx tsc --noEmit -p tsconfig.app.json   # ≤ 36
npm run build
```
Com o banco aplicado: criar um grupo escolhendo um símbolo + cor → aparece nas 8 superfícies; criar com imagem → a imagem ganha.

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/CreateGroupDialog.tsx
git commit -m "feat(chat): escolher simbolo/cor/imagem ja na criacao do grupo

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-review (feito na escrita)

- **Cobertura do spec:** #1 → Task 1; catálogos → Task 2; extrair color picker → Task 3; AvatarDeChat → Task 4; banco+tipos → Task 5; seletor → Task 6; 8 superfícies + Geral balão → Task 7; editar (hooks+fichas) → Task 8; criar → Task 9. Todas as superfícies (8 avatar + 3 seletor) cobertas (AGENTS §3).
- **Sem placeholder:** peças novas com código completo; fiação com âncora + trecho.
- **Consistência de tipos:** `AparenciaValor` (Task 6) usado em 8 e 9; `AvatarDeChat` props (Task 4) idênticas em 6 e 7; colunas `icone/cor_fundo/cor_icone` batem entre migration (5), tipos (5), hooks (8) e inserts (9); `icone` = chave do catálogo (2) em todo lugar.
- **Ordem:** 1 (WhatsApp, sem banco) → 2,3,4 (peças) → 5 (banco, **aplicação gated**) → 6 → 7,8,9 (fiação; 8 e 9 dependem do banco aplicado para funcionar de verdade, mas compilam com os tipos da Task 5).

## Verificação final (antes de publicar — os "três não")
Suíte **inteira** verde · tsc não sobe · build compila · lint não sobe · RLS testada como vendedor comum · banco (Task 5) confirmado aplicado antes de publicar as Tasks 8/9.
