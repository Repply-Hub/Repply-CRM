# Radar com a ordem e a moldura da pauta — Plano de implementação

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: use `superpowers:subagent-driven-development`
> (recomendado) ou `superpowers:executing-plans`, tarefa a tarefa. Passos em caixa de seleção (`- [ ]`).

**Objetivo:** na tela "Hoje", a tabela do time sobe para cima dos dois gráficos, e os seis blocos do
Radar ganham a mesma moldura da pauta, com o miolo das tabelas mais legível.

**Arquitetura:** a moldura vira uma constante num arquivo próprio e é aplicada por `className` nos
seis `Card` — a primitiva `src/components/ui/card.tsx` não muda. A ordem muda em `RadarDeRisco.tsx`.
O miolo das duas tabelas e os nomes do eixo ganham classes locais.

**Pilha:** React 18 + TypeScript + Tailwind 3 (`cn` = `clsx` + `tailwind-merge`, a última classe de
cada grupo vence) · Vitest + Testing Library.

**Desenho aprovado:** `docs/superpowers/specs/2026-09-11-radar-ordem-e-moldura-da-pauta-design.md`.

## Restrições globais

- **PT-BR** em comentário, teste e commit (CLAUDE.md §5).
- 🔴 **Não edite `src/components/ui/card.tsx`** — ela serve o sistema inteiro (CLAUDE.md §5.4).
- 🔴 **Não edite `commonAxisProps`, `commonGridProps` nem `chartColors`**
  (`src/components/charts/DashboardChartTooltip.tsx`) — são dos gráficos do Dashboard também.
- 🔴 **Dado real não entra no teste** (CLAUDE.md §6.9): nomes e valores inventados.
- **Tipos:** `npx tsc --noEmit -p tsconfig.app.json` (o `-p` é obrigatório). Critério: **nenhum erro
  novo nos arquivos que você tocou** — o total oscila porque outras sessões trabalham na pasta.
- **Git:** outras sessões usam esta pasta e o mesmo índice. `git status --short` num comando
  SEPARADO do commit; nunca `git add -A`; arquivo novo precisa de `git add -N` antes;
  `git commit -m "<msg>" --only -- <caminhos>`, terminando com
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. **Nunca `git push`.**
- 🔴 **As capturas de tela são do controlador**, não suas: a do "antes" precisa sair ANTES de
  qualquer classe mudar, e o navegador depende de uma sessão que só o Lucas abre. Não comece a
  Tarefa 1 sem o controlador confirmar que o "antes" foi capturado.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/components/pauta/moldura-da-pauta.ts` **(novo)** | A constante `MOLDURA_DA_PAUTA` |
| `src/components/pauta/RadarDeRisco.tsx` | A ordem; a moldura em cinco blocos; a tabela do fabricante; os nomes do eixo |
| `src/components/pauta/TabelaDoTime.tsx` | A moldura; o miolo da tabela |
| `src/components/pauta/radar-ordem.test.tsx` **(novo)** | Prende a ordem, com o componente montado |

---

## Tarefa 1: a ordem e a moldura

**Arquivos:**
- Criar: `src/components/pauta/moldura-da-pauta.ts`
- Criar: `src/components/pauta/radar-ordem.test.tsx`
- Modificar: `src/components/pauta/RadarDeRisco.tsx`
- Modificar: `src/components/pauta/TabelaDoTime.tsx`

**Interfaces:**
- Produz: `export const MOLDURA_DA_PAUTA: string` em `@/components/pauta/moldura-da-pauta` — o único
  lugar onde a moldura existe.

- [ ] **Passo 1: o teste que falha**

Crie `src/components/pauta/radar-ordem.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

/**
 * O QUE ESTE ARQUIVO PRENDE: a ordem do Radar na tela "Hoje" — os três cartões de risco, depois a
 * tabela do time, depois os dois gráficos.
 *
 * Pedido do dono do produto em 10/09/2026: a tabela é onde se AGE ("Abrir negócio" e "Retomar
 * depois" em cada linha), e ficava embaixo de dois gráficos. Uma troca de lugar volta sem ninguém
 * notar numa edição distraída — por isso a posição é conferida no componente montado.
 *
 * A tabela e a barra de filtros viram esboços: cada uma tem consultas próprias, e aqui só a
 * POSIÇÃO delas importa. Nomes e valores são inventados (CLAUDE.md §6.9).
 */

vi.mock('@/hooks/use-dashboard', () => ({
  useDashboardNegociosRisco: () => ({
    data: {
      qtd_parados: 3,
      valor_parados: 90000,
      qtd_sem_proxima_acao: 2,
      valor_sem_proxima_acao: 40000,
      valor_risco_total: 120000,
      risco_por_vendedor: [{ vendedor: 'Ana Souza', valor: 70000 }],
      risco_por_fabricante: [{ fabrica: 'Fabricante Exemplo', qtd: 3, valor: 90000 }],
    },
  }),
}));
vi.mock('@/components/pauta/TabelaDoTime', () => ({
  TabelaDoTime: () => <div data-testid="tabela-do-time" />,
}));
vi.mock('@/components/pauta/BarraDeFiltros', () => ({
  BarraDeFiltros: () => <div data-testid="barra-de-filtros" />,
}));

import { RadarDeRisco } from './RadarDeRisco';
import { lerFiltrosDoEndereco } from '@/lib/filtros-do-painel';

afterEach(cleanup);

function desenhar() {
  render(
    <RadarDeRisco
      empresaId="emp-1"
      filtros={lerFiltrosDoEndereco(new URLSearchParams())}
      onChangeFiltros={() => {}}
      podeFiltrarPorResponsavel
      onAbrirNegocio={() => {}}
      onRetomarNegocio={() => {}}
    />,
  );
}

/** `a` vem antes de `b` na ordem do documento. */
const vemAntes = (a: Node, b: Node) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe('a ordem do Radar', () => {
  it('🔴 a tabela do time vem ANTES dos dois gráficos', () => {
    desenhar();
    const tabela = screen.getByTestId('tabela-do-time');
    expect(vemAntes(tabela, screen.getByText(/Risco por Vendedor/))).toBe(true);
    expect(vemAntes(tabela, screen.getByText(/Resumo por fabricante/))).toBe(true);
  });

  it('os três cartões de risco continuam no topo, antes da tabela', () => {
    desenhar();
    expect(vemAntes(screen.getByText('Negócios Parados'), screen.getByTestId('tabela-do-time'))).toBe(true);
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `npx vitest run src/components/pauta/radar-ordem.test.tsx`
Esperado: o primeiro caso FALHA (hoje a tabela vem depois dos gráficos); o segundo passa.

- [ ] **Passo 3: a constante da moldura**

Crie `src/components/pauta/moldura-da-pauta.ts`:

```ts
/**
 * A moldura da pauta, para os blocos do Radar que usam `Card`.
 *
 * A pauta (`ItemPauta`, em `src/pages/Hoje.tsx`) desenha cada item com a borda de força total e
 * nenhuma sombra — e é por isso que ela se destaca no tema claro, onde cartão e fundo são o mesmo
 * branco (`--card` e `--background` em `0 0% 100%`, `src/index.css`). O `Card` traz de fábrica a
 * borda a 30%, uma sombra e um efeito ao passar o mouse (`src/components/ui/card.tsx`); no branco
 * sobre branco, a borda some.
 *
 * Estas classes vencem as da base porque `cn` usa tailwind-merge: a última classe de cada grupo
 * fica. A primitiva não é editada — ela serve o sistema inteiro (CLAUDE.md §5.4).
 *
 * Sem efeito de mouse DE PROPÓSITO: nenhum destes blocos é clicável como um todo, e o efeito
 * prometia um clique que não existe. O que é clicável dentro deles (as linhas da tabela do time)
 * tem o próprio efeito.
 */
export const MOLDURA_DA_PAUTA = 'border-border shadow-none hover:border-border hover:shadow-none';
```

- [ ] **Passo 4: a moldura e a ordem em `RadarDeRisco.tsx`**

1. Importe a constante, junto dos outros imports de `@/components/pauta/`:
   ```ts
   import { MOLDURA_DA_PAUTA } from '@/components/pauta/moldura-da-pauta';
   ```
2. Troque as **4** ocorrências de
   `<Card className="shadow-card border-border/60 hover:shadow-card-hover transition-all duration-300">`
   (os três cartões de risco e o cartão "Risco por Vendedor") por
   `<Card className={MOLDURA_DA_PAUTA}>`.
3. Troque o cartão "Resumo por fabricante":
   ```tsx
   <Card className={`shadow-card border-border/60 hover:shadow-card-hover transition-all duration-300 ${risco.riscoPorVendedor.length > 0 ? '' : 'lg:col-span-2'}`}>
   ```
   por
   ```tsx
   <Card className={`${MOLDURA_DA_PAUTA} ${risco.riscoPorVendedor.length > 0 ? '' : 'lg:col-span-2'}`}>
   ```
4. **Mova a tabela:** recorte o bloco que começa no comentário
   `{/* A TABELA DO TIME, no lugar do bloco "Os 10 maiores em risco"` e termina no `/>` do
   `<TabelaDoTime … />` (hoje o último filho de `<div className="mt-5">`), e cole-o **logo depois
   do `</div>` que fecha** `<div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">` (a grade
   dos três cartões). Não mude nada dentro do bloco movido, nem as propriedades da `TabelaDoTime`.
5. Troque `<div className="grid grid-cols-1 lg:grid-cols-2 gap-5">` (a grade dos dois gráficos,
   agora depois da tabela) por `<div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-5">`.
   Espaço: a grade dos cartões tem `mb-5` e a tabela `mt-5` — margens vizinhas se sobrepõem, então
   o espaço entre todos os blocos continua 20 px.
6. Acima da grade dos gráficos, um comentário curto: a tabela subiu por pedido do dono do produto
   em 10/09/2026 — ela é onde se age, e o `radar-ordem.test.tsx` prende a ordem.

- [ ] **Passo 5: a moldura em `TabelaDoTime.tsx`**

Importe a constante (`import { MOLDURA_DA_PAUTA } from '@/components/pauta/moldura-da-pauta';`) e
troque `<Card className="shadow-card border-border/60 mt-5">` por
``<Card className={`${MOLDURA_DA_PAUTA} mt-5`}>``.

- [ ] **Passo 6: rodar e ver passar**

```bash
npx vitest run src/components/pauta/
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "error TS" | grep -E "pauta/(RadarDeRisco|TabelaDoTime|moldura-da-pauta|radar-ordem)"
```
Esperado: todos os testes da pasta passam (inclusive `tabela-do-time.test.tsx`, que não confere
classe visual); a busca do `tsc` não devolve nada.

- [ ] **Passo 7: commitar**

```bash
git status --short
```
(comando separado; confira que nada alheio entra)
```bash
git add -N src/components/pauta/moldura-da-pauta.ts src/components/pauta/radar-ordem.test.tsx
git commit -m "feat(hoje): a tabela do time sobe para cima dos graficos, e o Radar ganha a moldura da pauta

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" --only -- src/components/pauta/moldura-da-pauta.ts src/components/pauta/radar-ordem.test.tsx src/components/pauta/RadarDeRisco.tsx src/components/pauta/TabelaDoTime.tsx
```

---

## Tarefa 2: o miolo das tabelas e os nomes do eixo

**Arquivos:**
- Modificar: `src/components/pauta/RadarDeRisco.tsx`
- Modificar: `src/components/pauta/TabelaDoTime.tsx`

**Interfaces:** nenhuma nova. É mudança só de aparência — a prova é a captura do controlador, e os
testes existentes têm de continuar passando.

- [ ] **Passo 1: `RadarDeRisco.tsx` — os nomes do eixo e a tabela do fabricante**

Troque exatamente (a coluna "vezes" é quantas ocorrências devem existir ANTES da troca):

| vezes | de | para |
|---|---|---|
| 1 | `fontSize={11} fill="hsl(var(--muted-foreground))"` (em `renderVendedorTick`) | `fontSize={11} fill="hsl(var(--card-foreground))"` |
| 1 | `<tr className="border-b text-[11px] uppercase tracking-wider text-muted-foreground">` | `<tr className="bg-muted text-[11px] uppercase tracking-wider text-muted-foreground">` |
| 1 | `<th className="py-2 text-left font-semibold">Fabricante</th>` | `<th className="px-3 py-2 text-left font-semibold">Fabricante</th>` |
| 1 | `<th className="py-2 text-right font-semibold">Negócios</th>` | `<th className="px-3 py-2 text-right font-semibold">Negócios</th>` |
| 1 | `<th className="py-2 text-right font-semibold">Valor</th>` | `<th className="px-3 py-2 text-right font-semibold">Valor</th>` |
| 1 | `<tr key={f.fabrica} className="border-b border-border/50 last:border-0">` | `<tr key={f.fabrica} className="border-b border-border last:border-0">` |
| 1 | `<td className="py-2">{f.fabrica}</td>` | `<td className="px-3 py-2 text-card-foreground">{f.fabrica}</td>` |
| 1 | `<td className="py-2 text-right font-mono tabular-nums">{f.qtd}</td>` | `<td className="px-3 py-2 text-right font-mono font-semibold tabular-nums text-card-foreground">{f.qtd}</td>` |
| 1 | `<td className="py-2 text-right font-mono tabular-nums">{formatCurrency(f.valor)}</td>` | `<td className="px-3 py-2 text-right font-mono font-semibold tabular-nums text-card-foreground">{formatCurrency(f.valor)}</td>` |

Junto de `renderVendedorTick`, uma linha de comentário: os nomes são o que se lê primeiro no
gráfico, e a grade e o eixo de valores continuam nas propriedades compartilhadas com o Dashboard.

- [ ] **Passo 2: `TabelaDoTime.tsx` — o miolo da tabela**

| vezes | de | para |
|---|---|---|
| 1 | `<tr className="border-b text-[11px] uppercase tracking-wider text-muted-foreground">` | `<tr className="bg-muted text-[11px] uppercase tracking-wider text-muted-foreground">` |
| 4 | `<th className="py-2 text-left font-semibold">` | `<th className="px-3 py-2 text-left font-semibold">` |
| 3 | `<th className="py-2 text-right font-semibold">` | `<th className="px-3 py-2 text-right font-semibold">` |
| 1 | `className="cursor-pointer border-b border-border/50 last:border-0 hover:bg-muted/50"` | `className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/50"` |
| 1 | `<td className="py-2 pr-3">{n.nome}</td>` | `<td className="px-3 py-2 font-medium text-card-foreground">{n.nome}</td>` |
| 3 | `<td className="py-2 pr-3 text-muted-foreground">` | `<td className="px-3 py-2 text-muted-foreground">` |
| 2 | `<td className="py-2 pr-3 text-right font-mono tabular-nums">` | `<td className="px-3 py-2 text-right font-mono font-semibold tabular-nums text-card-foreground">` |
| 1 | `<td className="py-2 text-right" onClick={(e) => e.stopPropagation()}>` | `<td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>` |

⚠️ Confira as contagens antes de trocar: se alguma não bater, **pare e avise** — o arquivo mudou
desde que este plano foi escrito, e trocar às cegas pode acertar a linha errada. O cabeçalho
"Responsável" é condicional (`podeVerDeTodos`) e está entre as 4 de `text-left`; a célula dele,
entre as 3 de `text-muted-foreground`.

- [ ] **Passo 3: rodar**

```bash
npx vitest run src/components/pauta/
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "error TS" | grep -E "pauta/(RadarDeRisco|TabelaDoTime)"
```
Esperado: tudo passa; a busca do `tsc` não devolve nada.

- [ ] **Passo 4: commitar**

```bash
git status --short
```
(comando separado)
```bash
git commit -m "style(hoje): as tabelas do Radar ganham cabecalho em faixa e numeros fortes, e o eixo por vendedor sai do cinza

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" --only -- src/components/pauta/RadarDeRisco.tsx src/components/pauta/TabelaDoTime.tsx
```

---

## Como se prova (feito pelo controlador)

1. `radar-ordem.test.tsx` passa, e falhou antes da Tarefa 1.
2. **Capturas, antes e depois**, temas claro e escuro, na visão de vendedor (usuário de teste da
   empresa de demonstração). A visão de gestor fica para o Lucas conferir no próprio login.
3. Suíte cheia verde, `tsc` sem erro nos arquivos tocados, `npm run build` compila.
4. 🔴 **O Lucas vê as capturas antes de publicar.**

## O que este plano NÃO faz

- Não mexe na pauta, nos textos, nos dados, nem nos gráficos do Dashboard.
- Não alinha o cartão "Sem Próxima Ação" à regra da tarefa vencida (decisão separada).
- Não publica.
