# A pauta do dia que encolhe até zerar — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pauta do dia passa a ser escolhida na virada do dia e só encolher até zerar; a do gestor traz os negócios dele primeiro e depois os da equipe; e os cartões de risco seguem a mesma chave de permissão.

**Architecture:** Toda a regra vive em duas funções de banco — `pauta_do_dia_de(uuid)` (a fila, que alimenta a tela e o e-mail das 7h) e `dashboard_negocios_risco(...)` (os cartões). O site e a função de borda só passam a separar dois tipos de item que a fila devolve (`negocio_parado` e `negocio_feito`) e a mostrar o contador. Nenhuma regra é reimplementada fora do banco.

**Tech Stack:** Postgres/plpgsql (Supabase), React 18 + TypeScript, TanStack Query v5, Tailwind, Vitest + Testing Library, Deno (função de borda).

**Desenho:** `docs/superpowers/specs/2026-09-12-pauta-do-dia-que-encolhe-design.md`

## Global Constraints

- 🔴 **`CREATE OR REPLACE`, NUNCA `DROP` + `CREATE`.** `pauta_do_dia_de(uuid)` teve `authenticated` revogado de propósito — medido em 12/09/2026, `proacl` = `postgres=X/postgres | service_role=X/postgres`. Um `DROP` apagaria isso em silêncio e devolveria a pauta de qualquer colega a qualquer pessoa logada.
- 🔴 **O corpo das funções é COLHIDO com `pg_get_functiondef`, não reescrito de memória.** Os corpos colhidos em 12/09/2026 estão neste plano; antes de aplicar, confira que o `md5(prosrc)` ainda bate: `pauta_do_dia_de` = `e65e235e52c15d1326ad51d67f43162f` (6217 caracteres), `dashboard_negocios_risco` = `3e40ace58fa8b109c44710db2b8415da` (3071 caracteres). Se não bater, alguém mexeu depois: colha de novo e reaplique as trocas.
- 🔴 **Dado real não entra em teste, plano nem comentário** (CLAUDE.md §6.9). Nomes e valores inventados: "Ana Souza", "Obra Exemplo", 180000.
- 🔴 **Fuso:** `historico_contatos.data_contato` é comparada **em UTC**, nunca convertida para São Paulo. Medido: a coluna guarda meia-noite UTC (o que `registrar_retorno` grava) e meio-dia UTC (o que as telas de contato gravam); converter para São Paulo joga o primeiro grupo para o dia anterior.
- 🔴 **Índice do git compartilhado com outras sessões:** nunca `git add -A`. Commitar sempre com `git commit -m "<msg>" --only -- <caminhos>`, e `git add -N <arquivo>` antes, para arquivo novo.
- Mensagem de commit termina com `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Não publicar nada** (nem `git push`, nem `supabase functions deploy`, nem migration) até a Tarefa 7, que tem a ordem obrigatória.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade | Tarefa |
|---|---|---|
| `src/lib/pauta-do-dia.ts` (novo) | separar o que a tela desenha do que já foi feito, e contar o dia | 1 |
| `src/lib/pauta-do-dia.test.ts` (novo) | prende a separação e o contador | 1 |
| `src/hooks/use-pauta.ts` | o tipo do item ganha `negocio_feito` | 2 |
| `src/pages/Hoje.tsx` | contador, estado "zerada", etiqueta de dono | 2 |
| `src/pages/hoje-estados.test.tsx` (novo) | prende os três estados da tela | 2 |
| `supabase/functions/pauta-resumo-diario/corpo.ts` | expõe `soOsPendentes` | 3 |
| `supabase/functions/pauta-resumo-diario/index.ts` | filtra antes de decidir se envia | 3 |
| `src/lib/corpo-do-resumo-diario.test.ts` | prende o filtro | 3 |
| `src/components/configuracoes/AutomacaoTab.tsx` | um número só, "Até quantos itens por dia" | 4 |
| `src/hooks/use-configuracoes-automacao.ts` | sai `pauta_min_itens` | 4 |
| `supabase/migrations/20260912100000_pauta_do_dia_que_encolhe.sql` (novo) | a fila | 5 |
| `supabase/migrations/20260912110000_risco_segue_a_chave.sql` (novo) | os cartões | 6 |

---

### Task 1: O módulo que separa a pauta

**Files:**
- Create: `src/lib/pauta-do-dia.ts`
- Test: `src/lib/pauta-do-dia.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `separarAPauta(itens: ItemParaSeparar[]): PautaSeparada`, onde
  `ItemParaSeparar = { tipo: string }` (aceita qualquer objeto com `tipo`, para o teste não precisar montar um `ItemDaPauta` inteiro) e
  `PautaSeparada = { naTela: T[]; feitos: T[]; negociosDoDia: number }`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/lib/pauta-do-dia.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { separarAPauta } from './pauta-do-dia';

/**
 * O QUE ESTE ARQUIVO PRENDE: a conta de "3 de 7 feitos hoje" e o que a tela desenha.
 *
 * A fila (`pauta_do_dia_de`) passou a devolver DOIS tipos de negócio: `negocio_parado`, que
 * ainda espera retorno, e `negocio_feito`, que já recebeu um hoje. Desenhar os dois juntos
 * mostraria como pendente o que a pessoa acabou de resolver.
 *
 * Nomes e valores inventados (CLAUDE.md §6.9).
 */

const compromisso = { tipo: 'compromisso', titulo: 'Reunião com Ana Souza' };
const parado = { tipo: 'negocio_parado', titulo: 'Obra Exemplo' };
const feito = { tipo: 'negocio_feito', titulo: 'Obra Modelo' };

describe('separarAPauta', () => {
  it('a tela desenha compromissos e pendentes, nunca os feitos', () => {
    const { naTela } = separarAPauta([compromisso, parado, feito]);
    expect(naTela).toEqual([compromisso, parado]);
  });

  it('o denominador conta só NEGÓCIOS — compromisso não entra', () => {
    const r = separarAPauta([compromisso, parado, parado, feito]);
    expect(r.negociosDoDia).toBe(3);
    expect(r.feitos).toHaveLength(1);
  });

  it('dia zerado: nenhum pendente e pelo menos um feito', () => {
    const r = separarAPauta([feito, feito]);
    expect(r.naTela).toHaveLength(0);
    expect(r.feitos).toHaveLength(2);
    expect(r.negociosDoDia).toBe(2);
  });

  it('lista vazia não quebra e não inventa dia zerado', () => {
    const r = separarAPauta([]);
    expect(r.naTela).toHaveLength(0);
    expect(r.feitos).toHaveLength(0);
    expect(r.negociosDoDia).toBe(0);
  });

  it('tipo desconhecido vai para a tela, e não some', () => {
    const estranho = { tipo: 'tipo_que_ainda_nao_existe', titulo: 'X' };
    const { naTela, negociosDoDia } = separarAPauta([estranho]);
    expect(naTela).toEqual([estranho]);
    expect(negociosDoDia).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

```bash
npx vitest run src/lib/pauta-do-dia.test.ts
```

Esperado: FALHA com `Failed to resolve import "./pauta-do-dia"`.

- [ ] **Step 3: Escrever o módulo**

Criar `src/lib/pauta-do-dia.ts`:

```ts
/**
 * A pauta do dia, separada em "o que ainda espera" e "o que já foi feito".
 *
 * Desde 12/09/2026 a fila é escolhida na virada do dia e só encolhe: o negócio que recebe
 * retorno sai da lista e nada entra no lugar. Para a tela poder dizer "3 de 7 feitos hoje" —
 * e distinguir quem trabalhou o dia inteiro de quem não tinha nada parado —, a função de banco
 * devolve também os já feitos, marcados com `tipo = 'negocio_feito'`.
 *
 * 🔴 QUEM CONSOME TEM DE FILTRAR. `ItemPauta` desenha qualquer item que receba; sem esta
 * separação, o negócio resolvido às 9h continuaria na tela às 17h com o botão "Retomar depois"
 * do lado.
 *
 * Recebe qualquer objeto com `tipo` de propósito: o teste não precisa montar um `ItemDaPauta`
 * inteiro só para conferir uma contagem.
 */
export type ItemParaSeparar = { tipo: string };

export type PautaSeparada<T extends ItemParaSeparar> = {
  /** O que a tela desenha: compromissos da agenda e os negócios que ainda esperam retorno. */
  naTela: T[];
  /** Os negócios do dia que já receberam retorno hoje. */
  feitos: T[];
  /**
   * Quantos NEGÓCIOS o dia trouxe — o denominador de "3 de 7 feitos hoje".
   *
   * Compromisso não entra: reunião marcada não é negócio parado, e contá-la faria o
   * denominador subir sem que houvesse mais trabalho de follow-up a fazer.
   */
  negociosDoDia: number;
};

export function separarAPauta<T extends ItemParaSeparar>(itens: T[]): PautaSeparada<T> {
  const feitos = itens.filter((i) => i.tipo === 'negocio_feito');
  const naTela = itens.filter((i) => i.tipo !== 'negocio_feito');
  const parados = naTela.filter((i) => i.tipo === 'negocio_parado').length;
  return { naTela, feitos, negociosDoDia: parados + feitos.length };
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

```bash
npx vitest run src/lib/pauta-do-dia.test.ts
```

Esperado: `Test Files 1 passed`, `Tests 5 passed`.

- [ ] **Step 5: Commitar**

```bash
git add -N src/lib/pauta-do-dia.ts src/lib/pauta-do-dia.test.ts
git commit -m "feat(pauta): modulo que separa o que a tela desenha do que ja foi feito hoje

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" --only -- src/lib/pauta-do-dia.ts src/lib/pauta-do-dia.test.ts
```

---

### Task 2: A tela "Hoje" — contador, dia zerado e a etiqueta de dono

**Files:**
- Modify: `src/hooks/use-pauta.ts` (o tipo do item)
- Modify: `src/pages/Hoje.tsx`
- Test: `src/pages/hoje-estados.test.tsx` (criar)

**Interfaces:**
- Consumes: `separarAPauta` da Tarefa 1.
- Produces: nada para tarefas seguintes.

- [ ] **Step 1: O tipo do item ganha `negocio_feito`**

Em `src/hooks/use-pauta.ts`, trocar a linha do campo `tipo` dentro de `interface ItemDaPauta`:

```ts
  tipo: 'compromisso' | 'negocio_parado';
```

por:

```ts
  /**
   * `negocio_feito` entrou em 12/09/2026: é um negócio que estava na pauta de hoje e já
   * recebeu retorno. Ele vem no MESMO retorno da fila para a tela poder contar "3 de 7 feitos
   * hoje" sem uma segunda consulta — e quem desenha tem de filtrar (`separarAPauta`, em
   * `src/lib/pauta-do-dia.ts`).
   */
  tipo: 'compromisso' | 'negocio_parado' | 'negocio_feito';
```

- [ ] **Step 2: Escrever o teste que falha**

Criar `src/pages/hoje-estados.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

/**
 * O QUE ESTE ARQUIVO PRENDE: a tela "Hoje" distingue TRÊS dias diferentes que hoje pareciam
 * iguais — o dia em que não havia nada parado, o dia em que a fila própria está vazia mas há
 * trabalho da equipe embaixo, e o dia em que a pessoa (ou o time) ZEROU a pauta.
 *
 * Pedido do dono do produto em 12/09/2026: "quando um usuário for dando os retornos aos
 * negócios que estão na pauta aí a pauta vai diminuindo até zerar". Sem a mensagem própria,
 * quem trabalhou o dia todo vê a mesma tela de quem não tinha nada a fazer.
 *
 * Tudo que fala com o servidor vira esboço: aqui só a ESCOLHA DO ESTADO importa. Nomes e
 * valores inventados (CLAUDE.md §6.9).
 */

const mockPauta = vi.fn();
vi.mock('@/hooks/use-pauta', () => ({
  usePauta: () => mockPauta(),
  useRegistrarRetorno: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/use-dashboard', () => ({
  useNegociosEmRisco: () => ({ data: { total: 0 }, isLoading: false, status: 'success' }),
}));
vi.mock('@/components/pauta/RadarDeRisco', () => ({ RadarDeRisco: () => <div /> }));
vi.mock('@/components/pedidos/PainelDoNegocio', () => ({ PainelDoNegocio: () => <div /> }));
vi.mock('@/components/pauta/DialogoRetorno', () => ({ DialogoRetorno: () => <div /> }));
vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ profile: { nome: 'Ana Souza', empresa_id: 'emp-1', role: 'gestor' } }),
}));
vi.mock('@/hooks/use-minha-permissao', () => ({ usePossoVerPautaDeTodos: () => true }));
vi.mock('@/hooks/use-configuracoes-automacao', () => ({
  useConfiguracoesAutomacao: () => ({ data: { pauta_dias_parado: 3 } }),
  PADROES_DA_PAUTA: { pauta_dias_parado: 3 },
}));
// 🔴 OS NOMES SÃO OS DO HOOK DE VERDADE (`negocioAberto`, `abrirNegocio`, `fecharNegocio`):
// `Hoje.tsx` desestrutura os três, e um esboço com nomes diferentes entrega `undefined` e a
// tela estoura no primeiro clique — um teste que "passa" sem provar nada.
vi.mock('@/hooks/use-negocio-no-endereco', () => ({
  useNegocioNoEndereco: () => ({
    negocioAberto: null,
    abrirNegocio: vi.fn(),
    fecharNegocio: vi.fn(),
  }),
}));

import { MemoryRouter } from 'react-router-dom';
import Hoje from './Hoje';

afterEach(() => {
  cleanup();
  mockPauta.mockReset();
});

const feito = (id: string) => ({
  tipo: 'negocio_feito', referencia_id: id, selo: 'Feito hoje', titulo: 'Obra Exemplo',
  detalhe: 'Em Negociação', valor: 180000, quando: null, dias_parado: 9, ordem: 2000,
  responsavel: null,
});
const parado = (id: string) => ({
  tipo: 'negocio_parado', referencia_id: id, selo: 'Orçamento parado', titulo: 'Obra Modelo',
  detalhe: 'Em Negociação', valor: 90000, quando: null, dias_parado: 11, ordem: 1000,
  responsavel: null,
});

function desenhar() {
  render(<MemoryRouter><Hoje /></MemoryRouter>);
}

describe('os estados da tela "Hoje"', () => {
  it('🔴 zerou: nenhum pendente e pelo menos um feito', () => {
    mockPauta.mockReturnValue({ data: [feito('a'), feito('b')], isLoading: false });
    desenhar();
    expect(screen.getByText('Pauta de hoje zerada')).toBeInTheDocument();
  });

  it('🔴 com pendente e feito, a tela conta o progresso', () => {
    mockPauta.mockReturnValue({ data: [parado('a'), feito('b')], isLoading: false });
    desenhar();
    expect(screen.getByText('1 de 2 feitos hoje')).toBeInTheDocument();
    expect(screen.queryByText('Pauta de hoje zerada')).not.toBeInTheDocument();
  });

  it('sem nada feito e sem nada parado, continua a frase de hoje', () => {
    mockPauta.mockReturnValue({ data: [], isLoading: false });
    desenhar();
    expect(screen.queryByText('Pauta de hoje zerada')).not.toBeInTheDocument();
    expect(screen.getByText(/Nada parado/)).toBeInTheDocument();
  });

  it('o negócio já feito não é desenhado como item da fila', () => {
    mockPauta.mockReturnValue({ data: [parado('a'), feito('b')], isLoading: false });
    desenhar();
    expect(screen.queryByText('Obra Exemplo')).not.toBeInTheDocument();
    expect(screen.getByText('Obra Modelo')).toBeInTheDocument();
  });

  it('🔴 negócio de colega mostra de quem é', () => {
    mockPauta.mockReturnValue({
      data: [{ ...parado('a'), responsavel: 'Bruno Lima' }],
      isLoading: false,
    });
    desenhar();
    expect(screen.getByText('Bruno Lima')).toBeInTheDocument();
  });

  it('negócio próprio não ganha etiqueta de dono', () => {
    // A função de banco manda `responsavel` NULO quando o negócio é de quem está olhando. Sem
    // esta conferência, uma etiqueta com o próprio nome em todo item passaria despercebida.
    mockPauta.mockReturnValue({ data: [parado('a')], isLoading: false });
    desenhar();
    expect(screen.queryByText('Ana Souza')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Rodar o teste e ver falhar**

```bash
npx vitest run src/pages/hoje-estados.test.tsx
```

Esperado: FALHA em `Unable to find an element with the text: Pauta de hoje zerada`.

- [ ] **Step 4: Ligar o módulo em `Hoje.tsx`**

4a. No bloco de imports, depois da linha `import { vozDaPauta } from '@/lib/voz-da-pauta';`, acrescentar:

```ts
import { separarAPauta } from '@/lib/pauta-do-dia';
```

4b. Trocar a linha 239 (`const total = pauta?.length ?? 0;`) por:

```ts
  // 🔴 A FILA DEVOLVE DOIS TIPOS DE NEGÓCIO desde 12/09/2026: o que ainda espera retorno e o
  // que já recebeu um hoje. `ItemPauta` desenha qualquer item que receba, então quem separa é
  // esta linha — sem ela, o negócio resolvido às 9h continuaria na tela às 17h com o botão
  // "Retomar depois" do lado.
  const { naTela, feitos, negociosDoDia } = separarAPauta(pauta ?? []);
  const total = naTela.length;
```

4c. Trocar a chamada da voz para receber só o que está na tela:

```ts
  const voz = useMemo(
    () => vozDaPauta(pauta ?? [], diasParadoDaEmpresa),
    [pauta, diasParadoDaEmpresa],
  );
```

vira:

```ts
  // 🔴 `naTela`, e não `pauta`: a voz conta os negócios da frase ("R$ X parados em N
  // negócios"), e contar os já feitos faria a manchete cobrar trabalho que a pessoa acabou de
  // entregar. A voz é a mesma do e-mail das 7h — lá o filtro é feito no `index.ts`.
  const voz = useMemo(
    () => vozDaPauta(naTela, diasParadoDaEmpresa),
    [naTela, diasParadoDaEmpresa],
  );
```

4d. Trocar `pauta!.map((item, i) => (` por `naTela.map((item, i) => (`, na lista de itens.

- [ ] **Step 5: O estado "zerada" e o contador**

5a. Acrescentar, logo abaixo da linha `const filaVaziaEComemora = ...`:

```ts
  // 🔴 GANHA DOS OUTROS DOIS ESTADOS, e é o ponto do pedido de 12/09/2026: sem ele, quem
  // trabalhou o dia inteiro e zerou vê exatamente a mesma tela de quem não tinha nada parado.
  // Não depende da tabela do time ter respondido: o que houver embaixo não desmente o fato de
  // a pauta DE HOJE ter sido cumprida.
  const zerouAPautaDeHoje = total === 0 && feitos.length > 0;
```

5b. Trocar a condição do primeiro ramo do `:` encadeado. Onde está:

```tsx
        ) : filaVaziaEComemora ? (
```

passa a estar:

```tsx
        ) : zerouAPautaDeHoje ? (
          // O dia cumprido. A frase é NEUTRA quanto a quem fez, de propósito: na pauta do
          // gestor os negócios são da equipe, e "você zerou" seria falso ali.
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Sun className="h-6 w-6 text-primary" />
            </div>
            <h2 className="text-2xl font-semibold text-card-foreground">Pauta de hoje zerada</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              {negociosDoDia === 1
                ? 'O negócio do dia recebeu retorno. A pauta de amanhã nasce de manhã.'
                : `Os ${negociosDoDia} negócios do dia receberam retorno. A pauta de amanhã nasce de manhã.`}
            </p>
          </div>
        ) : filaVaziaEComemora ? (
```

5c. Acrescentar o contador no cabeçalho da lista. Dentro de `<header className="mb-6">`, depois do bloco `{voz.apoio && (...)}`, acrescentar:

```tsx
              {feitos.length > 0 && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {`${feitos.length} de ${negociosDoDia} feitos hoje`}
                </p>
              )}
```

- [ ] **Step 6: A etiqueta de dono volta ao item**

Em `ItemPauta`, trocar o comentário que ocupa o lugar da etiqueta:

```tsx
          {/* A fila é sempre pessoal desde 09/09/2026, então `item.responsavel` vem sempre nulo e
              a etiqueta de dono saiu daqui. O campo fica no banco: é o que a tabela do time e o
              e-mail leem. */}
```

por:

```tsx
          {/* 🔴 A ETIQUETA VOLTOU em 12/09/2026, junto com a pauta do gestor. `responsavel` só
              vem preenchido quando o negócio é DE OUTRA PESSOA — a função de banco resolve
              isso —, então para o próprio dono nada é desenhado aqui. Sem ela, o gestor recebe
              negócio de colega sem saber de quem é, e cobra a pessoa errada. */}
          {item.responsavel && (
            <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {item.responsavel}
            </span>
          )}
```

- [ ] **Step 7: Rodar os testes e ver passar**

```bash
npx vitest run src/pages/hoje-estados.test.tsx
```

Esperado: `Tests 4 passed`.

```bash
npx vitest related --run src/pages/Hoje.tsx src/hooks/use-pauta.ts src/lib/pauta-do-dia.ts
```

Esperado: todos os arquivos relacionados passam, inclusive `src/components/pauta/radar-ordem.test.tsx`.

- [ ] **Step 8: Conferir os tipos**

```bash
npx tsc --noEmit -p tsconfig.app.json
```

Esperado: nenhum erro novo nos arquivos tocados (`src/pages/Hoje.tsx`, `src/hooks/use-pauta.ts`, `src/lib/pauta-do-dia.ts`).

- [ ] **Step 9: Commitar**

```bash
git add -N src/pages/hoje-estados.test.tsx
git commit -m "feat(hoje): o contador do dia, a tela de pauta zerada e a etiqueta de dono de volta

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" --only -- src/pages/Hoje.tsx src/hooks/use-pauta.ts src/pages/hoje-estados.test.tsx
```

---

### Task 3: O e-mail das 7h ignora o que já foi feito

**Files:**
- Modify: `supabase/functions/pauta-resumo-diario/corpo.ts`
- Modify: `supabase/functions/pauta-resumo-diario/index.ts`
- Test: `src/lib/corpo-do-resumo-diario.test.ts`

**Interfaces:**
- Consumes: nada da Tarefa 1 (a função de borda roda em Deno e não importa de `src/`).
- Produces: `soOsPendentes(itens: ItemDaPauta[]): ItemDaPauta[]`, exportada de `corpo.ts`.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar ao fim de `src/lib/corpo-do-resumo-diario.test.ts`:

```ts
describe('soOsPendentes', () => {
  const item = (tipo: string, titulo: string) => ({
    tipo, selo: 'Orçamento parado', titulo, detalhe: 'Em Negociação',
    valor: 180000, quando: null, dias_parado: 9,
  });

  it('🔴 tira do e-mail o negócio que já recebeu retorno hoje', () => {
    const itens = [item('negocio_parado', 'Obra Exemplo'), item('negocio_feito', 'Obra Modelo')];
    expect(soOsPendentes(itens).map((i) => i.titulo)).toEqual(['Obra Exemplo']);
  });

  it('compromisso da agenda continua no e-mail', () => {
    const itens = [item('compromisso', 'Reunião com Ana Souza')];
    expect(soOsPendentes(itens)).toHaveLength(1);
  });
});
```

E acrescentar `soOsPendentes` à linha de `import` que já traz `montarEmail` do `corpo.ts` no topo do arquivo.

- [ ] **Step 2: Rodar o teste e ver falhar**

```bash
npx vitest run src/lib/corpo-do-resumo-diario.test.ts
```

Esperado: FALHA com `soOsPendentes is not a function` (ou erro de importação).

- [ ] **Step 3: Escrever a função em `corpo.ts`**

Acrescentar em `supabase/functions/pauta-resumo-diario/corpo.ts`, logo depois da `interface ItemDaPauta`:

```ts
/**
 * O e-mail lista só o que ainda espera retorno.
 *
 * Desde 12/09/2026 a fila devolve também os negócios que JÁ receberam retorno hoje
 * (`tipo = 'negocio_feito'`), para a tela poder contar "3 de 7 feitos hoje". Às 7h da manhã não
 * há nenhum — mas um reprocessamento no meio do dia mandaria à pessoa uma lista de coisas que
 * ela já resolveu, com o selo de "parado".
 *
 * Fica aqui, e não dentro de `montarEmail`, porque `index.ts` decide ANTES de montar se há
 * e-mail a mandar: com a fila inteira, uma pauta zerada pareceria cheia e o e-mail sairia.
 */
export function soOsPendentes(itens: ItemDaPauta[]): ItemDaPauta[] {
  return itens.filter((i) => i.tipo !== "negocio_feito");
}
```

- [ ] **Step 4: Ligar em `index.ts`**

Em `supabase/functions/pauta-resumo-diario/index.ts`:

4a. Acrescentar `soOsPendentes,` à lista de importações vinda de `./corpo.ts` (a que já traz `montarEmail` e `montarPulsoDaEquipe`), em ordem alfabética, depois de `montarPulsoDaEquipe,`.

4b. Trocar a linha

```ts
        const itens = (pauta ?? []) as ItemDaPauta[];
```

por

```ts
        // 🔴 FILTRA ANTES DE DECIDIR. A fila devolve os negócios já feitos hoje junto com os
        // pendentes; sem esta linha, uma pauta zerada contaria como cheia no `if` logo abaixo e
        // a pessoa receberia um e-mail listando o que ela já resolveu, com selo de "parado".
        const itens = soOsPendentes((pauta ?? []) as ItemDaPauta[]);
```

- [ ] **Step 5: Rodar os testes e ver passar**

```bash
npx vitest run src/lib/corpo-do-resumo-diario.test.ts
```

Esperado: todos passam, inclusive os dois novos.

```bash
npx tsc --noEmit -p tsconfig.app.json
```

Esperado: nenhum erro novo. (`corpo.ts` entra na conferência de tipos porque o teste em `src/` o importa.)

- [ ] **Step 6: Commitar**

```bash
git commit -m "feat(pauta): o e-mail das 7h lista so o que ainda espera retorno

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" --only -- supabase/functions/pauta-resumo-diario/corpo.ts supabase/functions/pauta-resumo-diario/index.ts src/lib/corpo-do-resumo-diario.test.ts
```

---

### Task 4: Configurações — "Até quantos itens por dia"

**Files:**
- Modify: `src/components/configuracoes/AutomacaoTab.tsx`
- Modify: `src/hooks/use-configuracoes-automacao.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `PADROES_DA_PAUTA` sem a chave `pauta_min_itens`.

- [ ] **Step 1: Tirar o piso do hook**

Em `src/hooks/use-configuracoes-automacao.ts`, remover estas duas linhas de `PADROES_DA_PAUTA`:

```ts
  /** Piso de itens: abaixo disso o corte AFROUXA, para um dia leve não parecer quebrado. */
  pauta_min_itens: 3,
```

e trocar o comentário do teto por:

```ts
  /**
   * Teto de itens, contando compromissos. É o que faz a pauta poder terminar.
   *
   * O PISO saiu em 12/09/2026 (`pauta_min_itens`). Ele completava a fila com negócios que NÃO
   * estavam parados quando faltavam parados — exatamente a regra que o dono do produto derrubou
   * ao decidir que só entra o que está parado. A linha guardada no banco não é apagada de propósito —
   * é ela que permite voltar atrás reemitindo a função de banco, sem ninguém ter de digitar o valor de novo.
   */
  pauta_max_itens: 7,
```

- [ ] **Step 2: Um número só na tela**

Em `src/components/configuracoes/AutomacaoTab.tsx`:

2a. Remover a linha `const [minimo, setMinimo] = useState('');` e a linha `setMinimo(String(config.pauta_min_itens));`.

2b. Trocar o bloco inteiro do par de campos — do `<div className="flex flex-wrap items-center justify-between gap-3">` que contém "Quantos itens por dia" até o `</div>` que o fecha — por:

```tsx
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-card-foreground">Até quantos itens por dia</p>
              <p className="text-xs text-muted-foreground">
                O teto da pauta. Entra o que está parado além do prazo acima, do maior valor
                para o menor, até esse limite. Compromisso da agenda ocupa vaga: reunião marcada
                não se corta por teto.
              </p>
            </div>
            <Input
              type="text"
              inputMode="numeric"
              aria-label="Máximo de itens"
              className="w-16 text-center"
              value={maximo}
              onChange={(e) => setMaximo(e.target.value)}
              onBlur={() => gravarNumero('pauta_max_itens', maximo, 1, 20, setMaximo)}
            />
          </div>
```

2c. Remover o aviso que comparava os dois números:

```tsx
          {Number(minimo) > Number(maximo) && (
            <p className="text-xs text-destructive">
              O mínimo está maior que o máximo — a pauta vai respeitar o máximo.
            </p>
          )}
```

- [ ] **Step 3: Conferir que nada mais lê a chave**

```bash
grep -rn "pauta_min_itens" src/ supabase/functions/
```

Esperado: **uma linha só**, a menção dentro do comentário que o Step 1 acabou de escrever. Nenhuma LEITURA da chave pode sobrar. (Em `supabase/migrations/` ela continua aparecendo, e é assim que tem de ser — migration não se edita, CLAUDE.md §6.3.)

- [ ] **Step 4: Conferir tipos e testes**

```bash
npx tsc --noEmit -p tsconfig.app.json
```

Esperado: nenhum erro novo.

```bash
npx vitest related --run src/components/configuracoes/AutomacaoTab.tsx src/hooks/use-configuracoes-automacao.ts src/pages/Hoje.tsx
```

Esperado: todos passam.

- [ ] **Step 5: Commitar**

```bash
git commit -m "feat(configuracoes): a pauta passa a ter um teto so, sem piso de itens

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" --only -- src/components/configuracoes/AutomacaoTab.tsx src/hooks/use-configuracoes-automacao.ts
```

---

### Task 5: A migration da pauta

**Files:**
- Create: `supabase/migrations/20260912100000_pauta_do_dia_que_encolhe.sql`

**Interfaces:**
- Consumes: `public.ve_pauta_de_todos(uuid)`, que já existe desde `20260907140000`.
- Produces: `pauta_do_dia_de(uuid)` devolvendo, além de `compromisso` e `negocio_parado`, o tipo `negocio_feito`. Assinatura inalterada, então `pauta_do_dia()` herda tudo.

- [ ] **Step 1: Conferir que o corpo vigente é o que este plano assume**

```sql
select md5(p.prosrc), length(p.prosrc),
       coalesce(array_to_string(p.proacl,' | '),'(padrao)')
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='pauta_do_dia_de';
```

Esperado: `e65e235e52c15d1326ad51d67f43162f`, `6217`, `postgres=X/postgres | service_role=X/postgres`.

Se o md5 não bater, **pare**: colha o corpo com `pg_get_functiondef` e reaplique as sete trocas descritas no Step 3 sobre o texto novo.

- [ ] **Step 2: Medir o efeito ANTES de aplicar**

Rodar a consulta abaixo (só `SELECT`) para todas as pessoas ativas, e guardar o resultado para comparar depois. Ela reproduz a fila vigente pessoa a pessoa:

```sql
select u.nome, count(*) filter (where p.tipo = 'negocio_parado') as negocios,
       count(*) filter (where p.tipo = 'compromisso') as compromissos
  from usuarios u
  left join lateral public.pauta_do_dia_de(u.id) p on true
 where u.deleted_at is null
 group by u.id, u.nome
 order by 2 desc;
```

🔴 Relate os números **na conversa**, não dentro do arquivo (CLAUDE.md §6.9).

- [ ] **Step 3: Escrever a migration**

Criar `supabase/migrations/20260912100000_pauta_do_dia_que_encolhe.sql`:

````sql
-- ============================================================================
-- A PAUTA DO DIA É ESCOLHIDA NA VIRADA DO DIA, E SÓ ENCOLHE
-- ============================================================================
--
-- Pedido do dono do produto em 12/09/2026, desenho em
-- `docs/superpowers/specs/2026-09-12-pauta-do-dia-que-encolhe-design.md`:
--
--   · a lista do dia é decidida na virada e vale o dia inteiro; o negócio que recebe retorno
--     sai dela e NADA entra no lugar, até zerar;
--   · a pauta de quem tem a chave `pauta_de_todos` volta a trazer a equipe, com os negócios
--     do próprio dono nas primeiras vagas;
--   · só entra o que está parado — acaba o enchimento por `pauta_min_itens`;
--   · a fila devolve também os negócios JÁ FEITOS hoje, para a tela contar "3 de 7 feitos".
--
-- 🔴 ISTO DESFAZ, DE PROPÓSITO, A MIGRATION `20260909120000_fila_pessoal.sql`. O motivo
-- registrado lá era real — "o teto de 7 era disputado por valor com os da equipe inteira, e o
-- negócio de R$ 8 mil do gestor perdia a vaga para o de R$ 2 milhões de um colega". A ordem
-- nova resolve exatamente isso: os do dono ocupam as primeiras vagas. Quem ler só aquele
-- arquivo vai achar que isto é regressão; não é.
--
-- 🔴 `CREATE OR REPLACE`, NUNCA `DROP` + `CREATE`. Medido em 12/09/2026, `pg_proc.proacl`:
--     pauta_do_dia_de(uuid)  ->  postgres=X/postgres | service_role=X/postgres
-- Nem `anon`, nem `authenticated`, nem PUBLIC — ela é só do servidor, alimenta o e-mail das 7h.
-- Como a assinatura não muda, o `CREATE OR REPLACE` preserva a `proacl` inteira. Confira antes
-- e depois:
--   select p.oid::regprocedure, coalesce(array_to_string(p.proacl,' | '),'(padrao)')
--     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.proname like 'pauta_do_dia%';
--
-- 🔴 O corpo abaixo foi COLHIDO com `pg_get_functiondef` em 12/09/2026 e editado a partir do
-- texto vigente. `md5(prosrc)` do texto colhido: e65e235e52c15d1326ad51d67f43162f (6.217
-- caracteres). Fora das trocas marcadas com 🔴 e de linhas em branco, o texto é o mesmo.
--
-- `pauta_do_dia()` NÃO é tocada: o corpo dela inteiro é
-- `select * from public.pauta_do_dia_de(get_my_usuario_id());`. Ela herda.
--
-- ----------------------------------------------------------------------------
-- O QUE CONTA COMO "DAR RETORNO", E POR QUE EDIÇÃO DE CAMPO NÃO CONTA
-- ----------------------------------------------------------------------------
-- Medido no banco em 12/09/2026: dias de importação escrevem milhares de linhas de histórico
-- de uma vez — um dia com 9.498 edições de campo alcançando 4.637 negócios, outro com 10.063
-- negócios recebendo linha de etapa. Se qualquer mexida contasse como retorno, um dia de
-- importação ZERARIA a pauta da empresa inteira e o sistema diria "dia cumprido" para gente que
-- não trabalhou.
--
-- A separação é limpa e está gravada: nos três dias de carga, as linhas em massa têm TODAS
-- `status_anterior` nulo. Quem move o negócio de verdade grava de onde ele saiu. Por isso:
--
--   · mudança de etapa conta SÓ com `status_anterior is not null` (o que também deixa de fora
--     a criação de um negócio novo — criar não é dar retorno);
--   · contato registrado conta (é onde o "Retomar depois" grava);
--   · tarefa do negócio criada ou concluída hoje conta;
--   · edição de campo solto NÃO conta.
--
-- Quando esta régua errar, ela erra para o lado seguro: o negócio CONTINUA na fila.
--
-- 🔴 FUSO — `historico_contatos.data_contato` é comparada EM UTC. Medido: a coluna guarda
-- meia-noite UTC (o que `registrar_retorno` grava, `(now() at time zone 'America/Sao_Paulo')::date`
-- convertido para timestamptz) e meio-dia UTC (o que as telas de contato gravam). Converter
-- para São Paulo joga o primeiro grupo para o dia ANTERIOR, e o retorno registrado hoje contaria
-- como de ontem. É a armadilha do CLAUDE.md §7.12 vista do lado do banco.
--
-- ----------------------------------------------------------------------------
-- O QUE CONGELA NA VIRADA DO DIA, E POR QUÊ
-- ----------------------------------------------------------------------------
-- Se só a saída dos negócios feitos mudasse, o próximo da fila subiria para a vaga aberta — que
-- é exatamente a recomposição que o pedido derruba. Então cinco entradas passam a ser medidas
-- no começo do dia (`v_inicio`):
--
--   1. `ultima_etapa` — o "há quantos dias está parado" olha só o histórico anterior à virada.
--      É o que mantém o negócio que recebeu ação hoje ocupando o lugar dele na lista.
--   2. `retorno_marcado` — retorno marcado HOJE não tira o negócio da lista de hoje; ele sai
--      como FEITO, e é a partir de amanhã que a data marcada o segura.
--   3. A tarefa que esconde o negócio — vale a que existia na virada. Tarefa criada hoje não
--      esconde (o negócio sai como feito); tarefa concluída hoje não revela (ela escondia o
--      negócio na virada, então ele não era da lista de hoje).
--   4. `v_compromissos`, que desconta vaga — conta os compromissos do dia que já existiam na
--      virada, concluídos ou não. Sem isso, concluir uma tarefa abriria vaga e puxaria um
--      negócio novo, e criar uma tarefa às 10h derrubaria um negócio da lista.
--   5. `etapa_na_virada` — negócio GANHO OU PERDIDO hoje continua candidato pela etapa em que
--      estava na virada: a primeira mudança de etapa do dia guarda de onde ele saiu. Ele segura a
--      vaga e sai como FEITO, e o contador diz "3 de 7". Sem isso, o filtro de etapa lido ao vivo
--      tiraria o negócio ganho dos candidatos, e o próximo da fila entraria na vaga dele.
--
-- ⚠️ UMA SIMPLIFICAÇÃO CONSCIENTE, que erra para o lado de mostrar o compromisso que existe:
--
--   · Os COMPROMISSOS desenhados continuam ao vivo. Reunião marcada às 10h para as 15h aparece;
--     esconder um compromisso do dia até amanhã seria defeito, não regra. A consequência aceita:
--     num dia assim a tela pode mostrar mais itens que o teto.
--
-- ----------------------------------------------------------------------------
-- RAROS, ACEITOS, e para que lado erram
-- ----------------------------------------------------------------------------
-- Estas entradas continuam lidas AO VIVO e podem mexer na lista durante o dia. São raras, e selar
-- qualquer uma delas exigiria reconstruir o estado da virada a partir do histórico, campo por
-- campo — não vale agora. Regra geral: quando uma delas tira um negócio dos candidatos e há mais
-- parados que vagas, o próximo da fila entra no lugar.
--
--   · Editar o VALOR de um negócio perto do corte pode trocar um negócio por outro: a escolha é
--     por valor, e o valor lido é o de agora. Um sai sem crédito, outro entra.
--   · Trocar o DONO move o negócio entre pautas: ele sai da de um (e a vaga abre) e pode entrar
--     na do outro no mesmo dia.
--   · Levar para outro dia, ou apagar, um compromisso que existia na virada ABRE vaga: entra um
--     negócio a mais. O contrário — trazer para hoje um compromisso antigo — FECHA uma: um
--     negócio sai sem crédito.
--   · Reabrir uma tarefa concluída, estender o prazo de uma tarefa vencida ou editar hoje uma
--     tarefa concluída antes da virada ESCONDE o negócio sem crédito.
--   · Importação que mude a etapa no dia (linha com `status_anterior` nulo) não conta como
--     retorno e não entra em `etapa_na_virada`: se ela fechar o negócio, ele sai pela etapa ao
--     vivo; se reabrir um fechado, ele pode entrar.
--   · `useDeleteTarefaKanbanColuna` (src/hooks/use-tarefas-kanban-colunas.ts) muda o `status` das
--     tarefas SEM mexer em `updated_at`: a tarefa que ele leva para "concluida" deixa de esconder
--     o negócio na hora, sem dar crédito; a concluída que ele leva para uma coluna aberta passa a
--     esconder o negócio.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.pauta_do_dia_de(p_usuario_id uuid)
 RETURNS TABLE(tipo text, referencia_id uuid, selo text, titulo text, detalhe text, valor numeric, quando timestamp with time zone, dias_parado integer, ordem integer, responsavel text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  -- 🔴 MUDOU: some `v_min` (o piso acabou), entram `v_inicio` (a virada do dia) e `v_ve_todos`.
  v_empresa uuid; v_auth uuid; v_dias int; v_max int;
  v_hoje date; v_inicio timestamptz; v_compromissos int; v_vagas int; v_ve_todos boolean;
begin
  select u.empresa_id, u.user_id into v_empresa, v_auth
  from usuarios u where u.id = p_usuario_id and u.deleted_at is null;
  if v_empresa is null then return; end if;
  if not empresa_tem_secao_de(v_empresa, 'hoje') then return; end if;

  -- 🔴 MUDOU: a chave volta a decidir de quem são os negócios da fila. A leitura é a MESMA que
  -- a tabela do time e o painel de risco usam — uma função só, nunca uma cópia.
  v_ve_todos := public.ve_pauta_de_todos(p_usuario_id);

  -- 🔴 MUDOU: `pauta_min_itens` não é mais lido. A linha continua no banco de quem a salvou;
  -- voltar atrás é reemitir esta função.
  select coalesce((select (c.valor #>> '{}')::int from configuracoes_automacao c
                    where c.empresa_id = v_empresa and c.chave = 'pauta_dias_parado'), 3),
         coalesce((select (c.valor #>> '{}')::int from configuracoes_automacao c
                    where c.empresa_id = v_empresa and c.chave = 'pauta_max_itens'), 7)
    into v_dias, v_max;

  v_hoje := (now() at time zone 'America/Sao_Paulo')::date;
  -- 🔴 NOVO: a virada do dia no calendário brasileiro, em timestamptz. `v_hoje::timestamp` é
  -- meia-noite SEM fuso; `at time zone 'America/Sao_Paulo'` diz que essa meia-noite é de São
  -- Paulo e devolve o instante. Comparar `created_at` com `v_hoje` puro compararia com meia-noite
  -- UTC, três horas antes, e o trabalho feito entre 21h e meia-noite cairia no dia errado.
  v_inicio := (v_hoje::timestamp at time zone 'America/Sao_Paulo');

  -- 🔴 MUDOU: conta os compromissos que já existiam NA VIRADA, concluídos ou não. Antes eram os
  -- abertos agora — e aí concluir uma tarefa abria vaga para um negócio novo entrar.
  select count(*) into v_compromissos
  from (
    select 1 from eventos e
     where e.user_id = v_auth and (e.inicio at time zone 'America/Sao_Paulo')::date = v_hoje
       and e.created_at < v_inicio
    union all
    select 1 from tarefas t
     where t.usuario_id = p_usuario_id and t.prazo_final is not null
       and (t.prazo_final at time zone 'America/Sao_Paulo')::date = v_hoje
       and t.created_at < v_inicio
  ) q;

  v_vagas := greatest(v_max - v_compromissos, 0);

  return query
  with
  gente as (
    select u.id from usuarios u
     where u.empresa_id = v_empresa and u.deleted_at is null
       -- 🔴 MUDOU: era `and u.id = p_usuario_id` (fila sempre pessoal, 09/09/2026).
       and (v_ve_todos or u.id = p_usuario_id)
  ),
  etapas_abertas as (
    select distinct k.slug from kanban_colunas k
     where k.empresa_id = v_empresa and k.slug not in ('fechamento','perdido')
  ),
  ultima_etapa as (
    select h.pedido_id, max(h.created_at) as em
      from pedidos_historico_status h
     where h.tipo = 'status'
       -- 🔴 NOVO: só o histórico anterior à virada. É esta linha que congela a lista do dia.
       and h.created_at < v_inicio
       and h.pedido_id in (select p2.id from pedidos p2 where p2.usuario_id in (select id from gente))
     group by h.pedido_id
  ),
  retorno_marcado as (
    select hc.pedido_id, max(hc.proximo_contato_em) as ate
      from historico_contatos hc
     where hc.proximo_contato_em is not null
       -- 🔴 NOVO: retorno marcado HOJE não tira o negócio da lista de hoje — ele sai como
       -- feito. Ver o aviso de fuso no cabeçalho: a comparação é em UTC.
       and (hc.data_contato at time zone 'UTC')::date < v_hoje
     group by hc.pedido_id
  ),
  agidos_hoje as (
    -- 🔴 NOVO: os negócios que receberam retorno hoje, por QUALQUER pessoa. Ver o cabeçalho
    -- para por que edição de campo e etapa sem anterior ficam de fora.
    select distinct x.pedido_id from (
      select h.pedido_id from pedidos_historico_status h
       where h.created_at >= v_inicio
         and h.tipo = 'status'
         and h.status_anterior is not null
      union all
      select hc.pedido_id from historico_contatos hc
       where (hc.data_contato at time zone 'UTC')::date = v_hoje
      union all
      select t.pedido_id from tarefas t
       where t.pedido_id is not null
         and (t.created_at >= v_inicio
              or (coalesce(t.status,'') = 'concluida' and t.updated_at >= v_inicio))
    ) x
  ),
  etapa_na_virada as (
    -- 🔴 NOVO: a etapa em que o negócio estava na virada, para quem mudou de etapa hoje — a primeira
    -- mudança do dia guarda em `status_anterior` de onde ele saiu. Linha de importação (anterior
    -- nulo) fica de fora, como em `agidos_hoje`. É o que faz o negócio GANHO hoje segurar a vaga.
    select distinct on (h.pedido_id) h.pedido_id, h.status_anterior as status
      from pedidos_historico_status h
     where h.tipo = 'status'
       and h.created_at >= v_inicio
       and h.status_anterior is not null
     order by h.pedido_id, h.created_at asc
  ),
  candidatos as (
    select p.id,
      coalesce(nullif(trim(p.nome),''),
               nullif(trim(p.campos_extras ->> 'Negócio'),''),
               nullif(trim(cl.empresa),'') || coalesce(' | ' || fa.nome,''),
               'Negócio sem nome')                              as titulo,
      coalesce(k.nome, p.status)                                as etapa_label,
      p.data_pedido,
      coalesce(p.valor_total,0)                                 as valor,
      (v_hoje - (ue.em at time zone 'America/Sao_Paulo')::date) as dias_parado,
      du.nome                                                   as dono,
      (p.usuario_id = p_usuario_id)                             as e_meu,
      -- 🔴 NOVO: a marca que separa pendente de feito, sem tirar o negócio da lista do dia.
      (ah.pedido_id is not null)                                as feito_hoje
    from pedidos p
    join ultima_etapa ue        on ue.pedido_id = p.id
    join gente g                on g.id = p.usuario_id
    left join usuarios du       on du.id = p.usuario_id
    left join clientes cl       on cl.id = p.cliente_id
    left join fabricantes fa    on fa.id = p.fabricante_id
    left join kanban_colunas k  on k.empresa_id = v_empresa and k.funil_id = p.funil_id and k.slug = p.status
    left join retorno_marcado r on r.pedido_id = p.id
    -- 🔴 NOVO: as duas marcas do dia — `agidos_hoje` separa feito de pendente, e `etapa_na_virada`
    -- diz em que etapa o negócio estava na virada.
    left join agidos_hoje ah    on ah.pedido_id = p.id
    left join etapa_na_virada ev on ev.pedido_id = p.id
    -- 🔴 MUDOU: era `where p.status in (...)`. A primeira mudança de etapa de hoje guarda de onde o
    -- negócio saiu; sem ela, o filtro ao vivo tirava dos candidatos o negócio GANHO (ou perdido)
    -- hoje, e o próximo da fila entrava na vaga dele. Agora ele segura a vaga e sai como
    -- `negocio_feito`.
    where coalesce(ev.status, p.status) in (select slug from etapas_abertas)
      and (r.ate is null or r.ate <= v_hoje)
      and not exists (
        -- Uma linha só no dia do retorno. Sem isto a pessoa veria a tarefa (que já entra como
        -- compromisso) E o negócio voltando à fila — duas linhas sobre o mesmo assunto, e a
        -- tarefa ainda comendo uma das vagas.
        -- QUALQUER tarefa aberta esconde, não só a que o "Retomar depois" cria: é o mesmo
        -- critério que o cartão "Sem Próxima Ação" já usa — tarefa aberta é próxima ação, venha
        -- de onde vier.
        -- 🔴 MENOS A VENCIDA (decisão do dono do produto em 11/09/2026): tarefa que passou do
        -- prazo sem ser concluída deixa de esconder, e o negócio volta à pauta no dia seguinte ao
        -- prazo. Sem isto ele sumia da pauta do dono enquanto a tarefa ficasse aberta, porque a
        -- tarefa só entra como compromisso NO DIA do prazo. Tarefa sem prazo continua escondendo:
        -- não vence nunca, é próxima ação sem data.
        -- 🔴 MUDOU (12/09/2026): vale a tarefa COMO ELA ESTAVA NA VIRADA DO DIA. Criada hoje não
        -- esconde — o negócio sai como feito, e é assim que criar tarefa conta como retorno.
        -- Concluída hoje não revela — ela escondia o negócio na virada, então ele não era da
        -- lista de hoje; ele volta amanhã se continuar parado.
        select 1 from tarefas t
         where t.pedido_id = p.id
           and t.created_at < v_inicio
           and not (coalesce(t.status,'') = 'concluida' and t.updated_at < v_inicio)
           and (t.prazo_final is null
                or (t.prazo_final at time zone 'America/Sao_Paulo')::date >= v_hoje)
      )
  ),
  do_dia as (
    -- 🔴 MUDOU, e são três coisas num lugar só:
    --   · era `where r.dias_parado >= v_dias or r.posicao <= greatest(v_min - v_compromissos, 0)`
    --     — o `or` era o enchimento com negócio que NÃO está parado. Saiu.
    --   · era `order by r.valor desc, r.dias_parado desc` — agora os do próprio dono vêm antes de
    --     qualquer negócio da equipe. Entre os parados, continuam entrando os de MAIOR VALOR, como
    --     a função vigente já fazia (decisão do dono do produto em 13/09/2026). Não "os parados há
    --     mais tempo": medido em 13/09/2026, na MD todo candidato mais parado está parado há
    --     exatamente 12 dias — é a data da importação do Bitrix. "Parado há mais tempo" hoje quer
    --     dizer "intocado desde a importação", e essa ordem tiraria da pauta os negócios
    --     trabalhados depois dela.
    --   · `c.id` no fim só desempata: sem ele, dois negócios de mesmo valor e mesmos dias parados
    --     na borda do corte podiam trocar de lugar entre uma recarga e outra.
    -- Os FEITOS continuam aqui dentro: eles ocupam o lugar deles na lista do dia, e é o que faz
    -- a vaga aberta ficar aberta.
    select c.* from candidatos c
    where c.dias_parado >= v_dias
    order by c.e_meu desc, c.valor desc, c.dias_parado desc, c.id
    limit v_vagas
  ),
  compromissos as (
    select e.id, e.titulo,
           coalesce(nullif(trim(e.descricao),''),'Compromisso na agenda') as detalhe,
           e.inicio as quando
      from eventos e
     where e.user_id = v_auth and (e.inicio at time zone 'America/Sao_Paulo')::date = v_hoje
    union all
    select t.id, t.titulo,
           coalesce(nullif(trim(t.descricao),''),'Tarefa com prazo hoje') as detalhe,
           t.prazo_final as quando
      from tarefas t
     where t.usuario_id = p_usuario_id and t.prazo_final is not null
       and (t.prazo_final at time zone 'America/Sao_Paulo')::date = v_hoje
       and coalesce(t.status,'') <> 'concluida'
  )
  select 'compromisso'::text, cp.id, 'Hoje'::text, cp.titulo, cp.detalhe,
         null::numeric, cp.quando, null::integer,
         (row_number() over (order by cp.quando))::integer, null::text
  from compromissos cp
  union all
  select 'negocio_parado'::text, n.id, 'Orçamento parado'::text, n.titulo,
         'Em ' || n.etapa_label || ' desde ' || to_char(n.data_pedido,'DD/MM/YYYY'),
         n.valor, null::timestamptz, n.dias_parado,
         -- 🔴 MUDOU: a ordem na tela também põe os do dono na frente; dias parados e `id` só
         -- desempatam, pelo mesmo motivo do `do_dia`.
         (1000 + row_number() over (order by n.e_meu desc, n.valor desc, n.dias_parado desc, n.id))::integer,
         case when n.e_meu then null else n.dono end
  -- 🔴 MUDOU: era `from negocios n`. Os feitos saem daqui e vão para o bloco de baixo.
  from do_dia n where not n.feito_hoje
  union all
  -- 🔴 NOVO: os já feitos, atrás de tudo. A tela não os desenha — ela os CONTA, para dizer
  -- "3 de 7 feitos hoje" e para distinguir o dia zerado do dia em que não havia nada.
  select 'negocio_feito'::text, n.id, 'Feito hoje'::text, n.titulo,
         'Em ' || n.etapa_label || ' desde ' || to_char(n.data_pedido,'DD/MM/YYYY'),
         n.valor, null::timestamptz, n.dias_parado,
         (2000 + row_number() over (order by n.valor desc, n.id))::integer,
         case when n.e_meu then null else n.dono end
  from do_dia n where n.feito_hoje
  order by 9;
end;
$function$;

COMMIT;
````

- [ ] **Step 4: Conferir o arquivo antes de aplicar**

```bash
grep -c "DROP FUNCTION" supabase/migrations/20260912100000_pauta_do_dia_que_encolhe.sql
```

Esperado: `0`.

```bash
grep -n "pauta_min_itens\|v_min" supabase/migrations/20260912100000_pauta_do_dia_que_encolhe.sql
```

Esperado: só as linhas de COMENTÁRIO que explicam a saída do piso — nenhuma dentro do corpo executável.

- [ ] **Step 5: Simular o "depois" SEM aplicar**

🔴 **NADA É APLICADO NESTA TAREFA.** Aplicar a migration antes de o site novo estar no ar é exatamente a janela que a Tarefa 7 existe para evitar — a tela antiga desenharia os negócios já feitos como pendentes. Quem aplica é a Tarefa 7.

A simulação é só leitura: copie o `return query` novo para um `SELECT` puro, trocando `p_usuario_id` pelo identificador de cada pessoa e `v_dias`/`v_max`/`v_hoje`/`v_inicio`/`v_ve_todos` pelos valores que a função calcularia (o corte é 3, o teto 7 e a chave vem de `public.ve_pauta_de_todos(<id>)` quando a empresa nunca salvou ajuste — medido em 12/09/2026: **nenhuma empresa salvou**). Rodar para todas as pessoas ativas e comparar com o resultado guardado no Step 2, pessoa a pessoa:

- quem **não** tem a chave: o mesmo conjunto de negócios de antes, menos os que receberam retorno hoje;
- quem **tem** a chave: os próprios negócios primeiro, e a equipe preenchendo até o teto;
- ninguém com mais negócios do que `pauta_max_itens` menos os compromissos da virada.

🔴 O cenário "antes" da simulação tem de **reproduzir exatamente** a medição do Step 2, feita chamando a função de verdade. É isso que prova que a simulação é fiel; sem essa conferência ela mede outra coisa e concorda consigo mesma.

- [ ] **Step 6: Commitar**

```bash
git add -N supabase/migrations/20260912100000_pauta_do_dia_que_encolhe.sql
git commit -m "feat(pauta): a lista do dia e escolhida na virada e so encolhe, e a do gestor traz os dele primeiro

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" --only -- supabase/migrations/20260912100000_pauta_do_dia_que_encolhe.sql
```

---

### Task 6: Os cartões de risco seguem a chave

**Files:**
- Create: `supabase/migrations/20260912110000_risco_segue_a_chave.sql`

**Interfaces:**
- Consumes: `public.eu_vejo_pauta_de_todos()` e `public.get_my_usuario_id()`, que já existem.
- Produces: `dashboard_negocios_risco(...)` recortada por permissão. Assinatura inalterada.

- [ ] **Step 1: Medir o vazamento, para ter o "antes"**

Rodar a função como duas pessoas da mesma empresa — uma com a chave e uma sem — e guardar `qtd_parados`, `qtd_sem_proxima_acao` e `valor_risco_total` das duas. Medido em 12/09/2026: os números vêm **idênticos**, porque a regra de leitura de `pedidos` é da empresa inteira e não havia portão nenhum nesses campos.

🔴 Relate os números na conversa, não no arquivo.

- [ ] **Step 2: Escrever a migration**

Criar `supabase/migrations/20260912110000_risco_segue_a_chave.sql`:

````sql
-- ============================================================================
-- OS CARTÕES DE RISCO E O RESUMO POR FABRICANTE SEGUEM A CHAVE DA PAUTA
-- ============================================================================
--
-- Decisão do dono do produto em 12/09/2026. Medido no mesmo dia: os três cartões de risco e o
-- "Resumo por fabricante" mostravam o número da EMPRESA INTEIRA para todo mundo — uma vendedora
-- e uma gestora da mesma empresa recebiam exatamente o mesmo valor em risco. Isso nunca foi
-- decisão: é a regra de leitura de `pedidos`, que é da empresa inteira, aparecendo sem portão.
--
-- Passam a seguir a MESMA chave que decide a pauta logo acima, na mesma tela
-- (`pauta_de_todos`, lida por `public.eu_vejo_pauta_de_todos()`). O gráfico por vendedor já
-- seguia desde 07/09, e a tabela do time segue pela própria função (`negocios_em_risco_de`).
--
-- ⚠️ ISTO MUDA NÚMEROS QUE AS PESSOAS VEEM TODO DIA. Para quem não tem a chave, o valor em
-- risco vai CAIR — não porque algo sumiu, mas porque ele passa a ser o valor em risco DELA.
--
-- 🔴 O corte é UM SÓ, na origem dos negócios (`abertos`), e não um portão por campo: assim os
-- cinco agregados, o resumo por fabricante e qualquer campo futuro nascem já recortados.
--
-- 🔴 A função NÃO é `SECURITY DEFINER` (`prosecdef = false`) e continua assim: quem recorta por
-- empresa é a regra de segurança de `pedidos`, avaliada com o privilégio de quem chama. Mexer
-- nisso é o que a tornaria capaz de mostrar negócio de outra empresa.
--
-- 🔴 AS DUAS CHAMADAS SÃO `(SELECT ...)` SEM CORRELAÇÃO, de propósito: assim o planejador as
-- resolve UMA VEZ (`InitPlan`) em vez de por linha. É o mesmo motivo do §7.16 do CLAUDE.md, onde
-- a RLS de `pedidos` cobrando função por linha matou uma função desta base.
--
-- 🔴 `CASE WHEN public.eu_vejo_pauta_de_todos()` em `risco_por_vendedor` FICA, mesmo virando
-- redundante: sem a chave, `abertos` já só tem os negócios da pessoa, e sem o `CASE` o gráfico
-- passaria a desenhar uma barra só, com o nome de quem está olhando. Hoje ele vem vazio, e
-- mudar isso é decisão de tela, não deste arquivo.
--
-- 🔴 O corpo foi COLHIDO com `pg_get_functiondef` em 12/09/2026.
-- `md5(prosrc)` do texto colhido: 3e40ace58fa8b109c44710db2b8415da (3.071 caracteres). Fora da
-- troca marcada com 🔴, o texto é o mesmo caractere por caractere.
--
-- PARA VOLTAR ATRÁS: reemitir a função sem a linha marcada. `CREATE OR REPLACE`, sempre.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.dashboard_negocios_risco(p_usuario_ids uuid[] DEFAULT NULL::uuid[], p_fabricante_ids uuid[] DEFAULT NULL::uuid[], p_funil_id uuid DEFAULT NULL::uuid, p_dias_parado integer DEFAULT 7, p_etapas text[] DEFAULT NULL::text[])
 RETURNS TABLE(qtd_parados bigint, valor_parados numeric, qtd_sem_proxima_acao bigint, valor_sem_proxima_acao numeric, valor_risco_total numeric, risco_por_vendedor jsonb, risco_por_fabricante jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH hoje AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d),
  abertos AS (
    SELECT
      p.id,
      p.usuario_id,
      p.nome,
      p.cliente_id,
      p.campos_extras,
      p.valor_total,
      u.nome AS vendedor_nome,
      f.nome AS fabricante_nome,
      COALESCE(k.nome, p.status) AS etapa_label,
      COALESCE(uh.ultima_atividade, p.created_at) AS ultima_atividade
    FROM public.pedidos p
    LEFT JOIN public.usuarios u ON u.id = p.usuario_id
    LEFT JOIN public.fabricantes f ON f.id = p.fabricante_id
    LEFT JOIN public.kanban_colunas k ON k.slug = p.status AND k.empresa_id = u.empresa_id AND k.funil_id = p.funil_id
    LEFT JOIN LATERAL (
      SELECT h.created_at AS ultima_atividade
      FROM public.pedidos_historico_status h
      WHERE h.pedido_id = p.id
      ORDER BY h.created_at DESC
      LIMIT 1
    ) uh ON true
    WHERE p.status NOT IN ('fechamento', 'perdido')
      -- 🔴 NOVO: o portão. Ver o cabeçalho.
      AND (
        (SELECT public.eu_vejo_pauta_de_todos())
        OR p.usuario_id = (SELECT public.get_my_usuario_id())
      )
      AND (p_usuario_ids    IS NULL OR p.usuario_id    = ANY(p_usuario_ids))
      AND (p_fabricante_ids IS NULL OR p.fabricante_id = ANY(p_fabricante_ids))
      AND (p_funil_id       IS NULL OR p.funil_id      = p_funil_id)
      AND (p_etapas         IS NULL OR p.status        = ANY(p_etapas))
  ),
  marcado AS (
    SELECT
      a.*,
      a.ultima_atividade <= (now() - (p_dias_parado || ' days')::interval) AS parado,
      (a.ultima_atividade AT TIME ZONE 'America/Sao_Paulo')::date          AS parado_desde,
      (
        NOT EXISTS (
          SELECT 1 FROM public.tarefas t
          WHERE t.pedido_id = a.id AND t.status <> 'concluida'
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.historico_contatos hc, hoje
          WHERE hc.pedido_id = a.id
            AND hc.proximo_contato_em IS NOT NULL
            AND hc.proximo_contato_em >= hoje.d
        )
      ) AS sem_proxima_acao
    FROM abertos a
  )
  SELECT
    (SELECT count(*) FROM marcado WHERE parado)::bigint,
    (SELECT coalesce(sum(valor_total), 0) FROM marcado WHERE parado)::numeric,
    (SELECT count(*) FROM marcado WHERE sem_proxima_acao)::bigint,
    (SELECT coalesce(sum(valor_total), 0) FROM marcado WHERE sem_proxima_acao)::numeric,
    (SELECT coalesce(sum(valor_total), 0) FROM marcado WHERE parado OR sem_proxima_acao)::numeric,
    CASE WHEN public.eu_vejo_pauta_de_todos() THEN (
      SELECT coalesce(jsonb_agg(jsonb_build_object('vendedor', vendedor_nome, 'qtd', qtd, 'valor', total) ORDER BY total DESC), '[]'::jsonb)
      FROM (
        SELECT vendedor_nome, count(*) AS qtd, sum(valor_total) AS total
        FROM marcado WHERE (parado OR sem_proxima_acao) AND vendedor_nome IS NOT NULL
        GROUP BY vendedor_nome
      ) rv
    ) ELSE '[]'::jsonb END,
    (
      SELECT coalesce(jsonb_agg(jsonb_build_object('fabrica', fabricante_nome, 'qtd', qtd, 'valor', total) ORDER BY total DESC), '[]'::jsonb)
      FROM (
        SELECT fabricante_nome, count(*) AS qtd, sum(valor_total) AS total
        FROM marcado WHERE (parado OR sem_proxima_acao) AND fabricante_nome IS NOT NULL
        GROUP BY fabricante_nome
      ) rf
    );
$function$;

COMMIT;
````

- [ ] **Step 3: Simular o "depois" SEM aplicar**

🔴 **NADA É APLICADO NESTA TAREFA** — ver o aviso da Tarefa 5. Quem aplica é a Tarefa 7.

Rodar o `SELECT` da função com o `WHERE` novo embutido à mão (trocando as duas chamadas por `true` e por `false` + o identificador da pessoa, para simular os dois lados da chave) e comparar com a medição do Step 1.

Esperado: quem tem a chave mantém os mesmos números; quem não tem passa a ver números menores, e eles têm de bater com a soma dos negócios daquela pessoa.

- [ ] **Step 4: Commitar**

```bash
git add -N supabase/migrations/20260912110000_risco_segue_a_chave.sql
git commit -m "feat(hoje): os cartoes de risco e o resumo por fabricante seguem a chave da pauta

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" --only -- supabase/migrations/20260912110000_risco_segue_a_chave.sql
```

---

### Task 7: Publicar, nesta ordem

**Files:** nenhum.

🔴 **A ORDEM É OBRIGATÓRIA, e é o INVERSO da ordem do pacote anterior.** A migration faz a fila devolver o tipo `negocio_feito`; o site e a função de borda que ainda não sabem filtrá-lo desenhariam os negócios **já feitos** como se fossem pendentes, com o botão "Retomar depois" do lado.

- [ ] **Step 1: Publicar o site**

Levar só os commits das Tarefas 1 a 4, por cherry-pick sobre `origin/main`, em pasta de trabalho isolada:

```bash
git fetch origin
git worktree add --detach ../pauta-publica origin/main
```

Dentro dela: criar o atalho de `node_modules` (`cmd //c "mklink /J node_modules ..\mdrepresentacoes\node_modules"`), copiar o `.env`, fazer o cherry-pick dos commits, rodar `npm run build` e `npx vitest related --run` nos arquivos tocados, refazer `git fetch` e empurrar na mesma janela.

🔴 Ao terminar: **remover o atalho ANTES de remover a pasta** (`cmd //c "rmdir node_modules"`), senão o `node_modules` de verdade vai junto.

Site novo + função de banco velha = nenhum item `negocio_feito` chega, o contador nunca aparece, a pauta se comporta como hoje. Inofensivo.

- [ ] **Step 2: Publicar a função de borda**

```bash
npx supabase functions deploy pauta-resumo-diario --project-ref hukeirrmsoiowvvrhivx
```

Conferir a versão publicada com `get_edge_function` e comparar com o commit.

- [ ] **Step 3: Aplicar as duas migrations**

Na ordem dos nomes, com `apply_migration`: `20260912100000` (nome `pauta_do_dia_que_encolhe`) e depois `20260912110000` (nome `risco_segue_a_chave`), com o conteúdo dos arquivos.

Logo em seguida, conferir que a `proacl` da pauta não mudou:

```sql
select p.oid::regprocedure, coalesce(array_to_string(p.proacl,' | '),'(padrao)')
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname like 'pauta_do_dia%';
```

Esperado, idêntico à medição de antes: `pauta_do_dia_de(uuid)` com `postgres=X/postgres | service_role=X/postgres`, e `pauta_do_dia()` com `authenticated=X/postgres`. Se `authenticated` aparecer em `pauta_do_dia_de`, **pare**: a fila de qualquer colega acabou de ficar aberta a qualquer pessoa logada.

Conferir também o corpo aplicado: `md5(prosrc)` de `pauta_do_dia_de` tem de ser `6a850b00552e24e75f4c8f2161eb18e0` (12.028 caracteres). 🔴 Esse md5 é do conteúdo COMMITADO, com fim de linha LF — nesta máquina `core.autocrlf=true`, então aplique a partir de `git show <commit>:<arquivo>`, nunca do arquivo da árvore de trabalho, ou o md5 não bate.

E repetir as medições guardadas nas Tarefas 5 e 6, comparando com o que a simulação previu.

- [ ] **Step 4: Conferir no ar**

Além dos itens abaixo, conferir que os três cartões de risco e o "Resumo por fabricante" desenham com números (não com erro) e que o console não acusa erro de permissão.

- Abrir a tela "Hoje" logado como gestor: os negócios próprios em cima, os da equipe em seguida com o nome do dono ao lado.
- Dar um "Retomar depois" num negócio da pauta e recarregar: ele sai da lista, o contador aparece ("1 de N feitos hoje"), e **nenhum negócio novo entra no lugar**.
- Conferir Configurações → Automação: um campo só, "Até quantos itens por dia".

- [ ] **Step 5: Avisar a equipe**

O valor em risco dos cartões vai cair na tela de quem não tem a chave. Avisar antes de alguém achar que sumiu negócio.
