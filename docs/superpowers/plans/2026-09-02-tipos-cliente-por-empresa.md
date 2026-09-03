# Tipos de cliente por empresa — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar a lista de tipos de cliente — hoje 9 valores fixos no código mais o que cada pessoa cria no `localStorage` do próprio navegador — numa lista por empresa guardada no banco, editável só por gestor, e usar isso para separar clientes ativos de inativos na JHS.

**Architecture:** Tabela nova `clientes_tipos` (uma linha por tipo, por empresa), no molde de `marcadores`. `clientes.tipo` **continua texto livre, sem chave estrangeira** — a tabela governa o dropdown e o rótulo, não a integridade. Um hook `use-clientes-tipos.ts` expõe a lista e as mutações; `src/pages/Clientes.tsx` deixa de ler `localStorage`. Backfill semeia cada empresa existente com os tipos que ela já usa; um gatilho semeia empresa nova com Construtora / Loja / Pessoa Física.

**Tech Stack:** React 18 + TypeScript + Vite · TanStack Query · shadcn-ui/Radix · Supabase (Postgres + RLS) · Vitest.

**Spec:** [`docs/superpowers/specs/2026-09-02-tipos-cliente-por-empresa-design.md`](../specs/2026-09-02-tipos-cliente-por-empresa-design.md)

---

## Global Constraints

- **PT-BR** em interface, comentário, mensagem de erro e commit.
- **Nunca editar migration existente.** Só acrescentar arquivo novo.
- **A RLS do Postgres é a autoridade real.** Esconder botão não protege nada.
- **Erro do Supabase não é `Error`** — usar `mensagemDeErro` de `src/lib/mensagem-de-erro.ts`.
- **Linha de base medida em 02/09/2026 nesta árvore (commit `d262afc5`), não pode piorar:**
  - `npm run test` → **65 arquivos, 976 testes, todos passando**
  - `npx tsc --noEmit -p tsconfig.app.json` → **33 erros herdados** (o `-p` é obrigatório; sem ele o comando não confere nada e devolve sucesso)
- 🔴 **Outra sessão trabalha nesta mesma pasta.** `git status --short` mostra trabalho que não é desta tarefa: `src/integrations/supabase/types.ts` e `src/test/setup.ts` modificados, e 4 arquivos novos de "responsáveis do negócio". **Nunca `git add -A`.** Ver Task 8 para o procedimento de commit do `types.ts`, que é o único arquivo disputado.
- 🔴 **`git push` publica em produção**, sozinho, em minutos. Rodar a verificação ANTES de pedir autorização.
- 🔴 **Toda aplicação de migration em produção e todo passo de dados exigem "pode" explícito do Lucas.**
- **Ordem obrigatória:** migration no banco **antes** do deploy do código. O contrário deixa a tela de Clientes consultando uma tabela que não existe.

### Decisões já tomadas (não reabrir)

| Decisão | Valor |
|---|---|
| Escopo de tela | **Só `src/pages/Clientes.tsx`.** `ClienteDetalhe.tsx` e `EmpresaSelector.tsx` ficam de fora, registrados como dívida (Task 6) |
| Valor padrão do campo Tipo | **Primeiro item da lista da empresa** |
| Slug de Pessoa Física | **`pessoa fisica`** (com espaço, sem acento) — é o que a importação já produz e o que a MD já tem em 129 clientes. Não mexer no `TIPO_MAP` |
| `clientes.tipo` | Continua **texto livre**, sem chave estrangeira |
| Filtro de Tipo | Continua **somando os tipos realmente em uso**, para nenhuma empresa sumir da busca |
| Reordenar por arrasto | **Não** (YAGNI) |
| Tipos criados no navegador e nunca usados | **Perdem-se** na virada. Aceito e registrado |

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/20260902160000_clientes_tipos_por_empresa.sql` | **Criar** — tabela, RLS, backfill, gatilho de empresa nova |
| `supabase/migrations/20260902161000_inventario_inclui_clientes_tipos.sql` | **Criar** — soma a tabela ao inventário de exclusão de empresa |
| `src/hooks/use-clientes-tipos.ts` | **Criar** — leitura e mutações da lista (um hook por domínio) |
| `src/hooks/use-clientes-tipos.test.ts` | **Criar** — testes da lógica pura (slug, rótulo, padrão) |
| `src/lib/tipos-de-cliente.ts` | **Criar** — funções puras: `slugDeTipo`, `rotuloDoTipo`, `tipoPadrao`. Ficam fora do hook para poderem ser testadas sem mockar o Supabase |
| `src/integrations/supabase/types.ts` | **Modificar** — declarar a tabela nova (arquivo disputado com a outra sessão) |
| `src/pages/Clientes.tsx` | **Modificar** — dropdown, criar/excluir, rótulo, filtro e valor padrão passam a vir do banco |
| `docs/divida-tecnica.md` | **Modificar** — registrar as duas telas fora de escopo |

---

## Task 1: Estrutura no banco

**Files:**
- Create: `supabase/migrations/20260902160000_clientes_tipos_por_empresa.sql`

**Interfaces:**
- Produces: tabela `public.clientes_tipos(id, empresa_id, slug, nome, ordem, is_sistema, created_at, updated_at)`, com `UNIQUE (empresa_id, slug)`; função `public.criar_clientes_tipos_padrao()`.

- [ ] **Step 1: Conferir que o nome do arquivo não colide**

Run: `ls supabase/migrations | sort | tail -3`
Expected: a última é `20260902153000_contatos_select_orfao_escopado_por_empresa.sql`. Se houver alguma com timestamp ≥ `20260902160000`, escolher um timestamp maior.

- [ ] **Step 2: Escrever a migration**

Criar `supabase/migrations/20260902160000_clientes_tipos_por_empresa.sql`:

```sql
-- ============================================================================
-- TIPOS DE CLIENTE VIRAM UMA LISTA POR EMPRESA
-- ============================================================================
-- ANTES: a lista do campo "Tipo" do cadastro de cliente eram 9 valores fixos no
-- codigo (baseTipos, em src/pages/Clientes.tsx) mais o que cada pessoa criasse
-- em localStorage['clientes_custom_tipos'] -- por NAVEGADOR. Nada disso era
-- compartilhado com a equipe nem preso a empresa.
--
-- AGORA: uma linha por tipo, por empresa.
--
-- O valor guardado em clientes.tipo continua sendo TEXTO LIVRE, sem chave
-- estrangeira para ca. Esta tabela governa o DROPDOWN e o ROTULO, nao a
-- integridade. Foi decisao explicita: virar chave estrangeira exigiria reescrever
-- o tipo de 1.584 clientes de 5 empresas, com risco alto e nenhum ganho para o
-- objetivo. Ver docs/superpowers/specs/2026-09-02-tipos-cliente-por-empresa-design.md
--
-- MOLDE: 20260731130000_marcadores_negocios.sql -- tabela + UNIQUE(empresa_id,slug)
-- + indice + 4 policies + trigger de updated_at + backfill + gatilho de empresa nova.
-- Este e o SETIMO gatilho AFTER INSERT ON public.empresas. Backfill e gatilho ficam
-- no MESMO arquivo de proposito: a divergencia entre "consertar quem ja existe" e
-- "consertar a fabrica" ja custou caro neste projeto.
-- ============================================================================

CREATE TABLE public.clientes_tipos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id),
  slug TEXT NOT NULL,
  nome TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  is_sistema BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, slug)
);

CREATE INDEX idx_clientes_tipos_empresa ON public.clientes_tipos(empresa_id, ordem);

ALTER TABLE public.clientes_tipos ENABLE ROW LEVEL SECURITY;

-- Leitura: todo mundo da empresa (o vendedor precisa ver a lista para escolher).
-- Escrita: so gestor. is_admin() entra nas quatro porque e tabela de CONFIGURACAO,
-- igual a marcadores -- o admin da plataforma da suporte sem virar membro da empresa.
CREATE POLICY "clientes_tipos_select"
ON public.clientes_tipos FOR SELECT TO authenticated
USING (is_admin() OR empresa_id = get_my_empresa_id());

CREATE POLICY "clientes_tipos_insert"
ON public.clientes_tipos FOR INSERT TO authenticated
WITH CHECK (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id()));

CREATE POLICY "clientes_tipos_update"
ON public.clientes_tipos FOR UPDATE TO authenticated
USING (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id()));

CREATE POLICY "clientes_tipos_delete"
ON public.clientes_tipos FOR DELETE TO authenticated
USING (is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id()));

CREATE TRIGGER update_clientes_tipos_updated_at
BEFORE UPDATE ON public.clientes_tipos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- BACKFILL: cada empresa recebe EXATAMENTE os tipos que seus clientes ja usam.
-- ----------------------------------------------------------------------------
-- clientes.empresa_id esta NULO nas 1.584 linhas (medido em 02/09/2026), entao a
-- empresa do cliente vem por usuario_id -> usuarios.empresa_id. Medido: esse
-- caminho alcanca 100% das linhas (nenhum cliente sem usuario, nenhum usuario sem
-- empresa, nenhum tipo nulo ou vazio).
--
-- Repare: este caminho (usuario_id) e do BACKFILL, para descobrir de qual empresa
-- e cada cliente. Ele NAO entra nas policies acima, que escopam por
-- empresa_id = get_my_empresa_id(). Sao dois mecanismos diferentes no mesmo arquivo.
--
-- nome = slug DE PROPOSITO: preserva exatamente o rotulo que a tela ja mostra hoje.
-- A MD continua vendo "construtora - 3 níveis" como esta gravado. Embelezar rotulo
-- de outra empresa esta fora de escopo.
--
-- Esperado: 34 linhas (MD 19, Repply 7, PR & COCENTINO 4, JHS 3, House Design 1).
INSERT INTO public.clientes_tipos (empresa_id, slug, nome, ordem, is_sistema)
SELECT
  t.empresa_id,
  t.tipo,
  t.tipo,
  (row_number() OVER (PARTITION BY t.empresa_id ORDER BY t.n DESC, t.tipo))::int - 1,
  false
FROM (
  SELECT u.empresa_id, c.tipo, count(*) AS n
  FROM public.clientes c
  JOIN public.usuarios u ON u.id = c.usuario_id
  WHERE c.tipo IS NOT NULL
    AND btrim(c.tipo) <> ''
    AND u.empresa_id IS NOT NULL
  GROUP BY u.empresa_id, c.tipo
) t
ON CONFLICT (empresa_id, slug) DO NOTHING;

-- ----------------------------------------------------------------------------
-- EMPRESA NOVA nasce com a lista padrao enxuta.
-- ----------------------------------------------------------------------------
-- 'pessoa fisica' com ESPACO e sem acento nao e descuido: e exatamente o valor que
-- a importacao produz hoje (TIPO_MAP em ImportClientesDialog.tsx normaliza
-- 'pessoa_fisica', 'pessoa física' e 'pf' todos para 'pessoa fisica') e o que a MD
-- ja tem gravado em 129 clientes. Usar underscore aqui criaria um tipo orfao a cada
-- importacao.
CREATE OR REPLACE FUNCTION public.criar_clientes_tipos_padrao()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.clientes_tipos (empresa_id, slug, nome, ordem, is_sistema) VALUES
    (NEW.id, 'construtora',   'Construtora',   0, true),
    (NEW.id, 'loja',          'Loja',          1, true),
    (NEW.id, 'pessoa fisica', 'Pessoa Física', 2, true)
  ON CONFLICT (empresa_id, slug) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_criar_clientes_tipos_padrao
AFTER INSERT ON public.empresas
FOR EACH ROW EXECUTE FUNCTION public.criar_clientes_tipos_padrao();

COMMENT ON TABLE public.clientes_tipos IS
  'Lista de tipos/segmentos de cliente, por empresa. Governa o dropdown e o rotulo do campo Tipo; clientes.tipo continua texto livre, sem chave estrangeira para ca.';
```

- [ ] **Step 3: Conferir a sintaxe sem aplicar**

Run: `grep -c "CREATE POLICY" supabase/migrations/20260902160000_clientes_tipos_por_empresa.sql`
Expected: `4`

- [ ] **Step 4: Commit (só este arquivo)**

```bash
git status --short
git add supabase/migrations/20260902160000_clientes_tipos_por_empresa.sql
git diff --cached --name-only
git commit -m "feat(clientes): estrutura da lista de tipos de cliente por empresa"
```

> ⚠️ Escrever a migration **não é** aplicá-la. A aplicação em produção é a Task 7, com autorização.

---

## Task 2: Inventário de exclusão de empresa

**Files:**
- Create: `supabase/migrations/20260902161000_inventario_inclui_clientes_tipos.sql`

**Interfaces:**
- Consumes: `public.clientes_tipos` (Task 1).

- [ ] **Step 1: Ler a definição atual da função**

Run: `sed -n '/create or replace function public.inventario_da_empresa/,/^\$\$;/p' supabase/migrations/20260830220000_inventario_antes_de_apagar.sql`
Expected: a função inteira, com a lista de tuplas `(tabela, linhas, como_se_liga)`. A linha de `marcadores` é a penúltima.

- [ ] **Step 2: Escrever a migration**

Copiar a definição inteira lida no passo 1 para o arquivo novo e acrescentar **uma linha** logo depois da de `marcadores`:

```sql
-- Soma clientes_tipos ao inventario. A tabela tem empresa_id NOT NULL com chave
-- estrangeira para empresas e SEM ON DELETE, igual a marcadores: se ficar de fora,
-- o inventario devolve "zero em tudo" mentindo, e a apagada definitiva esbarra na
-- chave estrangeira. Recriamos a funcao inteira porque CREATE OR REPLACE exige o
-- corpo completo -- nenhuma linha existente foi alterada.
      ('clientes_tipos', (select count(*) from public.clientes_tipos ct where ct.empresa_id = p_empresa_id), 'empresa_id'),
```

- [ ] **Step 3: Conferir que nenhuma linha existente sumiu**

Run:
```bash
diff <(grep -oE "\('[a-z_]+'," supabase/migrations/20260830220000_inventario_antes_de_apagar.sql | sort) \
     <(grep -oE "\('[a-z_]+'," supabase/migrations/20260902161000_inventario_inclui_clientes_tipos.sql | sort)
```
Expected: uma única diferença, a linha `> ('clientes_tipos',`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260902161000_inventario_inclui_clientes_tipos.sql
git commit -m "feat(empresas): inventario passa a contar clientes_tipos"
```

---

## Task 3: Funções puras dos tipos de cliente

**Files:**
- Create: `src/lib/tipos-de-cliente.ts`
- Create: `src/hooks/use-clientes-tipos.test.ts` (testa este módulo; fica junto do hook que o consome)

**Interfaces:**
- Produces:
  - `export interface TipoDeCliente { id: string; empresa_id: string; slug: string; nome: string; ordem: number; is_sistema: boolean; created_at: string; updated_at: string }`
  - `export function slugDeTipo(nome: string): string`
  - `export function rotuloDoTipo(slug: string, tipos: Pick<TipoDeCliente,'slug'|'nome'>[]): string`
  - `export function tipoPadrao(tipos: Pick<TipoDeCliente,'slug'>[]): string`
  - `export function opcoesDeFiltro(tipos: Pick<TipoDeCliente,'slug'|'nome'>[], slugsEmUso: string[]): { value: string; label: string }[]`

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/hooks/use-clientes-tipos.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { slugDeTipo, rotuloDoTipo, tipoPadrao, opcoesDeFiltro } from '@/lib/tipos-de-cliente';

const LISTA = [
  { slug: 'construtora_ativa', nome: 'Construtora Ativa' },
  { slug: 'loja_ativa', nome: 'Loja Ativa' },
  { slug: 'pessoa fisica', nome: 'Pessoa Física' },
];

describe('slugDeTipo', () => {
  it('tira acento, baixa a caixa e junta com underscore', () => {
    expect(slugDeTipo('Construtora Inativa')).toBe('construtora_inativa');
    expect(slugDeTipo('  Pessoa Física  ')).toBe('pessoa_fisica');
  });

  it('devolve vazio quando o nome nao tem nenhum caractere aproveitavel', () => {
    expect(slugDeTipo('   ')).toBe('');
    expect(slugDeTipo('!!!')).toBe('');
  });
});

describe('rotuloDoTipo', () => {
  it('acha o rotulo pelo slug', () => {
    expect(rotuloDoTipo('construtora_ativa', LISTA)).toBe('Construtora Ativa');
  });

  it('cai no proprio valor quando o slug nao esta na lista', () => {
    // Um cliente gravado com um tipo que ja foi removido da lista continua legivel.
    expect(rotuloDoTipo('construtora - 3 níveis', LISTA)).toBe('construtora - 3 níveis');
  });
});

describe('tipoPadrao', () => {
  it('e o primeiro item da lista', () => {
    expect(tipoPadrao(LISTA)).toBe('construtora_ativa');
  });

  it('e vazio quando a lista ainda nao carregou', () => {
    expect(tipoPadrao([])).toBe('');
  });
});

describe('opcoesDeFiltro', () => {
  it('soma os tipos em uso que nao estao na lista, para nenhum cliente sumir da busca', () => {
    const opcoes = opcoesDeFiltro(LISTA, ['construtora_ativa', 'construtora']);
    expect(opcoes.map(o => o.value)).toEqual([
      'construtora_ativa', 'loja_ativa', 'pessoa fisica', 'construtora',
    ]);
    expect(opcoes.find(o => o.value === 'construtora')?.label).toBe('construtora');
  });

  it('nao duplica um tipo que esta na lista e em uso', () => {
    const opcoes = opcoesDeFiltro(LISTA, ['construtora_ativa']);
    expect(opcoes).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/hooks/use-clientes-tipos.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/tipos-de-cliente"`.

- [ ] **Step 3: Escrever o módulo**

Criar `src/lib/tipos-de-cliente.ts`:

```ts
/**
 * Funcoes puras do campo "Tipo" do cadastro de cliente.
 *
 * Ficam fora do hook de proposito: assim dao para testar sem mockar o Supabase, e
 * a tela de Clientes pode usar as mesmas regras que o hook usa.
 *
 * `clientes.tipo` e TEXTO LIVRE. A lista de `clientes_tipos` governa o dropdown e o
 * rotulo -- nunca a integridade. Por isso `rotuloDoTipo` sempre tem um caminho de
 * saida para um valor que nao esta na lista.
 */

export interface TipoDeCliente {
  id: string;
  empresa_id: string;
  slug: string;
  nome: string;
  ordem: number;
  is_sistema: boolean;
  created_at: string;
  updated_at: string;
}

/** Mesma regra que a tela usava antes de a lista ir para o banco. */
export function slugDeTipo(nome: string): string {
  return nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Cai no proprio valor quando o slug nao esta na lista. Isso e o que mantem legivel
 * o cliente gravado com um tipo que o gestor removeu depois -- e os 19 tipos
 * proprios da MD, que sao rotulo e slug ao mesmo tempo.
 */
export function rotuloDoTipo(
  slug: string,
  tipos: Pick<TipoDeCliente, 'slug' | 'nome'>[],
): string {
  return tipos.find(t => t.slug === slug)?.nome ?? slug;
}

/** Vazio enquanto a lista nao carregou -- o Select fica sem selecao, nao com lixo. */
export function tipoPadrao(tipos: Pick<TipoDeCliente, 'slug'>[]): string {
  return tipos[0]?.slug ?? '';
}

/**
 * Opcoes do FILTRO = a lista da empresa + os tipos realmente gravados que nao estao
 * nela. Sem essa soma, um cliente com tipo fora da lista (importacao, ou tipo
 * removido depois) fica inalcancavel pelo filtro -- defeito que ja existiu e foi
 * consertado antes.
 */
export function opcoesDeFiltro(
  tipos: Pick<TipoDeCliente, 'slug' | 'nome'>[],
  slugsEmUso: string[],
): { value: string; label: string }[] {
  const daLista = tipos.map(t => ({ value: t.slug, label: t.nome }));
  const conhecidos = new Set(tipos.map(t => t.slug));
  const orfaos = Array.from(new Set(slugsEmUso))
    .filter(s => s && !conhecidos.has(s))
    .sort()
    .map(s => ({ value: s, label: s }));
  return [...daLista, ...orfaos];
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/hooks/use-clientes-tipos.test.ts`
Expected: PASS — 8 testes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tipos-de-cliente.ts src/hooks/use-clientes-tipos.test.ts
git commit -m "feat(clientes): funcoes puras dos tipos de cliente, com testes"
```

---

## Task 4: Declarar a tabela nos tipos do TypeScript

**Files:**
- Modify: `src/integrations/supabase/types.ts`

**Interfaces:**
- Produces: `Database['public']['Tables']['clientes_tipos']`, sem o qual `supabase.from('clientes_tipos')` não compila.

> 🔴 **Arquivo disputado.** A outra sessão tem alterações não-commitadas aqui (bloco `pedido_responsaveis`). **Não commitar este arquivo nesta task** — o commit tem procedimento próprio na Task 8.

- [ ] **Step 1: Achar onde inserir (ordem alfabética)**

Run: `grep -n "^      clientes: {\|^      configuracoes_automacao: {" src/integrations/supabase/types.ts | head -4`
Expected: as tabelas estão em ordem alfabética. `clientes_tipos` entra **depois** do bloco `clientes` e **antes** do próximo.

- [ ] **Step 2: Inserir o bloco**

Acrescentar, no ponto achado no passo 1:

```ts
      clientes_tipos: {
        Row: {
          created_at: string
          empresa_id: string
          id: string
          is_sistema: boolean
          nome: string
          ordem: number
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          empresa_id: string
          id?: string
          is_sistema?: boolean
          nome: string
          ordem?: number
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          empresa_id?: string
          id?: string
          is_sistema?: boolean
          nome?: string
          ordem?: number
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clientes_tipos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
```

- [ ] **Step 3: Conferir que compila e que o número não subiu**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -cE "error TS"`
Expected: `33` (a linha de base). Se subir, o bloco está mal formado.

- [ ] **Step 4: NÃO commitar ainda**

Run: `git status --short src/integrations/supabase/types.ts`
Expected: ` M src/integrations/supabase/types.ts` — modificado, **fora da fila**. O commit é a Task 8.

---

## Task 5: Hook `use-clientes-tipos`

**Files:**
- Create: `src/hooks/use-clientes-tipos.ts`

**Interfaces:**
- Consumes: `TipoDeCliente`, `slugDeTipo` de `@/lib/tipos-de-cliente` (Task 3); tabela `clientes_tipos` (Tasks 1 e 4).
- Produces:
  - `useClientesTipos(empresaId?: string | null)` → `UseQueryResult<TipoDeCliente[]>`
  - `useCriarTipoDeCliente()` → mutation, `mutateAsync({ nome: string }) => Promise<string>` (devolve o slug criado)
  - `useExcluirTipoDeCliente()` → mutation, `mutateAsync({ id: string }) => Promise<void>`

- [ ] **Step 1: Escrever o hook**

Criar `src/hooks/use-clientes-tipos.ts`:

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { mensagemDeErro } from '@/lib/mensagem-de-erro';
import { slugDeTipo, type TipoDeCliente } from '@/lib/tipos-de-cliente';

/**
 * Lista de tipos/segmentos de cliente da empresa. Molde: use-marcadores.ts.
 *
 * A escrita e recusada pela RLS para quem nao e gestor -- a trava da tela e so
 * cosmetica. Por isso o onError mostra a frase que o BANCO devolveu, via
 * mensagemDeErro: erro do Supabase nao e um Error, e `e instanceof Error` da falso
 * justamente para os erros que interessam.
 */
export function useClientesTipos(empresaId?: string | null) {
  return useQuery<TipoDeCliente[]>({
    queryKey: ['clientes_tipos', empresaId ?? null],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clientes_tipos')
        .select('*')
        .order('ordem', { ascending: true });
      if (error) throw error;
      return (data ?? []) as TipoDeCliente[];
    },
    enabled: !!empresaId,
  });
}

export function useCriarTipoDeCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { nome: string }): Promise<string> => {
      const nome = input.nome.trim();
      if (!nome) throw new Error('Informe um nome para o tipo');

      // A empresa vem do banco, nunca do estado do React: numa sessao meio
      // carregada o profile pode estar nulo e gravaria um tipo sem dono.
      const { data: usuario, error: uErr } = await supabase
        .from('usuarios')
        .select('empresa_id')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id ?? '')
        .maybeSingle();
      if (uErr) throw uErr;
      if (!usuario?.empresa_id) throw new Error('Usuário sem empresa. Faça login novamente.');

      const { data: existentes, error: eErr } = await supabase
        .from('clientes_tipos')
        .select('slug, ordem')
        .eq('empresa_id', usuario.empresa_id);
      if (eErr) throw eErr;

      const base = slugDeTipo(nome);
      if (!base) throw new Error('Nome inválido');
      const usados = new Set((existentes ?? []).map(e => e.slug));
      if (usados.has(base)) throw new Error('Esse tipo já existe');

      const maxOrdem = (existentes ?? []).reduce((m, e) => Math.max(m, e.ordem), -1);

      const { error } = await supabase.from('clientes_tipos').insert({
        empresa_id: usuario.empresa_id,
        slug: base,
        nome,
        ordem: maxOrdem + 1,
        is_sistema: false,
      });
      if (error) throw error;
      return base;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clientes_tipos'] });
      toast.success('Tipo criado');
    },
    onError: (err) => toast.error(mensagemDeErro(err, 'Não foi possível criar o tipo')),
  });
}

export function useExcluirTipoDeCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string }) => {
      // So tira do dropdown. Cliente ja gravado com esse valor continua com ele e
      // segue legivel (rotuloDoTipo cai no proprio valor) e alcancavel pelo filtro
      // (opcoesDeFiltro soma os tipos em uso). Nao ha chave estrangeira para limpar.
      const { error } = await supabase.from('clientes_tipos').delete().eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clientes_tipos'] });
      toast.success('Tipo excluído');
    },
    onError: (err) => toast.error(mensagemDeErro(err, 'Não foi possível excluir o tipo')),
  });
}
```

- [ ] **Step 2: Conferir a assinatura de `mensagemDeErro`**

Run: `grep -n "export function mensagemDeErro" src/lib/mensagem-de-erro.ts`
Expected: uma função que aceita `(erro: unknown, padrao: string)`. Se a ordem dos parâmetros for outra, ajustar as duas chamadas acima.

- [ ] **Step 3: Conferir que compila**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -cE "error TS"`
Expected: `33`.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/use-clientes-tipos.ts
git commit -m "feat(clientes): hook da lista de tipos de cliente por empresa"
```

---

## Task 6: Tela de Clientes passa a usar o banco

**Files:**
- Modify: `src/pages/Clientes.tsx`

**Interfaces:**
- Consumes: `useClientesTipos`, `useCriarTipoDeCliente`, `useExcluirTipoDeCliente` (Task 5); `rotuloDoTipo`, `tipoPadrao`, `opcoesDeFiltro` (Task 3).

- [ ] **Step 1: Importar o que a tela vai usar**

Acrescentar aos imports do topo:

```ts
import { useClientesTipos, useCriarTipoDeCliente, useExcluirTipoDeCliente } from '@/hooks/use-clientes-tipos';
import { rotuloDoTipo, tipoPadrao, opcoesDeFiltro } from '@/lib/tipos-de-cliente';
```

- [ ] **Step 2: Trocar as constantes do topo**

Nas linhas 94-100, **apagar** `tipoLabels`, `baseTipos` e o `getTipoLabel` antigo. **Manter** `tipoIcons` e `getTipoIcon` (o ícone continua vindo do código; tipo desconhecido cai em `Building2`, que já era o comportamento).

- [ ] **Step 3: Trocar o estado de localStorage pela consulta ao banco**

Nas linhas 367-374, **apagar** os dois `useState` que leem `localStorage` e pôr, depois da linha que já calcula `empresaIdAtual`:

```ts
  const { data: tiposDeCliente } = useClientesTipos(empresaIdAtual);
  const tipos = tiposDeCliente ?? [];
  const criarTipo = useCriarTipoDeCliente();
  const excluirTipo = useExcluirTipoDeCliente();
  // Mesma regra do canDelete logo acima: espelha public.is_gestor() so para esconder
  // o controle na UI. A RLS continua sendo a autoridade real.
  const podeGerenciarTipos = ['gestor', 'admin', 'empresa'].includes(profile?.role);
```

- [ ] **Step 4: Fazer o campo do formulário nascer com o primeiro item da lista**

Trocar a linha 352 `const [tipo, setTipo] = useState('construtora');` por:

```ts
  // Nasce vazio e recebe o primeiro tipo da empresa assim que a lista chega. Nao da
  // para cravar 'construtora': depois da personalizacao da JHS esse slug nao existe
  // mais la, e o cadastro gravaria um tipo orfao.
  const [tipo, setTipo] = useState('');
```

E acrescentar, junto dos outros efeitos:

```ts
  useEffect(() => {
    if (!tipo && tipos.length > 0) setTipo(tipoPadrao(tipos));
  }, [tipo, tipos]);
```

- [ ] **Step 5: Trocar os dois handlers**

Substituir `handleCreateTipo` (401-442) e `handleDeleteTipo` (380-399) por:

```ts
  const handleCreateTipo = async () => {
    try {
      const slug = await criarTipo.mutateAsync({ nome: newTipoName });
      if (newTipoTarget === 'form') setTipo(slug);
      else setSelectedTipos(prev => (prev.includes(slug) ? prev : [...prev, slug]));
      setNewTipoName('');
      setNewTipoOpen(false);
    } catch {
      // O toast do erro real ja sai no onError do hook.
    }
  };

  const handleDeleteTipo = async (id: string, slug: string) => {
    try {
      await excluirTipo.mutateAsync({ id });
      if (tipo === slug) setTipo(tipoPadrao(tipos.filter(t => t.slug !== slug)));
      setSelectedTipos(prev => prev.filter(v => v !== slug));
      setConfirmDeleteTipo(null);
    } catch {
      // idem
    }
  };
```

> `handleDeleteTipo` passa a receber **id e slug**. Ajustar quem o chama (o `confirmDeleteTipo` guardava só o valor — passar a guardar `{ id, slug }`).

- [ ] **Step 6: Trocar as listas do dropdown e do filtro**

- Linha ~617 (`tipoFilterOptions`): usar `opcoesDeFiltro(tipos, clientesDaEmpresa.map(c => c.tipo))`.
- Linhas ~1207-1208 e ~1280-1286: a lista de opções passa a ser `tipos.map(t => ({ value: t.slug, label: t.nome }))`. Manter o item `__new__` ("+ Criar novo tipo…") **apenas quando `podeGerenciarTipos`**.
- Todo `getTipoLabel(x, customTipos)` (linhas ~498-499, 555, 1536, 1661, 1894) vira `rotuloDoTipo(x, tipos)`.

- [ ] **Step 7: Rodar tudo**

```bash
npx vitest run src/hooks/use-clientes-tipos.test.ts
npm run test
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -cE "error TS"
npm run build
```
Expected: testes 976+ passando, tipos `33`, build ok.

- [ ] **Step 8: Conferir na tela**

Subir `npm run dev` e, em `/clientes`: a lista de tipos aparece; criar um tipo novo e recarregar a página **em outro navegador** mostra o mesmo tipo (prova que saiu do localStorage); entrar como vendedor comum **não** mostra "+ Criar novo tipo…".

- [ ] **Step 9: Commit**

```bash
git status --short
git add src/pages/Clientes.tsx
git commit -m "feat(clientes): lista de tipos vem do banco, compartilhada pela empresa"
```

---

## Task 7: Registrar a dívida das duas telas fora de escopo

**Files:**
- Modify: `docs/divida-tecnica.md`

- [ ] **Step 1: Acrescentar a seção**

```markdown
## Tipos de cliente: duas telas ainda gravam lista fixa própria

Desde 02/09/2026 a lista de tipos de cliente é uma lista por empresa
(`clientes_tipos`), lida por `src/pages/Clientes.tsx`. **Outras duas telas ficaram
de fora, por decisão de escopo, e continuam com listas fixas embutidas:**

| Arquivo | O que faz | Estrago |
|---|---|---|
| `src/pages/ClienteDetalhe.tsx` (~891-897) | Select com **3 opções fixas** e `tipoLabels` próprio (49-50) | Editar um cliente por essa tela **desfaz a classificação**: "Construtora Ativa" vira um dos 3 valores antigos |
| `src/components/shared/EmpresaSelector.tsx` (214-232) | Select com **6 opções fixas**; cadastra cliente de verdade via `useCreateCliente`. Usado em **6 telas** (NovoNegocioDialog, Clientes, ContatoDetalhe, EditarPedido, Obras) | Vendedor que cadastra cliente pelo atalho do negócio grava `construtora` — slug que a JHS não tem mais. O cliente fica sem rótulo bonito (mostra o valor cru) |

Nenhum dos dois quebra a tela: `rotuloDoTipo` cai no valor cru e `opcoesDeFiltro`
soma os tipos em uso, então o cliente continua legível e encontrável. O que se perde
é a classificação correta.

**Conserto:** as duas passarem a ler `useClientesTipos` como `Clientes.tsx` faz.
```

- [ ] **Step 2: Commit**

```bash
git add docs/divida-tecnica.md
git commit -m "docs(divida): duas telas ainda gravam tipo de cliente com lista fixa"
```

---

## Task 8: Commit do `types.ts` (arquivo disputado)

**Files:**
- Modify: `src/integrations/supabase/types.ts` (só o bloco da Task 4)

- [ ] **Step 1: Ver o que está no arquivo**

Run: `git diff --stat src/integrations/supabase/types.ts`
Expected: as alterações da outra sessão (`pedido_responsaveis`) **mais** o bloco `clientes_tipos` da Task 4.

- [ ] **Step 2: Escolher o caminho**

**Caminho A (preferido) — o Lucas commita o trabalho da outra sessão primeiro.** Depois disso o arquivo só tem a minha alteração:

```bash
git add src/integrations/supabase/types.ts
git commit -m "feat(clientes): declara clientes_tipos nos tipos do banco"
```

**Caminho B — estagiar só o meu pedaço**, se o trabalho da outra sessão precisar continuar fora do git:

```bash
git diff src/integrations/supabase/types.ts > /tmp/types-completo.patch
# editar /tmp/meu-pedaco.patch deixando SOMENTE o hunk do bloco clientes_tipos
git apply --cached /tmp/meu-pedaco.patch
git diff --cached                      # conferir: so o bloco clientes_tipos
git commit -m "feat(clientes): declara clientes_tipos nos tipos do banco"
git status --short                     # types.ts deve continuar ' M' (o resto da outra sessao)
```

> 🔴 **Nunca `git add -A` aqui.** E conferir `git status --short` num comando separado do commit.

---

## Task 9: Aplicar em produção (exige autorização)

- [ ] **Step 1: Verificação completa antes de pedir o "pode"**

```bash
npm run test
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -cE "error TS"
npm run build
```
Expected: 976+ testes passando, `33` erros de tipo, build ok.

- [ ] **Step 2: Pedir autorização ao Lucas**, dizendo o que sobe e o que muda.

- [ ] **Step 3: Conferir que não entrou commit de outra pessoa**

```bash
git fetch origin
git log --oneline HEAD..origin/main
git status --short
```

- [ ] **Step 4: Aplicar as duas migrations no banco de produção** (projeto `hukeirrmsoiowvvrhivx`), **antes** do deploy.

- [ ] **Step 5: Conferir o backfill**

```sql
select e.nome, count(*) from clientes_tipos ct join empresas e on e.id = ct.empresa_id
group by e.nome order by count(*) desc;
```
Expected: **34 linhas** no total — MD 19, Repply 7, PR & COCENTINO 4, JHS 3, House Design 1.

E que nenhum cliente ficou órfão:
```sql
select count(*) from clientes c
join usuarios u on u.id = c.usuario_id
left join clientes_tipos ct on ct.empresa_id = u.empresa_id and ct.slug = c.tipo
where ct.id is null;
```
Expected: `0`.

- [ ] **Step 6: `git push origin main`** — isso **publica**.

---

## Task 10: Dados da JHS (exige autorização, isolado do schema)

**Empresa:** JHS Representações Limitada — `9ad7723e-a9ba-4608-b961-72b9bdeabcbe`

- [ ] **Step 1: Pedir o "pode" do Lucas** — são 221 cadastros de cliente reais mudando de tipo.

- [ ] **Step 2: Trocar a lista da JHS pelos 7 tipos**

```sql
begin;

insert into clientes_tipos (empresa_id, slug, nome, ordem, is_sistema) values
  ('9ad7723e-a9ba-4608-b961-72b9bdeabcbe','construtora_ativa',   'Construtora Ativa',   0, false),
  ('9ad7723e-a9ba-4608-b961-72b9bdeabcbe','construtora_inativa', 'Construtora Inativa', 1, false),
  ('9ad7723e-a9ba-4608-b961-72b9bdeabcbe','loja_ativa',          'Loja Ativa',          2, false),
  ('9ad7723e-a9ba-4608-b961-72b9bdeabcbe','loja_inativa',        'Loja Inativa',        3, false),
  ('9ad7723e-a9ba-4608-b961-72b9bdeabcbe','hotel_ativo',         'Hotel Ativo',         4, false),
  ('9ad7723e-a9ba-4608-b961-72b9bdeabcbe','hotel_inativo',       'Hotel Inativo',       5, false),
  ('9ad7723e-a9ba-4608-b961-72b9bdeabcbe','pessoa fisica',       'Pessoa Física',       6, false)
on conflict (empresa_id, slug) do nothing;

-- Reclassifica os 221 ja importados (a primeira leva = ativos).
update clientes c set tipo = case c.tipo
    when 'construtora' then 'construtora_ativa'
    when 'loja'        then 'loja_ativa'
    when 'hotel'       then 'hotel_ativo'
  end
from usuarios u
where u.id = c.usuario_id
  and u.empresa_id = '9ad7723e-a9ba-4608-b961-72b9bdeabcbe'
  and c.tipo in ('construtora','loja','hotel');

-- Tira da lista da JHS os 3 slugs antigos que o backfill generico criou e que
-- agora nao tem mais nenhum cliente.
delete from clientes_tipos
where empresa_id = '9ad7723e-a9ba-4608-b961-72b9bdeabcbe'
  and slug in ('construtora','loja','hotel');

commit;
```

- [ ] **Step 3: Conferir**

```sql
select c.tipo, count(*) from clientes c join usuarios u on u.id = c.usuario_id
where u.empresa_id = '9ad7723e-a9ba-4608-b961-72b9bdeabcbe' group by c.tipo;
```
Expected: `construtora_ativa` 186, `loja_ativa` 33, `hotel_ativo` 2 — **total 221**, nenhum sobrando nos valores antigos. E a lista da JHS com **7** linhas.

---

## Task 11: Planilha dos 591 inativos

**Fonte:** `D:\lucas\Documents\2- REPPLY HUB\Projetos\Repply CRM\Implementações\JHS Representações\Relatório de Clientes inativos 02 de Setembro.xls` — HTML disfarçado de `.xls`, **UTF-8** (não cp1252), 6 colunas, 591 linhas.

**Saída:** `…\Implementações\JHS Representações\Planilhas para importação Repply\3 - Empresas (clientes) INATIVOS JHS.xlsx` e `4 - Contatos INATIVOS JHS.xlsx`.

- [ ] **Step 1: Reaproveitar o gerador dos ativos**, mudando só o mapa de tipos:

| sinal no nome | Tipo na planilha |
|---|---|
| construtora / engenharia / incorporadora / SPE | `construtora_inativa` |
| loja / ferragens / materiais / cerâmica / pisos… | `loja_inativa` |
| hotel / resort / pousada | `hotel_inativo` |
| **CPF (11 dígitos)** | `pessoa fisica` |
| sem sinal | `construtora_inativa` |

- [ ] **Step 2: Tratar o que os ativos não tinham** — **14 CPF** (formatar `000.000.000-00`), **3 sem telefone**, **16 sem e-mail** (contato criado só com nome), **18 linhas com nome repetido** (filiais: entram como empresas separadas, mas o contato delas não amarra sozinho), telefones de 7/9/12 dígitos (passar o texto original sem mexer).

- [ ] **Step 3: Conferir antes de entregar**: 591 linhas de empresa; todo `Empresa` da planilha de contatos existe na de empresas; nenhum e-mail inválido; a coluna Tipo só contém os 4 valores acima.

- [ ] **Step 4: Entregar ao Lucas** com o lembrete: importar **pela tela de Empresas** (a de Contatos depois), porque o outro caminho de importação (`use-bulk-import.ts`) tem um padrão diferente (`'cliente'`) e criaria um tipo fora da lista.

---

## Self-Review

**Cobertura da spec:** §4.1 tabela/RLS → Task 1. §4.2 backfill e gatilho → Task 1. §4.3 hook → Task 5 (funções puras extraídas para Task 3, melhoria sobre a spec: dá para testar sem mockar o Supabase). §4.4 tela → Task 6. §4.5 dados da JHS → Task 10. §4.6 planilha → Task 11. §4.7 types.ts → Tasks 4 e 8. §4.8 testes → Task 3. §5 ordem de produção → Tasks 9 e 10. Acrescentado além da spec: inventário (Task 2) e a dívida das duas telas (Task 7), ambos levantados no mapeamento.

**Placeholders:** nenhum "TBD"/"TODO". Todo passo de código traz o código.

**Consistência de tipos:** `TipoDeCliente` é declarado uma vez (Task 3) e importado pelo hook (Task 5). `rotuloDoTipo`/`tipoPadrao`/`opcoesDeFiltro` têm a mesma assinatura no teste, no módulo e no consumo. `handleDeleteTipo(id, slug)` — a mudança de assinatura está sinalizada no passo que a introduz.

**Ponto frágil conhecido:** a Task 6 mexe num arquivo de 2.111 linhas com muitos pontos de uso. Os números de linha citados são de `d262afc5`; conferir com `grep` antes de editar, não confiar na linha.
