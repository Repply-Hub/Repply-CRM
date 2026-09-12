# Bloco 4 — Menções (@) no chat e nas notas do WhatsApp — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No chat interno (Geral e grupos) e nas notas internas do WhatsApp, digitar @ abre uma lista com busca para marcar alguém (ou @todos/@all); quem é marcado recebe aviso na tela com som, registro no sininho que abre a conversa, e um @ ao lado do número vermelho na lista de conversas e no menu lateral até abrir a conversa.

**Architecture:**
- **Mensagem:** a mensagem guarda **quem foi escolhido na lista** (`mencionados uuid[]`, `menciona_todos boolean`), e não o nome escrito.
- **Gatilho:** um gatilho depois de inserir confere se cada pessoa **enxerga aquela conversa**, cria a menção (`mencoes`) e o registro no sininho (`notificacoes.link`). Nunca bloqueia o envio.
- **Tela:** a menção nova chega pelo tempo real de `mencoes`, vira aviso na tela e, no chat, substitui o aviso normal.
- **Código:** a lógica do @ é pura (`src/lib/mencao.ts`), com um gancho (`useCampoComMencao`) e dois componentes (lista e texto destacado) usados no chat e na nota.

**Tech Stack:** Postgres (plpgsql, RLS, realtime), React 18 + TS, TanStack Query, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-11-busca-config-agenda-mencoes-design.md`, Bloco 4.

## Global Constraints

- **Ids:** chat, notas, menções e sininho usam `usuarios.id`; `wapi_instancia_usuarios.usuario_auth_id` é o id de **login** (`usuarios.user_id`).
- **Onde existe:** Geral e grupos do chat; a janela "Adicionar nota" do WhatsApp (`salvarNotaManual`, a única nota digitada pela pessoa). **Não** em conversa direta. **Não** na caixa que manda mensagem ao cliente — a menção de grupo do WhatsApp (`mentionQuery`, `WhatsAppInbox.tsx:4610-4671`, `6520-6600`, `8863-8887`) continua como está.
- **Quem aparece na lista:** Geral = empresa toda; grupo = membros; nota = só quem atende o número **e** enxerga a conversa. Nunca a própria pessoa nem usuário excluído. Conversa sem número vinculado: lista vazia, com o texto "Ninguém atende este número, então não há a quem mencionar."
- **@todos / @all:** quem está naquela conversa.
- 🔴 O gatilho de menção **nunca** pode impedir a mensagem de ser gravada (bloco `exception when others`).
- Outra sessão divide a pasta: nunca `git add -A`/`.`; commit com `git commit --only -m "…" -- <arquivos>`.
- Migration ensaiada numa transação desfeita, aplicada sozinha via MCP `apply_migration`, **só com o "pode" do Lucas**; migration **antes** do site.
- Linha de base que não pode piorar: testes ≥ o que os Blocos 1–3 deixaram; `tsc` 36; lint 427; build ok.
- Textos: "te mencionou no Geral", "te mencionou no grupo <nome>", "te mencionou numa nota da conversa com <contato>"; opção da lista "@todos" com "avisa as N pessoas desta conversa".

## Arquivos

| arquivo | responsabilidade |
|---|---|
| `src/lib/mencao.ts` (novo) + `.test.ts` | detectar @, filtrar, inserir, apurar no envio, partir texto para destaque |
| `src/lib/alvo-do-chat.ts` (novo) + `.test.ts` | `?conversa=` ↔ conversa do chat |
| `src/components/mencao/ListaDeMencao.tsx` (novo) + `.test.tsx` | a lista com a barra de busca |
| `src/components/mencao/TextoComMencoes.tsx` (novo) + `.test.tsx` | texto com o nome destacado |
| `src/hooks/use-campo-com-mencao.ts` (novo) + `.test.tsx` | estado do @ num campo de texto |
| `supabase/migrations/20260911140000_mencoes.sql` (novo) | colunas, tabela, funções, gatilhos |
| `src/integrations/supabase/types.ts` | tipos novos |
| `src/lib/mencoes-por-conversa.ts` (novo) + `.test.ts` | conta as não lidas por conversa (puro) |
| `src/lib/aviso-de-mensagem-nova.test.ts` (novo) | trava o parâmetro `acao` |
| `src/hooks/use-mencoes.ts` (novo) | não lidas, aviso em tempo real, marcar lidas |
| `src/lib/aviso-de-mensagem-nova.ts` | parâmetro `acao` |
| `src/hooks/use-notificacoes.ts` | cala o aviso normal quando é menção a mim; chat abre a conversa certa; `link` |
| `src/components/layout/NotificationCenter.tsx` | clicar abre `link` |
| `src/components/layout/AppSidebar.tsx` | @ no menu |
| `src/hooks/use-chat.ts` | envia `mencionados` |
| `src/pages/Chat.tsx` | campo, destaque, `?conversa=`, @ na lista, marcar lidas |
| `src/hooks/use-whatsapp-inbox.ts` | nota envia `mencionados` |
| `src/pages/WhatsAppInbox.tsx` | nota com @, destaque, @ na lista, marcar lidas |

---

### Task 1: A lógica do @ (pura)

**Files:**
- Create: `src/lib/mencao.ts`, `src/lib/mencao.test.ts`
- Create: `src/lib/alvo-do-chat.ts`, `src/lib/alvo-do-chat.test.ts`

**Interfaces:**
- Produces:
  - `interface PessoaMencionavel { id: string; nome: string; avatar_url?: string | null }`
  - `interface MencaoEmCurso { consulta: string; inicio: number }`
  - `detectarMencao(texto: string, cursor: number): MencaoEmCurso | null`
  - `filtrarPessoas(pessoas: readonly PessoaMencionavel[], consulta: string, limite?: number): PessoaMencionavel[]`
  - `inserirMencao(texto: string, m: MencaoEmCurso, rotulo: string): { texto: string; cursor: number }`
  - `mencionadosNoTexto(texto: string, escolhidos: ReadonlyMap<string, string>): { ids: string[]; todos: boolean }`
  - `consultaCasaComTodos(consulta: string): boolean`
  - `partesComMencao(texto: string, nomes: readonly string[], todos: boolean): Array<{ texto: string; mencao: string | null }>`
  - `type AlvoDoChat = { type: 'geral' } | { type: 'grupo'; grupoId: string } | { type: 'dm'; memberId: string; recipientId: string }`
  - `alvoDaChave(chave: string | null | undefined): AlvoDoChat | null`, `chaveDoAlvo(alvo: AlvoDoChat): string`

- [ ] **Step 1: Testes (falham)**

Criar `src/lib/mencao.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  consultaCasaComTodos,
  detectarMencao,
  filtrarPessoas,
  inserirMencao,
  mencionadosNoTexto,
  partesComMencao,
} from './mencao';

const PESSOAS = [
  { id: 'u1', nome: 'Ângela Souza' },
  { id: 'u2', nome: 'Angelo Reis' },
  { id: 'u3', nome: 'Carlos Lima' },
];

describe('detectarMencao', () => {
  it('abre com @ no começo ou depois de espaço', () => {
    expect(detectarMencao('@eri', 4)).toEqual({ consulta: 'eri', inicio: 0 });
    expect(detectarMencao('bom dia @eri', 12)).toEqual({ consulta: 'eri', inicio: 8 });
  });

  it('@ sozinho abre com consulta vazia', () => {
    expect(detectarMencao('oi @', 4)).toEqual({ consulta: '', inicio: 3 });
  });

  it('não abre em e-mail nem depois de espaço', () => {
    expect(detectarMencao('fulano@empresa', 14)).toBeNull();
    expect(detectarMencao('@eri ', 5)).toBeNull();
  });

  it('olha só até o cursor', () => {
    expect(detectarMencao('@eri depois', 4)).toEqual({ consulta: 'eri', inicio: 0 });
  });
});

describe('filtrarPessoas', () => {
  it('sem acento e sem maiúscula: "ang" acha Ângela e Angelo', () => {
    expect(filtrarPessoas(PESSOAS, 'ang').map((p) => p.id)).toEqual(['u1', 'u2']);
  });

  it('acha pelo sobrenome', () => {
    expect(filtrarPessoas(PESSOAS, 'lima').map((p) => p.id)).toEqual(['u3']);
  });

  it('consulta vazia devolve todos, até o limite', () => {
    expect(filtrarPessoas(PESSOAS, '', 2)).toHaveLength(2);
  });

  it('quem começa com a consulta vem antes', () => {
    const lista = [{ id: 'a', nome: 'Ana Carla' }, { id: 'b', nome: 'Carla Souza' }];
    expect(filtrarPessoas(lista, 'carla').map((p) => p.id)).toEqual(['b', 'a']);
  });
});

describe('inserirMencao', () => {
  it('troca "@eri" pelo nome inteiro e põe o cursor depois do espaço', () => {
    expect(inserirMencao('bom dia @ang tudo bem', { consulta: 'ang', inicio: 8 }, 'Ângela Souza')).toEqual({
      texto: 'bom dia @Ângela Souza  tudo bem',
      cursor: 22,
    });
  });
});

describe('mencionadosNoTexto', () => {
  const escolhidos = new Map([['u1', 'Ângela Souza'], ['u3', 'Carlos Lima']]);

  it('só vale quem continua escrito no texto', () => {
    expect(mencionadosNoTexto('@Ângela Souza pode ver?', escolhidos)).toEqual({ ids: ['u1'], todos: false });
  });

  it('@todos e @all marcam todos, em qualquer caixa', () => {
    expect(mencionadosNoTexto('@todos reunião às 15h', new Map()).todos).toBe(true);
    expect(mencionadosNoTexto('atenção @ALL.', new Map()).todos).toBe(true);
  });

  it('"@todoscontente" não é @todos', () => {
    expect(mencionadosNoTexto('@todoscontente', new Map()).todos).toBe(false);
  });
});

describe('consultaCasaComTodos', () => {
  it.each([['', true], ['to', true], ['al', true], ['todos', true], ['x', false], ['tod x', false]])(
    '"%s" → %s',
    (c, r) => expect(consultaCasaComTodos(c)).toBe(r),
  );
});

describe('partesComMencao', () => {
  it('parte o texto nos nomes mencionados, o mais longo primeiro', () => {
    expect(partesComMencao('oi @Ana Souza e @Ana', ['Ana', 'Ana Souza'], false)).toEqual([
      { texto: 'oi ', mencao: null },
      { texto: '@Ana Souza', mencao: 'Ana Souza' },
      { texto: ' e ', mencao: null },
      { texto: '@Ana', mencao: 'Ana' },
    ]);
  });

  it('@todos só é destacado quando a mensagem de fato marcou todos', () => {
    expect(partesComMencao('@todos', [], false)).toEqual([{ texto: '@todos', mencao: null }]);
    expect(partesComMencao('@todos', [], true)).toEqual([{ texto: '@todos', mencao: 'todos' }]);
  });

  it('não destaca pedaço de palavra: "@Anabela" não é "@Ana"', () => {
    expect(partesComMencao('@Anabela', ['Ana'], false)).toEqual([{ texto: '@Anabela', mencao: null }]);
  });
});
```

Criar `src/lib/alvo-do-chat.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { alvoDaChave, chaveDoAlvo } from './alvo-do-chat';

const ID = '3f2a8c10-5b7d-4e21-9a6f-0c4d2e8b7a91'; // inventado

describe('alvo do chat', () => {
  it('lê as três chaves', () => {
    expect(alvoDaChave('geral')).toEqual({ type: 'geral' });
    expect(alvoDaChave(`grupo_${ID}`)).toEqual({ type: 'grupo', grupoId: ID });
    expect(alvoDaChave(`dm_${ID}`)).toEqual({ type: 'dm', memberId: ID, recipientId: ID });
  });

  it('recusa o que não é chave', () => {
    expect(alvoDaChave('grupo_')).toBeNull();
    expect(alvoDaChave('qualquer')).toBeNull();
    expect(alvoDaChave(null)).toBeNull();
  });

  it('ida e volta', () => {
    for (const chave of ['geral', `grupo_${ID}`, `dm_${ID}`]) {
      expect(chaveDoAlvo(alvoDaChave(chave)!)).toBe(chave);
    }
  });
});
```

Run: `npx vitest run src/lib/mencao.test.ts src/lib/alvo-do-chat.test.ts` → FAIL (módulos não existem).

- [ ] **Step 2: Implementar**

Criar `src/lib/mencao.ts`:

```ts
/**
 * A lógica do @ — pura, sem React, para ser testada sem tela.
 *
 * 🔴 A MENÇÃO É A PESSOA ESCOLHIDA NA LISTA, NÃO O NOME ESCRITO (decisão do dono do
 * produto, 11/09/2026). O texto guarda "@Ângela Souza" para ser legível em qualquer
 * lugar, mas quem é avisado sai de `escolhidos` — por id. Duas "Ana" ou alguém que
 * mudou de nome não confundem nada. Se a pessoa apagar o "@Nome" antes de enviar, a
 * menção cai.
 */

export interface PessoaMencionavel {
  id: string;
  nome: string;
  avatar_url?: string | null;
}

export interface MencaoEmCurso {
  /** O que foi digitado depois do "@", até o cursor. */
  consulta: string;
  /** Posição do "@" no texto. */
  inicio: number;
}

const semAcento = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function detectarMencao(texto: string, cursor: number): MencaoEmCurso | null {
  const m = /(?:^|\s)@([^\s@]*)$/.exec(texto.slice(0, cursor));
  if (!m) return null;
  return { consulta: m[1], inicio: cursor - m[1].length - 1 };
}

export function filtrarPessoas(
  pessoas: readonly PessoaMencionavel[],
  consulta: string,
  limite = 8,
): PessoaMencionavel[] {
  const q = semAcento(consulta.trim());
  if (!q) return pessoas.slice(0, limite);
  const comeca = (p: PessoaMencionavel) => semAcento(p.nome).startsWith(q);
  return pessoas
    .filter((p) => semAcento(p.nome).includes(q))
    .sort((a, b) => Number(!comeca(a)) - Number(!comeca(b)))
    .slice(0, limite);
}

export function inserirMencao(
  texto: string,
  m: MencaoEmCurso,
  rotulo: string,
): { texto: string; cursor: number } {
  const antes = texto.slice(0, m.inicio);
  const depois = texto.slice(m.inicio + 1 + m.consulta.length);
  const insercao = `@${rotulo} `;
  return { texto: antes + insercao + depois, cursor: antes.length + insercao.length };
}

const RE_TODOS = /(?:^|\s)@(?:todos|all)(?=$|[\s.,;:!?])/i;

export function mencionadosNoTexto(
  texto: string,
  escolhidos: ReadonlyMap<string, string>,
): { ids: string[]; todos: boolean } {
  const ids = [...escolhidos].filter(([, nome]) => texto.includes(`@${nome}`)).map(([id]) => id);
  return { ids, todos: RE_TODOS.test(texto) };
}

/** A opção "@todos" aparece enquanto o que foi digitado ainda pode virar "todos" ou "all". */
export function consultaCasaComTodos(consulta: string): boolean {
  const q = semAcento(consulta);
  return 'todos'.startsWith(q) || 'all'.startsWith(q);
}

const escaparRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Parte o texto nos trechos "@Nome" dos mencionados, para a tela destacar. O nome mais
 * longo é tentado primeiro ("@Ana Souza" antes de "@Ana"), e o nome precisa
 * terminar ali ("@Anabela" não é "@Ana").
 */
export function partesComMencao(
  texto: string,
  nomes: readonly string[],
  todos: boolean,
): Array<{ texto: string; mencao: string | null }> {
  const alvos = [...new Set(nomes.filter(Boolean))].sort((a, b) => b.length - a.length).map(escaparRegex);
  if (todos) alvos.push('todos', 'all');
  if (alvos.length === 0) return [{ texto, mencao: null }];

  const re = new RegExp(`@(${alvos.join('|')})(?![\\p{L}\\p{N}])`, 'giu');
  const partes: Array<{ texto: string; mencao: string | null }> = [];
  let ultimo = 0;
  for (const m of texto.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > ultimo) partes.push({ texto: texto.slice(ultimo, i), mencao: null });
    const nome = m[1];
    const ehTodos = /^(todos|all)$/i.test(nome) && todos;
    partes.push({ texto: m[0], mencao: ehTodos ? 'todos' : nome });
    ultimo = i + m[0].length;
  }
  if (ultimo < texto.length) partes.push({ texto: texto.slice(ultimo), mencao: null });
  return partes;
}
```

Criar `src/lib/alvo-do-chat.ts`:

```ts
/**
 * O endereço de cada conversa do chat interno: `/chat?conversa=geral`,
 * `/chat?conversa=grupo_<id>`, `/chat?conversa=dm_<id>` — as mesmas chaves que os
 * contadores de não lidas já usam (`useUnreadChatByTarget`). Até 11/09/2026 o aviso de
 * chat levava só para `/chat`, e a pessoa tinha de procurar a conversa.
 */
export type AlvoDoChat =
  | { type: 'geral' }
  | { type: 'grupo'; grupoId: string }
  | { type: 'dm'; memberId: string; recipientId: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function alvoDaChave(chave: string | null | undefined): AlvoDoChat | null {
  if (chave === 'geral') return { type: 'geral' };
  const m = /^(grupo|dm)_(.+)$/.exec(chave ?? '');
  if (!m || !UUID.test(m[2])) return null;
  return m[1] === 'grupo'
    ? { type: 'grupo', grupoId: m[2] }
    : { type: 'dm', memberId: m[2], recipientId: m[2] };
}

export function chaveDoAlvo(alvo: AlvoDoChat): string {
  if (alvo.type === 'geral') return 'geral';
  return alvo.type === 'grupo' ? `grupo_${alvo.grupoId}` : `dm_${alvo.memberId}`;
}
```

Run: `npx vitest run src/lib/mencao.test.ts src/lib/alvo-do-chat.test.ts` → PASS.

Conferir o `cursor` do teste de `inserirMencao`: `'bom dia '` tem 8 caracteres e `'@Ângela Souza '` tem 14, então o cursor fica em 22.

- [ ] **Step 3: Commit**

```bash
git add -- src/lib/mencao.ts src/lib/mencao.test.ts src/lib/alvo-do-chat.ts src/lib/alvo-do-chat.test.ts
git commit --only -m "feat(mencao): a logica do @ e o endereco de cada conversa do chat

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -- src/lib/mencao.ts src/lib/mencao.test.ts src/lib/alvo-do-chat.ts src/lib/alvo-do-chat.test.ts
```

---

### Task 2: A lista e o texto destacado

**Files:**
- Create: `src/components/mencao/ListaDeMencao.tsx`, `src/components/mencao/ListaDeMencao.test.tsx`
- Create: `src/components/mencao/TextoComMencoes.tsx`, `src/components/mencao/TextoComMencoes.test.tsx`

**Interfaces:**
- Consumes: `partesComMencao` (Task 1), `linkifyText(text, linkClassName?)` de `@/lib/linkify`.
- Produces:
  - `interface SugestaoDeMencao { id: string; rotulo: string; detalhe?: string; avatar_url?: string | null }` (`id === TODOS` para @todos)
  - `const TODOS = '__todos__'`
  - `ListaDeMencao({ consulta, sugestoes, ativa, onEscolher, mensagemVazia, className? })`
  - `TextoComMencoes({ texto, nomes, todos, meuNome? })`

- [ ] **Step 1: Testes (falham)**

Criar `src/components/mencao/ListaDeMencao.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ListaDeMencao, TODOS } from './ListaDeMencao';

afterEach(cleanup);

const SUG = [
  { id: TODOS, rotulo: '@todos', detalhe: 'avisa as 12 pessoas desta conversa' },
  { id: 'u1', rotulo: 'Ângela Souza' },
];

describe('ListaDeMencao', () => {
  it('a barra de busca mostra o que foi digitado depois do @', () => {
    render(<ListaDeMencao consulta="eri" sugestoes={SUG} ativa={0} onEscolher={() => {}} mensagemVazia="" />);
    expect(screen.getByText('eri')).toBeTruthy();
  });

  it('@todos vem primeiro, com quantas pessoas avisa', () => {
    render(<ListaDeMencao consulta="" sugestoes={SUG} ativa={0} onEscolher={() => {}} mensagemVazia="" />);
    const opcoes = screen.getAllByRole('option');
    expect(opcoes[0].textContent).toContain('@todos');
    expect(opcoes[0].textContent).toContain('avisa as 12 pessoas desta conversa');
  });

  it('clicar escolhe — no mousedown, para o campo não perder o foco', () => {
    const onEscolher = vi.fn();
    render(<ListaDeMencao consulta="" sugestoes={SUG} ativa={0} onEscolher={onEscolher} mensagemVazia="" />);
    fireEvent.mouseDown(screen.getByRole('option', { name: /Ângela Souza/ }));
    expect(onEscolher).toHaveBeenCalledWith(SUG[1]);
  });

  it('sem ninguém, mostra a mensagem de vazio', () => {
    render(
      <ListaDeMencao consulta="" sugestoes={[]} ativa={0} onEscolher={() => {}}
        mensagemVazia="Ninguém atende este número, então não há a quem mencionar." />,
    );
    expect(screen.getByText('Ninguém atende este número, então não há a quem mencionar.')).toBeTruthy();
  });

  it('marca a opção ativa para as setas do teclado', () => {
    render(<ListaDeMencao consulta="" sugestoes={SUG} ativa={1} onEscolher={() => {}} mensagemVazia="" />);
    expect(screen.getAllByRole('option')[1].getAttribute('aria-selected')).toBe('true');
  });
});
```

Criar `src/components/mencao/TextoComMencoes.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TextoComMencoes } from './TextoComMencoes';

afterEach(cleanup);

describe('TextoComMencoes', () => {
  it('destaca o nome mencionado', () => {
    render(<TextoComMencoes texto="@Ângela Souza pode ver?" nomes={['Ângela Souza']} todos={false} />);
    expect(screen.getByText('@Ângela Souza').getAttribute('data-mencao')).toBe('outra');
  });

  it('com mais destaque quando é o nome de quem está lendo', () => {
    render(<TextoComMencoes texto="@Ângela Souza pode ver?" nomes={['Ângela Souza']} todos={false} meuNome="Ângela Souza" />);
    expect(screen.getByText('@Ângela Souza').getAttribute('data-mencao')).toBe('minha');
  });

  it('@todos marcado conta como menção a quem lê', () => {
    render(<TextoComMencoes texto="@todos reunião" nomes={[]} todos meuNome="Carlos" />);
    expect(screen.getByText('@todos').getAttribute('data-mencao')).toBe('minha');
  });

  it('continua transformando link em link', () => {
    render(<TextoComMencoes texto="@Eric veja https://exemplo.com.br" nomes={['Eric']} todos={false} />);
    expect(screen.getByRole('link').getAttribute('href')).toContain('https://exemplo.com.br');
  });
});
```

Run: `npx vitest run src/components/mencao` → FAIL (módulos não existem).

- [ ] **Step 2: Implementar**

Criar `src/components/mencao/ListaDeMencao.tsx`:

```tsx
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export const TODOS = '__todos__';

export interface SugestaoDeMencao {
  id: string;
  rotulo: string;
  detalhe?: string;
  avatar_url?: string | null;
}

interface Props {
  consulta: string;
  sugestoes: SugestaoDeMencao[];
  ativa: number;
  onEscolher: (s: SugestaoDeMencao) => void;
  mensagemVazia: string;
  className?: string;
}

const iniciais = (nome: string) =>
  nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

/**
 * A lista que abre ao digitar @. A "barra de busca" do topo MOSTRA o que foi digitado
 * depois do @ — não é um segundo campo: o foco fica no campo de mensagem o tempo todo,
 * e é lá que a pessoa continua digitando (pedido do dono do produto: "uma lista com
 * barra de busca para clicar no nome").
 */
export function ListaDeMencao({ consulta, sugestoes, ativa, onEscolher, mensagemVazia, className }: Props) {
  return (
    <div
      className={cn(
        'w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md',
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className={cn('truncate', consulta ? 'text-foreground' : 'text-muted-foreground')}>
          {consulta || 'Digite um nome'}
        </span>
      </div>
      <div role="listbox" aria-label="Mencionar alguém" className="max-h-56 overflow-y-auto p-1">
        {sugestoes.length === 0 ? (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">{mensagemVazia}</p>
        ) : (
          sugestoes.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="option"
              aria-selected={i === ativa}
              // mousedown, e não click: o click tiraria o foco do campo antes de escolher.
              onMouseDown={(e) => {
                e.preventDefault();
                onEscolher(s);
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm',
                i === ativa ? 'bg-accent text-accent-foreground' : 'hover:bg-muted',
              )}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                {s.avatar_url ? <img src={s.avatar_url} alt="" className="h-full w-full object-cover" /> : s.id === TODOS ? '@' : iniciais(s.rotulo)}
              </span>
              <span className={cn('truncate', s.id === TODOS && 'font-medium')}>{s.rotulo}</span>
              {s.detalhe && <span className="ml-auto truncate pl-2 text-xs text-muted-foreground">{s.detalhe}</span>}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
```

Criar `src/components/mencao/TextoComMencoes.tsx`:

```tsx
import { Fragment } from 'react';
import { linkifyText } from '@/lib/linkify';
import { partesComMencao } from '@/lib/mencao';

interface Props {
  texto: string;
  /** Nomes das pessoas que a mensagem de fato mencionou (vindos de `mencionados`). */
  nomes: string[];
  /** A mensagem marcou @todos/@all. */
  todos: boolean;
  /** Nome de quem está lendo — a menção a ele ganha mais destaque. */
  meuNome?: string | null;
}

/** O texto da mensagem com os "@Nome" destacados, e os links continuando links. */
export function TextoComMencoes({ texto, nomes, todos, meuNome }: Props) {
  const partes = partesComMencao(texto, nomes, todos);
  return (
    <>
      {partes.map((p, i) => {
        if (!p.mencao) return <Fragment key={i}>{linkifyText(p.texto)}</Fragment>;
        const minha = p.mencao === 'todos' || (!!meuNome && p.mencao === meuNome);
        return (
          <span
            key={i}
            data-mencao={minha ? 'minha' : 'outra'}
            className={minha ? 'rounded bg-yellow-200 px-0.5 font-semibold text-yellow-950' : 'font-semibold'}
          >
            {p.texto}
          </span>
        );
      })}
    </>
  );
}
```

Run: `npx vitest run src/components/mencao` → PASS.

- [ ] **Step 3: Commit**

```bash
git add -- src/components/mencao/ListaDeMencao.tsx src/components/mencao/ListaDeMencao.test.tsx src/components/mencao/TextoComMencoes.tsx src/components/mencao/TextoComMencoes.test.tsx
git commit --only -m "feat(mencao): lista com busca e texto com o nome destacado

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -- src/components/mencao/ListaDeMencao.tsx src/components/mencao/ListaDeMencao.test.tsx src/components/mencao/TextoComMencoes.tsx src/components/mencao/TextoComMencoes.test.tsx
```

---

### Task 3: O gancho do campo com @

**Files:**
- Create: `src/hooks/use-campo-com-mencao.ts`, `src/hooks/use-campo-com-mencao.test.tsx`

**Interfaces:**
- Consumes: Task 1 e `TODOS`/`SugestaoDeMencao` (Task 2).
- Produces:
```ts
useCampoComMencao(opts: {
  texto: string;
  setTexto: (t: string) => void;
  pessoas: PessoaMencionavel[];
  ativo: boolean;          // false = campo comum (conversa direta)
  totalDaConversa: number; // para "avisa as N pessoas desta conversa"
  ref: React.RefObject<HTMLTextAreaElement>;
}): {
  aberta: boolean; consulta: string; sugestoes: SugestaoDeMencao[]; ativa: number;
  aoMudar: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  aoTeclar: (e: React.KeyboardEvent<HTMLTextAreaElement>) => boolean; // true = a tecla era da lista
  escolher: (s: SugestaoDeMencao) => void;
  paraEnviar: (textoFinal: string) => { ids: string[]; todos: boolean };
  limpar: () => void;
}
```

- [ ] **Step 1: Teste (falha)**

Criar `src/hooks/use-campo-com-mencao.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest';
import { useRef, useState } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useCampoComMencao } from './use-campo-com-mencao';
import { ListaDeMencao } from '@/components/mencao/ListaDeMencao';

afterEach(cleanup);

const PESSOAS = [{ id: 'u1', nome: 'Ângela Souza' }, { id: 'u2', nome: 'Carlos Lima' }];
let apurado: { ids: string[]; todos: boolean } | null = null;

function Campo({ ativo = true }: { ativo?: boolean }) {
  const [texto, setTexto] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const m = useCampoComMencao({ texto, setTexto, pessoas: PESSOAS, ativo, totalDaConversa: 2, ref });
  return (
    <div>
      {m.aberta && (
        <ListaDeMencao consulta={m.consulta} sugestoes={m.sugestoes} ativa={m.ativa} onEscolher={m.escolher} mensagemVazia="vazio" />
      )}
      <textarea
        aria-label="mensagem"
        ref={ref}
        value={texto}
        onChange={m.aoMudar}
        onKeyDown={(e) => {
          if (m.aoTeclar(e)) return;
          if (e.key === 'Enter') apurado = m.paraEnviar(texto);
        }}
      />
    </div>
  );
}

const digitar = (valor: string) => {
  const campo = screen.getByLabelText('mensagem') as HTMLTextAreaElement;
  fireEvent.change(campo, { target: { value: valor, selectionStart: valor.length } });
  return campo;
};

describe('useCampoComMencao', () => {
  it('digitar @ abre a lista com @todos primeiro', () => {
    render(<Campo />);
    digitar('oi @');
    const opcoes = screen.getAllByRole('option');
    expect(opcoes[0].textContent).toContain('@todos');
    expect(opcoes[0].textContent).toContain('avisa as 2 pessoas desta conversa');
  });

  it('Enter escolhe a opção ativa e o texto ganha o nome inteiro', () => {
    render(<Campo />);
    const campo = digitar('oi @ang');
    fireEvent.keyDown(campo, { key: 'Enter' });
    expect(campo.value).toBe('oi @Ângela Souza ');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('no envio, só vale quem foi escolhido e continua no texto', () => {
    render(<Campo />);
    const campo = digitar('oi @ang');
    fireEvent.keyDown(campo, { key: 'Enter' });
    fireEvent.keyDown(campo, { key: 'Enter' });
    expect(apurado).toEqual({ ids: ['u1'], todos: false });
  });

  it('Esc fecha a lista e mantém o texto', () => {
    render(<Campo />);
    const campo = digitar('oi @car');
    fireEvent.keyDown(campo, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(campo.value).toBe('oi @car');
  });

  it('desligado (conversa direta), @ não abre nada', () => {
    render(<Campo ativo={false} />);
    digitar('oi @');
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
```

Run: `npx vitest run src/hooks/use-campo-com-mencao.test.tsx` → FAIL.

- [ ] **Step 2: Implementar**

Criar `src/hooks/use-campo-com-mencao.ts`:

```ts
import { useCallback, useMemo, useRef, useState } from 'react';
import type React from 'react';
import {
  consultaCasaComTodos,
  detectarMencao,
  filtrarPessoas,
  inserirMencao,
  mencionadosNoTexto,
  type MencaoEmCurso,
  type PessoaMencionavel,
} from '@/lib/mencao';
import { TODOS, type SugestaoDeMencao } from '@/components/mencao/ListaDeMencao';

interface Opcoes {
  texto: string;
  setTexto: (t: string) => void;
  pessoas: PessoaMencionavel[];
  ativo: boolean;
  totalDaConversa: number;
  ref: React.RefObject<HTMLTextAreaElement>;
}

/** O @ num campo de texto: abre a lista, navega pelo teclado, insere o nome e apura no envio. */
export function useCampoComMencao({ texto, setTexto, pessoas, ativo, totalDaConversa, ref }: Opcoes) {
  const [emCurso, setEmCurso] = useState<MencaoEmCurso | null>(null);
  const [ativa, setAtiva] = useState(0);
  const escolhidos = useRef(new Map<string, string>());

  const sugestoes = useMemo<SugestaoDeMencao[]>(() => {
    if (!emCurso) return [];
    const lista: SugestaoDeMencao[] = [];
    if (pessoas.length > 0 && consultaCasaComTodos(emCurso.consulta)) {
      lista.push({
        id: TODOS,
        rotulo: '@todos',
        detalhe: `avisa as ${totalDaConversa} ${totalDaConversa === 1 ? 'pessoa' : 'pessoas'} desta conversa`,
      });
    }
    for (const p of filtrarPessoas(pessoas, emCurso.consulta)) {
      lista.push({ id: p.id, rotulo: p.nome, avatar_url: p.avatar_url });
    }
    return lista;
  }, [emCurso, pessoas, totalDaConversa]);

  const aoMudar = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const valor = e.target.value;
      setTexto(valor);
      if (!ativo) return;
      setEmCurso(detectarMencao(valor, e.target.selectionStart ?? valor.length));
      setAtiva(0);
    },
    [ativo, setTexto],
  );

  const escolher = useCallback(
    (s: SugestaoDeMencao) => {
      if (!emCurso) return;
      const rotulo = s.id === TODOS ? 'todos' : s.rotulo;
      const r = inserirMencao(texto, emCurso, rotulo);
      if (s.id !== TODOS) escolhidos.current.set(s.id, s.rotulo);
      setTexto(r.texto);
      setEmCurso(null);
      requestAnimationFrame(() => {
        ref.current?.focus();
        ref.current?.setSelectionRange(r.cursor, r.cursor);
      });
    },
    [emCurso, ref, setTexto, texto],
  );

  const aoTeclar = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
      if (!emCurso) return false;
      if (e.key === 'Escape') {
        e.preventDefault();
        setEmCurso(null);
        return true;
      }
      if (sugestoes.length === 0) return false;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setAtiva((i) => (i + 1) % sugestoes.length);
        return true;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setAtiva((i) => (i - 1 + sugestoes.length) % sugestoes.length);
        return true;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        escolher(sugestoes[Math.min(ativa, sugestoes.length - 1)]);
        return true;
      }
      return false;
    },
    [ativa, emCurso, escolher, sugestoes],
  );

  const paraEnviar = useCallback(
    (textoFinal: string) =>
      ativo ? mencionadosNoTexto(textoFinal, escolhidos.current) : { ids: [], todos: false },
    [ativo],
  );

  const limpar = useCallback(() => {
    escolhidos.current.clear();
    setEmCurso(null);
  }, []);

  return {
    aberta: ativo && emCurso !== null,
    consulta: emCurso?.consulta ?? '',
    sugestoes,
    ativa,
    aoMudar,
    aoTeclar,
    escolher,
    paraEnviar,
    limpar,
  };
}
```

Run: `npx vitest run src/hooks/use-campo-com-mencao.test.tsx` → PASS.

- [ ] **Step 3: Commit**

```bash
git add -- src/hooks/use-campo-com-mencao.ts src/hooks/use-campo-com-mencao.test.tsx
git commit --only -m "feat(mencao): o campo de texto entende o @

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -- src/hooks/use-campo-com-mencao.ts src/hooks/use-campo-com-mencao.test.tsx
```

---

### Task 4: O banco — colunas, menções, conferência de acesso e gatilhos

**Files:**
- Create: `supabase/migrations/20260911140000_mencoes.sql`
- Modify: `src/integrations/supabase/types.ts`

**Interfaces:**
- Produces: colunas `chat_mensagens.mencionados/menciona_todos`, `whatsapp_mensagens.mencionados/menciona_todos`, `notificacoes.link`; tabela `mencoes (id, empresa_id, mencionado_id, autor_id, autor_nome, origem, chat_mensagem_id, wa_mensagem_id, conversa_chave, lugar, previa, link, lida_em, created_at)`; RPC `pessoas_mencionaveis_na_conversa(p_conversa_id uuid) returns table(id uuid, nome text, avatar_url text)`.

- [ ] **Step 1: Escrever a migration**

Criar `supabase/migrations/20260911140000_mencoes.sql`:

```sql
-- Menções (@) no chat interno (Geral e grupos) e nas notas internas do WhatsApp.
-- Spec: docs/superpowers/specs/2026-09-11-busca-config-agenda-mencoes-design.md, Bloco 4.
--
-- A mensagem guarda QUEM foi escolhido na lista (`mencionados`), não o nome escrito. Um
-- gatilho depois de gravar confere se cada pessoa ENXERGA aquela conversa e só então cria
-- a menção e o registro no sininho. É o que impede usar menção para mostrar trecho de
-- conversa a quem não tem acesso.
--
-- 🔴 Os gatilhos NUNCA bloqueiam a mensagem: qualquer erro vira aviso no log.

-- 1. Colunas -----------------------------------------------------------------------
alter table public.chat_mensagens
  add column if not exists mencionados    uuid[]  not null default '{}',
  add column if not exists menciona_todos boolean not null default false;

alter table public.whatsapp_mensagens
  add column if not exists mencionados    uuid[]  not null default '{}',
  add column if not exists menciona_todos boolean not null default false;

-- Para onde o registro do sininho leva. Até aqui o sininho só sabia abrir negócio.
alter table public.notificacoes add column if not exists link text;

-- 2. A tabela de menções ------------------------------------------------------------
-- `chat_mensagens.lida` é UM booleano por mensagem, compartilhado: no Geral, o primeiro
-- que abre zera para todos. Menção precisa de "lida por mim" — daí a tabela própria.
create table if not exists public.mencoes (
  id               uuid        primary key default gen_random_uuid(),
  empresa_id       uuid        not null references public.empresas(id) on delete cascade,
  mencionado_id    uuid        not null references public.usuarios(id) on delete cascade,
  autor_id         uuid        references public.usuarios(id) on delete set null,
  autor_nome       text,
  origem           text        not null check (origem in ('chat', 'whatsapp_nota')),
  chat_mensagem_id uuid        references public.chat_mensagens(id) on delete cascade,
  wa_mensagem_id   uuid        references public.whatsapp_mensagens(id) on delete cascade,
  conversa_chave   text        not null,  -- 'geral' | 'grupo_<id>' | id da conversa do WhatsApp
  lugar            text        not null,  -- 'no Geral' | 'no grupo X' | 'numa nota da conversa com Y'
  previa           text,
  link             text        not null,
  lida_em          timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists mencoes_nao_lidas on public.mencoes (mencionado_id) where lida_em is null;

alter table public.mencoes enable row level security;
create policy mencoes_select_proprias on public.mencoes
  for select to authenticated using (mencionado_id = get_my_usuario_id());
create policy mencoes_update_proprias on public.mencoes
  for update to authenticated
  using (mencionado_id = get_my_usuario_id())
  with check (mencionado_id = get_my_usuario_id());
-- A pessoa só pode marcar como lida — nenhuma outra coluna.
revoke update on public.mencoes from authenticated;
grant update (lida_em) on public.mencoes to authenticated;

alter publication supabase_realtime add table public.mencoes;

-- 3. Outra pessoa enxerga esta conversa de WhatsApp? --------------------------------
-- Espelha `can_access_wa_conversa` (20260902170000) para um usuário qualquer, e não só
-- para quem está logado. Conversa sem número vinculado: ninguém (decisão de 11/09/2026).
create or replace function public.usuario_alcanca_wa_conversa(_usuario_id uuid, _conversa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from whatsapp_conversas c
      join usuarios u
        on u.id = _usuario_id
       and u.empresa_id = c.empresa_id
       and u.deleted_at is null
       and u.user_id is not null
     where c.id = _conversa_id
       and c.instancia_id is not null
       and exists (
         select 1 from wapi_instancia_usuarios wiu
          where wiu.instancia_id = c.instancia_id
            and wiu.usuario_auth_id = u.user_id
       )
       and (
         u.role in ('empresa', 'gestor')
         or exists (select 1 from whatsapp_conversa_responsaveis r
                     where r.conversa_id = c.id and r.usuario_id = u.id)
         or not exists (select 1 from whatsapp_conversa_responsaveis r2
                         where r2.conversa_id = c.id)
       )
  );
$$;
revoke all on function public.usuario_alcanca_wa_conversa(uuid, uuid) from public, anon, authenticated;

-- 4. A lista do @ na nota ------------------------------------------------------------
create or replace function public.pessoas_mencionaveis_na_conversa(p_conversa_id uuid)
returns table (id uuid, nome text, avatar_url text)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, coalesce(u.nome, u.email), u.avatar_url
    from usuarios u
   where public.can_access_wa_conversa(p_conversa_id)   -- quem pergunta precisa enxergar
     and u.empresa_id = get_my_empresa_id()
     and u.id <> get_my_usuario_id()
     and public.usuario_alcanca_wa_conversa(u.id, p_conversa_id)
   order by 2;
$$;
revoke all on function public.pessoas_mencionaveis_na_conversa(uuid) from public, anon;
grant execute on function public.pessoas_mencionaveis_na_conversa(uuid) to authenticated;

-- 5. Gatilho do chat -----------------------------------------------------------------
create or replace function public.chat_anota_mencoes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chave text;
  v_lugar text;
  v_autor text;
begin
  if new.recipient_id is not null then return null; end if;  -- conversa direta: sem menção
  if cardinality(new.mencionados) = 0 and not new.menciona_todos then return null; end if;

  if new.grupo_id is null then
    v_chave := 'geral';
    v_lugar := 'no Geral';
  else
    v_chave := 'grupo_' || new.grupo_id;
    select 'no grupo ' || nome into v_lugar from chat_grupos where id = new.grupo_id;
  end if;
  select coalesce(nome, email) into v_autor from usuarios where id = new.usuario_id;

  with audiencia as (
    select u.id
      from usuarios u
     where u.empresa_id = new.empresa_id
       and u.deleted_at is null
       and u.user_id is not null
       and (new.grupo_id is null
            or exists (select 1 from chat_grupo_membros gm
                        where gm.grupo_id = new.grupo_id and gm.usuario_id = u.id))
  ),
  alvos as (
    select a.id
      from audiencia a
     where a.id <> new.usuario_id
       and (new.menciona_todos or a.id = any (new.mencionados))
       -- quem escreve precisa estar na conversa: a política de gravação do chat não confere grupo
       and exists (select 1 from audiencia x where x.id = new.usuario_id)
  ),
  gravadas as (
    insert into mencoes (empresa_id, mencionado_id, autor_id, autor_nome, origem,
                         chat_mensagem_id, conversa_chave, lugar, previa, link)
    select new.empresa_id, id, new.usuario_id, v_autor, 'chat',
           new.id, v_chave, coalesce(v_lugar, 'no chat'), left(new.conteudo, 140),
           '/chat?conversa=' || v_chave
      from alvos
    returning mencionado_id, autor_nome, lugar, previa, link
  )
  insert into notificacoes (usuario_id, tipo, titulo, mensagem, link)
  select mencionado_id, 'mencao', coalesce(autor_nome, 'Alguém') || ' te mencionou ' || lugar, previa, link
    from gravadas;

  return null;
exception when others then
  raise warning '[mencao] chat %: %', new.id, sqlerrm;
  return null;
end;
$$;

drop trigger if exists chat_anota_mencoes on public.chat_mensagens;
create trigger chat_anota_mencoes
  after insert on public.chat_mensagens
  for each row execute function public.chat_anota_mencoes();

-- 6. Gatilho da nota do WhatsApp ------------------------------------------------------
create or replace function public.wa_anota_mencoes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_autor   text;
  v_contato text;
  v_lugar   text;
begin
  if not new.is_nota_interna then return null; end if;  -- sai rápido: o webhook grava muito
  if cardinality(new.mencionados) = 0 and not new.menciona_todos then return null; end if;
  if new.usuario_id is null then return null; end if;

  select coalesce(nome, email) into v_autor from usuarios where id = new.usuario_id;
  select coalesce(nome_contato, telefone) into v_contato from whatsapp_conversas where id = new.conversa_id;
  v_lugar := 'numa nota da conversa com ' || coalesce(v_contato, 'um contato');

  with alvos as (
    select u.id
      from usuarios u
     where u.empresa_id = new.empresa_id
       and u.id <> new.usuario_id
       and (new.menciona_todos or u.id = any (new.mencionados))
       and usuario_alcanca_wa_conversa(u.id, new.conversa_id)
  ),
  gravadas as (
    insert into mencoes (empresa_id, mencionado_id, autor_id, autor_nome, origem,
                         wa_mensagem_id, conversa_chave, lugar, previa, link)
    select new.empresa_id, id, new.usuario_id, v_autor, 'whatsapp_nota',
           new.id, new.conversa_id::text, v_lugar, left(new.conteudo, 140),
           '/whatsapp?conversaId=' || new.conversa_id || '&mensagemId=' || new.id
      from alvos
    returning mencionado_id, autor_nome, lugar, previa, link
  )
  insert into notificacoes (usuario_id, tipo, titulo, mensagem, link)
  select mencionado_id, 'mencao', coalesce(autor_nome, 'Alguém') || ' te mencionou ' || lugar, previa, link
    from gravadas;

  return null;
exception when others then
  raise warning '[mencao] nota %: %', new.id, sqlerrm;
  return null;
end;
$$;

drop trigger if exists wa_anota_mencoes on public.whatsapp_mensagens;
create trigger wa_anota_mencoes
  after insert on public.whatsapp_mensagens
  for each row execute function public.wa_anota_mencoes();
```

- [ ] **Step 2: Tipos**

Em `src/integrations/supabase/types.ts`:
- `chat_mensagens` Row: `mencionados: string[]`, `menciona_todos: boolean`; Insert/Update: as mesmas com `?:`.
- `whatsapp_mensagens` Row/Insert/Update: idem.
- `notificacoes` Row: `link: string | null`; Insert/Update: `link?: string | null`.
- Nova tabela, em ordem alfabética dentro de `Tables` (depois de `leads`/antes de `notificacoes`, onde couber):

```ts
      mencoes: {
        Row: {
          autor_id: string | null
          autor_nome: string | null
          chat_mensagem_id: string | null
          conversa_chave: string
          created_at: string
          empresa_id: string
          id: string
          lida_em: string | null
          link: string
          lugar: string
          mencionado_id: string
          origem: string
          previa: string | null
          wa_mensagem_id: string | null
        }
        Insert: {
          autor_id?: string | null
          autor_nome?: string | null
          chat_mensagem_id?: string | null
          conversa_chave: string
          created_at?: string
          empresa_id: string
          id?: string
          lida_em?: string | null
          link: string
          lugar: string
          mencionado_id: string
          origem: string
          previa?: string | null
          wa_mensagem_id?: string | null
        }
        Update: {
          lida_em?: string | null
        }
        Relationships: []
      }
```

- Em `Functions`:
```ts
      pessoas_mencionaveis_na_conversa: {
        Args: { p_conversa_id: string }
        Returns: { id: string; nome: string; avatar_url: string | null }[]
      }
```

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "error TS"` → ≤ 36.

- [ ] **Step 3: Ensaiar sem gravar**

Achar dados da demo:
```sql
select id, user_id, nome from usuarios
 where empresa_id = '<EMPRESA_DEMO>' and user_id is not null and deleted_at is null;
select id, instancia_id from whatsapp_conversas
 where empresa_id = '<EMPRESA_DEMO>' limit 3;
select id from configuracoes_wapi where empresa_id = '<EMPRESA_DEMO>' limit 1;
```

Via MCP `execute_sql`: `begin;` + migration inteira + o bloco abaixo + `rollback;`. Trocar `<EMPRESA_DEMO>` pelo id da empresa de demonstração, `<AUTH_TESTE>`/`<ID_TESTE>` pela conta de teste e `<ID_OUTRO>`/`<AUTH_OUTRO>` pela outra conta. Os valores saem das consultas acima e da memória do projeto (`empresa-repply-e-de-demonstracao`), e **nunca** entram neste arquivo (CLAUDE.md §6.9). Trocar também `<CONVERSA>` por uma conversa da demo e `<INSTANCIA>` pela instância da demo.

```sql
select set_config('request.jwt.claims', json_build_object('sub', '<AUTH_TESTE>', 'role', 'authenticated')::text, true);

-- chat: menção no Geral
insert into chat_mensagens (conteudo, usuario_id, empresa_id, mencionados)
values ('@Outro ensaio', '<ID_TESTE>', '<EMPRESA_DEMO>', array['<ID_OUTRO>'::uuid]);

-- chat: conversa direta NUNCA gera menção
insert into chat_mensagens (conteudo, usuario_id, empresa_id, recipient_id, mencionados)
values ('@Outro direta', '<ID_TESTE>', '<EMPRESA_DEMO>', '<ID_OUTRO>', array['<ID_OUTRO>'::uuid]);

-- nota: a conversa passa a ter número (só dentro desta transação) e as duas contas atendem
update whatsapp_conversas set instancia_id = '<INSTANCIA>' where id = '<CONVERSA>';
insert into wapi_instancia_usuarios (instancia_id, usuario_auth_id)
values ('<INSTANCIA>', '<AUTH_TESTE>'), ('<INSTANCIA>', '<AUTH_OUTRO>') on conflict do nothing;
insert into whatsapp_mensagens (conversa_id, empresa_id, direcao, conteudo, tipo, status, usuario_id, lida, is_nota_interna, menciona_todos)
values ('<CONVERSA>', '<EMPRESA_DEMO>', 'saida', '@todos ensaio', 'texto', 'enviado', '<ID_TESTE>', true, true, true);

select origem, conversa_chave, lugar, link, (select nome from usuarios where id = mencionado_id) as para from mencoes;
select tipo, titulo, link from notificacoes where tipo = 'mencao';
```

Expected: 2 menções (uma `chat` com chave `geral`, uma `whatsapp_nota`), **as duas para a outra conta**; nenhuma da conversa direta; 2 registros no sininho com `link` preenchido. Terminar com `rollback;` e conferir `select count(*) from information_schema.tables where table_name = 'mencoes'` → `0`.

- [ ] **Step 4: Commit (aplicar é na Task 8)**

```bash
git add -- supabase/migrations/20260911140000_mencoes.sql
git commit --only -m "feat(mencao): mencoes no banco, com conferencia de acesso e registro no sininho

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -- supabase/migrations/20260911140000_mencoes.sql src/integrations/supabase/types.ts
```

Mesmo cuidado com `types.ts` dos blocos anteriores.

---

### Task 5: Aviso, sininho e @ no menu

**Files:**
- Create: `src/lib/mencoes-por-conversa.ts`, `src/lib/mencoes-por-conversa.test.ts`
- Create: `src/lib/aviso-de-mensagem-nova.test.ts`
- Create: `src/hooks/use-mencoes.ts`
- Modify: `src/lib/aviso-de-mensagem-nova.ts`
- Modify: `src/hooks/use-notificacoes.ts` (tipo `Notificacao :12-22`; aviso do chat `:153-177`)
- Modify: `src/components/layout/NotificationCenter.tsx:206-211`
- Modify: `src/components/layout/AppSidebar.tsx:101-103`, `:416-443`

**Interfaces:**
- Produces:
  - `interface MencaoNaoLida { id: string; origem: 'chat' | 'whatsapp_nota'; conversa_chave: string }`
  - `contarPorChave(lista: MencaoNaoLida[]): { chat: Record<string, number>; whatsapp: Record<string, number>; totalChat: number; totalWhatsapp: number }`
  - `useMencoesNaoLidas()` — query `['mencoes_nao_lidas', meId]` com o resultado de `contarPorChave`
  - `useAvisoDeMencao()` — tempo real + aviso na tela; montado **uma vez**, no `AppSidebar`
  - `useMarcarMencoesLidas()` — `mutate({ origem, chave })`
  - `avisarMensagemNova({ …, acao?: string })`

- [ ] **Step 1: Teste da contagem e do aviso (falha)**

A contagem fica num arquivo puro de propósito: `use-mencoes.ts` importa o cliente do banco, e o teste não precisa dele.

Criar `src/lib/mencoes-por-conversa.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { contarPorChave } from './mencoes-por-conversa';

describe('contarPorChave', () => {
  it('separa chat e WhatsApp, por conversa', () => {
    expect(
      contarPorChave([
        { id: '1', origem: 'chat', conversa_chave: 'geral' },
        { id: '2', origem: 'chat', conversa_chave: 'geral' },
        { id: '3', origem: 'chat', conversa_chave: 'grupo_g1' },
        { id: '4', origem: 'whatsapp_nota', conversa_chave: 'c9' },
      ]),
    ).toEqual({ chat: { geral: 2, grupo_g1: 1 }, whatsapp: { c9: 1 }, totalChat: 3, totalWhatsapp: 1 });
  });

  it('lista vazia', () => {
    expect(contarPorChave([])).toEqual({ chat: {}, whatsapp: {}, totalChat: 0, totalWhatsapp: 0 });
  });
});
```

Criar `src/lib/aviso-de-mensagem-nova.test.ts`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

const toastFalso = vi.fn();
vi.mock('sonner', () => ({ toast: (...args: unknown[]) => toastFalso(...args) }));
vi.mock('@/lib/som', () => ({ tocarNotificacao: vi.fn() }));

import { avisarMensagemNova } from './aviso-de-mensagem-nova';

afterEach(() => {
  cleanup();
  toastFalso.mockReset();
});

const tituloDoUltimoAviso = () => (toastFalso.mock.calls.at(-1)![0] as () => JSX.Element)();

describe('avisarMensagemNova', () => {
  it('sem ação, continua "enviou uma mensagem"', () => {
    avisarMensagemNova({ de: 'Carlos', previa: 'oi' });
    render(tituloDoUltimoAviso());
    expect(screen.getByText(/enviou uma mensagem/)).toBeTruthy();
  });

  it('menção troca por "te mencionou no Geral"', () => {
    avisarMensagemNova({ de: 'Carlos', acao: 'te mencionou no Geral', previa: 'oi' });
    render(tituloDoUltimoAviso());
    expect(screen.getByText(/te mencionou no Geral/)).toBeTruthy();
    expect(screen.queryByText(/enviou uma mensagem/)).toBeNull();
  });
});
```

Run: `npx vitest run src/lib/mencoes-por-conversa.test.ts src/lib/aviso-de-mensagem-nova.test.ts` → FAIL (a contagem ainda não existe, e o segundo caso do aviso falha).

- [ ] **Step 2: O parâmetro `acao`**

Em `src/lib/aviso-de-mensagem-nova.ts`:
- em `AvisoDeMensagemNova`, depois de `de: string;`:
```ts
  /** O que a pessoa fez. Padrão: "enviou uma mensagem". Menção: "te mencionou no Geral". */
  acao?: string;
```
- na assinatura: `export function avisarMensagemNova({ de, acao = 'enviou uma mensagem', previa, aoAbrir, conversaId }: AvisoDeMensagemNova): void {`
- no toast: trocar `' enviou uma mensagem'` por `` ` ${acao}` ``.

- [ ] **Step 3: A contagem (pura) e `use-mencoes.ts`**

Criar `src/lib/mencoes-por-conversa.ts`:

```ts
/** Menções ainda não vistas, contadas por conversa — o que acende o @ em cada lugar. */
export interface MencaoNaoLida {
  id: string;
  origem: 'chat' | 'whatsapp_nota';
  conversa_chave: string;
}

export function contarPorChave(lista: MencaoNaoLida[]) {
  const chat: Record<string, number> = {};
  const whatsapp: Record<string, number> = {};
  for (const m of lista) {
    const alvo = m.origem === 'chat' ? chat : whatsapp;
    alvo[m.conversa_chave] = (alvo[m.conversa_chave] ?? 0) + 1;
  }
  const soma = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
  return { chat, whatsapp, totalChat: soma(chat), totalWhatsapp: soma(whatsapp) };
}
```

Criar `src/hooks/use-mencoes.ts`:

```ts
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { avisarMensagemNova, previaDaMensagem } from '@/lib/aviso-de-mensagem-nova';
import { contarPorChave, type MencaoNaoLida } from '@/lib/mencoes-por-conversa';

/** Menções ainda não vistas, por conversa. A RLS só devolve as da própria pessoa. */
export function useMencoesNaoLidas() {
  const { profile } = useAuth();
  const meId: string | undefined = profile?.id;
  return useQuery({
    queryKey: ['mencoes_nao_lidas', meId],
    enabled: !!meId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mencoes')
        .select('id, origem, conversa_chave')
        .eq('mencionado_id', meId!)
        .is('lida_em', null);
      if (error) throw error;
      return contarPorChave((data ?? []) as MencaoNaoLida[]);
    },
  });
}

/**
 * O aviso na tela quando alguém me menciona. 🔴 MONTAR UMA VEZ SÓ (AppSidebar): cada
 * montagem abre um canal, e dois canais dariam dois avisos.
 */
export function useAvisoDeMencao() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const meId: string | undefined = profile?.id;

  useEffect(() => {
    if (!meId) return;
    const canal = supabase
      .channel(`mencoes-rt-${meId}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mencoes', filter: `mencionado_id=eq.${meId}` },
        (payload) => {
          qc.invalidateQueries({ queryKey: ['mencoes_nao_lidas'] });
          if (payload.eventType !== 'INSERT') return;
          const m = payload.new as {
            autor_nome: string | null; lugar: string; previa: string | null; link: string;
            origem: string; conversa_chave: string;
          };
          avisarMensagemNova({
            de: m.autor_nome ?? 'Alguém',
            acao: `te mencionou ${m.lugar}`,
            previa: previaDaMensagem(m.previa, 'Menção'),
            aoAbrir: () => navigate(m.link),
            // Nota do WhatsApp: se a pessoa já está naquela conversa, o som cala sozinho.
            conversaId: m.origem === 'whatsapp_nota' ? m.conversa_chave : null,
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [meId, navigate, qc]);
}

/** Abrir a conversa marca as menções dela como vistas — some o @. */
export function useMarcarMencoesLidas() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async ({ origem, chave }: { origem: 'chat' | 'whatsapp_nota'; chave: string }) => {
      const { error } = await supabase
        .from('mencoes')
        .update({ lida_em: new Date().toISOString() })
        .eq('mencionado_id', profile!.id)
        .eq('origem', origem)
        .eq('conversa_chave', chave)
        .is('lida_em', null);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mencoes_nao_lidas'] }),
  });
}
```

Run: `npx vitest run src/lib/mencoes-por-conversa.test.ts src/lib/aviso-de-mensagem-nova.test.ts` → PASS (4 testes).

- [ ] **Step 4: O aviso normal do chat cala quando é menção a mim, e abre a conversa certa**

Em `src/hooks/use-notificacoes.ts`, dentro do `if (payload.eventType === 'INSERT' && meId && payload.new.usuario_id !== meId) {` (linha 153), logo no começo do bloco:

```ts
          // Menção a mim: quem avisa é useAvisoDeMencao ("te mencionou"). Avisar aqui também
          // daria dois avisos pela mesma mensagem.
          const mencionados: string[] = Array.isArray(payload.new.mencionados) ? payload.new.mencionados : [];
          if (!payload.new.recipient_id && (mencionados.includes(meId) || payload.new.menciona_todos)) return;
```

e trocar `aoAbrir: () => navigate('/chat'),` (linha 175) por:

```ts
            aoAbrir: () => navigate(`/chat?conversa=${
              payload.new.grupo_id ? `grupo_${payload.new.grupo_id}`
                : payload.new.recipient_id ? `dm_${payload.new.usuario_id}`
                : 'geral'
            }`),
```

(apagar o comentário "O chat interno não tem rota por conversa…", que deixa de ser verdade).

No tipo `Notificacao` (linhas 12-22), depois de `cliente_id`: `  link?: string | null;`. Se a consulta de `useNotificacoes` listar colunas no `.select(...)`, acrescentar `link`; se for `'*'`, nada a fazer.

- [ ] **Step 5: O sininho abre o destino**

Em `src/components/layout/NotificationCenter.tsx:208-211`, trocar

```tsx
                      if (n.pedido_id) irPara(`/pedidos/${n.pedido_id}/editar`);
```

por

```tsx
                      if (n.link) irPara(n.link);
                      else if (n.pedido_id) irPara(`/pedidos/${n.pedido_id}/editar`);
```

- [ ] **Step 6: O @ no menu lateral**

Em `src/components/layout/AppSidebar.tsx`:
- imports: `import { useAvisoDeMencao, useMencoesNaoLidas } from '@/hooks/use-mencoes';`
- depois da linha 103:
```tsx
  const { data: mencoes } = useMencoesNaoLidas();
  // Montado aqui porque o menu está em toda tela: é o que garante o aviso de menção
  // mesmo com o chat e o WhatsApp fechados. UMA vez só.
  useAvisoDeMencao();
```
- dentro do `displayItems.map`, depois de `const badgeCount = …`:
```tsx
                    const temArroba =
                      (item.id === 'chat' && (mencoes?.totalChat ?? 0) > 0) ||
                      (item.id === 'whatsapp' && (mencoes?.totalWhatsapp ?? 0) > 0);
```
- a bolinha do menu recolhido passa a acender também com `temArroba`: trocar `{showBadge && collapsed && (` por `{(showBadge || temArroba) && collapsed && (`.
- no `labelEl`, logo antes de `{showBadge && (`:
```tsx
                        {temArroba && (
                          <span
                            title="Você foi mencionado"
                            aria-label="Você foi mencionado"
                            className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground"
                          >
                            @
                          </span>
                        )}
```
e no `<span>` do número vermelho, trocar `ml-2` por `ml-1.5` (os dois selos lado a lado).

Run: `npm run test` → tudo passando. `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "error TS"` → ≤ 36.

- [ ] **Step 7: Commit**

```bash
git add -- src/lib/mencoes-por-conversa.ts src/lib/mencoes-por-conversa.test.ts src/lib/aviso-de-mensagem-nova.test.ts src/hooks/use-mencoes.ts
git commit --only -m "feat(mencao): aviso na tela, sininho que abre a conversa e @ no menu lateral

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -- src/lib/mencoes-por-conversa.ts src/lib/mencoes-por-conversa.test.ts src/lib/aviso-de-mensagem-nova.test.ts src/hooks/use-mencoes.ts src/lib/aviso-de-mensagem-nova.ts src/hooks/use-notificacoes.ts src/components/layout/NotificationCenter.tsx src/components/layout/AppSidebar.tsx
```

---

### Task 6: O chat interno

**Files:**
- Modify: `src/hooks/use-chat.ts` (`ChatMessage :9-28`, `useSendMessage :452-648`)
- Modify: `src/pages/Chat.tsx`

**Interfaces:**
- Consumes: Tasks 1–3 e 5; `useVendedores` de `@/hooks/use-clientes` (chave `['usuarios']`, já sem excluídos).
- Produces: `send(conteudo, files?, grupoId?, recipientId?, quoted?, mencoes?: { ids: string[]; todos: boolean })`.

- [ ] **Step 1: Enviar as menções**

Em `src/hooks/use-chat.ts`:
- no tipo `ChatMessage`, acrescentar `  mencionados?: string[];` e `  menciona_todos?: boolean;`
- no `mutationFn` de `useSendMessage` (linha 457), acrescentar `mencoes` à desestruturação e ao tipo: `mencoes?: { ids: string[]; todos: boolean } | null`
- logo depois de `quotedFields` (linha 475):
```ts
      const camposDeMencao = {
        mencionados: mencoes?.ids ?? [],
        menciona_todos: mencoes?.todos ?? false,
      };
```
- no `newMsg` de texto (linha 479): acrescentar `...camposDeMencao,`
- no `newMsg` com anexo (linha 516): acrescentar `...(i === 0 ? camposDeMencao : {}),`
- em `send` (linha 638): acrescentar o sexto parâmetro `mencoes?: { ids: string[]; todos: boolean } | null` e repassá-lo em `mutation.mutateAsync({ conteudo, files, grupoId, recipientId, quoted, mencoes })`.

- [ ] **Step 2: O campo com @ (só Geral e grupos)**

Em `src/pages/Chat.tsx`:
- imports:
```tsx
import { useSearchParams } from 'react-router-dom';
import { useVendedores } from '@/hooks/use-clientes';
import { useCampoComMencao } from '@/hooks/use-campo-com-mencao';
import { ListaDeMencao } from '@/components/mencao/ListaDeMencao';
import { TextoComMencoes } from '@/components/mencao/TextoComMencoes';
import { useMencoesNaoLidas, useMarcarMencoesLidas } from '@/hooks/use-mencoes';
import { alvoDaChave, chaveDoAlvo } from '@/lib/alvo-do-chat';
```
- depois da query `grupoMembros` (linha ~873):
```tsx
  // Quem pode ser mencionado: no Geral, a empresa toda; no grupo, os membros. Sempre sem
  // a própria pessoa e sem excluído (`useVendedores` já vem sem excluído).
  const { data: ativos = [] } = useVendedores();
  const pessoasMencionaveis = useMemo(() => {
    const vivos = (ativos as { id: string; nome: string | null; avatar_url?: string | null; user_id: string | null }[])
      .filter((u) => u.user_id && u.id !== myVendedor);
    const base = target.type === 'grupo'
      ? vivos.filter((u) => grupoMembros.some((m) => m.id === u.id))
      : vivos;
    return base.map((u) => ({ id: u.id, nome: u.nome ?? 'Sem nome', avatar_url: u.avatar_url }));
  }, [ativos, grupoMembros, myVendedor, target.type]);
  const nomePorId = useMemo(
    () => new Map((ativos as { id: string; nome: string | null }[]).map((u) => [u.id, u.nome ?? ''])),
    [ativos],
  );
  const meuNome = nomePorId.get(myVendedor ?? '') ?? null;

  const mencao = useCampoComMencao({
    texto: text,
    setTexto: setText,
    pessoas: pessoasMencionaveis,
    ativo: target.type !== 'dm',
    totalDaConversa: pessoasMencionaveis.length,
    ref: inputRef,
  });
```
- em `handleSend` (linha 960), logo depois de `const trimmed = text.trim();` e antes de `setText('')`: `    const mencoes = mencao.paraEnviar(trimmed);`; trocar a chamada `await send(trimmed, files, activeGrupoId, activeRecipientId, quoted);` por `await send(trimmed, files, activeGrupoId, activeRecipientId, quoted, mencoes);` e, no `finally`, acrescentar `mencao.limpar();`.
- no contêiner do campo (linha 2198), trocar `<div className="border-t border-border px-4 py-3">` por `<div className="relative border-t border-border px-4 py-3">` e acrescentar logo dentro dele:
```tsx
            {mencao.aberta && (
              <ListaDeMencao
                className="absolute bottom-full left-4 z-20 mb-1"
                consulta={mencao.consulta}
                sugestoes={mencao.sugestoes}
                ativa={mencao.ativa}
                onEscolher={mencao.escolher}
                mensagemVazia="Ninguém com esse nome nesta conversa."
              />
            )}
```
- no `<Textarea>` (linhas ~2289-2298): trocar `onChange={(e) => setText(e.target.value)}` por `onChange={mencao.aoMudar}` e `onKeyDown={handleKeyDown}` por `onKeyDown={(e) => { if (mencao.aoTeclar(e)) return; handleKeyDown(e); }}`.

- [ ] **Step 3: O nome destacado na bolha**

Linha 1960: trocar

```tsx
                                {msg.conteudo && !(msg.arquivo_url && msg.conteudo === msg.arquivo_nome) && linkifyText(msg.conteudo)}
```

por

```tsx
                                {msg.conteudo && !(msg.arquivo_url && msg.conteudo === msg.arquivo_nome) && (
                                  <TextoComMencoes
                                    texto={msg.conteudo}
                                    nomes={(msg.mencionados ?? []).map((id) => nomePorId.get(id) ?? '').filter(Boolean)}
                                    todos={!!msg.menciona_todos}
                                    meuNome={meuNome}
                                  />
                                )}
```

Se `linkifyText` deixar de ser usado em `Chat.tsx`, remover o import (conferir com Grep).

- [ ] **Step 4: `?conversa=` e marcar lidas**

Depois de `const [target, setTarget] = useState<ChatTarget>({ type: 'geral' });` (linha 622):

```tsx
  // Vindo de um aviso ou do sininho: abre a conversa certa e limpa o endereço.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const alvo = alvoDaChave(searchParams.get('conversa'));
    if (!alvo) return;
    setTarget(alvo);
    setSearchParams((prev) => { const n = new URLSearchParams(prev); n.delete('conversa'); return n; }, { replace: true });
  }, [searchParams, setSearchParams]);

  const { data: mencoes } = useMencoesNaoLidas();
  const marcarMencoesLidas = useMarcarMencoesLidas();
  const chaveAtual = chaveDoAlvo(target);
  // Estar com a conversa aberta é ter visto a menção — inclusive a que chega enquanto a
  // pessoa está lá. Só dispara quando há o que marcar.
  useEffect(() => {
    if (target.type === 'dm') return;
    if (!mencoes?.chat[chaveAtual]) return;
    marcarMencoesLidas.mutate({ origem: 'chat', chave: chaveAtual });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveAtual, mencoes?.chat[chaveAtual]]);
```

- [ ] **Step 5: O @ na lista de conversas**

No componente `MembersList` (linhas ~100-400):
- na interface de props (perto da linha 114), acrescentar `mencoesPorChave: Record<string, number>;` e desestruturar.
- onde `<MembersList … unreadCounts={unreadCounts} />` é usado (linha ~1294), acrescentar `mencoesPorChave={mencoes?.chat ?? {}}`.
- nas duas versões (recolhida e aberta), para o Geral e para cada grupo (não nas diretas), acrescentar **antes** do número vermelho:

versão aberta (linhas ~258 e ~295):
```tsx
                {(mencoesPorChave['geral'] ?? 0) > 0 && (
                  <span aria-label="Você foi mencionado" className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">@</span>
                )}
```
(para grupo, a chave é `` `grupo_${g.id}` ``), deixando os dois selos num `<div className="flex items-center gap-1">`.

versão recolhida (linhas ~144 e ~168): quando houver menção e não houver número vermelho, mostrar a mesma bolinha com `@`:
```tsx
          {(mencoesPorChave['geral'] ?? 0) > 0 && !(unreadCounts['geral'] > 0) && (
            <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-primary text-[7px] font-bold text-primary-foreground ring-1 ring-background">@</span>
          )}
```

- [ ] **Step 6: Conferir e commitar**

Run: `npm run test` → tudo passando; `npx tsc …` ≤ 36; `npx eslint src/pages/Chat.tsx src/hooks/use-chat.ts` sem problema novo.

```bash
git commit --only -m "feat(mencao): @ no chat Geral e nos grupos, com a conversa certa aberta pelo aviso

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -- src/hooks/use-chat.ts src/pages/Chat.tsx
```

---

### Task 7: As notas do WhatsApp

**Files:**
- Modify: `src/hooks/use-whatsapp-inbox.ts` (`WaMensagem` perto da linha 126; `useWaAddNota :1715-1760`)
- Modify: `src/pages/WhatsAppInbox.tsx`

**Interfaces:**
- Consumes: Tasks 1–3 e 5; RPC `pessoas_mencionaveis_na_conversa` (Task 4).
- Produces: `useWaAddNota().mutateAsync({ conversaId, texto, fixada?, mencionados?: string[], mencionaTodos?: boolean })`.

- [ ] **Step 1: A nota envia as menções**

Em `src/hooks/use-whatsapp-inbox.ts`:
- no tipo `WaMensagem`, perto de `is_nota_interna?: boolean;` (linha 129): `  mencionados?: string[];` e `  menciona_todos?: boolean;`
- em `useWaAddNota`, trocar a desestruturação por `{ conversaId, texto, fixada = false, mencionados = [], mencionaTodos = false }: { conversaId: string; texto: string; fixada?: boolean; mencionados?: string[]; mencionaTodos?: boolean }` e acrescentar ao `.insert({...})`: `mencionados,` e `menciona_todos: mencionaTodos,`.

- [ ] **Step 2: O @ na janela "Adicionar nota"**

Em `src/pages/WhatsAppInbox.tsx`, no componente principal (onde ficam `novaNotaOpen`/`notaTexto`, linhas ~4445-4476):
- imports no topo:
```tsx
import { useQuery } from '@tanstack/react-query'; // se ainda não estiver importado
import { useCampoComMencao } from '@/hooks/use-campo-com-mencao';
import { ListaDeMencao } from '@/components/mencao/ListaDeMencao';
import { TextoComMencoes } from '@/components/mencao/TextoComMencoes';
import { useMencoesNaoLidas, useMarcarMencoesLidas } from '@/hooks/use-mencoes';
```
- depois de `const setNotaFixadaMutation = useWaSetNotaFixada();` (linha 4448):
```tsx
  // Quem pode ser mencionado na nota: só quem atende o número E enxerga esta conversa.
  // Quem decide é o banco (pessoas_mencionaveis_na_conversa), com a mesma regra da RLS.
  const notaTextoRef = useRef<HTMLTextAreaElement>(null);
  const { data: mencionaveisDaNota = [] } = useQuery({
    queryKey: ['mencionaveis_da_conversa', conversaAtiva?.id],
    enabled: novaNotaOpen && !!conversaAtiva?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('pessoas_mencionaveis_na_conversa', {
        p_conversa_id: conversaAtiva!.id,
      });
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string; avatar_url: string | null }[];
    },
  });
  const mencaoNota = useCampoComMencao({
    texto: notaTexto,
    setTexto: setNotaTexto,
    pessoas: mencionaveisDaNota,
    ativo: true,
    totalDaConversa: mencionaveisDaNota.length,
    ref: notaTextoRef,
  });
```
- em `salvarNotaManual` (linha 4458): antes do `try`, `const { ids, todos } = mencaoNota.paraEnviar(notaTexto.trim());`; na chamada `addNota.mutateAsync({ … })`, acrescentar `mencionados: ids, mencionaTodos: todos,`; depois do `setNovaNotaOpen(false);`, acrescentar `mencaoNota.limpar();`.
- no diálogo (linhas 9677-9686), trocar o bloco do `Textarea` por:
```tsx
          <div className="space-y-1.5">
            <Label htmlFor="nota-texto">Nota interna</Label>
            <Textarea
              id="nota-texto"
              ref={notaTextoRef}
              rows={4}
              value={notaTexto}
              onChange={mencaoNota.aoMudar}
              onKeyDown={(e) => { mencaoNota.aoTeclar(e); }}
              placeholder="Visível só pra equipe — não é enviada ao contato. Use @ para chamar alguém."
            />
            {mencaoNota.aberta && (
              <ListaDeMencao
                consulta={mencaoNota.consulta}
                sugestoes={mencaoNota.sugestoes}
                ativa={mencaoNota.ativa}
                onEscolher={mencaoNota.escolher}
                mensagemVazia={
                  conversaAtiva?.instancia_id
                    ? 'Ninguém com esse nome atende este número.'
                    : 'Ninguém atende este número, então não há a quem mencionar.'
                }
              />
            )}
          </div>
```
(A lista fica no fluxo, abaixo do campo, e não flutuando: o diálogo corta o que sai da borda dele.)

Se `useRef` ou `supabase` não estiverem importados no arquivo, acrescentá-los. Conferir o nome exato do campo de instância em `WaConversa` com Grep (`instancia_id` em `use-whatsapp-inbox.ts`).

- [ ] **Step 3: O nome destacado na nota**

No chip da nota (linha ~8600), trocar `{linkifyText(msg.conteudo)}` por:

```tsx
                                            <TextoComMencoes
                                              texto={msg.conteudo}
                                              nomes={(msg.mencionados ?? []).map((id) => vendedores.find((v) => v.id === id)?.nome ?? '').filter(Boolean)}
                                              todos={!!msg.menciona_todos}
                                              meuNome={profile?.nome}
                                            />
```

(`vendedores` é a lista de `useVendedores()` do componente principal, linha 4201.)

- [ ] **Step 4: O @ na lista de conversas e marcar lidas**

No componente principal:
```tsx
  const { data: mencoes } = useMencoesNaoLidas();
  const marcarMencoesLidas = useMarcarMencoesLidas();
  useEffect(() => {
    if (!conversaAtivaId || !mencoes?.whatsapp[conversaAtivaId]) return;
    marcarMencoesLidas.mutate({ origem: 'whatsapp_nota', chave: conversaAtivaId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversaAtivaId, conversaAtivaId ? mencoes?.whatsapp[conversaAtivaId] : undefined]);
```

Criar, perto de `NaoLidasBadge` (linha ~703):
```tsx
// O @ de "você foi mencionado numa nota desta conversa" — ao lado do número vermelho,
// como no WhatsApp. Some quando a pessoa abre a conversa.
function ArrobaDeMencao({ ativo }: { ativo: boolean }) {
  if (!ativo) return null;
  return (
    <span
      title="Você foi mencionado numa nota"
      aria-label="Você foi mencionado numa nota"
      className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground"
    >
      @
    </span>
  );
}
```

Usar ao lado de cada `<NaoLidasBadge …/>`:
- lista lateral (linha ~6678): `<ArrobaDeMencao ativo={(mencoes?.whatsapp[conv.id] ?? 0) > 0} />` antes do `<NaoLidasBadge …/>`.
- visão em tabela (linha ~1264): o componente dessa visão recebe props do pai. Acrescentar a prop `mencoesPorConversa?: Record<string, number>`, passar `mencoesPorConversa={mencoes?.whatsapp}` onde ele é usado, e renderizar `<ArrobaDeMencao ativo={(mencoesPorConversa?.[conv.id] ?? 0) > 0} />` antes do `NaoLidasBadge`.
- barra recolhida (linha ~7001): quando `!conversaNaoLida(conv, profile?.id) && (mencoes?.whatsapp[conv.id] ?? 0) > 0`, mostrar a bolinha com `@` na mesma posição, com `bg-primary`.

Na condição que decide mostrar a coluna da direita da linha (linha ~6671-6674), acrescentar `|| (mencoes?.whatsapp[conv.id] ?? 0) > 0`.

- [ ] **Step 5: Conferir e commitar**

Run: `npm run test`, `npx tsc …` ≤ 36, `npx eslint src/pages/WhatsAppInbox.tsx src/hooks/use-whatsapp-inbox.ts` sem problema novo.

```bash
git commit --only -m "feat(mencao): @ nas notas internas do WhatsApp, so para quem atende o numero

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -- src/hooks/use-whatsapp-inbox.ts src/pages/WhatsAppInbox.tsx
```

---

### Task 8: Verificação final e publicação

- [ ] **Step 1: Suíte completa**

```bash
npm run test
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "error TS"
npm run lint 2>&1 | tail -3
npm run build
```
Expected: todos passando (novos: 21 de `mencao`, 3 de `alvo-do-chat`, 5 da lista, 4 do texto, 5 do gancho, 2 da contagem, 2 do aviso); `tsc` ≤ 36; lint ≤ 427; build ok.

- [ ] **Step 2: Pedir o "pode" ao Lucas**

Em linguagem de consequência:
- **Banco:**
  - duas colunas novas nas mensagens do chat e nas do WhatsApp, e uma no sininho;
  - uma tabela nova de menções;
  - dois gatilhos.
  - Nada é apagado.
  - O gatilho do WhatsApp sai na primeira linha quando a mensagem não é nota, então não pesa no recebimento.
  - Se o gatilho falhar, a mensagem é gravada do mesmo jeito, só sem a menção.
- **Site:** o @ no Geral, nos grupos e na nota; o @ na lista e no menu; o aviso "te mencionou"; o sininho abrindo a conversa; o aviso do chat abrindo a conversa certa.
- **Ordem:** banco, depois site.

- [ ] **Step 3: Aplicar a migration (depois do "pode")**

MCP `apply_migration`, `name: mencoes`, conteúdo exato da Task 4. Conferir:
```sql
select tgname from pg_trigger where tgname in ('chat_anota_mencoes', 'wa_anota_mencoes');
select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'mencoes';
```
Expected: os 2 gatilhos; `1`.

- [ ] **Step 4: Publicar o site (só os commits deste bloco)**

Mesmo caminho: `git cherry -v origin/main HEAD` → worktree de `origin/main` → `cherry-pick` dos commits das Tasks 1–7 → `git diff --stat HEAD <HEAD testado> -- <arquivos deste bloco>` vazio → `git push origin HEAD:main` → remover o worktree → `gh api …/status` = `success`.

- [ ] **Step 5: Ponta a ponta, com duas contas (com o Lucas)**

Com as duas contas da demo, em duas janelas:
1. **Geral:** a conta A escreve "@" e escolhe B. B recebe:
   - o aviso "A te mencionou no Geral", com som, e **só esse** (não também "enviou uma mensagem");
   - o @ no item Chat do menu e ao lado do Geral na lista;
   - o registro no sininho, que, clicado, abre o Geral.
2. **Leitura:** B abre o Geral e o @ some.
3. **Conversa direta:** digitar @ não abre lista.
4. **Nota:** numa conversa de WhatsApp com número vinculado e as duas contas atendendo, A cria nota com "@todos". B recebe:
   - "A te mencionou numa nota da conversa com …";
   - o @ ao lado da conversa;
   - o sininho abre a conversa rolando até a nota.

Se a demo não tiver conversa com número vinculado (tarefa pendente das 12 conversas sem instância), fazer o item 4 depois que ela for resolvida e anotar o item como "não verificado" no relato ao Lucas.

Conferir o banco:
```sql
select origem, lugar, lida_em is not null as lida from mencoes order by created_at desc limit 5;
```
