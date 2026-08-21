# Controle de acesso por empresa — plano de execução

> **Para quem vai executar:** use `superpowers:subagent-driven-development` ou
> `superpowers:executing-plans`. Os passos usam caixa de seleção (`- [ ]`).

**O quê e o porquê estão em [`plano-controle-de-acesso.md`](plano-controle-de-acesso.md).**
Leia aquele primeiro. Este aqui é só o como.

**Objetivo:** cada empresa passa a ter um conjunto de seções liberadas, definido por um
preset com exceções por cima, e o sistema recusa de verdade o que estiver desligado.

**Abordagem:** uma lista única de seções no código; presets e exceções no banco; uma função
de banco que responde a mesma coisa para o site e para as políticas; e a recusa em três
camadas — menu, rota e banco.

**Pilha:** Supabase (Postgres + Edge Functions em Deno) · React 18 + TypeScript + Vite ·
TanStack Query · Vitest.

---

## Restrições globais

- **PT-BR** em interface, comentário, mensagem de erro e mensagem de commit.
- **Autorização do Lucas antes de cada commit e de cada envio.** É por commit.
- **Antes de cada commit:** `git fetch origin` e conferir commits de outra pessoa.
- **Nunca `git add -A`.** Há outra sessão na mesma pasta. Liste os arquivos um a um.
- **Nunca edite migration existente.** Só acrescente arquivo novo.
- **Escrever a migration não é aplicá-la.** Não há banco local.
- **Lint:** o critério é **o total não subir**. Base: 498 problemas.
- **Testes:** `npm run test` tem que continuar verde. Base: 152 testes em 10 arquivos.
- **Modal:** use `<ConteudoDialogo>`, não `<DialogContent>` (`CLAUDE.md` §7.11).
- **Dinheiro:** não aparece neste plano. Se aparecer, `CampoMoeda` (`CLAUDE.md` §7.10).
- **Ao aplicar migration pelo MCP**, o banco registra um carimbo próprio: confira
  `select version, name from supabase_migrations.schema_migrations order by version desc limit 3`
  e **renomeie o arquivo** para bater. (Aconteceu na blindagem do WhatsApp.)

### Dois eixos que não podem se misturar

O projeto **já tem** um sistema de permissões, e ele é de **outro eixo**:

| Já existe (por USUÁRIO) | Este plano (por EMPRESA) |
|---|---|
| `permissoes_usuario` — 128 linhas | `secao_excecoes` — nasce vazia |
| `permissao_presets` — 32 linhas | `secao_presets` |
| `has_funcionalidade(_usuario_id, _modulo, _funcionalidade)` | `empresa_tem_secao(p_secao)` |

**Não toque em nada da coluna da esquerda.** `has_funcionalidade` **não** é código morto a
reaproveitar: ela lê `permissoes_usuario.funcionalidades` e é a companheira da matriz de
permissões. Nenhuma política a usa hoje, mas ela pertence ao outro eixo.

A empresa define o que **existe**. A matriz define quem **vê**.

---

## Arquivos

| Arquivo | Responsabilidade | Tarefa |
|---|---|---|
| `src/lib/secoes.ts` | **Novo.** A lista única de seções + funções puras | 1 |
| `src/lib/secoes.test.ts` | **Novo.** Contrato da lista | 1 |
| `supabase/migrations/<ts>_secoes_por_empresa.sql` | **Nova.** Tabelas, função, preset padrão | 2 |
| `src/hooks/use-secoes.ts` | **Novo.** Pergunta ao banco quais seções a empresa tem | 3 |
| `src/App.tsx` | Guarda de seção no `ProtectedRoute` | 4 |
| `src/components/layout/AppSidebar.tsx` | Item some do menu | 5 |
| `src/hooks/use-admin-secoes.ts` | **Novo.** Dados da tela de admin | 6 |
| `src/pages/AdminSecoes.tsx` | **Nova.** Empresas, presets e exceções | 6, 7 |
| `supabase/migrations/<ts>_portal_exige_secao.sql` | **Nova.** Trava do Portal | 9 |
| `supabase/functions/portal-scraper/index.ts` e irmãs | Checagem dentro da função | 9 |
| Os 11 pontos de Obras | Cascata | 10 |
| Demais seções | Cascata | 11 |
| `src/hooks/use-permissoes.ts` | Matriz acompanha | 12 |
| `src/components/landing/RecursosSection.tsx` · `src/lib/planos.ts` | Portal sai da venda | 13 |

`<ts>` = carimbo `AAAAMMDDHHMMSS`.

---

## A ordem, e o ponto de parada

```
1-3   Fundação            → nada muda para quem usa
4-5   Recusa na tela      → o Portal some para todos, MD inclusive
6-7   Tela de admin
 8    ⏸ VOCÊ liga o Portal para a MD, pela tela
 9    Trava no banco      → só depois do passo 8 conferido
10-13 Cascata e limpeza
```

> 🔴 **A tarefa 9 não começa sem o passo 8 conferido.** Por decisão do dono do produto
> (decisão 7), nenhuma exceção nasce por migration: a MD só recupera o Portal quando alguém
> apertar o botão na tela. Travar antes deixaria a MD sem Portal e sem caminho de volta que
> não fosse mexer no banco à mão.

---

# FASE 1 — Fundação (invisível)

## Tarefa 1: A lista única de seções

**Arquivos:**
- Criar: `src/lib/secoes.ts`
- Criar: `src/lib/secoes.test.ts`

**Interfaces:**
- Consome: nada.
- Produz: `SECOES`, `SecaoId`, `Secao`, `secaoDaRota(pathname)`, `SECOES_DESLIGAVEIS` —
  usados nas tarefas 3, 4, 5, 6, 12.

**Por que lógica pura:** sem banco e sem rede, então é testável de verdade. E é o único
lugar onde a resposta "quais são as seções" existe.

- [ ] **Passo 1: escrever o teste que falha**

`src/lib/secoes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SECOES, SECOES_DESLIGAVEIS, secaoDaRota, type SecaoId } from './secoes';

/**
 * POR QUE ESTE ARQUIVO EXISTE: o projeto tinha DUAS listas de módulos que não batiam —
 * DEFAULT_SIDEBAR_ITEMS (15 ids, com os de admin) e MODULOS (14 chaves, com contatos e
 * pedidos). Criar uma terceira criaria uma terceira verdade. Estes testes fixam que a
 * lista nova É a verdade e que ela conversa com as duas antigas.
 */
describe('SECOES', () => {
  it('não tem id repetido', () => {
    const ids = SECOES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('tem exatamente 8 seções desligáveis', () => {
    expect(SECOES_DESLIGAVEIS.map((s) => s.id).sort()).toEqual(
      ['calendario', 'chat', 'dashboard', 'emails', 'obras', 'portal', 'tarefas', 'whatsapp'],
    );
  });

  it('marca como NÃO desligável o núcleo que o banco exige', () => {
    // pedidos.cliente_id e pedidos.fabricante_id são NOT NULL (11.909 de 11.909
    // preenchidos), e /app é a home autenticada. Desligar qualquer uma quebra o produto.
    for (const id of ['clientes', 'pipeline', 'fabricantes', 'configuracoes'] as SecaoId[]) {
      expect(SECOES.find((s) => s.id === id)?.desligavel).toBe(false);
    }
  });

  it('toda seção tem rota começando com barra', () => {
    for (const s of SECOES) expect(s.rota.startsWith('/')).toBe(true);
  });

  it('acha a seção pela rota exata', () => {
    expect(secaoDaRota('/portal')?.id).toBe('portal');
    expect(secaoDaRota('/obras')?.id).toBe('obras');
  });

  it('acha a seção por rota filha — detalhe de cliente conta como clientes', () => {
    expect(secaoDaRota('/clientes/acme-123')?.id).toBe('clientes');
  });

  it('devolve null para rota que não pertence a seção nenhuma', () => {
    expect(secaoDaRota('/login')).toBeNull();
    expect(secaoDaRota('/assinar')).toBeNull();
  });

  it('não confunde prefixo parecido', () => {
    // '/portalzinho' não é '/portal'. Sem esta regra, uma rota futura com nome
    // parecido herdaria a trava da seção errada.
    expect(secaoDaRota('/portalzinho')).toBeNull();
  });

  it('cobre as rotas SEM item de menu, que uma guarda por menu deixaria passar', () => {
    expect(secaoDaRota('/pedidos/novo')?.id).toBe('pipeline');
    expect(secaoDaRota('/pedidos/abc/editar')?.id).toBe('pipeline');
    expect(secaoDaRota('/contatos/joao-1')?.id).toBe('clientes');
  });

  it('toda seção aponta para pelo menos um módulo da matriz de permissões', () => {
    // Se uma seção for desligada, a linha dela precisa sumir da matriz por usuário.
    for (const s of SECOES) expect(s.modulosPermissao.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

```bash
npx vitest run src/lib/secoes.test.ts
```

Esperado: FALHA — `Failed to resolve import "./secoes"`.

- [ ] **Passo 3: escrever a implementação**

`src/lib/secoes.ts`:

```ts
/**
 * A lista única de seções do sistema.
 *
 * POR QUE ISTO EXISTE: até 21/08/2026 havia DUAS listas canônicas de módulos que não
 * batiam entre si — `DEFAULT_SIDEBAR_ITEMS` (src/hooks/use-sidebar-preferences.ts, 15 ids,
 * incluindo os 3 de admin) e `MODULOS` (src/hooks/use-permissoes.ts, 14 chaves, com
 * `contatos` e `pedidos` que o menu não tem). O controle de acesso por empresa precisava
 * de uma lista; criar a terceira criaria a terceira verdade.
 *
 * Esta passa a ser a verdade. As outras duas continuam existindo por ora (mexer nelas é a
 * tarefa 12), mas cada seção declara aqui a que ids delas corresponde.
 *
 * NÃO confundir com o eixo de permissão POR USUÁRIO (`permissoes_usuario`,
 * `permissao_presets`, `has_funcionalidade`). Aqui é POR EMPRESA: o que EXISTE para
 * aquele assinante. Lá é quem VÊ, dentro do que existe.
 */

export type SecaoId =
  | 'dashboard'
  | 'pipeline'
  | 'clientes'
  | 'obras'
  | 'fabricantes'
  | 'portal'
  | 'calendario'
  | 'tarefas'
  | 'chat'
  | 'whatsapp'
  | 'emails'
  | 'configuracoes';

export interface Secao {
  id: SecaoId;
  /** Rótulo na tela de admin. O menu tem o próprio rótulo, editável pelo usuário. */
  label: string;
  /** Rota raiz. Rotas filhas (`/clientes/:slug`) pertencem à mesma seção. */
  rota: string;
  /** Rotas adicionais que pertencem a esta seção e não descendem de `rota`. */
  rotasExtras?: string[];
  /**
   * false = o produto quebra sem ela. Não é escolha de projeto: `pedidos.cliente_id` e
   * `pedidos.fabricante_id` são NOT NULL, e `/app` é a home autenticada.
   */
  desligavel: boolean;
  /** Chaves equivalentes em MODULOS (src/hooks/use-permissoes.ts). */
  modulosPermissao: string[];
}

export const SECOES: Secao[] = [
  { id: 'dashboard',     label: 'Dashboard',     rota: '/dashboard',     desligavel: true,  modulosPermissao: ['dashboard'] },
  { id: 'pipeline',      label: 'Negócios',      rota: '/app',           rotasExtras: ['/pedidos'], desligavel: false, modulosPermissao: ['pipeline', 'pedidos'] },
  { id: 'clientes',      label: 'Clientes',      rota: '/clientes',      rotasExtras: ['/contatos'], desligavel: false, modulosPermissao: ['clientes', 'contatos'] },
  { id: 'obras',         label: 'Obras',         rota: '/obras',         desligavel: true,  modulosPermissao: ['obras'] },
  { id: 'fabricantes',   label: 'Fabricantes',   rota: '/fabricantes',   desligavel: false, modulosPermissao: ['fabricantes'] },
  { id: 'portal',        label: 'Portal',        rota: '/portal',        desligavel: true,  modulosPermissao: ['portal'] },
  { id: 'calendario',    label: 'Calendário',    rota: '/calendario',    desligavel: true,  modulosPermissao: ['calendario'] },
  { id: 'tarefas',       label: 'Tarefas',       rota: '/tarefas',       desligavel: true,  modulosPermissao: ['tarefas'] },
  { id: 'chat',          label: 'Chat interno',  rota: '/chat',          desligavel: true,  modulosPermissao: ['chat'] },
  { id: 'whatsapp',      label: 'WhatsApp',      rota: '/whatsapp',      desligavel: true,  modulosPermissao: ['whatsapp'] },
  { id: 'emails',        label: 'E-mail',        rota: '/emails',        desligavel: true,  modulosPermissao: ['emails'] },
  { id: 'configuracoes', label: 'Configurações', rota: '/configuracoes', desligavel: false, modulosPermissao: ['configuracoes'] },
];

export const SECOES_DESLIGAVEIS = SECOES.filter((s) => s.desligavel);

const POR_ID = new Map(SECOES.map((s) => [s.id, s]));
export const secaoPorId = (id: SecaoId): Secao | undefined => POR_ID.get(id);

/**
 * A que seção pertence uma rota.
 *
 * Casa a rota exata OU rota filha (`/clientes/acme-1` → clientes). A barra ao comparar o
 * prefixo não é detalhe: sem ela, `/portalzinho` casaria com `/portal` e herdaria a trava
 * da seção errada.
 *
 * Devolve null para rota que não pertence a seção nenhuma (`/login`, `/assinar`,
 * `/admin/...`) — quem chama trata null como "não há seção a checar".
 */
export function secaoDaRota(pathname: string): Secao | null {
  for (const s of SECOES) {
    for (const base of [s.rota, ...(s.rotasExtras ?? [])]) {
      if (pathname === base || pathname.startsWith(base + '/')) return s;
    }
  }
  return null;
}
```

- [ ] **Passo 4: rodar e ver passar**

```bash
npx vitest run src/lib/secoes.test.ts
```

Esperado: **10 passed**.

- [ ] **Passo 5: suíte inteira**

```bash
npm run test
```

Esperado: **162 testes** (152 + 10), zero falha.

- [ ] **Passo 6: pedir autorização e commitar**

```bash
git add src/lib/secoes.ts src/lib/secoes.test.ts
git commit -m "feat(acesso): lista única de seções do sistema"
```

---

## Tarefa 2: O banco

**Arquivos:**
- Criar: `supabase/migrations/<ts>_secoes_por_empresa.sql`

**Interfaces:**
- Produz: tabelas `secao_presets`, `secao_preset_itens`, `secao_excecoes`; coluna
  `empresas.secao_preset_id`; funções `empresa_tem_secao(text) → boolean` e
  `minhas_secoes() → table(secao text, habilitada boolean)`. Usadas nas tarefas 3, 6, 9.

- [ ] **Passo 1: escrever a migration**

```sql
-- Controle de acesso a seções por empresa
--
-- Até aqui não existia NENHUM controle: nem tabela, nem tela, nem política. O único
-- mecanismo parecido (`sidebar_empresa_padrao`) só desenha o menu — a rota continua
-- alcançável e os dados continuam chegando.
--
-- EIXO: este é o controle POR EMPRESA — o que EXISTE para aquele assinante. NÃO confundir
-- com `permissoes_usuario` / `permissao_presets` / `has_funcionalidade(...)`, que são POR
-- USUÁRIO — quem VÊ, dentro do que existe. Os dois convivem e não se tocam.
--
-- DECISÃO DE PRODUTO (21/08/2026): nenhuma exceção nasce aqui. As 8 empresas, MD inclusive,
-- entram no preset padrão (tudo menos o Portal). O dono do produto liga o Portal para a MD
-- pela tela de admin, depois de pronta. Por isso `secao_excecoes` nasce VAZIA — e a trava
-- do Portal (migration separada) só pode entrar DEPOIS disso.

-- ---------------------------------------------------------------- presets

create table public.secao_presets (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  descricao   text,
  is_padrao   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Um padrão só. Sem isto, duas linhas marcadas como padrão fariam a resolução depender
-- da ordem de leitura — e o bug só apareceria quando alguém criasse o segundo preset.
create unique index secao_presets_um_padrao_so
  on public.secao_presets (is_padrao) where is_padrao;

create table public.secao_preset_itens (
  preset_id   uuid not null references public.secao_presets(id) on delete cascade,
  secao       text not null,
  habilitada  boolean not null default true,
  primary key (preset_id, secao)
);

-- ---------------------------------------------------------------- empresa → preset

-- Nullable de propósito: empresa sem preset apontado cai no padrão (ver empresa_tem_secao).
-- Não existe estado "sem regra".
alter table public.empresas
  add column if not exists secao_preset_id uuid references public.secao_presets(id);

-- ---------------------------------------------------------------- exceções

create table public.secao_excecoes (
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  secao       text not null,
  habilitada  boolean not null,
  criada_em   timestamptz not null default now(),
  criada_por  uuid references auth.users(id),
  primary key (empresa_id, secao)
);

-- ---------------------------------------------------------------- RLS
-- Escrita: só admin global. Leitura: qualquer autenticado — o app precisa perguntar, e
-- não há segredo nestas tabelas (dizem quais telas existem, não conteúdo de ninguém).

alter table public.secao_presets      enable row level security;
alter table public.secao_preset_itens enable row level security;
alter table public.secao_excecoes     enable row level security;

create policy secao_presets_select      on public.secao_presets      for select to authenticated using (true);
create policy secao_presets_write       on public.secao_presets      for all    to authenticated using (is_admin()) with check (is_admin());

create policy secao_preset_itens_select on public.secao_preset_itens for select to authenticated using (true);
create policy secao_preset_itens_write  on public.secao_preset_itens for all    to authenticated using (is_admin()) with check (is_admin());

-- Exceção: cada empresa lê só as suas; só admin escreve.
create policy secao_excecoes_select     on public.secao_excecoes     for select to authenticated
  using (empresa_id = get_my_empresa_id() or is_admin());
create policy secao_excecoes_write      on public.secao_excecoes     for all    to authenticated
  using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------- a pergunta única

-- Resolve na ordem: exceção da empresa → preset da empresa (ou o padrão) → ligada.
--
-- SECURITY DEFINER porque será chamada de dentro de políticas de RLS de OUTRAS tabelas
-- (a do Portal), e ali não pode depender das políticas destas.
--
-- Admin global não tem empresa: get_my_empresa_id() devolve null, nenhum ramo casa, e o
-- coalesce final devolve true. É o comportamento certo — o admin não opera o CRM de
-- ninguém (App.tsx o redireciona para /admin/empresas), então liberar aqui não expõe nada.
create or replace function public.empresa_tem_secao(p_secao text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select x.habilitada
       from secao_excecoes x
      where x.empresa_id = get_my_empresa_id()
        and x.secao = p_secao),

    (select i.habilitada
       from secao_preset_itens i
      where i.secao = p_secao
        and i.preset_id = coalesce(
              (select e.secao_preset_id from empresas e where e.id = get_my_empresa_id()),
              (select p.id from secao_presets p where p.is_padrao limit 1))),

    true
  );
$$;

-- Versão em lote, para o app perguntar UMA vez em vez de doze.
create or replace function public.minhas_secoes()
returns table (secao text, habilitada boolean)
language sql
stable
security definer
set search_path to 'public'
as $$
  select s.secao, public.empresa_tem_secao(s.secao)
    from (
      select unnest(array[
        'dashboard','pipeline','clientes','obras','fabricantes','portal',
        'calendario','tarefas','chat','whatsapp','emails','configuracoes'
      ]) as secao
    ) s;
$$;

revoke all on function public.empresa_tem_secao(text) from public;
revoke all on function public.minhas_secoes() from public;
grant execute on function public.empresa_tem_secao(text) to authenticated;
grant execute on function public.minhas_secoes() to authenticated;

-- ---------------------------------------------------------------- o preset padrão

insert into public.secao_presets (nome, descricao, is_padrao)
values ('Padrão', 'Tudo o que o sistema faz hoje, menos o Portal de Consultas.', true);

insert into public.secao_preset_itens (preset_id, secao, habilitada)
select p.id, v.secao, v.habilitada
  from public.secao_presets p,
       (values
          ('dashboard', true), ('pipeline', true), ('clientes', true),
          ('obras', true),     ('fabricantes', true),
          ('portal', false),   -- <<< a única desligada
          ('calendario', true),('tarefas', true), ('chat', true),
          ('whatsapp', true),  ('emails', true),  ('configuracoes', true)
       ) as v(secao, habilitada)
 where p.is_padrao;

-- TODAS as empresas, MD inclusive, apontam para o padrão (decisão de produto de 21/08).
update public.empresas
   set secao_preset_id = (select id from public.secao_presets where is_padrao)
 where secao_preset_id is null;

-- `secao_excecoes` fica VAZIA de propósito. A primeira linha dela nasce pela tela de
-- admin, quando o dono do produto ligar o Portal para a MD. Semear aqui pouparia um
-- clique e deixaria o caminho da tela sem ser exercitado antes de virar o único caminho.
```

- [ ] **Passo 2: aplicar e conferir o carimbo**

Aplique pelo MCP do Supabase, depois:

```sql
select version, name from supabase_migrations.schema_migrations order by version desc limit 3;
```

**Renomeie o arquivo** para o `version` registrado.

- [ ] **Passo 3: provar que a resolução funciona**

```sql
select nome,
       (select count(*) from public.secao_preset_itens i
         where i.preset_id = e.secao_preset_id and i.habilitada) as secoes_ligadas,
       (select count(*) from public.secao_excecoes x where x.empresa_id = e.id) as excecoes
  from public.empresas e order by nome;
```

**Aprovação: as 8 empresas com `secoes_ligadas = 11` e `excecoes = 0`.** Onze, não doze —
o Portal está desligado no padrão.

- [ ] **Passo 4: conferir que nada quebrou**

Nada lê estas tabelas ainda. Confirme que o app segue normal:

```bash
npm run test && npm run build
```

- [ ] **Passo 5: pedir autorização e commitar**

```bash
git add supabase/migrations/<arquivo-renomeado>.sql
git commit -m "feat(acesso): presets e exceções de seção por empresa"
```

---

## Tarefa 3: A consulta que o site usa

**Arquivos:**
- Criar: `src/hooks/use-secoes.ts`

**Interfaces:**
- Consome: `SECOES`, `SecaoId` (tarefa 1); RPC `minhas_secoes()` (tarefa 2).
- Produz: `useSecoesDaEmpresa()` → `{ mapa, carregando }` e
  `useSecaoLigada(id)` → `{ ligada: boolean | undefined, carregando: boolean }`.
  Usados nas tarefas 4, 5, 10, 11, 12.

**O `undefined` é deliberado.** Enquanto a resposta não chegou, `ligada` é `undefined` — nem
sim nem não. Quem consome decide: a guarda de rota **espera** (mostra carregando), a
cascata **esconde** (não pisca conteúdo que talvez suma). Devolver `false` durante o
carregamento faria a tela piscar "sem acesso" para quem tem acesso.

- [ ] **Passo 1: escrever o hook**

`src/hooks/use-secoes.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { SECOES, type SecaoId } from '@/lib/secoes';

/**
 * Quais seções a empresa do usuário logado tem.
 *
 * Uma chamada só para as 12 seções (RPC `minhas_secoes`), em vez de uma por seção: a
 * cascata pergunta em dezenas de pontos de tela, e uma consulta por ponto multiplicaria
 * a conta por nada.
 *
 * A resposta do banco é a MESMA que as políticas de RLS usam (`empresa_tem_secao`), então
 * tela e banco não têm como divergir.
 */
export function useSecoesDaEmpresa() {
  const { profile, profileLoaded } = useAuth();
  const empresaId = profile?.empresa_id ?? profile?.empresas?.id ?? null;

  const q = useQuery({
    queryKey: ['secoes_da_empresa', empresaId],
    // Sem empresa não há o que perguntar. Admin global cai aqui e não usa telas de CRM.
    enabled: profileLoaded && !!empresaId,
    // Muda raramente (só quando o admin mexe) e é consultada em dezenas de pontos.
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('minhas_secoes' as never);
      if (error) throw error;
      const mapa = new Map<string, boolean>();
      for (const linha of (data ?? []) as { secao: string; habilitada: boolean }[]) {
        mapa.set(linha.secao, linha.habilitada);
      }
      return mapa;
    },
  });

  return { mapa: q.data, carregando: q.isLoading, erro: q.error };
}

/**
 * Uma seção está ligada para esta empresa?
 *
 * `ligada === undefined` significa "ainda não sei" — não significa "não". Quem chama
 * decide: guarda de rota espera; cascata esconde.
 *
 * Seção não desligável responde `true` na hora, sem esperar o banco: o produto não
 * funciona sem ela, então não há resposta possível além de sim.
 */
export function useSecaoLigada(id: SecaoId) {
  const { mapa, carregando, erro } = useSecoesDaEmpresa();

  const desligavel = SECOES.find((s) => s.id === id)?.desligavel ?? true;
  if (!desligavel) return { ligada: true, carregando: false };

  // Erro de rede não pode trancar quem paga. A barreira real dos dados é a RLS — este
  // hook é conveniência de navegação. Mesmo argumento do gate de plano (App.tsx).
  if (erro) return { ligada: true, carregando: false };

  return { ligada: mapa?.get(id), carregando };
}
```

- [ ] **Passo 2: atualizar os tipos gerados à mão**

`src/integrations/supabase/types.ts` é gerado, mas não há banco local (`CLAUDE.md` §6.8).
Acrescente as duas funções em `Functions`, junto das já existentes, para o `.rpc()` não
brigar com o TypeScript:

```ts
      empresa_tem_secao: {
        Args: { p_secao: string }
        Returns: boolean
      }
      minhas_secoes: {
        Args: Record<PropertyKey, never>
        Returns: { secao: string; habilitada: boolean }[]
      }
```

- [ ] **Passo 3: conferir**

```bash
npm run test && npm run build
npm run lint 2>&1 | tail -3   # não pode passar de 498
```

- [ ] **Passo 4: pedir autorização e commitar**

```bash
git add src/hooks/use-secoes.ts src/integrations/supabase/types.ts
git commit -m "feat(acesso): o app passa a perguntar quais seções a empresa tem"
```

---

# FASE 2 — A recusa na tela

## Tarefa 4: Guarda de rota

**Arquivos:**
- Modificar: `src/App.tsx`

**Interfaces:**
- Consome: `secaoDaRota` (tarefa 1), `useSecaoLigada` (tarefa 3), `TelaBloqueio`
  (`src/components/shared/TelaBloqueio.tsx`, já existe).

**Três decisões, e o porquê de cada uma:**

1. **Dentro do `ProtectedRoute`, não wrapper por rota.** O precedente é `requerPlano`: prop
   com padrão, protegendo por omissão. Como a guarda descobre a seção pela rota
   (`secaoDaRota`), não precisa nem de prop — nasce ligada em toda rota protegida, e rota
   sem seção (`/assinar`) devolve null e passa direto.
2. **Depois do gate de plano.** Quem está com o plano vencido vê o paywall, que é
   acionável, em vez de "seção indisponível", que não é.
3. **Na dúvida, espera — não nega nem libera.** `AdminRoute` nega com perfil nulo,
   `GestorRoute` libera. Aqui não é preciso escolher: enquanto `ligada === undefined`
   mostramos "Carregando...", igual ao que o próprio `ProtectedRoute` já faz enquanto o
   perfil carrega. Negar piscaria "sem acesso" para quem tem; liberar piscaria conteúdo
   que vai sumir.

- [ ] **Passo 1: importar o que falta**

No topo de `src/App.tsx`, junto dos outros imports:

```tsx
import { secaoDaRota } from "@/lib/secoes";
import { useSecaoLigada } from "@/hooks/use-secoes";
import { Lock } from "lucide-react";
```

- [ ] **Passo 2: criar o componente da guarda**

Logo depois de `GestorRoute` (hoje em `src/App.tsx:354-359`):

```tsx
/**
 * Guarda de SEÇÃO: a empresa deste usuário tem a seção a que esta rota pertence?
 *
 * Diferente de AdminRoute/GestorRoute, que olham o PAPEL da pessoa. Aqui olha-se o que a
 * EMPRESA contratou. As duas coisas se somam: a empresa define o que existe, o papel
 * define quem vê.
 *
 * Não recebe prop: descobre a seção pela rota. Rota que não pertence a seção nenhuma
 * (/assinar, /admin/...) devolve null em secaoDaRota e passa direto — o que também
 * garante que a tela de admin nunca se auto-bloqueie.
 *
 * Esconder o item do menu NÃO substitui isto: qualquer usuário cria um atalho digitando o
 * endereço à mão (SidebarAddItemDialog.tsx:43), e o padrão da empresa nunca remove item já
 * salvo pelo usuário (use-sidebar-preferences.ts). Sem esta guarda, desligar é decoração.
 */
function SecaoRoute({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const secao = secaoDaRota(location.pathname);
  const { ligada, carregando } = useSecaoLigada(secao?.id ?? 'configuracoes');

  // Rota sem seção: nada a checar.
  if (!secao) return <>{children}</>;

  // Ainda não sabemos. Esperar é melhor que errar para os dois lados.
  if (carregando || ligada === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Carregando...
      </div>
    );
  }

  if (!ligada) {
    return (
      <TelaBloqueio
        titulo="Seção não disponível"
        descricao={
          <>
            A seção <strong className="text-foreground">{secao.label}</strong> não faz parte
            do que está contratado para a sua empresa. Fale com o responsável pela conta se
            precisar dela.
          </>
        }
        icone={Lock}
        tom="neutro"
      >
        <Button asChild className="w-full">
          <Link to="/app">Voltar para Negócios</Link>
        </Button>
      </TelaBloqueio>
    );
  }

  return <>{children}</>;
}
```

> `Link` precisa entrar no import de `react-router-dom` da linha 6, que hoje traz
> `BrowserRouter, Routes, Route, Navigate, useLocation`.

- [ ] **Passo 3: ligar a guarda dentro do `ProtectedRoute`**

Em `src/App.tsx`, o `return` final do `ProtectedRoute` hoje é:

```tsx
  return (
    <ErrorBoundary
      key={ebKey}
      fallback={(error, _reset, codigo) => <TelaDeErro error={error} codigo={codigo} />}
    >
      {children}
    </ErrorBoundary>
  );
```

Troque por:

```tsx
  return (
    <ErrorBoundary
      key={ebKey}
      fallback={(error, _reset, codigo) => <TelaDeErro error={error} codigo={codigo} />}
    >
      {/* Dentro do ErrorBoundary de propósito: assim a guarda herda a key por rota
          (linha ~211) e um erro dentro dela não escapa para o boundary da raiz. */}
      <SecaoRoute>{children}</SecaoRoute>
    </ErrorBoundary>
  );
```

- [ ] **Passo 4: conferir que NADA mudou ainda**

Neste ponto o preset padrão já desliga o Portal, então **a guarda vai barrar `/portal` para
todas as empresas, MD inclusive** — que é o esperado até o passo 8.

```bash
npm run test && npm run build
npm run lint 2>&1 | tail -3
```

Suba `npm run dev` e confira, logado como usuário de empresa:

| Rota | Esperado |
|---|---|
| `/app`, `/clientes`, `/obras`, `/tarefas` | abrem normal |
| `/portal` | **"Seção não disponível"**, com botão de voltar |
| `/assinar` | abre normal (não pertence a seção nenhuma) |
| `/admin/empresas` (como admin) | abre normal |

- [ ] **Passo 5: pedir autorização e commitar**

```bash
git add src/App.tsx
git commit -m "feat(acesso): rota de seção desligada passa a recusar"
```

---

## Tarefa 5: A barra lateral acompanha

**Arquivos:**
- Modificar: `src/components/layout/AppSidebar.tsx`

**Interfaces:** consome `useSecoesDaEmpresa` (tarefa 3) e `SECOES` (tarefa 1).

O filtro de exibição de `AppSidebar.tsx` (hoje ~linhas 130-147) já tem três camadas: admin
global, `ADMIN_ONLY_IDS`, e `permissoes_usuario.pode_ver`. Esta é a quarta.

- [ ] **Passo 1: acrescentar a camada**

No topo do arquivo:

```tsx
import { useSecoesDaEmpresa } from '@/hooks/use-secoes';
import { SECOES } from '@/lib/secoes';
```

Dentro do componente, junto dos outros hooks:

```tsx
  const { mapa: secoesDaEmpresa } = useSecoesDaEmpresa();
```

E no filtro, como última condição (depois das três que já existem):

```tsx
      // Quarta camada: a empresa contratou esta seção?
      //
      // Enquanto o mapa não chegou, NÃO filtra — o menu aparece inteiro por um instante e
      // depois encolhe. O contrário (esconder até saber) faria o menu piscar vazio a cada
      // carregamento, que é pior de usar e assusta mais.
      //
      // Isto é conveniência de navegação. Quem recusa de verdade é SecaoRoute (App.tsx) e,
      // no Portal, a política do banco.
      .filter((item) => {
        if (!secoesDaEmpresa) return true;
        const secao = SECOES.find((s) => s.id === item.id);
        if (!secao || !secao.desligavel) return true;
        return secoesDaEmpresa.get(secao.id) !== false;
      })
```

> Os ids do menu e os de `SECOES` coincidem para as 12 seções — foi assim que a lista
> única foi montada (tarefa 1). Os três itens de admin (`admin_empresas`,
> `usuarios_admin`, `admin_wa_instancias`) não estão em `SECOES`, então `secao` vem
> `undefined` e o filtro os deixa passar.

- [ ] **Passo 2: conferir na tela**

Logado como usuário de empresa: **o item "Portal" some do menu.** Os outros 11 continuam.
Logado como admin: os itens de admin continuam aparecendo.

- [ ] **Passo 3: conferir a armadilha do item salvo**

O padrão da empresa nunca remove item já salvo pelo usuário. Confirme que um usuário que
**já tinha** o Portal salvo no menu pessoal também para de vê-lo — é o caso que o filtro
precisa cobrir, e é por isso que ele age na exibição e não na gravação.

```bash
npm run test && npm run build
npm run lint 2>&1 | tail -3
```

- [ ] **Passo 4: pedir autorização e commitar**

```bash
git add src/components/layout/AppSidebar.tsx
git commit -m "feat(acesso): item de seção desligada some do menu"
```

---

# FASE 3 — A tela de admin

## Tarefa 6: Dados e tela de empresas

**Arquivos:**
- Criar: `src/hooks/use-admin-secoes.ts`
- Criar: `src/pages/AdminSecoes.tsx`
- Modificar: `src/App.tsx` (rota) e `src/hooks/use-sidebar-preferences.ts` (item de menu)
- Criar: `supabase/migrations/<ts>_admin_secoes_rpc.sql`

**Interfaces:**
- Consome: tabelas da tarefa 2, `SECOES` da tarefa 1.
- Produz: `useAdminSecoes()`, `useDefinirExcecao()`, `useDefinirPresetDaEmpresa()`.

**O padrão é o de `AdminEmpresas.tsx`:** `AppLayout` → busca → lista de `Card` expansível,
ações abrindo `AlertDialog` de confirmação, mutations vindas de um hook. E **a autorização
mora no corpo da função de banco** (`is_admin()` com `RAISE`), não no frontend — igual a
`admin_definir_plano`.

- [ ] **Passo 1: as funções de banco**

`supabase/migrations/<ts>_admin_secoes_rpc.sql`:

```sql
-- Leitura e escrita do controle de seções, para a tela de admin.
--
-- SECURITY DEFINER com is_admin() + RAISE dentro do corpo, seguindo o padrão de
-- admin_definir_plano: a autorização real fica no banco, e o frontend só decide se
-- mostra a tela.

create or replace function public.admin_secoes_por_empresa()
returns table (
  empresa_id   uuid,
  empresa_nome text,
  usuarios     bigint,
  preset_id    uuid,
  preset_nome  text,
  secao        text,
  habilitada   boolean,
  origem       text        -- 'excecao' | 'preset' | 'padrao'
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not is_admin() then
    raise exception 'Apenas o administrador global pode ver o controle de seções';
  end if;

  return query
  select e.id, e.nome,
         (select count(*) from usuarios u where u.empresa_id = e.id),
         p.id, p.nome,
         s.secao,
         coalesce(x.habilitada, i.habilitada, true),
         case when x.habilitada is not null then 'excecao'
              when i.habilitada is not null then 'preset'
              else 'padrao' end
    from empresas e
    cross join (
      select unnest(array[
        'dashboard','pipeline','clientes','obras','fabricantes','portal',
        'calendario','tarefas','chat','whatsapp','emails','configuracoes'
      ]) as secao
    ) s
    left join secao_presets p
           on p.id = coalesce(e.secao_preset_id, (select id from secao_presets where is_padrao))
    left join secao_preset_itens i on i.preset_id = p.id and i.secao = s.secao
    left join secao_excecoes x     on x.empresa_id = e.id and x.secao = s.secao
   order by e.nome, s.secao;
end;
$$;

-- Cria, atualiza ou REMOVE a exceção. p_habilitada null = remover (volta a seguir o preset).
create or replace function public.admin_definir_excecao_secao(
  p_empresa_id uuid,
  p_secao text,
  p_habilitada boolean
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not is_admin() then
    raise exception 'Apenas o administrador global pode alterar o acesso a seções';
  end if;

  if p_habilitada is null then
    delete from secao_excecoes where empresa_id = p_empresa_id and secao = p_secao;
  else
    insert into secao_excecoes (empresa_id, secao, habilitada, criada_por)
    values (p_empresa_id, p_secao, p_habilitada, auth.uid())
    on conflict (empresa_id, secao)
      do update set habilitada = excluded.habilitada,
                    criada_em  = now(),
                    criada_por = auth.uid();
  end if;
end;
$$;

create or replace function public.admin_definir_preset_da_empresa(
  p_empresa_id uuid,
  p_preset_id uuid
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not is_admin() then
    raise exception 'Apenas o administrador global pode alterar o preset de uma empresa';
  end if;
  update empresas set secao_preset_id = p_preset_id where id = p_empresa_id;
end;
$$;

revoke all on function public.admin_secoes_por_empresa() from public;
revoke all on function public.admin_definir_excecao_secao(uuid, text, boolean) from public;
revoke all on function public.admin_definir_preset_da_empresa(uuid, uuid) from public;
grant execute on function public.admin_secoes_por_empresa() to authenticated;
grant execute on function public.admin_definir_excecao_secao(uuid, text, boolean) to authenticated;
grant execute on function public.admin_definir_preset_da_empresa(uuid, uuid) to authenticated;
```

Aplique, confira o carimbo, renomeie o arquivo.

- [ ] **Passo 2: provar que a autorização recusa**

Logado como usuário comum (não admin), no app:

```js
await supabase.rpc('admin_secoes_por_empresa')
```

Esperado: **erro** "Apenas o administrador global pode ver o controle de seções".
Se devolver dados, **pare** — a autorização não está funcionando.

- [ ] **Passo 3: o hook**

`src/hooks/use-admin-secoes.ts`, no molde de `use-admin-cs.ts`:

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface LinhaSecaoEmpresa {
  empresa_id: string;
  empresa_nome: string | null;
  usuarios: number;
  preset_id: string | null;
  preset_nome: string | null;
  secao: string;
  habilitada: boolean;
  origem: 'excecao' | 'preset' | 'padrao';
}

/**
 * Controle de seções por empresa, para o admin global.
 *
 * Tudo por RPC SECURITY DEFINER, como o resto do painel de admin: a autorização mora no
 * corpo das funções (is_admin() com RAISE), e a tela só decide se aparece.
 */
export function useAdminSecoes() {
  return useQuery({
    queryKey: ['admin_secoes'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_secoes_por_empresa' as never);
      if (error) throw error;
      return (data ?? []) as LinhaSecaoEmpresa[];
    },
  });
}

export function useDefinirExcecao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { empresaId: string; secao: string; habilitada: boolean | null }) => {
      const { error } = await supabase.rpc('admin_definir_excecao_secao' as never, {
        p_empresa_id: p.empresaId,
        p_secao: p.secao,
        p_habilitada: p.habilitada,
      } as never);
      if (error) throw error;
    },
    onSuccess: (_d, p) => {
      qc.invalidateQueries({ queryKey: ['admin_secoes'] });
      // A empresa afetada precisa reler o próprio mapa; a chave é por empresa.
      qc.invalidateQueries({ queryKey: ['secoes_da_empresa'] });
      toast.success(
        p.habilitada === null
          ? 'Exceção removida — a empresa volta a seguir o preset'
          : p.habilitada
            ? 'Seção liberada para esta empresa'
            : 'Seção bloqueada para esta empresa',
      );
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : 'Não foi possível alterar o acesso');
    },
  });
}

export function useDefinirPresetDaEmpresa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { empresaId: string; presetId: string }) => {
      const { error } = await supabase.rpc('admin_definir_preset_da_empresa' as never, {
        p_empresa_id: p.empresaId,
        p_preset_id: p.presetId,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin_secoes'] });
      qc.invalidateQueries({ queryKey: ['secoes_da_empresa'] });
      toast.success('Preset da empresa alterado');
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : 'Não foi possível alterar o preset');
    },
  });
}
```

- [ ] **Passo 4: a tela**

`src/pages/AdminSecoes.tsx`. O **miolo** vai abaixo, pronto. O envoltório (`AppLayout` com
`title`/`subtitle`, campo de busca, `Card` expansível, `AlertDialog` de confirmação) copia
`src/pages/AdminEmpresas.tsx`, que já tem tudo isso montado.

```tsx
import { useMemo, useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SECOES, type SecaoId } from '@/lib/secoes';
import {
  useAdminSecoes, useDefinirExcecao, type LinhaSecaoEmpresa,
} from '@/hooks/use-admin-secoes';

/** As 12 seções de UMA empresa, com o interruptor e a origem de cada resposta. */
function SecoesDaEmpresa({ linhas }: { linhas: LinhaSecaoEmpresa[] }) {
  const definir = useDefinirExcecao();
  const empresaId = linhas[0]?.empresa_id;

  // Indexa por seção para casar com a ordem de SECOES, que é a verdade da ordem.
  const porSecao = useMemo(
    () => new Map(linhas.map((l) => [l.secao, l])),
    [linhas],
  );

  return (
    <div className="space-y-1">
      {SECOES.map((s) => {
        const linha = porSecao.get(s.id);
        if (!linha) return null;

        return (
          <div key={s.id} className="flex items-center gap-3 py-2 border-b last:border-0">
            <Switch
              checked={linha.habilitada}
              // Núcleo não desliga: pedidos.cliente_id e pedidos.fabricante_id são NOT NULL
              // e /app é a home. Desabilitado com explicação, em vez de escondido — assim
              // fica claro que a decisão é do produto e não um esquecimento da tela.
              disabled={!s.desligavel || definir.isPending}
              onCheckedChange={(marcado) =>
                definir.mutate({ empresaId, secao: s.id, habilitada: marcado })
              }
              aria-label={s.label}
            />

            <span className="flex-1 text-sm">{s.label}</span>

            {!s.desligavel && (
              <span className="text-xs text-muted-foreground" title="O sistema não funciona sem esta seção">
                sempre ligada
              </span>
            )}

            {/* De onde veio a resposta. Sem isto ninguém entende por que duas empresas
                com o MESMO preset divergem. */}
            {s.desligavel && (
              <Badge variant={linha.origem === 'excecao' ? 'default' : 'outline'}>
                {linha.origem === 'excecao' ? 'exceção desta empresa' : 'do preset'}
              </Badge>
            )}

            {linha.origem === 'excecao' && (
              <Button
                variant="ghost"
                size="sm"
                disabled={definir.isPending}
                onClick={() =>
                  definir.mutate({ empresaId, secao: s.id, habilitada: null })
                }
              >
                Voltar a seguir o preset
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

Agrupar as linhas por empresa, para alimentar o componente acima:

```tsx
  const { data: linhas = [], isLoading } = useAdminSecoes();

  const porEmpresa = useMemo(() => {
    const m = new Map<string, LinhaSecaoEmpresa[]>();
    for (const l of linhas) {
      const atual = m.get(l.empresa_id) ?? [];
      atual.push(l);
      m.set(l.empresa_id, atual);
    }
    return [...m.values()];
  }, [linhas]);
```

Cada grupo vira um `Card` com o cabeçalho — nome da empresa, nº de usuários, preset que
segue, e quantas exceções tem:

```tsx
  const cabecalho = (g: LinhaSecaoEmpresa[]) => ({
    nome: g[0].empresa_nome ?? '(sem nome)',
    usuarios: g[0].usuarios,
    preset: g[0].preset_nome ?? 'Padrão',
    excecoes: g.filter((l) => l.origem === 'excecao').length,
  });
```

O restante da estrutura, copiado de `AdminEmpresas.tsx`:

- Uma linha por empresa: nome, nº de usuários, preset que segue, nº de exceções.
- Expandida: as 12 seções, cada uma com um `Switch`
  (`src/components/ui/switch.tsx`, controlado por `checked` + `onCheckedChange`).
- Ao lado de cada seção, um `Badge` dizendo de onde vem a resposta: **"do preset"** ou
  **"exceção"**. Sem isso ninguém entende por que duas empresas com o mesmo preset
  divergem.
- Seção não desligável (`SECOES`, tarefa 1): `Switch` desabilitado, com `title` explicando
  que o produto não funciona sem ela.
- Mexer num `Switch` cria exceção (`useDefinirExcecao` com `true`/`false`). Um botão
  **"Voltar a seguir o preset"** na linha que tem exceção chama a mesma mutação com `null`.
- Confirmação em `AlertDialog` antes de aplicar, como `AdminEmpresas.tsx` faz.

- [ ] **Passo 5: rota e item de menu**

Em `src/App.tsx`, no topo:

```tsx
const AdminSecoes = lazyComRetry(() => import("./pages/AdminSecoes"));
```

E junto das outras rotas de admin:

```tsx
    <Route
      path="/admin/secoes"
      element={
        <ProtectedRoute>
          <AdminRoute>
            <AdminSecoes />
          </AdminRoute>
        </ProtectedRoute>
      }
    />
```

> `/admin` já está em `ROTAS_DO_ADMIN_GERAL` por prefixo, então a rota nova já é alcançável
> pelo admin sem tocar naquela lista. E `secaoDaRota('/admin/secoes')` devolve null, então
> a guarda de seção não se auto-bloqueia.

Em `src/hooks/use-sidebar-preferences.ts`, junto dos outros itens de admin:

```ts
  { id: 'admin_secoes', path: '/admin/secoes', label: 'Seções', icon: 'ToggleLeft', visible: true },
```

- [ ] **Passo 6: conferir**

```bash
npm run test && npm run build
npm run lint 2>&1 | tail -3
```

Logado como admin: a tela lista as 8 empresas, todas seguindo "Padrão", todas com Portal
desligado e **zero exceções**.

- [ ] **Passo 7: pedir autorização e commitar**

```bash
git add supabase/migrations/<arquivo>.sql src/hooks/use-admin-secoes.ts src/pages/AdminSecoes.tsx src/App.tsx src/hooks/use-sidebar-preferences.ts
git commit -m "feat(admin): tela de controle de seções por empresa"
```

---

## Tarefa 7: Edição de presets

**Arquivos:**
- Modificar: `src/pages/AdminSecoes.tsx`, `src/hooks/use-admin-secoes.ts`
- Criar: `supabase/migrations/<ts>_admin_presets_rpc.sql`

Uma aba na mesma tela: listar presets, criar, renomear, e marcar quais seções cada um liga.
Mesmo padrão de RPC com `is_admin()` no corpo.

**A regra que precisa ficar visível na tela:** mudar um preset muda **todas** as empresas
que o seguem, menos onde houver exceção. Mostre quantas empresas serão afetadas **antes** de
confirmar — senão o admin descobre depois.

- [ ] **Passo 1:** RPCs `admin_criar_preset(p_nome, p_descricao)`,
  `admin_renomear_preset(p_preset_id, p_nome, p_descricao)` e
  `admin_definir_item_preset(p_preset_id, p_secao, p_habilitada)`, todas com o mesmo
  cabeçalho de `is_admin()` + `RAISE` da tarefa 6.
- [ ] **Passo 2:** hooks `useCriarPreset`, `useRenomearPreset`, `useDefinirItemPreset`, no
  molde exato de `useDefinirExcecao`.
- [ ] **Passo 3:** a aba, com a contagem de empresas afetadas no diálogo de confirmação.
- [ ] **Passo 4:** conferir, pedir autorização, commitar.

```bash
git commit -m "feat(admin): criar e editar presets de seção"
```

---

## Tarefa 8: ⏸ PONTO DE PARADA — o Lucas liga o Portal para a MD

**Não é tarefa de código.** É o passo que a decisão 7 criou.

- [ ] **Passo 1:** o Lucas abre `/admin/secoes`, acha **MD Representações**, liga o Portal.
- [ ] **Passo 2:** conferir que virou exceção de verdade:

```sql
select e.nome, x.secao, x.habilitada, x.criada_em
  from public.secao_excecoes x join public.empresas e on e.id = x.empresa_id;
```

Esperado: **uma linha** — MD Representações · portal · true.

- [ ] **Passo 3:** logar como usuário da MD e abrir `/portal`. **Tem que funcionar igual a
  hoje.** Logar como usuário da JHS e abrir `/portal`: **"Seção não disponível"**.

> 🔴 **A tarefa 9 só começa depois de os três passos acima estarem conferidos.** Se o
> Portal da MD não voltou, a trava do banco vai fechar a porta com a MD do lado de fora.

---

# FASE 4 — A trava no banco

## Tarefa 9: O Portal recusa no banco

**Arquivos:**
- Criar: `supabase/migrations/<ts>_portal_exige_secao.sql`
- Modificar: `supabase/functions/portal-scraper/index.ts`,
  `supabase/functions/scrape-licencas-idema/index.ts`,
  `supabase/functions/list-dom-editions/index.ts`

**O problema medido:** as 4 tabelas de licença têm política de leitura `qual = true` para
qualquer autenticado, e três aceitam escrita. Não têm `empresa_id` — são dados públicos de
licença. Então a condição não é "esta linha é sua?", é **"você tem o Portal?"**.

- [ ] **Passo 1: conferir de novo que a MD tem a exceção**

Rode a consulta do passo 2 da tarefa 8. **Se não voltar a linha da MD, pare aqui.**

- [ ] **Passo 2: escrever a migration**

```sql
-- Portal: as tabelas de licença passam a exigir a seção
--
-- Estado antes (medido em 21/08/2026): as 4 tabelas tinham SELECT com qual = true para
-- `authenticated`. Qualquer pessoa logada em QUALQUER empresa lia as licenças da MD, e
-- três das quatro aceitavam escrita. Não vazava para a internet (anônimo recebia vazio),
-- mas vazava entre clientes.
--
-- Estas tabelas não têm empresa_id: são dados públicos de licença ambiental, iguais para
-- todo mundo. Por isso a condição é "você tem o Portal?" e não "esta linha é sua?".
--
-- PRÉ-REQUISITO CONFERIDO: a MD já tem a exceção de portal em secao_excecoes. Sem isso,
-- esta migration deixaria a MD sem Portal.

drop policy if exists "Authenticated users can read dom_licencas" on public.dom_licencas;
drop policy if exists "licencas_extremoz_delete" on public.licencas_extremoz;
drop policy if exists "licencas_extremoz_insert" on public.licencas_extremoz;
drop policy if exists "licencas_extremoz_select" on public.licencas_extremoz;
drop policy if exists "licencas_extremoz_update" on public.licencas_extremoz;
drop policy if exists "Usuários autenticados podem atualizar licenças" on public.licencas_idema;
drop policy if exists "licencas_idema_insert" on public.licencas_idema;
drop policy if exists "licencas_idema_select" on public.licencas_idema;
drop policy if exists "Authenticated users can insert licencas_natal" on public.licencas_natal;
drop policy if exists "Authenticated users can read licencas_natal" on public.licencas_natal;

-- Leitura: exige a seção.
create policy dom_licencas_select      on public.dom_licencas      for select to authenticated using (empresa_tem_secao('portal'));
create policy licencas_idema_select    on public.licencas_idema    for select to authenticated using (empresa_tem_secao('portal'));
create policy licencas_natal_select    on public.licencas_natal    for select to authenticated using (empresa_tem_secao('portal'));
create policy licencas_extremoz_select on public.licencas_extremoz for select to authenticated using (empresa_tem_secao('portal'));

-- Escrita: exige a seção E ser gestor. Antes, `licencas_idema` e `licencas_natal`
-- aceitavam inserção de QUALQUER autenticado, e `licencas_idema` também alteração.
-- A carga em massa continua vindo das Edge Functions, que usam service_role e não passam
-- por RLS — então apertar aqui não quebra a importação.
create policy licencas_idema_write     on public.licencas_idema    for all to authenticated
  using (empresa_tem_secao('portal') and is_gestor())
  with check (empresa_tem_secao('portal') and is_gestor());
create policy licencas_natal_write     on public.licencas_natal    for all to authenticated
  using (empresa_tem_secao('portal') and is_gestor())
  with check (empresa_tem_secao('portal') and is_gestor());
create policy licencas_extremoz_write  on public.licencas_extremoz for all to authenticated
  using (empresa_tem_secao('portal') and is_gestor())
  with check (empresa_tem_secao('portal') and is_gestor());
```

Aplique, confira o carimbo, renomeie.

- [ ] **Passo 3: as funções de servidor**

As três funções do Portal rodam com `service_role` e **ignoram RLS por definição** — a
migration acima não as afeta. Cada uma precisa da checagem escrita dentro, logo depois de
identificar o usuário:

```ts
    const { data: temPortal, error: erroSecao } = await userClient.rpc('empresa_tem_secao', {
      p_secao: 'portal',
    });
    if (erroSecao || temPortal !== true) {
      return new Response(
        JSON.stringify({ error: 'Sua empresa não tem acesso ao Portal de Consultas' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
```

> Use o cliente do USUÁRIO (`userClient`, criado com o `Authorization` recebido), não o de
> serviço. Com o de serviço `auth.uid()` é nulo e `empresa_tem_secao` não tem como saber de
> quem se trata.

- [ ] **Passo 4: PROVAR que fechou**

Logado como usuário da **JHS** (sem Portal), no console do navegador:

```js
await supabase.from('licencas_idema').select('id').limit(1)
```

Esperado: **lista vazia**. Se voltar linha, a trava não pegou.

Logado como usuário da **MD**: a mesma consulta **tem que devolver dados**, e a tela
`/portal` tem que funcionar igual a antes — inclusive o botão de importar licenças, que
passa pelas funções de servidor.

- [ ] **Passo 5: pedir autorização e commitar**

```bash
git add supabase/migrations/<arquivo>.sql supabase/functions/portal-scraper/index.ts supabase/functions/scrape-licencas-idema/index.ts supabase/functions/list-dom-editions/index.ts
git commit -m "fix(portal): licenças passam a exigir a seção contratada"
```

**Publique as três funções no Supabase** — enviar para o `main` publica o site, não as
funções.

- [ ] **Passo 6: fechar a dívida §8**

Mova o item para "Resolvidos" em `docs/divida-tecnica.md`, com data e commit.

---

# FASE 5 — Cascata e limpeza

## Tarefa 10: Cascata de Obras

**Arquivos:** os 11 pontos listados em `plano-controle-de-acesso.md` §3.1.

**Interfaces:** consome `useSecaoLigada('obras')` (tarefa 3).

**A regra:** onde a seção some, some o **controle** — não o dado. Um negócio que já tenha
obra vinculada continua com ela no banco; o campo só deixa de aparecer. Religar traz tudo
de volta.

**Cascata usa `ligada === true`, não `!== false`.** Ao contrário do menu, aqui esconder
enquanto carrega é o certo: um campo que aparece e some é pior que um campo que demora.

Padrão a aplicar em cada ponto de tela:

```tsx
const { ligada: temObras } = useSecaoLigada('obras');
// ...
{temObras === true && (
  /* o painel, campo, coluna ou aba que já existia */
)}
```

- [ ] **Passo 1:** painel "Obras Vinculadas" — `src/pages/ClienteDetalhe.tsx`
- [ ] **Passo 2:** campo Obra ao criar — `src/components/pedidos/NovoNegocioDialog.tsx`
- [ ] **Passo 3:** campo Obra ao editar — `src/pages/EditarPedido.tsx`
- [ ] **Passo 4:** coluna e link no detalhe — `src/pages/Negocios.tsx`
- [ ] **Passo 5:** aba "Obras" em Campos — `src/components/configuracoes/CamposTab.tsx`
- [ ] **Passo 6:** filtro de entidade — `src/pages/HistoricoAlteracoes.tsx`
- [ ] **Passo 7:** `useObras` em `src/pages/Tarefas.tsx`
- [ ] **Passo 8:** coluna "Obra" nas exportações — `src/lib/generate-pdf.ts` e
      `src/lib/generate-excel.ts`. **Estes dois não são componentes**, então recebem a
      informação por parâmetro de quem chama, não por hook.
- [ ] **Passo 9:** as consultas que trazem obra embutida — `src/hooks/use-pedidos.ts`
      (obra no select e a busca casando nome de obra) e `src/hooks/use-clientes.ts`
      (`obras(*)`). **Não mexa nelas.** Trazer a obra embutida quando a seção está
      desligada não vaza nada (é dado da própria empresa) e mexer no select é onde o risco
      de quebrar a lista de negócios mora. Registre a decisão em comentário.

> ⚠️ `src/hooks/use-pedidos.ts` e `src/pages/Negocios.tsx` são território ativo da outra
> sessão. **Confira `git status` e `git log` antes de encostar neles**, e prefira fazer
> esta tarefa quando aquele trabalho estiver commitado.

- [ ] **Passo 10:** conferir com Obras desligada para uma empresa de teste — os 11 pontos,
      um a um — e conferir que com Obras ligada tudo volta.
- [ ] **Passo 11:** pedir autorização e commitar.

```bash
git commit -m "feat(acesso): Obras desligada some de todos os pontos do sistema"
```

---

## Tarefa 11: Cascata das demais seções

Mesmo padrão da tarefa 10, uma seção por commit:

- [ ] **Tarefas** — 5 painéis: `ClienteDetalhe.tsx`, `ContatoDetalhe.tsx`, `Negocios.tsx`,
      `WhatsAppInbox.tsx` (nova tarefa a partir de conversa), e a rota.
- [ ] **E-mail** — 3 botões em telas de cliente/contato, `NotificationCenter.tsx`, e o
      editor de assinatura em `Configuracoes.tsx`.
- [ ] **Chat** — só o contador da barra lateral, além da rota.
- [ ] **Calendário** — nada além da rota e do menu. É o desligamento mais limpo.
- [ ] **Dashboard** — o logo da barra lateral aponta para `/dashboard`
      (`AppSidebar.tsx:286`): com a seção desligada, aponte para `/app`.
- [ ] **WhatsApp** — **o mais arriscado, deixe por último.** 8 pontos, incluindo a seção do
      Dashboard (`Dashboard.tsx` + `DashboardCharts.tsx`), tarefas por conversa, a aba de
      Configurações e o contador. 49.427 mensagens no banco — nada é apagado, mas muita
      coisa some da tela.

---

## Tarefa 12: A matriz de permissões acompanha

**Arquivos:** `src/hooks/use-permissoes.ts`, `src/components/configuracoes/PermissaoMatrixEditor.tsx`

Se uma seção está desligada para a empresa, a linha dela **some da matriz de permissões por
usuário** — senão o gestor configura quem pode ver uma tela que não existe.

- [ ] **Passo 1:** no editor, filtrar `MODULOS` pelos `modulosPermissao` das seções ligadas
      (`SECOES`, tarefa 1, tem o mapeamento).
- [ ] **Passo 2:** **não apague as linhas já gravadas** em `permissoes_usuario`. Some da
      tela, fica no banco. Religar a seção devolve a configuração que o gestor já tinha
      feito — apagar obrigaria a refazer tudo.
- [ ] **Passo 3:** conferir, pedir autorização, commitar.

---

## Tarefa 13: O Portal sai da página de vendas

**Arquivos:** `src/components/landing/RecursosSection.tsx`, `src/lib/planos.ts`

A página pública anuncia o Portal como diferencial e o plano promete "Todos os módulos".
Com o Portal exclusivo da MD, isso vira promessa que o assinante não recebe (decisão 6).

- [ ] **Passo 1:** tirar o card do Portal de `RecursosSection.tsx`.
- [ ] **Passo 2:** trocar "Todos os módulos" em `src/lib/planos.ts` por uma lista do que o
      assinante realmente recebe.
- [ ] **Passo 3:** conferir a landing em `/`, pedir autorização, commitar.

---

## Verificação final

| Critério | Como se mede |
|---|---|
| Empresa sem Portal digitando `/portal` | Vê "Seção não disponível" **e** `select` em `licencas_idema` devolve vazio |
| A MD continua com o Portal | Login real: tela abre, dados aparecem, importação funciona |
| Nenhuma empresa perdeu o que já usava | As 8 empresas × 12 seções, comparadas antes e depois |
| Preset muda todo mundo junto | Desligar Calendário no padrão: todas mudam, menos quem tem exceção |
| Menu, rota e banco concordam | Nenhum caso de menu esconder e rota deixar entrar |
| Obras desligada some por completo | Os 11 pontos, um a um |
| Testes e lint | 162+ testes verdes; lint não passa de 498 |
| **Nenhuma seção órfã** | A consulta abaixo devolve **zero linhas** |

### A consulta que protege a regra de seção nova

`empresa_tem_secao` resolve "não achei regra" como **ligada** — de propósito, senão
publicar tiraria as 11 seções de todo mundo. O preço é que uma seção nova esquecida nos
presets nasce **ligada** para todos, que é o contrário do combinado.

Esta consulta acusa isso. Rode-a ao acrescentar qualquer seção nova, e no fim de cada fase:

```sql
-- Seção que existe em SECOES (src/lib/secoes.ts) mas não tem linha em algum preset.
-- Tem que devolver ZERO linhas.
select p.nome as preset, s.secao as secao_sem_regra
  from public.secao_presets p
  cross join (
    select unnest(array[
      'dashboard','pipeline','clientes','obras','fabricantes','portal',
      'calendario','tarefas','chat','whatsapp','emails','configuracoes'
    ]) as secao
  ) s
  left join public.secao_preset_itens i on i.preset_id = p.id and i.secao = s.secao
 where i.secao is null
 order by 1, 2;
```

> Ao acrescentar seção nova: a MESMA migration que a cria em `SECOES` acrescenta a linha
> dela em **todos** os presets, com `habilitada = false`. E a lista de seções desta
> consulta e a de `minhas_secoes()` precisam ser atualizadas junto — são três lugares com
> a mesma lista, e é o preço de o Postgres não conhecer o TypeScript.
