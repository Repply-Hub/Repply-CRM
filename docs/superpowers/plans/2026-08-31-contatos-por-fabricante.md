# Vários contatos por fabricante — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** A fábrica deixa de ter um contato em duas colunas soltas e passa a ter uma lista de
contatos com função, um deles marcado como principal.

**Architecture:** Duas tabelas novas (`fabricante_funcoes` e `fabricante_contatos`) presas à
fábrica, que é a única tabela do núcleo comercial com `empresa_id` de verdade. As regras que
dão para errar em silêncio — ordenação, rótulo do cartão e a troca de principal — saem para
uma função pura com teste. A tela ganha uma seção na ficha da fábrica e um diálogo de
gerenciar funções, ambos em `src/components/fabricantes/`, para não engordar
`Fabricantes.tsx` (682 linhas).

**Tech Stack:** Postgres (Supabase), React 18 + TypeScript, TanStack Query, shadcn/Radix,
Vitest.

## Global Constraints

- **Desenho aprovado:** `docs/superpowers/specs/2026-08-31-contatos-por-fabricante-design.md`.
  Ler antes da Tarefa 1.
- **PT-BR** em código, comentário, teste, mensagem de tela e commit (`CLAUDE.md` §5.1).
- **Nunca editar migration existente** (`CLAUDE.md` §6.3). Só acrescentar arquivo novo.
- **Migration escrita ≠ migration aplicada.** Não há banco local; aplicar é gesto separado e
  precisa de autorização do Lucas.
- **Linhas de base que não podem subir:** testes `780` em 48 arquivos
  (`npx vitest run`), tipos `35` (`npx tsc --noEmit -p tsconfig.app.json` — **com o `-p`**),
  lint `455` (`npx eslint .`).
- **Modal usa `<ConteudoDialogo>`**, nunca `<DialogContent>` cru (`CLAUDE.md` §7.11) — este
  projeto desligou Esc e clique-fora, e modal sem teto de altura prende a pessoa na tela.
- 🔴 **Há outra sessão ativa na mesma pasta.** Antes de cada commit: `git fetch origin`,
  `git status --short` num comando SEPARADO, e **nunca `git add -A`** (`CLAUDE.md` §13).
- 🔴 **`git push` PUBLICA** (`CLAUDE.md` §16). Rodar a verificação ANTES de enviar.

### 🔴 O número da migration pode colidir

A última em disco é `20260831120000`. Este plano usa `20260831150000`. **Confira antes de
criar o arquivo** — a outra sessão está commitando migrations no mesmo dia:

```bash
ls supabase/migrations | tail -3
```

Se já existir algo `>= 20260831150000`, use o próximo horário livre.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/20260831150000_contatos_por_fabricante.sql` | **Criar** — as duas tabelas, RLS, políticas, semeadura, backfill e a chamada do gerador do cerco |
| `src/lib/contatos-da-fabrica.ts` | **Criar** — ordenação, rótulo do cartão e a regra do principal. Funções puras, sem React |
| `src/lib/contatos-da-fabrica.test.ts` | **Criar** — o teste dessas regras |
| `src/integrations/supabase/types.ts` | **Modificar** — declarar as duas tabelas |
| `src/hooks/use-fabricante-contatos.ts` | **Criar** — leitura e gravação de contatos e funções |
| `src/components/fabricantes/ContatosDaFabrica.tsx` | **Criar** — a seção da ficha |
| `src/components/fabricantes/GerenciarFuncoesDialog.tsx` | **Criar** — o diálogo de funções |
| `src/pages/Fabricantes.tsx` | **Modificar** — o cartão passa a mostrar o principal |

---

## Task 1: O banco

**Files:**
- Create: `supabase/migrations/20260831150000_contatos_por_fabricante.sql`

**Interfaces:**
- Produces: tabelas `public.fabricante_funcoes` e `public.fabricante_contatos`, com as colunas
  descritas abaixo. As tarefas 3 a 6 dependem exatamente desses nomes.

- [ ] **Step 1: Conferir o número livre**

```bash
ls supabase/migrations | tail -3
```

Se algum for `>= 20260831150000`, escolha o próximo horário livre e use-o em todo o resto
desta tarefa.

- [ ] **Step 2: Escrever a migration**

Criar `supabase/migrations/20260831150000_contatos_por_fabricante.sql`:

```sql
-- ============================================================================
-- VÁRIOS CONTATOS POR FABRICANTE
-- ============================================================================
-- Desenho: docs/superpowers/specs/2026-08-31-contatos-por-fabricante-design.md
--
-- Hoje a fábrica tem UM contato, em duas colunas soltas (`nome_contato`, `telefone`).
-- Medido em 31/08/2026: essas colunas estão VAZIAS nas 28 fábricas da MD. No sistema
-- inteiro são 9 registros preenchidos — 1 da JHS e 8 da base de demonstração.
--
-- 🔴 POR QUE O ISOLAMENTO AQUI É O MAIS SIMPLES DO SISTEMA, E POR QUE NÃO COPIAR ISTO
--
-- `fabricantes` é a ÚNICA tabela do núcleo comercial que se prende à empresa por
-- `empresa_id`. `clientes` tem a coluna e ela está NULA nas 1.306 linhas; `pedidos` e
-- `obras` não têm coluna nenhuma, e o recorte real deles é `usuario_id →
-- usuarios.empresa_id`. Então o contato de fábrica herda o caminho mais curto que existe
-- aqui: uma junção com a fábrica dona.
--
-- NÃO copie este desenho para contato de cliente ou de obra — lá `empresa_id` mentiria.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. A lista de funções, por empresa
-- ---------------------------------------------------------------------------
create table if not exists public.fabricante_funcoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null,
  ordem integer not null default 0,
  -- veio da semeadura. Não impede apagar: só marca a origem, como em kanban_colunas.
  is_sistema boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Duas funções com o mesmo nome na mesma empresa é a mesma informação, não uma segunda.
create unique index if not exists fabricante_funcoes_nome_uniq
  on public.fabricante_funcoes (empresa_id, lower(nome));

-- ---------------------------------------------------------------------------
-- 2. Os contatos
-- ---------------------------------------------------------------------------
create table if not exists public.fabricante_contatos (
  id uuid primary key default gen_random_uuid(),
  fabricante_id uuid not null references public.fabricantes(id) on delete cascade,
  -- ON DELETE SET NULL, e não CASCADE: apagar a função "Logística" não pode apagar o
  -- telefone do pessoal da logística. Eles ficam sem função, que é recuperável.
  funcao_id uuid references public.fabricante_funcoes(id) on delete set null,
  nome text not null,
  telefone text,
  email text,
  observacao text,
  principal boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_fabricante_contatos_fabricante
  on public.fabricante_contatos (fabricante_id);

-- 🔴 O índice parcial é o que impede duas pessoas marcarem principais diferentes ao mesmo
-- tempo e o banco aceitar os dois. Sem ele, o cartão mostraria um dos dois sem critério —
-- e ninguém saberia que houve conflito.
create unique index if not exists fabricante_contatos_um_principal
  on public.fabricante_contatos (fabricante_id) where principal;

-- ---------------------------------------------------------------------------
-- 3. Segurança
-- ---------------------------------------------------------------------------
-- Mesmo alcance que JÁ vale para editar a fábrica desde 19/08/2026
-- (20260819125643_fabricantes_escrita_para_todo_membro_da_empresa.sql): qualquer membro da
-- empresa. Não se inventa permissão nova para um cadastro auxiliar.
alter table public.fabricante_funcoes  enable row level security;
alter table public.fabricante_contatos enable row level security;

drop policy if exists "fabricante_funcoes_select" on public.fabricante_funcoes;
create policy "fabricante_funcoes_select" on public.fabricante_funcoes
  for select to authenticated
  using (public.is_admin() or empresa_id = public.get_my_empresa_id());

drop policy if exists "fabricante_funcoes_insert" on public.fabricante_funcoes;
create policy "fabricante_funcoes_insert" on public.fabricante_funcoes
  for insert to authenticated
  with check (public.is_admin() or empresa_id = public.get_my_empresa_id());

drop policy if exists "fabricante_funcoes_update" on public.fabricante_funcoes;
create policy "fabricante_funcoes_update" on public.fabricante_funcoes
  for update to authenticated
  using (public.is_admin() or empresa_id = public.get_my_empresa_id())
  with check (public.is_admin() or empresa_id = public.get_my_empresa_id());

drop policy if exists "fabricante_funcoes_delete" on public.fabricante_funcoes;
create policy "fabricante_funcoes_delete" on public.fabricante_funcoes
  for delete to authenticated
  using (public.is_admin() or empresa_id = public.get_my_empresa_id());

-- As de contato se apoiam na fábrica dona. O WITH CHECK é escrito à mão nas duas pontas:
-- sem ele, o UPDATE poderia MOVER um contato para a fábrica de outra empresa — o USING
-- olha a linha de origem, não a de destino.
drop policy if exists "fabricante_contatos_select" on public.fabricante_contatos;
create policy "fabricante_contatos_select" on public.fabricante_contatos
  for select to authenticated
  using (exists (
    select 1 from public.fabricantes f
    where f.id = fabricante_contatos.fabricante_id
      and (public.is_admin() or f.empresa_id = public.get_my_empresa_id())));

drop policy if exists "fabricante_contatos_insert" on public.fabricante_contatos;
create policy "fabricante_contatos_insert" on public.fabricante_contatos
  for insert to authenticated
  with check (exists (
    select 1 from public.fabricantes f
    where f.id = fabricante_contatos.fabricante_id
      and (public.is_admin() or f.empresa_id = public.get_my_empresa_id())));

drop policy if exists "fabricante_contatos_update" on public.fabricante_contatos;
create policy "fabricante_contatos_update" on public.fabricante_contatos
  for update to authenticated
  using (exists (
    select 1 from public.fabricantes f
    where f.id = fabricante_contatos.fabricante_id
      and (public.is_admin() or f.empresa_id = public.get_my_empresa_id())))
  with check (exists (
    select 1 from public.fabricantes f
    where f.id = fabricante_contatos.fabricante_id
      and (public.is_admin() or f.empresa_id = public.get_my_empresa_id())));

drop policy if exists "fabricante_contatos_delete" on public.fabricante_contatos;
create policy "fabricante_contatos_delete" on public.fabricante_contatos
  for delete to authenticated
  using (exists (
    select 1 from public.fabricantes f
    where f.id = fabricante_contatos.fabricante_id
      and (public.is_admin() or f.empresa_id = public.get_my_empresa_id())));

-- ---------------------------------------------------------------------------
-- 4. A semeadura da lista de funções
-- ---------------------------------------------------------------------------
-- Empresa nova nasce com uma lista de partida, EDITÁVEL. Isso não contradiz o princípio de
-- não impor a prática da MD (SPEC.md §4): o que aquele princípio proíbe é lista cravada no
-- código, que o assinante não consegue mudar.
--
-- A lista existe por causa de uma medição: o campo de contato de hoje está vazio nas 28
-- fábricas da MD. Lista vazia obrigaria a sair da tela antes de cadastrar o primeiro
-- contato — o mesmo atrito que matou o campo antigo.
create or replace function public.criar_fabricante_funcoes_padrao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.fabricante_funcoes (empresa_id, nome, ordem, is_sistema) values
    (new.id, 'Gerente comercial',   0, true),
    (new.id, 'Logística',           1, true),
    (new.id, 'Assistência técnica', 2, true),
    (new.id, 'Financeiro',          3, true),
    (new.id, 'Representante',       4, true)
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists trg_criar_fabricante_funcoes_padrao on public.empresas;
create trigger trg_criar_fabricante_funcoes_padrao
after insert on public.empresas
for each row execute function public.criar_fabricante_funcoes_padrao();

-- O gatilho só vale para empresa NOVA. As que já existem recebem a mesma lista aqui.
insert into public.fabricante_funcoes (empresa_id, nome, ordem, is_sistema)
select e.id, v.nome, v.ordem, true
from public.empresas e
cross join (values
  ('Gerente comercial', 0), ('Logística', 1), ('Assistência técnica', 2),
  ('Financeiro', 3), ('Representante', 4)
) as v(nome, ordem)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 5. Os 9 contatos que já existem viram o principal da sua fábrica
-- ---------------------------------------------------------------------------
-- Sem função: não há como adivinhar qual delas, e chutar seria pior que deixar em branco.
insert into public.fabricante_contatos (fabricante_id, nome, telefone, principal)
select f.id,
       coalesce(nullif(trim(f.nome_contato), ''), 'Contato'),
       nullif(trim(f.telefone), ''),
       true
from public.fabricantes f
where coalesce(trim(f.nome_contato), '') <> ''
   or coalesce(trim(f.telefone), '') <> ''
on conflict do nothing;

-- 🔴 `fabricantes.nome_contato` e `fabricantes.telefone` NÃO CAEM AQUI.
--
-- Publicar o banco e publicar o site não são o mesmo ato nem acontecem no mesmo minuto.
-- Derrubar as colunas junto abre uma janela em que o site ANTIGO — ainda no ar — lê uma
-- coluna que já sumiu, e a tela de Fábricas quebra para cliente pagante.
--
-- O DROP vai em arquivo próprio, DEPOIS do site novo publicado. É o caminho de dois passos
-- que `obras.status` (20260824120000, "passo 2 de 2") e `contatos.obra_id` já seguiram.

-- ---------------------------------------------------------------------------
-- 6. O cerco do bloqueio por falta de pagamento
-- ---------------------------------------------------------------------------
-- Desde 30/08/2026 isso é um GERADOR, não cópia manual: ele varre as tabelas e cria as
-- políticas de INSERT/UPDATE/DELETE que faltam. Copiar à mão foi o que produziu o defeito
-- de `obra_contatos`, que saiu pela metade e passou quatro semanas sem ninguém notar.
--
-- O gerador só ENXERGA tabela com RLS ligada — por isso o passo 3 vem antes deste.
select public.aplicar_gate_de_plano();

comment on table public.fabricante_contatos is
  'Contatos da fábrica (gerente, logística, assistência técnica...). Pertencem a UMA '
  'fábrica: diferente de obra_contatos, que é N:N porque o comprador da construtora cuida '
  'de vários canteiros. O gerente da Portobello trabalha na Portobello.';

comment on table public.fabricante_funcoes is
  'A lista de funções por empresa. Nasce semeada e é editável — ponto de partida, não regra.';
```

- [ ] **Step 3: Conferir que o teste do cerco continua passando**

O teste lê os ARQUIVOS de migration e exige que toda tabela criada tenha RLS ligada em
alguma migration.

Run: `npx vitest run src/test/gate-de-plano.test.ts`
Expected: PASS. Se falhar apontando `fabricante_funcoes` ou `fabricante_contatos`, o
`enable row level security` do passo 3 da migration não foi escrito.

- [ ] **Step 4: Rodar a suíte inteira**

Run: `npx vitest run`
Expected: `780 passed` em 48 arquivos. A migration não muda teste nenhum; este passo existe
só para provar que o arquivo novo não quebrou o teste que lê migrations.

- [ ] **Step 5: Commit**

```bash
git fetch origin
git status --short
git add supabase/migrations/20260831150000_contatos_por_fabricante.sql
git diff --cached --name-only
git commit -m "feat(fabricantes): as duas tabelas de contato por fábrica (migration NÃO aplicada)"
```

> 🔴 **Escrever a migration não é aplicá-la.** Aplicar precisa de autorização do Lucas e é
> gesto separado. O commit diz isso no título de propósito.

---

## Task 2: As regras que dão para errar em silêncio

**Files:**
- Create: `src/lib/contatos-da-fabrica.ts`
- Test: `src/lib/contatos-da-fabrica.test.ts`

**Interfaces:**
- Produces:
  - `type ContatoDaFabrica = { id: string; nome: string; telefone: string | null; email: string | null; observacao: string | null; principal: boolean; funcao_id: string | null }`
  - `type FuncaoDaFabrica = { id: string; nome: string; ordem: number }`
  - `ordenarContatos(contatos: ContatoDaFabrica[], funcoes: FuncaoDaFabrica[]): ContatoDaFabrica[]`
  - `rotuloDoCartao(contatos: ContatoDaFabrica[], funcoes: FuncaoDaFabrica[]): string | null`
  - `aoMarcarPrincipal(contatos: ContatoDaFabrica[], idAlvo: string): { id: string; principal: boolean }[]`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/lib/contatos-da-fabrica.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  ordenarContatos,
  rotuloDoCartao,
  aoMarcarPrincipal,
  type ContatoDaFabrica,
  type FuncaoDaFabrica,
} from './contatos-da-fabrica';

/**
 * POR QUE ESTE ARQUIVO EXISTE: três regras desta funcionalidade erram em SILÊNCIO se
 * ficarem soltas na tela.
 *
 * 1. A ordenação: sem critério explícito, a lista sai na ordem que o banco devolver, que
 *    muda entre consultas. O usuário vê os contatos dançando de posição sem motivo.
 * 2. O rótulo do cartão: com zero contatos ele tem que sumir, não virar "undefined · +0".
 * 3. A troca de principal: o banco tem índice único parcial e RECUSA dois principais na
 *    mesma fábrica. Se a tela mandar só "marca este" sem desmarcar o outro, a gravação é
 *    recusada e a pessoa vê uma frase genérica.
 */

const funcoes: FuncaoDaFabrica[] = [
  { id: 'f1', nome: 'Gerente comercial', ordem: 0 },
  { id: 'f2', nome: 'Logística', ordem: 1 },
];

const contato = (over: Partial<ContatoDaFabrica> & { id: string; nome: string }): ContatoDaFabrica => ({
  telefone: null, email: null, observacao: null, principal: false, funcao_id: null, ...over,
});

describe('ordenarContatos', () => {
  it('põe o principal em primeiro, mesmo que a função dele venha depois', () => {
    const lista = [
      contato({ id: 'a', nome: 'Ana', funcao_id: 'f1' }),
      contato({ id: 'b', nome: 'Bruno', funcao_id: 'f2', principal: true }),
    ];
    expect(ordenarContatos(lista, funcoes).map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('depois do principal, ordena pela ordem da função', () => {
    const lista = [
      contato({ id: 'a', nome: 'Ana', funcao_id: 'f2' }),
      contato({ id: 'b', nome: 'Bruno', funcao_id: 'f1' }),
    ];
    expect(ordenarContatos(lista, funcoes).map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('quem não tem função vai para o fim, não para o começo', () => {
    // Sem isto, um contato salvo às pressas sem função apareceria antes do gerente.
    const lista = [
      contato({ id: 'a', nome: 'Ana' }),
      contato({ id: 'b', nome: 'Bruno', funcao_id: 'f2' }),
    ];
    expect(ordenarContatos(lista, funcoes).map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('empata pelo nome, para a ordem não mudar entre consultas', () => {
    const lista = [
      contato({ id: 'a', nome: 'Zeca', funcao_id: 'f1' }),
      contato({ id: 'b', nome: 'Ana', funcao_id: 'f1' }),
    ];
    expect(ordenarContatos(lista, funcoes).map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('não altera o array recebido', () => {
    const lista = [contato({ id: 'a', nome: 'Ana' }), contato({ id: 'b', nome: 'Bruno' })];
    const copia = [...lista];
    ordenarContatos(lista, funcoes);
    expect(lista).toEqual(copia);
  });
});

describe('rotuloDoCartao', () => {
  it('mostra o principal com a função e a contagem dos demais', () => {
    const lista = [
      contato({ id: 'a', nome: 'Jorge Menezes', funcao_id: 'f1', principal: true }),
      contato({ id: 'b', nome: 'Ana' }),
      contato({ id: 'c', nome: 'Bruno' }),
    ];
    expect(rotuloDoCartao(lista, funcoes)).toBe('Jorge Menezes · Gerente comercial  +2');
  });

  it('sem outros contatos, não mostra contagem', () => {
    const lista = [contato({ id: 'a', nome: 'Jorge Menezes', funcao_id: 'f1', principal: true })];
    expect(rotuloDoCartao(lista, funcoes)).toBe('Jorge Menezes · Gerente comercial');
  });

  it('sem função, mostra só o nome', () => {
    const lista = [contato({ id: 'a', nome: 'Jorge Menezes', principal: true })];
    expect(rotuloDoCartao(lista, funcoes)).toBe('Jorge Menezes');
  });

  it('🔴 sem contato nenhum devolve null, e o cartão não desenha a linha', () => {
    expect(rotuloDoCartao([], funcoes)).toBeNull();
  });

  it('sem principal marcado, usa o primeiro da ordenação em vez de sumir', () => {
    // Cenário real: os 9 contatos migrados nascem principais, mas alguém pode desmarcar.
    const lista = [contato({ id: 'a', nome: 'Ana', funcao_id: 'f2' }), contato({ id: 'b', nome: 'Bruno', funcao_id: 'f1' })];
    expect(rotuloDoCartao(lista, funcoes)).toBe('Bruno · Gerente comercial  +1');
  });
});

describe('aoMarcarPrincipal', () => {
  it('🔴 devolve TAMBÉM o desmarque do anterior — o banco recusa dois principais', () => {
    const lista = [
      contato({ id: 'a', nome: 'Ana', principal: true }),
      contato({ id: 'b', nome: 'Bruno' }),
    ];
    expect(aoMarcarPrincipal(lista, 'b')).toEqual([
      { id: 'a', principal: false },
      { id: 'b', principal: true },
    ]);
  });

  it('marcar quem já é principal não gera gravação nenhuma', () => {
    const lista = [contato({ id: 'a', nome: 'Ana', principal: true })];
    expect(aoMarcarPrincipal(lista, 'a')).toEqual([]);
  });

  it('sem nenhum principal antes, só marca o alvo', () => {
    const lista = [contato({ id: 'a', nome: 'Ana' }), contato({ id: 'b', nome: 'Bruno' })];
    expect(aoMarcarPrincipal(lista, 'b')).toEqual([{ id: 'b', principal: true }]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/contatos-da-fabrica.test.ts`
Expected: FAIL — `Failed to resolve import "./contatos-da-fabrica"`.

- [ ] **Step 3: Escrever a implementação**

Criar `src/lib/contatos-da-fabrica.ts`:

```ts
/**
 * As três regras dos contatos de fábrica que erram em silêncio se ficarem soltas na tela.
 *
 * Funções puras, sem React e sem Supabase: é o que permite testá-las: este projeto não tem
 * teste de componente nenhum (48 arquivos, zero `render(`), então regra que fica dentro do
 * `.tsx` não é coberta por nada.
 */

export interface ContatoDaFabrica {
  id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  observacao: string | null;
  principal: boolean;
  funcao_id: string | null;
}

export interface FuncaoDaFabrica {
  id: string;
  nome: string;
  ordem: number;
}

/** Sem função vai para o FIM. Number.MAX_SAFE_INTEGER é o que garante isso sem `if` espalhado. */
function ordemDaFuncao(contato: ContatoDaFabrica, funcoes: FuncaoDaFabrica[]): number {
  if (!contato.funcao_id) return Number.MAX_SAFE_INTEGER;
  const f = funcoes.find((x) => x.id === contato.funcao_id);
  return f ? f.ordem : Number.MAX_SAFE_INTEGER;
}

/**
 * Principal primeiro, depois pela ordem da função, e o empate pelo nome.
 *
 * O empate por nome não é capricho: sem um critério final, a ordem sai como o banco
 * devolver — e ela muda entre consultas. O usuário veria os contatos trocando de lugar
 * sozinhos ao recarregar.
 */
export function ordenarContatos(
  contatos: ContatoDaFabrica[],
  funcoes: FuncaoDaFabrica[],
): ContatoDaFabrica[] {
  return [...contatos].sort((a, b) => {
    if (a.principal !== b.principal) return a.principal ? -1 : 1;
    const oa = ordemDaFuncao(a, funcoes);
    const ob = ordemDaFuncao(b, funcoes);
    if (oa !== ob) return oa - ob;
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });
}

/**
 * O que o cartão da fábrica mostra: `Jorge Menezes · Gerente comercial  +3`.
 *
 * Devolve `null` quando não há contato — e aí o cartão NÃO desenha a linha, como já faz
 * hoje com `nome_contato` vazio. Devolver string vazia deixaria um espaço fantasma.
 */
export function rotuloDoCartao(
  contatos: ContatoDaFabrica[],
  funcoes: FuncaoDaFabrica[],
): string | null {
  if (contatos.length === 0) return null;
  const [primeiro, ...resto] = ordenarContatos(contatos, funcoes);
  const funcao = funcoes.find((f) => f.id === primeiro.funcao_id);
  const base = funcao ? `${primeiro.nome} · ${funcao.nome}` : primeiro.nome;
  return resto.length > 0 ? `${base}  +${resto.length}` : base;
}

/**
 * O que precisa ser gravado ao marcar alguém como principal.
 *
 * 🔴 Devolve TAMBÉM o desmarque do anterior. O banco tem índice único parcial
 * (`fabricante_contatos_um_principal`) e RECUSA dois principais na mesma fábrica: mandar
 * só "marca este" faz a gravação ser recusada, e o erro do Supabase não é um `Error` —
 * a tela cairia na frase genérica sem explicar nada (CLAUDE.md §4.6).
 *
 * Devolve lista vazia quando não há o que mudar, para a tela não gravar à toa.
 */
export function aoMarcarPrincipal(
  contatos: ContatoDaFabrica[],
  idAlvo: string,
): { id: string; principal: boolean }[] {
  const alvo = contatos.find((c) => c.id === idAlvo);
  if (!alvo || alvo.principal) return [];
  const anterior = contatos.find((c) => c.principal && c.id !== idAlvo);
  const mudancas: { id: string; principal: boolean }[] = [];
  if (anterior) mudancas.push({ id: anterior.id, principal: false });
  mudancas.push({ id: idAlvo, principal: true });
  return mudancas;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/contatos-da-fabrica.test.ts`
Expected: PASS, 13 testes.

- [ ] **Step 5: Commit**

```bash
git fetch origin
git status --short
git add src/lib/contatos-da-fabrica.ts src/lib/contatos-da-fabrica.test.ts
git diff --cached --name-only
git commit -m "feat(fabricantes): as regras de ordem, rótulo e principal dos contatos"
```

---

## Task 3: Tipos e hook

**Files:**
- Modify: `src/integrations/supabase/types.ts`
- Create: `src/hooks/use-fabricante-contatos.ts`

**Interfaces:**
- Consumes: as tabelas da Tarefa 1; os tipos da Tarefa 2.
- Produces:
  - `useFabricanteContatos(fabricanteId: string | undefined)` → `{ data: ContatoDaFabrica[] }`
  - `useFabricanteFuncoes()` → `{ data: FuncaoDaFabrica[] }`
  - `useSalvarContato()`, `useRemoverContato()`, `useMarcarPrincipal()`
  - `useSalvarFuncao()`, `useRemoverFuncao()`

- [ ] **Step 1: Declarar as tabelas em types.ts**

`src/integrations/supabase/types.ts` é mantido à mão neste projeto. Dentro de
`Database.public.Tables`, em ordem alfabética (entre `fabricante_arquivo_envios` e
`fabricantes`), acrescentar:

```ts
      fabricante_contatos: {
        Row: {
          created_at: string
          email: string | null
          fabricante_id: string
          funcao_id: string | null
          id: string
          nome: string
          observacao: string | null
          principal: boolean
          telefone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          fabricante_id: string
          funcao_id?: string | null
          id?: string
          nome: string
          observacao?: string | null
          principal?: boolean
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          fabricante_id?: string
          funcao_id?: string | null
          id?: string
          nome?: string
          observacao?: string | null
          principal?: boolean
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      fabricante_funcoes: {
        Row: {
          created_at: string
          empresa_id: string
          id: string
          is_sistema: boolean
          nome: string
          ordem: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          empresa_id: string
          id?: string
          is_sistema?: boolean
          nome: string
          ordem?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          empresa_id?: string
          id?: string
          is_sistema?: boolean
          nome?: string
          ordem?: number
          updated_at?: string
        }
        Relationships: []
      }
```

- [ ] **Step 2: Conferir que os tipos não subiram**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "error TS"`
Expected: `35`. **Com o `-p`** — sem ele o compilador não olha arquivo nenhum e devolve
sucesso falso (`CLAUDE.md` §9).

- [ ] **Step 3: Escrever o hook**

Criar `src/hooks/use-fabricante-contatos.ts`:

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { mensagemDeErro } from '@/lib/mensagem-de-erro';
import type { ContatoDaFabrica, FuncaoDaFabrica } from '@/lib/contatos-da-fabrica';

/**
 * Contatos e funções da fábrica.
 *
 * 🔴 Todo `catch` daqui usa `mensagemDeErro`, nunca `e instanceof Error ? e.message : ...`.
 * Erro do Supabase NÃO é um `Error` — é objeto simples `{message, details, hint, code}` —,
 * então `instanceof` dá falso justamente para os erros que interessam e a tela cai numa
 * frase genérica, escondendo o que o banco explicou (CLAUDE.md §4.6).
 */

export function useFabricanteContatos(fabricanteId: string | undefined) {
  return useQuery({
    queryKey: ['fabricante_contatos', fabricanteId],
    enabled: !!fabricanteId,
    queryFn: async (): Promise<ContatoDaFabrica[]> => {
      const { data, error } = await supabase
        .from('fabricante_contatos')
        .select('id, nome, telefone, email, observacao, principal, funcao_id')
        .eq('fabricante_id', fabricanteId!);
      if (error) throw error;
      return (data ?? []) as ContatoDaFabrica[];
    },
  });
}

export function useFabricanteFuncoes() {
  return useQuery({
    queryKey: ['fabricante_funcoes'],
    queryFn: async (): Promise<FuncaoDaFabrica[]> => {
      const { data, error } = await supabase
        .from('fabricante_funcoes')
        .select('id, nome, ordem')
        .order('ordem');
      if (error) throw error;
      return (data ?? []) as FuncaoDaFabrica[];
    },
  });
}

interface DadosDeContato {
  id?: string;
  fabricante_id: string;
  nome: string;
  funcao_id: string | null;
  telefone: string | null;
  email: string | null;
  observacao: string | null;
  principal?: boolean;
}

export function useSalvarContato() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dados: DadosDeContato) => {
      const { id, ...campos } = dados;
      const q = id
        ? supabase.from('fabricante_contatos').update(campos).eq('id', id)
        : supabase.from('fabricante_contatos').insert(campos);
      // `.select('id')` para a recusa por regra de segurança não passar por sucesso: no
      // PostgREST, gravação que atinge zero linhas NÃO devolve erro.
      const { data, error } = await q.select('id');
      if (error) throw new Error(mensagemDeErro(error));
      if (!data || data.length === 0) {
        throw new Error('A regra de segurança do banco recusou essa gravação.');
      }
      return data[0];
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['fabricante_contatos', v.fabricante_id] });
    },
  });
}

export function useRemoverContato() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; fabricanteId: string }) => {
      const { data, error } = await supabase
        .from('fabricante_contatos').delete().eq('id', id).select('id');
      if (error) throw new Error(mensagemDeErro(error));
      if (!data || data.length === 0) {
        throw new Error('A regra de segurança do banco recusou essa exclusão.');
      }
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['fabricante_contatos', v.fabricanteId] });
    },
  });
}

/**
 * Grava a troca de principal. Recebe a lista pronta de `aoMarcarPrincipal`, que já inclui
 * o DESMARQUE do anterior — o banco recusa dois principais na mesma fábrica.
 *
 * O desmarque vai primeiro, e em sequência, não em paralelo: marcar antes de desmarcar
 * bateria no índice único.
 */
export function useMarcarPrincipal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      mudancas,
    }: { mudancas: { id: string; principal: boolean }[]; fabricanteId: string }) => {
      for (const m of [...mudancas].sort((a, b) => Number(a.principal) - Number(b.principal))) {
        const { error } = await supabase
          .from('fabricante_contatos').update({ principal: m.principal }).eq('id', m.id);
        if (error) throw new Error(mensagemDeErro(error));
      }
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['fabricante_contatos', v.fabricanteId] });
    },
  });
}

export function useSalvarFuncao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dados: { id?: string; nome: string; ordem: number; empresa_id: string }) => {
      const { id, ...campos } = dados;
      const q = id
        ? supabase.from('fabricante_funcoes').update(campos).eq('id', id)
        : supabase.from('fabricante_funcoes').insert(campos);
      const { data, error } = await q.select('id');
      if (error) throw new Error(mensagemDeErro(error));
      if (!data || data.length === 0) {
        throw new Error('A regra de segurança do banco recusou essa gravação.');
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fabricante_funcoes'] }),
  });
}

/**
 * Apagar a função NÃO apaga contato: a chave estrangeira é `ON DELETE SET NULL`, então os
 * contatos que a usavam ficam sem função. É recuperável; apagar telefone não seria.
 */
export function useRemoverFuncao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('fabricante_funcoes').delete().eq('id', id).select('id');
      if (error) throw new Error(mensagemDeErro(error));
      if (!data || data.length === 0) {
        throw new Error('A regra de segurança do banco recusou essa exclusão.');
      }
    },
    onSuccess: (_d) => {
      qc.invalidateQueries({ queryKey: ['fabricante_funcoes'] });
      qc.invalidateQueries({ queryKey: ['fabricante_contatos'] });
    },
  });
}
```

- [ ] **Step 4: Conferir tipos e lint**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "error TS"`
Expected: `35`.

Run: `npx eslint src/hooks/use-fabricante-contatos.ts`
Expected: sem erro novo.

- [ ] **Step 5: Commit**

```bash
git fetch origin
git status --short
git add src/integrations/supabase/types.ts src/hooks/use-fabricante-contatos.ts
git diff --cached --name-only
git commit -m "feat(fabricantes): tipos e hook dos contatos por fábrica"
```

---

## Task 4: A seção Contatos na ficha da fábrica

**Files:**
- Create: `src/components/fabricantes/ContatosDaFabrica.tsx`

**Interfaces:**
- Consumes: `useFabricanteContatos`, `useFabricanteFuncoes`, `useSalvarContato`,
  `useRemoverContato`, `useMarcarPrincipal` (Tarefa 3); `ordenarContatos`,
  `aoMarcarPrincipal` (Tarefa 2).
- Produces: `<ContatosDaFabrica fabricanteId={string} />`

- [ ] **Step 1: Escrever o componente**

Criar `src/components/fabricantes/ContatosDaFabrica.tsx`:

```tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ConteudoDialogo } from '@/components/shared/DialogoResponsivo';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Star, Pencil, Trash2, Plus, Phone, Mail } from 'lucide-react';
import { toast } from 'sonner';
import {
  useFabricanteContatos, useFabricanteFuncoes, useSalvarContato,
  useRemoverContato, useMarcarPrincipal,
} from '@/hooks/use-fabricante-contatos';
import { ordenarContatos, aoMarcarPrincipal, type ContatoDaFabrica } from '@/lib/contatos-da-fabrica';

/** Nenhum campo além do nome é obrigatório — inclusive a função (ver §3.2 do desenho). */
const VAZIO = { nome: '', funcao_id: '', telefone: '', email: '', observacao: '' };

export function ContatosDaFabrica({ fabricanteId }: { fabricanteId: string }) {
  const { data: contatos = [] } = useFabricanteContatos(fabricanteId);
  const { data: funcoes = [] } = useFabricanteFuncoes();
  const salvar = useSalvarContato();
  const remover = useRemoverContato();
  const marcar = useMarcarPrincipal();

  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState<ContatoDaFabrica | null>(null);
  const [form, setForm] = useState(VAZIO);

  const emOrdem = ordenarContatos(contatos, funcoes);

  function abrirNovo() {
    setEditando(null);
    setForm(VAZIO);
    setAberto(true);
  }

  function abrirEdicao(c: ContatoDaFabrica) {
    setEditando(c);
    setForm({
      nome: c.nome,
      funcao_id: c.funcao_id ?? '',
      telefone: c.telefone ?? '',
      email: c.email ?? '',
      observacao: c.observacao ?? '',
    });
    setAberto(true);
  }

  async function gravar() {
    if (!form.nome.trim()) {
      toast.error('O nome do contato é obrigatório.');
      return;
    }
    try {
      await salvar.mutateAsync({
        id: editando?.id,
        fabricante_id: fabricanteId,
        nome: form.nome.trim(),
        funcao_id: form.funcao_id || null,
        telefone: form.telefone.trim() || null,
        email: form.email.trim() || null,
        observacao: form.observacao.trim() || null,
        // O primeiro contato da fábrica nasce principal — senão o cartão fica sem ninguém
        // até alguém lembrar de marcar.
        ...(editando ? {} : { principal: contatos.length === 0 }),
      });
      setAberto(false);
      toast.success(editando ? 'Contato atualizado.' : 'Contato adicionado.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível salvar o contato.');
    }
  }

  async function tornarPrincipal(id: string) {
    const mudancas = aoMarcarPrincipal(contatos, id);
    if (mudancas.length === 0) return;
    try {
      await marcar.mutateAsync({ mudancas, fabricanteId });
      toast.success('Contato principal atualizado.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível marcar o principal.');
    }
  }

  async function excluir(c: ContatoDaFabrica) {
    try {
      await remover.mutateAsync({ id: c.id, fabricanteId });
      toast.success('Contato removido.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível remover o contato.');
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Contatos</h3>
        <Button size="sm" variant="outline" onClick={abrirNovo}>
          <Plus className="h-4 w-4 mr-1" /> Adicionar
        </Button>
      </div>

      {emOrdem.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhum contato cadastrado nesta fábrica.
        </p>
      )}

      <ul className="space-y-2">
        {emOrdem.map((c) => {
          const funcao = funcoes.find((f) => f.id === c.funcao_id);
          return (
            <li key={c.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{c.nome}</span>
                  {c.principal && (
                    <span className="text-[10px] uppercase tracking-wide text-primary">Principal</span>
                  )}
                </div>
                {funcao && <p className="text-xs text-muted-foreground">{funcao.nome}</p>}
                {c.telefone && (
                  <p className="text-xs flex items-center gap-1 mt-1">
                    <Phone className="h-3 w-3" /> {c.telefone}
                  </p>
                )}
                {c.email && (
                  <p className="text-xs flex items-center gap-1">
                    <Mail className="h-3 w-3" /> {c.email}
                  </p>
                )}
                {c.observacao && <p className="text-xs text-muted-foreground mt-1">{c.observacao}</p>}
              </div>
              <div className="flex items-center gap-1 flex-none">
                {!c.principal && (
                  <Button size="icon" variant="ghost" title="Tornar principal"
                          onClick={() => tornarPrincipal(c.id)}>
                    <Star className="h-4 w-4" />
                  </Button>
                )}
                <Button size="icon" variant="ghost" title="Editar" onClick={() => abrirEdicao(c)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" title="Remover" onClick={() => excluir(c)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <ConteudoDialogo className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar contato' : 'Novo contato'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </div>
            <div>
              <Label>Função</Label>
              <Select value={form.funcao_id || 'sem'}
                      onValueChange={(v) => setForm({ ...form, funcao_id: v === 'sem' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="Sem função" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sem">Sem função</SelectItem>
                  {funcoes.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Telefone</Label>
              <Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
            </div>
            <div>
              <Label>E-mail</Label>
              <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <Label>Observação</Label>
              <Input value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button onClick={gravar} disabled={salvar.isPending}>
              {salvar.isPending ? 'Salvando…' : 'Salvar'}
            </Button>
          </DialogFooter>
        </ConteudoDialogo>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: Conferir tipos e lint**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "error TS"`
Expected: `35`.

Run: `npx eslint src/components/fabricantes/ContatosDaFabrica.tsx`
Expected: sem erro novo.

- [ ] **Step 3: Commit**

```bash
git fetch origin
git status --short
git add src/components/fabricantes/ContatosDaFabrica.tsx
git diff --cached --name-only
git commit -m "feat(fabricantes): seção de contatos na ficha da fábrica"
```

---

## Task 5: O diálogo de gerenciar funções

**Files:**
- Create: `src/components/fabricantes/GerenciarFuncoesDialog.tsx`

**Interfaces:**
- Consumes: `useFabricanteFuncoes`, `useSalvarFuncao`, `useRemoverFuncao` (Tarefa 3);
  `useAuth` para o `empresa_id`.
- Produces: `<GerenciarFuncoesDialog open={boolean} onOpenChange={(v:boolean)=>void} />`

- [ ] **Step 1: Escrever o componente**

Criar `src/components/fabricantes/GerenciarFuncoesDialog.tsx`:

```tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ConteudoDialogo } from '@/components/shared/DialogoResponsivo';
import { Trash2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { useFabricanteFuncoes, useSalvarFuncao, useRemoverFuncao } from '@/hooks/use-fabricante-contatos';

/**
 * Gerenciar as funções de contato de fábrica.
 *
 * Vive AQUI, aberto de dentro da tela de Fábricas, e não em Configurações: lista usada num
 * lugar só fica perto de onde é usada — o mesmo caminho do "Gerenciar colunas" do Kanban.
 * Configurações já tem seis abas.
 */
export function GerenciarFuncoesDialog({
  open, onOpenChange,
}: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { profile } = useAuth();
  const { data: funcoes = [] } = useFabricanteFuncoes();
  const salvar = useSalvarFuncao();
  const remover = useRemoverFuncao();
  const [nova, setNova] = useState('');

  async function acrescentar() {
    const nome = nova.trim();
    if (!nome) return;
    if (!profile?.empresa_id) {
      toast.error('Seu perfil ainda está carregando. Tente de novo em instantes.');
      return;
    }
    try {
      await salvar.mutateAsync({
        nome, ordem: funcoes.length, empresa_id: profile.empresa_id,
      });
      setNova('');
      toast.success('Função adicionada.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível adicionar a função.');
    }
  }

  // 🔴 `ordem` vai com o valor QUE JÁ ESTAVA. Mandar `ordem: 0` aqui renomearia e, de
  //    quebra, jogaria a função para o topo da lista — uma mudança que ninguém pediu e que
  //    o usuário leria como bug da tela, não como efeito do rename.
  async function renomear(f: { id: string; nome: string; ordem: number }, nome: string) {
    const limpo = nome.trim();
    if (!limpo || limpo === f.nome) return;
    try {
      await salvar.mutateAsync({
        id: f.id, nome: limpo, ordem: f.ordem, empresa_id: profile!.empresa_id!,
      });
      toast.success('Função renomeada.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível renomear a função.');
    }
  }

  async function excluir(id: string) {
    try {
      await remover.mutateAsync(id);
      toast.success('Função removida. Os contatos que a usavam ficaram sem função.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível remover a função.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <ConteudoDialogo className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Funções de contato</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          Estas são as funções que você pode escolher ao cadastrar o contato de uma fábrica.
          Remover uma função não remove nenhum contato — eles ficam sem função.
        </p>

        <ul className="space-y-2">
          {funcoes.map((f) => (
            <li key={f.id} className="flex items-center gap-2">
              <Input defaultValue={f.nome} onBlur={(e) => renomear(f, e.target.value)} />
              <Button size="icon" variant="ghost" title="Remover" onClick={() => excluir(f.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2 pt-2">
          <Input placeholder="Nova função" value={nova} onChange={(e) => setNova(e.target.value)} />
          <Button onClick={acrescentar} disabled={salvar.isPending}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </ConteudoDialogo>
    </Dialog>
  );
}
```

- [ ] **Step 2: Conferir tipos e lint**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "error TS"`
Expected: `35`.

Run: `npx eslint src/components/fabricantes/GerenciarFuncoesDialog.tsx`
Expected: sem erro novo.

- [ ] **Step 3: Commit**

```bash
git fetch origin
git status --short
git add src/components/fabricantes/GerenciarFuncoesDialog.tsx
git diff --cached --name-only
git commit -m "feat(fabricantes): diálogo de gerenciar funções de contato"
```

---

## Task 6: O cartão passa a mostrar o principal

**Files:**
- Modify: `src/pages/Fabricantes.tsx`

**Interfaces:**
- Consumes: `rotuloDoCartao` (Tarefa 2), `useFabricanteFuncoes` (Tarefa 3),
  `<ContatosDaFabrica>` (Tarefa 4), `<GerenciarFuncoesDialog>` (Tarefa 5).

- [ ] **Step 1: Ler o trecho que desenha o contato hoje**

```bash
sed -n '340,410p' src/pages/Fabricantes.tsx
```

São dois pontos que leem `fab.nome_contato` — por volta das linhas 345 e 397. Os números
podem ter saído do lugar; localize por conteúdo:

```bash
grep -n "nome_contato" src/pages/Fabricantes.tsx
```

- [ ] **Step 2: Trocar a leitura pelo rótulo novo**

São **dois** blocos, lidos do arquivo em 31/08/2026. Ambos usam o ícone `User`, que
permanece.

**Bloco 1** (`FabricanteCard`, ~linha 345) — DE:

```tsx
          {fab.nome_contato && (
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <User className="h-3 w-3 flex-shrink-0" />
              {fab.nome_contato}
            </p>
          )}
```

PARA:

```tsx
          {rotuloDoCartao(contatosPorFabricante[fab.id] ?? [], funcoes) && (
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <User className="h-3 w-3 flex-shrink-0" />
              {rotuloDoCartao(contatosPorFabricante[fab.id] ?? [], funcoes)}
            </p>
          )}
```

**Bloco 2** (`FabricanteDetailHeader`, ~linha 397) — DE:

```tsx
                {fab.nome_contato && (
                  <span className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1.5 whitespace-nowrap">
                    <User className="h-3.5 w-3.5" />
                    {fab.nome_contato}
                  </span>
                )}
```

PARA:

```tsx
                {rotuloDoCartao(contatosPorFabricante[fab.id] ?? [], funcoes) && (
                  <span className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1.5 whitespace-nowrap">
                    <User className="h-3.5 w-3.5" />
                    {rotuloDoCartao(contatosPorFabricante[fab.id] ?? [], funcoes)}
                  </span>
                )}
```

> ⚠️ **O `{fab.telefone && …}` logo abaixo do bloco 2 NÃO sai nesta rodada.** A coluna
> continua existindo e preenchida (§6 do desenho: o `DROP` é o passo 2, depois do site
> publicado). Removê-la aqui apagaria da tela um telefone que ainda está no banco.

E, no topo do componente `Fabricantes`, buscar os contatos de todas as fábricas numa
consulta só — não uma por cartão:

```tsx
// Uma consulta para todos os cartões. Uma por cartão faria N consultas na abertura da
// tela, e a MD tem 28 fábricas.
const { data: todosContatos = [] } = useQuery({
  queryKey: ['fabricante_contatos', 'todos'],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('fabricante_contatos')
      .select('id, nome, telefone, email, observacao, principal, funcao_id, fabricante_id');
    if (error) throw error;
    return data ?? [];
  },
});
const contatosPorFabricante = todosContatos.reduce<Record<string, ContatoDaFabrica[]>>(
  (acc, c) => {
    (acc[c.fabricante_id] ??= []).push(c as ContatoDaFabrica);
    return acc;
  }, {});
const { data: funcoes = [] } = useFabricanteFuncoes();
```

- [ ] **Step 3: Ligar a seção e o diálogo**

No `FabricanteDetailHeader` (por volta da linha 358), dentro do `<CardContent>`, acrescentar:

```tsx
<ContatosDaFabrica fabricanteId={fab.id} />
```

E, na barra de ações da tela `Fabricantes`, um botão que abre o diálogo:

```tsx
<Button variant="outline" size="sm" onClick={() => setFuncoesAberto(true)}>
  Funções de contato
</Button>
```

com `const [funcoesAberto, setFuncoesAberto] = useState(false);` e
`<GerenciarFuncoesDialog open={funcoesAberto} onOpenChange={setFuncoesAberto} />` no fim do
JSX.

- [ ] **Step 4: Verificação completa**

```bash
npx vitest run
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "error TS"
npx eslint . 2>&1 | tail -3
npx vite build 2>&1 | tail -3
```

Expected: `793 passed` em 49 arquivos · tipos `35` · lint `<= 455` · build compila.

- [ ] **Step 5: Commit**

```bash
git fetch origin
git status --short
git add src/pages/Fabricantes.tsx
git diff --cached --name-only
git commit -m "feat(fabricantes): o cartão mostra o contato principal e a contagem"
```

---

## Task 7: Verificação na tela e aplicação no banco

- [ ] **Step 1: Rodar o app**

```bash
npm run dev
```

Abrir `http://localhost:8080/fabricantes`.

> ⚠️ Sem a migration aplicada, a seção de contatos vai mostrar erro de tabela inexistente.
> Isso é ESPERADO até o passo 3.

- [ ] **Step 2: Pedir autorização ao Lucas para aplicar a migration**

Dizer o que ela faz: cria duas tabelas, semeia cinco funções para as 10 empresas, e move os
9 contatos existentes para a tabela nova. **Não apaga nada.**

- [ ] **Step 3: Aplicar, com censo antes e depois**

```sql
-- ANTES
select count(*) as fabricantes_com_contato from fabricantes
where coalesce(trim(nome_contato),'') <> '' or coalesce(trim(telefone),'') <> '';
-- esperado: 9
```

Aplicar a migration. Depois:

```sql
select
  (select count(*) from fabricante_funcoes)  as funcoes,       -- esperado: 50 (10 empresas x 5)
  (select count(*) from fabricante_contatos) as contatos,      -- esperado: 9
  (select count(*) from fabricante_contatos where principal) as principais;  -- esperado: 9
```

- [ ] **Step 4: Conferir o critério de pronto do desenho**

Percorrer os 9 itens da §9 de
`docs/superpowers/specs/2026-08-31-contatos-por-fabricante-design.md`, um a um, na tela.

O item 3 é o que mais importa e o mais fácil de deixar passar: **o banco tem de recusar dois
principais na mesma fábrica**. Testar direto:

```sql
-- deve FALHAR com violação de índice único
update fabricante_contatos set principal = true
where fabricante_id = (select fabricante_id from fabricante_contatos where principal limit 1);
```

- [ ] **Step 5: Commit da nota de aplicação**

Registrar no commit qual versão do banco corresponde a qual commit do site (`CLAUDE.md`
§16): publicar o site e aplicar a migration são dois gestos, e esquecer um deixa código e
produção divergentes sem aviso.

---

## O que NÃO entra neste plano

- ❌ Derrubar `fabricantes.nome_contato` e `fabricantes.telefone` — é o passo 2, em arquivo
  próprio, **depois** do site novo publicado (§6 do desenho)
- ❌ Ligar conversa de WhatsApp a contato de fábrica
- ❌ Importar contatos de fábrica por planilha
- ❌ Reordenar funções arrastando (a coluna `ordem` existe; a interface de arrastar, não)
