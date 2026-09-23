# Editar grupo/Geral, símbolos de obra e cores claras+escuras — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans para implementar tarefa a tarefa. Os passos usam checkbox (`- [ ]`).

**Goal:** Trocar a edição de grupo/Geral (hoje solta na ficha e vazando da tela) por um painel único "Editar", com estilo em cima e participantes (adicionar/remover) embaixo; e enriquecer o estilo com +5 símbolos de obra e cores claras+escuras (padrão laranja escuro).

**Architecture:** Catálogos puros (símbolos, cores) alimentam `SeletorDeAparencia` (grade + duas fileiras de cor). Uma peça nova `SeletorDeMembros` (extraída de `CreateGroupDialog`, sem mudar a criação) e um `EditarConversaDialog` (grupo e Geral) reúnem estilo + participantes num modal responsivo. Um hook novo `useRemoveChatGrupoMembros` faz a remoção com checagem de linhas. A ficha lateral em `Chat.tsx` vira só leitura + botão "Editar". Nenhuma mudança de banco.

**Tech Stack:** React 18 + TypeScript + Vite, shadcn/Radix (Dialog via `ConteudoDialogo`), TanStack Query, Supabase, Vitest + Testing Library, lucide-react.

**Spec:** `docs/superpowers/specs/2026-09-23-editar-grupo-simbolos-e-cores-design.md`

## Global Constraints

- **PT-BR** em interface, comentário, teste, commit.
- **Nenhuma mudança de banco** (sem migration). As colunas `icone/cor_fundo/cor_icone` já existem; a política de `DELETE` de `chat_grupo_membros` já permite criador/gestor.
- **Não mudar o COMPORTAMENTO da criação de grupo** — só trocar a lista inline pela peça compartilhada, mantendo texto e fluxo.
- **Exclusão com contagem (§4.6 do CLAUDE.md):** `.delete({ count: 'exact' })`, tratar `count === 0` como recusa (nunca `!count`), com `recusaSemErro(oQueNaoMudou, porQuePodeTerSido)` de `src/lib/recusa-do-banco.ts`.
- **Reaproveitar peças existentes:** `SeletorDeAparencia`, `ConteudoDialogo/CabecalhoDialogo/CorpoDialogo/RodapeDialogo`, `AvatarDeChat`.
- **Cores em hex, aplicadas por `style` inline.**
- **Símbolos:** confirmar que cada ícone existe no `lucide-react` instalado antes de usar (o build quebra se faltar).
- **Verificação (os três "não"):** `npm run test` (a suíte **inteira**; nº não cai), `npx tsc --noEmit -p tsconfig.app.json` (não sobe da base 35), `npm run build` (compila), `npm run lint` (nº não sobe).

---

## Estrutura de arquivos

- `src/lib/simbolos-de-chat.ts` (+ `.test.ts`) — +5 símbolos de obra.
- `src/lib/cores-de-chat.ts` (+ `.test.ts`) — cada cor ganha versão escura; padrão vira laranja escuro.
- `src/components/chat/SeletorDeAparencia.tsx` (+ `.test.tsx`) — duas fileiras de cor.
- `src/components/chat/SeletorDeMembros.tsx` (+ `.test.tsx`) — **novo**, extraído de `CreateGroupDialog`.
- `src/components/chat/CreateGroupDialog.tsx` — passa a consumir `SeletorDeMembros` (comportamento idêntico).
- `src/hooks/use-chat.ts` — **novo** `useRemoveChatGrupoMembros`.
- `src/components/chat/EditarConversaDialog.tsx` (+ `.test.tsx`) — **novo**, o painel de editar (grupo e Geral).
- `src/pages/Chat.tsx` — fichas de grupo e Geral viram leitura + botão "Editar"; remove o diálogo antigo de "Adicionar participante".

---

## Task 1: +5 símbolos de obra

**Files:**
- Modify: `src/lib/simbolos-de-chat.ts`
- Test: `src/lib/simbolos-de-chat.test.ts`

**Interfaces:**
- Consumes: nada novo.
- Produces: `SIMBOLOS_DE_CHAT` com 15 entradas (as 10 atuais + `capacete/martelo/regua/predio/caminhao`); `simboloDoCatalogo` inalterado.

- [ ] **Passo 1: Ajustar o teste (falha primeiro)**

Em `src/lib/simbolos-de-chat.test.ts`, trocar `10` por `15` nas duas asserções e acrescentar uma dos símbolos de obra:

```ts
describe('SIMBOLOS_DE_CHAT', () => {
  it('tem 15 símbolos com chaves únicas', () => {
    expect(SIMBOLOS_DE_CHAT).toHaveLength(15);
    const chaves = SIMBOLOS_DE_CHAT.map((s) => s.chave);
    expect(new Set(chaves).size).toBe(15);
  });
  it('o balão de chat está na lista (padrão do Geral)', () => {
    expect(SIMBOLOS_DE_CHAT.some((s) => s.chave === 'balao')).toBe(true);
  });
  it('inclui símbolos de obra/construção', () => {
    for (const chave of ['capacete', 'martelo', 'regua', 'predio', 'caminhao']) {
      expect(SIMBOLOS_DE_CHAT.some((s) => s.chave === chave)).toBe(true);
    }
  });
  it('chave conhecida devolve o símbolo; desconhecida/nula devolve null', () => {
    expect(simboloDoCatalogo('lampada')?.chave).toBe('lampada');
    expect(simboloDoCatalogo('nao-existe')).toBeNull();
    expect(simboloDoCatalogo(null)).toBeNull();
    expect(simboloDoCatalogo(undefined)).toBeNull();
  });
});
```

- [ ] **Passo 2: Rodar o teste e ver falhar**

Run: `npx vitest run src/lib/simbolos-de-chat.test.ts`
Expected: FAIL (`toHaveLength(15)`).

- [ ] **Passo 3: Confirmar que os ícones existem no lucide-react**

Run: `node -e "const l=require('lucide-react'); console.log(['HardHat','Hammer','Ruler','Building2','Truck'].map(n=>n+':'+(n in l)).join(' '))"`
Expected: todos `:true`. Se algum vier `:false`, escolher equivalente que exista (ex.: `Construction`, `Wrench`, `Warehouse`, `Building`) e usar o mesmo nome na chave/rótulo coerentemente.

- [ ] **Passo 4: Acrescentar os 5 símbolos**

Em `src/lib/simbolos-de-chat.ts`, incluir os ícones no import e as 5 entradas ao fim do array:

```ts
import {
  MessageCircle, Users2, Lightbulb, NotebookPen, Briefcase,
  Target, Megaphone, Calendar, ListChecks, Folder,
  HardHat, Hammer, Ruler, Building2, Truck, type LucideIcon,
} from 'lucide-react';
```

```ts
  { chave: 'pasta', rotulo: 'Pasta', Icone: Folder },
  { chave: 'capacete', rotulo: 'Capacete de obra', Icone: HardHat },
  { chave: 'martelo', rotulo: 'Martelo', Icone: Hammer },
  { chave: 'regua', rotulo: 'Régua', Icone: Ruler },
  { chave: 'predio', rotulo: 'Prédio', Icone: Building2 },
  { chave: 'caminhao', rotulo: 'Caminhão', Icone: Truck },
];
```

- [ ] **Passo 5: Rodar o teste e ver passar**

Run: `npx vitest run src/lib/simbolos-de-chat.test.ts`
Expected: PASS.

- [ ] **Passo 6: Commit**

```bash
git add src/lib/simbolos-de-chat.ts src/lib/simbolos-de-chat.test.ts
git commit -m "feat(chat): +5 simbolos de obra (capacete, martelo, regua, predio, caminhao)"
```

---

## Task 2: Cores com versão escura + padrão laranja escuro

**Files:**
- Modify: `src/lib/cores-de-chat.ts`
- Test: `src/lib/cores-de-chat.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `ParDeCor` ganha `fundoEscuro: string; iconeEscuro: string` (mantém `fundo`/`icone` = versão clara — não quebra o consumidor atual). `COR_FUNDO_PADRAO = '#FF5A1F'`, `COR_ICONE_PADRAO = '#FFFFFF'`.

- [ ] **Passo 1: Ajustar o teste (falha primeiro)**

`src/lib/cores-de-chat.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CORES_DE_CHAT, COR_FUNDO_PADRAO, COR_ICONE_PADRAO } from './cores-de-chat';

describe('CORES_DE_CHAT', () => {
  it('tem 8 cores com nomes únicos e hex válido (claro e escuro)', () => {
    expect(CORES_DE_CHAT).toHaveLength(8);
    expect(new Set(CORES_DE_CHAT.map((c) => c.nome)).size).toBe(8);
    for (const c of CORES_DE_CHAT) {
      for (const hex of [c.fundo, c.icone, c.fundoEscuro, c.iconeEscuro]) {
        expect(hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    }
  });
  it('a versão escura tem o ícone branco', () => {
    for (const c of CORES_DE_CHAT) {
      expect(c.iconeEscuro.toUpperCase()).toBe('#FFFFFF');
    }
  });
  it('o padrão é o laranja escuro (fundo forte + ícone branco)', () => {
    expect(COR_FUNDO_PADRAO.toUpperCase()).toBe('#FF5A1F');
    expect(COR_ICONE_PADRAO.toUpperCase()).toBe('#FFFFFF');
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/cores-de-chat.test.ts`
Expected: FAIL.

- [ ] **Passo 3: Reescrever o catálogo**

`src/lib/cores-de-chat.ts`:

```ts
/** Pares de cor para a aparência de grupo/Geral. Cada cor tem duas versões:
 *  - clara: fundo suave + ícone na cor forte (`fundo`/`icone`);
 *  - escura: fundo na cor forte + ícone branco (`fundoEscuro`/`iconeEscuro`),
 *    o visual clássico do sistema. Cor livre ajusta fundo e ícone à parte. */
export interface ParDeCor {
  nome: string;
  fundo: string;
  icone: string;
  fundoEscuro: string;
  iconeEscuro: string;
}

const BRANCO = '#FFFFFF';

export const CORES_DE_CHAT: readonly ParDeCor[] = [
  { nome: 'Laranja', fundo: '#FFE9E0', icone: '#FF5A1F', fundoEscuro: '#FF5A1F', iconeEscuro: BRANCO },
  { nome: 'Azul', fundo: '#E3F0FF', icone: '#2563EB', fundoEscuro: '#2563EB', iconeEscuro: BRANCO },
  { nome: 'Verde', fundo: '#E4F7EC', icone: '#16A34A', fundoEscuro: '#16A34A', iconeEscuro: BRANCO },
  { nome: 'Roxo', fundo: '#F1E9FF', icone: '#7C3AED', fundoEscuro: '#7C3AED', iconeEscuro: BRANCO },
  { nome: 'Rosa', fundo: '#FFE7F1', icone: '#DB2777', fundoEscuro: '#DB2777', iconeEscuro: BRANCO },
  { nome: 'Âmbar', fundo: '#FFF3D6', icone: '#D97706', fundoEscuro: '#D97706', iconeEscuro: BRANCO },
  { nome: 'Teal', fundo: '#DEF7F5', icone: '#0D9488', fundoEscuro: '#0D9488', iconeEscuro: BRANCO },
  { nome: 'Cinza', fundo: '#ECEEF1', icone: '#475569', fundoEscuro: '#475569', iconeEscuro: BRANCO },
];

/** Usadas quando a pessoa escolhe um símbolo mas ainda não mexeu na cor:
 *  o laranja escuro + branco, o padrão clássico do sistema. */
export const COR_FUNDO_PADRAO = '#FF5A1F';
export const COR_ICONE_PADRAO = '#FFFFFF';
```

- [ ] **Passo 4: Rodar e ver passar**

Run: `npx vitest run src/lib/cores-de-chat.test.ts`
Expected: PASS.

- [ ] **Passo 5: Conferir que nada mais quebrou (o consumidor ainda usa `fundo`/`icone`)**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: não sobe da base.

- [ ] **Passo 6: Commit**

```bash
git add src/lib/cores-de-chat.ts src/lib/cores-de-chat.test.ts
git commit -m "feat(chat): cores com versao escura e padrao laranja escuro + branco"
```

---

## Task 3: SeletorDeAparencia — duas fileiras de cor

**Files:**
- Modify: `src/components/chat/SeletorDeAparencia.tsx`
- Test: `src/components/chat/SeletorDeAparencia.test.tsx`

**Interfaces:**
- Consumes: `CORES_DE_CHAT` (com `fundoEscuro`/`iconeEscuro`), `COR_FUNDO_PADRAO/COR_ICONE_PADRAO` (novos valores), `SIMBOLOS_DE_CHAT` (15).
- Produces: mesmo componente e `AparenciaValor`; agora com botões de cor clara **e** escura (aria-label `Cor <nome> (clara|escura)`).

- [ ] **Passo 1: Teste (falha primeiro)**

Acrescentar ao `src/components/chat/SeletorDeAparencia.test.tsx` um caso que exige as duas fileiras (o teste existente do arquivo permanece):

```tsx
it('mostra a versão escura de cada cor e aplica fundo forte + ícone branco', () => {
  const onChange = vi.fn();
  render(
    <SeletorDeAparencia
      valor={{ icone: 'balao', corFundo: null, corIcone: null, fotoUrl: null }}
      onChange={onChange}
      onEscolherImagem={() => {}}
      IconePadrao={MessageCircle}
      nome="Grupo"
    />,
  );
  const laranjaEscura = screen.getByLabelText('Cor Laranja (escura)');
  fireEvent.click(laranjaEscura);
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({ corFundo: '#FF5A1F', corIcone: '#FFFFFF', fotoUrl: null }),
  );
});
```

(Imports no topo do teste, se ainda não houver: `import { render, screen, fireEvent } from '@testing-library/react'; import { vi } from 'vitest'; import { MessageCircle } from 'lucide-react'; import { SeletorDeAparencia } from './SeletorDeAparencia';`. Se `SeletorDeAparencia` renderizar `AvatarDeChat`, que usa `ImagemPrivada`/`useQuery`, envolver em `QueryClientProvider` como nos outros testes do componente.)

- [ ] **Passo 2: Rodar e ver falhar**

Run: `npx vitest run src/components/chat/SeletorDeAparencia.test.tsx`
Expected: FAIL (`Cor Laranja (escura)` não existe).

- [ ] **Passo 3: Duas fileiras no componente**

Em `SeletorDeAparencia.tsx`, trocar o bloco da paleta (o `<div className="flex flex-wrap items-center gap-1.5">` com o `.map`) por duas fileiras. Um helper aplica a cor:

```tsx
{/* Cores: paleta clara + escura + cor livre (fundo e ícone) */}
<div className="space-y-2">
  <p className="text-[11px] font-semibold text-muted-foreground">Cores</p>
  {([
    { titulo: 'Claras', variante: 'clara' as const },
    { titulo: 'Escuras', variante: 'escura' as const },
  ]).map(({ titulo, variante }) => (
    <div key={variante}>
      <p className="mb-1 text-[10px] text-muted-foreground">{titulo}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {CORES_DE_CHAT.map((c) => {
          const fundo = variante === 'clara' ? c.fundo : c.fundoEscuro;
          const icone = variante === 'clara' ? c.icone : c.iconeEscuro;
          return (
            <button
              key={`${c.nome}-${variante}`}
              type="button"
              aria-label={`Cor ${c.nome} (${variante})`}
              title={`${c.nome} (${titulo.toLowerCase()})`}
              onClick={() => onChange({ ...valor, fotoUrl: null, corFundo: fundo, corIcone: icone, icone: valor.icone ?? 'balao' })}
              className="h-7 w-7 rounded-full border border-border"
              style={{ backgroundColor: fundo, color: icone }}
            >
              <span className="text-xs font-bold">A</span>
            </button>
          );
        })}
      </div>
    </div>
  ))}
  <div className="flex items-center gap-3 text-[11px]">
    <span className="flex items-center gap-1">Fundo:
      <SeletorCorLivre hexAtual={valor.corFundo ?? COR_FUNDO_PADRAO} onEscolher={(hex) => onChange({ ...valor, fotoUrl: null, corFundo: hex, icone: valor.icone ?? 'balao' })} />
    </span>
    <span className="flex items-center gap-1">Ícone:
      <SeletorCorLivre hexAtual={valor.corIcone ?? COR_ICONE_PADRAO} onEscolher={(hex) => onChange({ ...valor, fotoUrl: null, corIcone: hex, icone: valor.icone ?? 'balao' })} />
    </span>
  </div>
</div>
```

`escolherSimbolo` já usa `COR_FUNDO_PADRAO`/`COR_ICONE_PADRAO` — passa a cair no laranja escuro sem mudança extra.

- [ ] **Passo 4: Rodar e ver passar (o arquivo inteiro)**

Run: `npx vitest run src/components/chat/SeletorDeAparencia.test.tsx`
Expected: PASS (o novo caso e os antigos).

- [ ] **Passo 5: Commit**

```bash
git add src/components/chat/SeletorDeAparencia.tsx src/components/chat/SeletorDeAparencia.test.tsx
git commit -m "feat(chat): SeletorDeAparencia com fileiras de cor clara e escura"
```

---

## Task 4: Extrair SeletorDeMembros (criação segue igual)

**Files:**
- Create: `src/components/chat/SeletorDeMembros.tsx`
- Test: `src/components/chat/SeletorDeMembros.test.tsx`
- Modify: `src/components/chat/CreateGroupDialog.tsx`

**Interfaces:**
- Produces: `interface MembroSelecionavel { id: string; nome: string; email?: string; role: string }` e
  `SeletorDeMembros({ titulo, membros, meuId, selecionados, onChange, altura? }: { titulo: string; membros: MembroSelecionavel[]; meuId: string | null; selecionados: string[]; onChange: (ids: string[]) => void; altura?: string })`.
- Consumes (Task 6/CreateGroupDialog): esse componente.

- [ ] **Passo 1: Teste (falha primeiro)**

`src/components/chat/SeletorDeMembros.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { SeletorDeMembros } from './SeletorDeMembros';

const membros = [
  { id: 'eu', nome: 'Eu Mesmo', role: 'gestor' },
  { id: 'a', nome: 'Ana Souza', role: 'vendedor' },
  { id: 'b', nome: 'Bruno Lima', role: 'vendedor' },
];

it('não lista o próprio usuário e alterna a seleção', () => {
  const onChange = vi.fn();
  render(<SeletorDeMembros titulo="Membros" membros={membros} meuId="eu" selecionados={[]} onChange={onChange} />);
  expect(screen.queryByText('Eu Mesmo')).toBeNull();
  fireEvent.click(screen.getByText('Ana Souza'));
  expect(onChange).toHaveBeenCalledWith(['a']);
});

it('"Selecionar todos" marca todos os outros; "Remover todos" limpa', () => {
  const onChange = vi.fn();
  const { rerender } = render(<SeletorDeMembros titulo="Membros" membros={membros} meuId="eu" selecionados={[]} onChange={onChange} />);
  fireEvent.click(screen.getByText('Selecionar todos'));
  expect(onChange).toHaveBeenCalledWith(['a', 'b']);
  rerender(<SeletorDeMembros titulo="Membros" membros={membros} meuId="eu" selecionados={['a', 'b']} onChange={onChange} />);
  fireEvent.click(screen.getByText('Remover todos'));
  expect(onChange).toHaveBeenCalledWith([]);
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `npx vitest run src/components/chat/SeletorDeMembros.test.tsx`
Expected: FAIL (módulo não existe).

- [ ] **Passo 3: Criar o componente (miolo idêntico ao de hoje na criação)**

`src/components/chat/SeletorDeMembros.tsx`:

```tsx
import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Users2, Search } from 'lucide-react';

export interface MembroSelecionavel {
  id: string;
  nome: string;
  email?: string;
  role: string;
}

function getInitials(name: string) {
  return name.split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

const COLORS = ['bg-primary', 'bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-pink-500', 'bg-amber-500'];
function colorForId(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}

export function SeletorDeMembros({
  titulo, membros, meuId, selecionados, onChange, altura = 'h-[220px]',
}: {
  titulo: string;
  membros: MembroSelecionavel[];
  meuId: string | null;
  selecionados: string[];
  onChange: (ids: string[]) => void;
  altura?: string;
}) {
  const [busca, setBusca] = useState('');
  const outros = membros.filter((m) => m.id !== meuId);
  const todosMarcados = outros.length > 0 && outros.every((m) => selecionados.includes(m.id));
  const filtrados = outros.filter((m) => m.nome.toLowerCase().includes(busca.trim().toLowerCase()));

  const alternar = (id: string) =>
    onChange(selecionados.includes(id) ? selecionados.filter((m) => m !== id) : [...selecionados, id]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{titulo}</Label>
        {outros.length > 0 && (
          <button
            type="button"
            onClick={() => onChange(todosMarcados ? [] : outros.map((m) => m.id))}
            className="text-[11px] font-semibold text-primary hover:underline"
          >
            {todosMarcados ? 'Remover todos' : 'Selecionar todos'}
          </button>
        )}
      </div>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input placeholder="Buscar membro..." value={busca} onChange={(e) => setBusca(e.target.value)} className="h-8 pl-8 text-xs" />
      </div>
      <ScrollArea className={`${altura} border rounded-lg p-2`}>
        <div className="space-y-1">
          {outros.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 py-8">
              <Users2 className="h-8 w-8 opacity-30" />
              <p className="text-xs text-center">Nenhum outro membro na sua empresa. Cadastre funcionários primeiro.</p>
            </div>
          )}
          {outros.length > 0 && filtrados.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 py-8">
              <Search className="h-8 w-8 opacity-30" />
              <p className="text-xs text-center">Nenhum membro encontrado para "{busca}".</p>
            </div>
          )}
          {filtrados.map((m) => (
            <label key={m.id} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted/50 cursor-pointer transition-colors">
              <Checkbox checked={selecionados.includes(m.id)} onCheckedChange={() => alternar(m.id)} />
              <Avatar className="h-7 w-7">
                <AvatarFallback className={`${colorForId(m.id)} text-white text-[9px] font-semibold`}>
                  {getInitials(m.nome)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-foreground truncate">{m.nome}</p>
                <p className="text-[10px] text-muted-foreground capitalize">{m.role}</p>
              </div>
            </label>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
```

- [ ] **Passo 4: Rodar e ver passar**

Run: `npx vitest run src/components/chat/SeletorDeMembros.test.tsx`
Expected: PASS.

- [ ] **Passo 5: CreateGroupDialog consome a peça (comportamento idêntico)**

Em `CreateGroupDialog.tsx`, substituir todo o bloco `<div className="space-y-2">...</div>` da lista de membros (o que começa em `<div className="space-y-2">` com `<Label>Membros</Label>` e vai até o `<ScrollArea>` fechar, incluindo o parágrafo "{selectedMembers.length} selecionado(s) + você") por:

```tsx
          <div className="space-y-2">
            <SeletorDeMembros
              titulo="Membros"
              membros={members}
              meuId={myId}
              selecionados={selectedMembers}
              onChange={setSelectedMembers}
            />
            {selectedMembers.length > 0 && (
              <p className="text-[10px] text-muted-foreground">
                {selectedMembers.length} selecionado(s) + você
              </p>
            )}
          </div>
```

Import: `import { SeletorDeMembros } from '@/components/chat/SeletorDeMembros';`. Depois **remover os agora não usados** de `CreateGroupDialog.tsx`: `toggleMember`, `otherMembers`, `allSelected`, `memberSearch`/`setMemberSearch`, e os imports que só serviam à lista (`Checkbox`, `Search`, `ScrollArea`, `Avatar`, `AvatarFallback`, `getInitials`, `colorForId`, `COLORS`, `Label` se não usado noutro ponto — conferir). O `onOpenChange` que fazia `setMemberSearch('')` perde essa linha.

- [ ] **Passo 6: Conferir a criação (comportamento intacto)**

Run: `npx tsc --noEmit -p tsconfig.app.json` e `npx vitest run src/components/chat`
Expected: tsc não sobe; testes passam. (Verificação manual da criação fica para a revisão ampla.)

- [ ] **Passo 7: Commit**

```bash
git add src/components/chat/SeletorDeMembros.tsx src/components/chat/SeletorDeMembros.test.tsx src/components/chat/CreateGroupDialog.tsx
git commit -m "refactor(chat): extrai SeletorDeMembros e reusa na criacao de grupo"
```

---

## Task 5: Hook de remover participante (com contagem)

**Files:**
- Modify: `src/hooks/use-chat.ts`
- Test: `src/hooks/remover-membro-grupo.test.tsx`

**Interfaces:**
- Produces: `useRemoveChatGrupoMembros()` → mutation `{ grupoId: string; usuarioIds: string[] }`; faz `DELETE` com `{ count: 'exact' }`, `count === 0` (com `usuarioIds.length > 0`) vira recusa via `recusaSemErro`.

- [ ] **Passo 1: Teste (falha primeiro)**

`src/hooks/remover-membro-grupo.test.tsx` — mesmo padrão de mock de `src/hooks/zero-linhas-nao-e-sucesso.test.tsx` (ler esse arquivo para copiar a forma de mockar `supabase` e `QueryClientProvider`). O teste prova que `count === 0` estoura:

```tsx
// Espírito do teste (ajustar ao mock existente em zero-linhas-nao-e-sucesso.test.tsx):
// - delete() encadeia .eq('grupo_id', ...).in('usuario_id', ...) e resolve { error: null, count: 0 }
// - mutateAsync({ grupoId: 'g', usuarioIds: ['a'] }) REJEITA (recusa), não resolve.
// - quando count = 1, resolve normalmente.
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `npx vitest run src/hooks/remover-membro-grupo.test.tsx`
Expected: FAIL (hook não existe).

- [ ] **Passo 3: Escrever o hook**

Em `src/hooks/use-chat.ts`, ao lado de `useAddChatGrupoMembros`, importar `recusaSemErro` (`import { recusaSemErro } from '@/lib/recusa-do-banco';` no topo, se ainda não houver) e acrescentar:

```ts
export function useRemoveChatGrupoMembros() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ grupoId, usuarioIds }: { grupoId: string; usuarioIds: string[] }) => {
      if (usuarioIds.length === 0) return;
      const { error, count } = await supabase
        .from('chat_grupo_membros')
        .delete({ count: 'exact' })
        .eq('grupo_id', grupoId)
        .in('usuario_id', usuarioIds);
      if (error) throw error;
      // 🔴 Zero linhas não é sucesso (CLAUDE.md §4.6): a RLS recusa DELETE sem erro.
      if (count === 0) {
        throw new Error(recusaSemErro(
          'O participante NÃO foi removido: ele continua no grupo.',
          'Remover participante é permissão de quem criou o grupo ou de um gestor.',
        ));
      }
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['chat-grupo-membros', variables.grupoId] });
      toast.success('Participante removido do grupo.');
    },
    onError: (err: any) => {
      console.error('Erro ao remover participante:', err);
      toast.error(err?.message || 'Não foi possível remover o participante.');
    },
  });
}
```

- [ ] **Passo 4: Rodar e ver passar**

Run: `npx vitest run src/hooks/remover-membro-grupo.test.tsx`
Expected: PASS.

- [ ] **Passo 5: Commit**

```bash
git add src/hooks/use-chat.ts src/hooks/remover-membro-grupo.test.tsx
git commit -m "feat(chat): useRemoveChatGrupoMembros com checagem de linhas (zero = recusa)"
```

---

## Task 6: EditarConversaDialog (grupo e Geral)

**Files:**
- Create: `src/components/chat/EditarConversaDialog.tsx`
- Test: `src/components/chat/EditarConversaDialog.test.tsx`

**Interfaces:**
- Consumes: `SeletorDeAparencia`, `SeletorDeMembros`, `useUpdateChatGrupo`, `useUpdateChatGeralConfig`, `useAddChatGrupoMembros`, `useRemoveChatGrupoMembros`, `ChatGrupo`, `ChatGeralConfig`.
- Produces:
  ```ts
  type AlvoEdicao =
    | { tipo: 'grupo'; grupo: ChatGrupo }
    | { tipo: 'geral'; config: ChatGeralConfig | null };
  EditarConversaDialog({ alvo, membros, membrosAtuais, meuId, podeEditar }: {
    alvo: AlvoEdicao;
    membros: MembroSelecionavel[];
    membrosAtuais?: { id: string }[];
    meuId: string | null;
    podeEditar: boolean;
  })
  ```
  Renderiza o próprio botão-gatilho "Editar grupo"/"Editar" **só quando `podeEditar`**; senão retorna `null`.

- [ ] **Passo 1: Teste (falha primeiro)**

`src/components/chat/EditarConversaDialog.test.tsx` — dois casos mínimos (mockar os hooks de `@/hooks/use-chat` com `vi.mock`, e envolver em `QueryClientProvider`):

```tsx
// 1) podeEditar=false → não renderiza botão nenhum (queryByText('Editar grupo') === null).
// 2) grupo: abrir o diálogo, desmarcar um membro atual e marcar um novo, clicar em "Salvar":
//    - updateGrupo chamado com o nome/estilo;
//    - addGrupoMembros chamado com os marcados novos;
//    - removeGrupoMembros chamado com os desmarcados.
//    (Basta asSerir que os mutate/mutateAsync dos mocks foram chamados com os ids certos.)
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `npx vitest run src/components/chat/EditarConversaDialog.test.tsx`
Expected: FAIL (módulo não existe).

- [ ] **Passo 3: Escrever o componente**

`src/components/chat/EditarConversaDialog.tsx`:

```tsx
import { useState } from 'react';
import { Dialog, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ConteudoDialogo, CabecalhoDialogo, CorpoDialogo, RodapeDialogo } from '@/components/shared/DialogoResponsivo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pencil, Loader2, Users2, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { SeletorDeAparencia, AparenciaValor } from '@/components/chat/SeletorDeAparencia';
import { SeletorDeMembros, MembroSelecionavel } from '@/components/chat/SeletorDeMembros';
import {
  useUpdateChatGrupo, useUpdateChatGeralConfig,
  useAddChatGrupoMembros, useRemoveChatGrupoMembros,
  ChatGrupo, ChatGeralConfig,
} from '@/hooks/use-chat';

export type AlvoEdicao =
  | { tipo: 'grupo'; grupo: ChatGrupo }
  | { tipo: 'geral'; config: ChatGeralConfig | null };

export function EditarConversaDialog({
  alvo, membros, membrosAtuais = [], meuId, podeEditar,
}: {
  alvo: AlvoEdicao;
  membros: MembroSelecionavel[];
  membrosAtuais?: { id: string }[];
  meuId: string | null;
  podeEditar: boolean;
}) {
  const ehGrupo = alvo.tipo === 'grupo';
  const origem = ehGrupo ? alvo.grupo : alvo.config;
  const nomeInicial = origem?.nome ?? (ehGrupo ? '' : 'Chat Geral');

  // Membros atuais que a lista gerencia (exclui o próprio, como na criação).
  const atuaisGerenciados = membrosAtuais.map((m) => m.id).filter((id) => id !== meuId);

  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState(nomeInicial);
  const [aparencia, setAparencia] = useState<AparenciaValor>({
    icone: origem?.icone ?? null,
    corFundo: origem?.cor_fundo ?? null,
    corIcone: origem?.cor_icone ?? null,
    fotoUrl: origem?.foto_url ?? null,
  });
  const [novaFoto, setNovaFoto] = useState<File | null>(null);
  const [selecionados, setSelecionados] = useState<string[]>(atuaisGerenciados);
  const [salvando, setSalvando] = useState(false);

  const updateGrupo = useUpdateChatGrupo();
  const updateGeral = useUpdateChatGeralConfig();
  const addMembros = useAddChatGrupoMembros();
  const removeMembros = useRemoveChatGrupoMembros();

  // Recarrega o rascunho a cada abertura (o alvo pode ter mudado enquanto fechado).
  const aoAbrir = (v: boolean) => {
    setOpen(v);
    if (v) {
      setNome(nomeInicial);
      setAparencia({ icone: origem?.icone ?? null, corFundo: origem?.cor_fundo ?? null, corIcone: origem?.cor_icone ?? null, fotoUrl: origem?.foto_url ?? null });
      setNovaFoto(null);
      setSelecionados(atuaisGerenciados);
    }
  };

  const escolherImagem = (file: File) => {
    setNovaFoto(file);
    setAparencia((a) => ({ ...a, icone: null, fotoUrl: URL.createObjectURL(file) }));
  };

  const salvar = async () => {
    if (!nome.trim()) { toast.error('Informe o nome'); return; }
    setSalvando(true);
    try {
      if (ehGrupo) {
        const grupoId = alvo.grupo.id;
        if (novaFoto) {
          await updateGrupo.mutateAsync({ grupoId, nome: nome.trim(), foto: novaFoto });
        } else {
          await updateGrupo.mutateAsync({ grupoId, nome: nome.trim(), icone: aparencia.icone, corFundo: aparencia.corFundo, corIcone: aparencia.corIcone, limparFoto: true });
        }
        const aAdicionarIds = selecionados.filter((id) => !atuaisGerenciados.includes(id));
        const aRemoverIds = atuaisGerenciados.filter((id) => !selecionados.includes(id));
        if (aAdicionarIds.length) await addMembros.mutateAsync({ grupoId, usuarioIds: aAdicionarIds });
        if (aRemoverIds.length) await removeMembros.mutateAsync({ grupoId, usuarioIds: aRemoverIds });
      } else if (novaFoto) {
        await updateGeral.mutateAsync({ nome: nome.trim(), foto: novaFoto });
      } else {
        await updateGeral.mutateAsync({ nome: nome.trim(), icone: aparencia.icone, corFundo: aparencia.corFundo, corIcone: aparencia.corIcone, limparFoto: true });
      }
      setOpen(false);
    } catch {
      // os hooks já mostram o toast do erro/recusa
    } finally {
      setSalvando(false);
    }
  };

  if (!podeEditar) return null;

  const IconePadrao = ehGrupo ? Users2 : MessageCircle;
  const titulo = ehGrupo ? 'Editar grupo' : 'Editar Chat Geral';

  return (
    <Dialog open={open} onOpenChange={aoAbrir}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 shrink-0">
          <Pencil className="h-3.5 w-3.5" /> {ehGrupo ? 'Editar grupo' : 'Editar'}
        </Button>
      </DialogTrigger>
      <ConteudoDialogo className="sm:max-w-md">
        <CabecalhoDialogo>
          <DialogTitle className="flex items-center gap-2">
            <IconePadrao className="h-5 w-5 text-primary" /> {titulo}
          </DialogTitle>
        </CabecalhoDialogo>
        <CorpoDialogo className="space-y-4">
          <SeletorDeAparencia
            nome={nome || (ehGrupo ? 'Grupo' : 'Chat Geral')}
            IconePadrao={IconePadrao}
            valor={aparencia}
            onChange={(v) => { setAparencia(v); if (v.icone) setNovaFoto(null); }}
            onEscolherImagem={escolherImagem}
          />
          <div className="space-y-2">
            <Label htmlFor="editar-nome">Nome</Label>
            <Input id="editar-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          {ehGrupo && (
            <SeletorDeMembros
              titulo="Participantes"
              membros={membros}
              meuId={meuId}
              selecionados={selecionados}
              onChange={setSelecionados}
            />
          )}
        </CorpoDialogo>
        <RodapeDialogo>
          <Button onClick={salvar} disabled={salvando} className="w-full">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Salvar
          </Button>
        </RodapeDialogo>
      </ConteudoDialogo>
    </Dialog>
  );
}
```

- [ ] **Passo 4: Rodar e ver passar**

Run: `npx vitest run src/components/chat/EditarConversaDialog.test.tsx`
Expected: PASS.

- [ ] **Passo 5: Commit**

```bash
git add src/components/chat/EditarConversaDialog.tsx src/components/chat/EditarConversaDialog.test.tsx
git commit -m "feat(chat): EditarConversaDialog (grupo e Geral) com estilo e participantes"
```

---

## Task 7: Religar as fichas em Chat.tsx (leitura + botão Editar)

**Files:**
- Modify: `src/pages/Chat.tsx`

**Interfaces:**
- Consumes: `EditarConversaDialog`, `AvatarDeChat`.

- [ ] **Passo 1: Imports**

Em `Chat.tsx`, garantir `import { EditarConversaDialog } from '@/components/chat/EditarConversaDialog';` (o `AvatarDeChat` já é importado).

- [ ] **Passo 2: Ficha do GRUPO — cabeçalho vira leitura + botão**

Substituir o `<div className="flex items-center gap-3 mb-4">` do grupo (o que hoje contém `<SeletorDeAparencia ...>` + a coluna do nome com lápis, ~1706–1740) por:

```tsx
<div className="flex items-center gap-3 mb-4">
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
  <div className="min-w-0 flex-1">
    <p className="text-sm font-semibold text-foreground truncate">{chatHeaderName}</p>
    <p className="text-[10px] text-muted-foreground mt-0.5">Grupo</p>
  </div>
  {activeGrupo && (
    <EditarConversaDialog
      alvo={{ tipo: 'grupo', grupo: activeGrupo }}
      membros={members}
      membrosAtuais={grupoMembros}
      meuId={myId}
      podeEditar={canDeleteGrupo}
    />
  )}
</div>
```

- [ ] **Passo 3: Ficha do GRUPO — participantes viram só leitura**

No bloco "Participantes do grupo" (~1741–1783), **remover** o botão "Adicionar" (o `{canDeleteGrupo && (<button ... setAddMembersOpen(true) ...>)}`). Manter o cabeçalho com a contagem e a lista `grupoMembros.map(...)` como está (só leitura).

- [ ] **Passo 4: Ficha do GERAL — cabeçalho vira leitura + botão**

Substituir o `<div className="flex items-center gap-3 mb-4">` do Geral (com `<SeletorDeAparencia ...>` + nome, ~1789–1823) por:

```tsx
<div className="flex items-center gap-3 mb-4">
  <AvatarDeChat
    className="h-14 w-14 border border-border"
    fotoUrl={geralConfig?.foto_url}
    icone={geralConfig?.icone}
    corFundo={geralConfig?.cor_fundo}
    corIcone={geralConfig?.cor_icone}
    IconePadrao={MessageCircle}
    nome={geralNome}
    tamanhoIcone="h-6 w-6"
  />
  <div className="min-w-0 flex-1">
    <p className="text-sm font-semibold text-foreground truncate">{geralNome}</p>
    <p className="text-[10px] text-muted-foreground mt-0.5">Toda a equipe</p>
  </div>
  <EditarConversaDialog
    alvo={{ tipo: 'geral', config: geralConfig ?? null }}
    membros={[]}
    meuId={myId}
    podeEditar={canManageGrupos}
  />
</div>
```

- [ ] **Passo 5: Remover o diálogo antigo de "Adicionar participante" e o estado órfão**

Apagar o bloco `<Dialog open={addMembersOpen} ...>...</Dialog>` (~2361 até o `</Dialog>` correspondente). Depois remover, **conferindo que não sobra uso** (o tsc/lint acusa): `addMembersOpen`/`setAddMembersOpen`, `addMembersSearch`/`setAddMembersSearch`, `selectedNewMembers`/`setSelectedNewMembers`, `handleAddMembers`, `addMemberEligible`, `allNewMembersSelected`, `addMemberCandidates`, e o `useAddChatGrupoMembros` importado/instanciado em `Chat.tsx` se não for mais usado ali (ele passou para dentro do `EditarConversaDialog`). Não remover `grupoMembros`, `members`, `myId`, `canDeleteGrupo`, `canManageGrupos`, `geralConfig`, `geralNome`, `chatHeaderName` — seguem em uso.

- [ ] **Passo 6: Verificação da tarefa**

Run: `npx tsc --noEmit -p tsconfig.app.json` (sem itens não usados; não sobe da base)
Run: `npx vitest run` (suíte inteira — nº não cai)
Run: `npm run build`
Expected: tudo verde.

- [ ] **Passo 7: Commit**

```bash
git add src/pages/Chat.tsx
git commit -m "feat(chat): ficha de grupo/Geral vira leitura + botao Editar (painel unico); remove add-membros antigo"
```

---

## Self-Review (feito ao escrever o plano)

1. **Cobertura do spec:** símbolos de obra (T1), cores claras+escuras + padrão (T2/T3), editar grupo painel único (T4/T6/T7), Geral sem participantes (T6/T7), remover participante com contagem (T5), botão só para quem pode + ficha leitura (T7), sem mudança de banco (todas). O "fora da tela" some ao tirar `SeletorDeAparencia` da faixa estreita (T7). ✔
2. **Placeholders:** nenhum "TBD"; código real em cada passo. O único ponto com instrução em vez de código literal é o mock do teste de T5/T6 — apontado para o arquivo-modelo `zero-linhas-nao-e-sucesso.test.tsx`, porque o formato do mock de `supabase` depende do helper de teste do projeto (o implementador copia a forma existente). ✔
3. **Consistência de tipos:** `MembroSelecionavel` definido em T4 e consumido em T6/T7; `AparenciaValor` reusado; `ParDeCor` mantém `fundo`/`icone` (não quebra o consumidor entre T2 e T3); `useRemoveChatGrupoMembros` com a mesma forma dos irmãos. ✔
4. **Ordem sem quebra de build entre tarefas:** T1 e T2 são aditivas; T3 usa os campos novos; T4 não muda a criação; T5/T6 novos; T7 integra. ✔

## Handoff

Plano salvo. Execução recomendada: **subagent-driven-development** (um subagente por tarefa, revisão entre elas, revisão ampla no fim), respeitando a regra da casa (publicar só com o "pode" do dono; aqui não há mudança de banco).
