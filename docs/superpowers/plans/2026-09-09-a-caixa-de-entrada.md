# Bloco A — Caixa de entrada de verdade

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: use `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para implementar tarefa a tarefa. Os passos usam caixinha (`- [ ]`) para acompanhamento.

**Objetivo:** separar "Caixa de entrada" de "Todos os e-mails" como no Gmail — mensagem arquivada num marcador sai da entrada e continua em Todos e no marcador dela — e abrir a seção na Caixa de entrada.

**Arquitetura:** a regra de "o que cada item da barra mostra" sai da tela e vira um módulo puro (`src/lib/filtro-da-caixa.ts`), testável sozinho. A listagem e o contador da barra passam a construir o filtro **pelo mesmo módulo**, o que faz o número do selo bater com a lista por construção, e não por coincidência.

**Tecnologias:** React 18 + TypeScript, TanStack Query, PostgREST (Supabase), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-09-email-e-whatsapp-design.md`

## Restrições globais

- 🔴 **Nunca `git add -A`** (CLAUDE.md §13). Use `git commit --only -m "…" -- <caminhos>`.
- 🔴 **Antes de CADA commit:** `git fetch origin` e `git status --short`. As sessões não compartilham o mesmo ponteiro — outra pode ter enviado sem que o seu HEAD ande (CLAUDE.md §13). Arquivo que não é seu na fila: pare e avise.
- 🔴 **`git push` PUBLICA em produção** (CLAUDE.md §16).
- Toda mensagem de commit termina com `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **"Todos os e-mails" não leva spam nem lixeira** — decisão do dono do produto, 09/09/2026.
- **Nada aqui interpreta o NOME da pasta.** A organização é de quem tem a caixa; casar com o cadastro do CRM funcionaria numa empresa e quebraria na seguinte. A distinção marcador × pasta de sistema já existe e vem de `ehSistema` em `use-email-pastas.ts`.
- Não mexer no botão **"Todas / Não lidas"** do topo (`Emails.tsx:1847`): apesar do nome coincidir, ele filtra por lido/não lido e não tem relação com isto.
- A RLS de `email_mensagens` continua sendo quem decide o que a pessoa enxerga. Nenhuma consulta privilegiada.
- Verificação: `npm run test` (linha de base **1.140**), `npx tsc --noEmit -p tsconfig.app.json` (~31 erros pré-existentes), `npm run lint` (433), `npm run build`.

---

## Estrutura de arquivos

| arquivo | responsabilidade |
|---|---|
| `src/lib/filtro-da-caixa.ts` (criar) | as constantes de pasta e a regra de o que cada item da barra mostra |
| `src/lib/filtro-da-caixa.test.ts` (criar) | testes da regra |
| `src/components/email/BarraPastas.tsx` (modificar) | ganha "Caixa de entrada"; "Todas" vira "Todos os e-mails" |
| `src/pages/Emails.tsx` (modificar) | estado inicial, consulta da lista e contadores passam pelo módulo |

---

### Tarefa 1: a regra, num módulo só

**Arquivos:**
- Criar: `src/lib/filtro-da-caixa.ts`
- Teste: `src/lib/filtro-da-caixa.test.ts`

**Interfaces:**
- Consome: nada.
- Produz:

```ts
export const PASTA_SPAM = 'SPAM';
export const PASTA_LIXEIRA = 'TRASH';
export const CAIXA_DE_ENTRADA = '__entrada__';
/** Mesmo nome que o projeto já usa (hoje em BarraPastas.tsx:10). `null` = Todos os e-mails. */
export type PastaSelecionada = string | null;
export interface FiltroDaCaixa {
  precisaTer: string | null;
  naoPodeTer: string[];
}
export function filtroDaCaixa(selecao: PastaSelecionada, marcadores: string[]): FiltroDaCaixa;
```

- [ ] **Passo 1: escrever o teste que falha**

Crie `src/lib/filtro-da-caixa.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  filtroDaCaixa, CAIXA_DE_ENTRADA, PASTA_SPAM, PASTA_LIXEIRA,
} from './filtro-da-caixa';

// Os marcadores reais da caixa da MD: rótulos que a pessoa criou no Gmail.
const MARCADORES = ['Label_4', 'Label_27', 'Label_185'];

describe('filtroDaCaixa', () => {
  it('a caixa de entrada esconde spam, lixeira e TODOS os marcadores', () => {
    expect(filtroDaCaixa(CAIXA_DE_ENTRADA, MARCADORES)).toEqual({
      precisaTer: null,
      naoPodeTer: [PASTA_SPAM, PASTA_LIXEIRA, 'Label_4', 'Label_27', 'Label_185'],
    });
  });

  it('todos os e-mails escondem só spam e lixeira', () => {
    expect(filtroDaCaixa(null, MARCADORES)).toEqual({
      precisaTer: null,
      naoPodeTer: [PASTA_SPAM, PASTA_LIXEIRA],
    });
  });

  it('um marcador escolhido mostra o marcador e mais nada', () => {
    expect(filtroDaCaixa('Label_27', MARCADORES)).toEqual({
      precisaTer: 'Label_27',
      naoPodeTer: [],
    });
  });

  it('spam e lixeira mostram o que está neles, sem se excluir', () => {
    expect(filtroDaCaixa(PASTA_SPAM, MARCADORES)).toEqual({
      precisaTer: PASTA_SPAM, naoPodeTer: [],
    });
    expect(filtroDaCaixa(PASTA_LIXEIRA, MARCADORES)).toEqual({
      precisaTer: PASTA_LIXEIRA, naoPodeTer: [],
    });
  });

  it('caixa sem marcador nenhum: a entrada é igual a todos os e-mails', () => {
    expect(filtroDaCaixa(CAIXA_DE_ENTRADA, [])).toEqual(filtroDaCaixa(null, []));
  });

  it('não repete spam nem lixeira se eles vierem na lista de marcadores', () => {
    // Defesa: se um dia `ehSistema` deixar spam passar por marcador, o filtro
    // não pode acabar com a mesma pasta duas vezes na exclusão.
    const f = filtroDaCaixa(CAIXA_DE_ENTRADA, [PASTA_SPAM, 'Label_4']);
    expect(f.naoPodeTer).toEqual([PASTA_SPAM, PASTA_LIXEIRA, 'Label_4']);
  });
});
```

- [ ] **Passo 2: rodar e confirmar que falha**

```bash
npx vitest run src/lib/filtro-da-caixa.test.ts
```

Esperado: FALHA com `Failed to resolve import "./filtro-da-caixa"`.

- [ ] **Passo 3: escrever o módulo**

Crie `src/lib/filtro-da-caixa.ts`:

```ts
/**
 * O que cada item da barra lateral da seção de E-mails mostra.
 *
 * Existe como módulo, e não como dois `if` dentro da consulta, porque a MESMA
 * regra precisa valer em dois lugares: a listagem e o número no selo. Quando as
 * duas eram escritas à mão, o selo prometia mensagens que a lista não tinha — é
 * o defeito que o comentário de `Emails.tsx:858` descreve. Aqui elas não podem
 * divergir: as duas chamam esta função.
 *
 * A diferença entre Caixa de entrada e Todos os e-mails é a do Gmail: mover para
 * um marcador TIRA da entrada, e a mensagem segue existindo em Todos e no
 * marcador. Nada aqui interpreta o NOME da pasta — a lista de marcadores chega
 * pronta de quem sabe distinguir marcador de pasta de sistema
 * (`ehSistema`, em use-email-pastas).
 */

/** Ids que o Nylas usa para as pastas de sistema, iguais em qualquer provedor. */
export const PASTA_SPAM = 'SPAM';
export const PASTA_LIXEIRA = 'TRASH';

/**
 * A Caixa de entrada não é uma pasta do provedor: é "o que chegou e ninguém
 * arquivou ainda". Por isso um valor próprio, e não um `pasta_id`. O formato
 * com underscores não colide com id de marcador (`Label_4`) nem de sistema.
 */
export const CAIXA_DE_ENTRADA = '__entrada__';

/**
 * O que está aceso na barra. `null` = Todos os e-mails.
 * Mesmo nome que o projeto já usa — vem de `BarraPastas.tsx:10` na Tarefa 2.
 */
export type PastaSelecionada = string | null;

export interface FiltroDaCaixa {
  /** Pasta que a mensagem precisa ter para aparecer. */
  precisaTer: string | null;
  /** Pastas que, se a mensagem tiver, a tiram da lista. */
  naoPodeTer: string[];
}

export function filtroDaCaixa(
  selecao: PastaSelecionada,
  marcadores: string[],
): FiltroDaCaixa {
  // Spam e lixeira escolhidos de propósito: a pessoa quer ver justamente o que
  // as outras listas escondem.
  if (selecao === PASTA_SPAM || selecao === PASTA_LIXEIRA) {
    return { precisaTer: selecao, naoPodeTer: [] };
  }

  if (selecao === CAIXA_DE_ENTRADA) {
    const fora = [PASTA_SPAM, PASTA_LIXEIRA];
    for (const m of marcadores) {
      if (!fora.includes(m)) fora.push(m);
    }
    return { precisaTer: null, naoPodeTer: fora };
  }

  if (selecao === null) {
    return { precisaTer: null, naoPodeTer: [PASTA_SPAM, PASTA_LIXEIRA] };
  }

  // Um marcador específico.
  return { precisaTer: selecao, naoPodeTer: [] };
}
```

- [ ] **Passo 4: rodar e confirmar que passa**

```bash
npx vitest run src/lib/filtro-da-caixa.test.ts
```

Esperado: **6 passando**.

- [ ] **Passo 5: commitar**

```bash
git commit --only -m "feat(email): a regra da barra lateral vira modulo testavel

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -- src/lib/filtro-da-caixa.ts src/lib/filtro-da-caixa.test.ts
```

---

### Tarefa 2: as constantes mudam de casa

**Arquivos:**
- Modificar: `src/components/email/BarraPastas.tsx` (linhas 13-14)
- Modificar: `src/pages/Emails.tsx` (linhas 83-84)

**Interfaces:**
- Consome: `PASTA_SPAM`, `PASTA_LIXEIRA` da Tarefa 1.
- Produz: nada novo.

**Por que separado:** é uma mudança mecânica que toca dois arquivos. Isolada, o diff da Tarefa 3 fica legível.

- [ ] **Passo 1: apagar as constantes e o tipo de BarraPastas**

Remova de `src/components/email/BarraPastas.tsx` as linhas 10, 13 e 14:

```ts
export type PastaSelecionada = string | null;
export const PASTA_SPAM = 'SPAM';
export const PASTA_LIXEIRA = 'TRASH';
```

e importe do novo lugar:

```ts
import { PASTA_SPAM, PASTA_LIXEIRA, type PastaSelecionada } from '@/lib/filtro-da-caixa';
```

- [ ] **Passo 2: corrigir quem importava**

Em `src/pages/Emails.tsx`, as linhas 83-85 importam `PASTA_SPAM`, `PASTA_LIXEIRA` e o tipo `PastaSelecionada` de `BarraPastas`. Mova os três para uma importação de `@/lib/filtro-da-caixa`.

Confirme que não sobrou nenhum outro importador:

```bash
grep -rn "PASTA_SPAM\|PASTA_LIXEIRA\|PastaSelecionada" src/ | grep -v "filtro-da-caixa"
```

Esperado: só usos, nenhuma importação vinda de `BarraPastas`.

- [ ] **Passo 3: verificar e commitar**

```bash
npx tsc --noEmit -p tsconfig.app.json 2>&1 | tail -3
npm run test 2>&1 | tail -5
```

```bash
git commit --only -m "refactor(email): as constantes de pasta passam a viver com a regra que as usa

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -- src/components/email/BarraPastas.tsx src/pages/Emails.tsx
```

---

### Tarefa 3: a Caixa de entrada na barra e na lista

**Arquivos:**
- Modificar: `src/components/email/BarraPastas.tsx` (o bloco de itens fixos, linhas ~172-204)
- Modificar: `src/pages/Emails.tsx` (linhas 241-242, 732-767, 858-896, 921-925, 1984-2000)

**Interfaces:**
- Consome: `filtroDaCaixa`, `CAIXA_DE_ENTRADA` (Tarefa 1).
- Produz: nada para outras tarefas.

- [ ] **Passo 1: a seleção inicial**

Em `src/pages/Emails.tsx`, linha 241-242, troque:

```ts
  const [pastaSelecionada, setPastaSelecionada] =
    useState<PastaSelecionada>(null);
```

por:

```ts
  // Abre na Caixa de entrada, não em Todos os e-mails: quem abre a seção quer
  // ver o que chegou e ainda não foi tratado. Decisão do dono do produto,
  // 09/09/2026.
  const [pastaSelecionada, setPastaSelecionada] =
    useState<PastaSelecionada>(CAIXA_DE_ENTRADA);
```

- [ ] **Passo 2: a lista dos marcadores**

Ainda em `Emails.tsx`, junto de onde `pastas` já é lido, acrescente:

```ts
  // Só o que a PESSOA criou. Pasta de sistema (INBOX, SENT, as abas do Gmail,
  // as superestrelas) não tira mensagem da entrada — ver `ehSistema`.
  const idsDosMarcadores = useMemo(
    () => pastas.filter((p) => !p.ehSistema).map((p) => p.pastaId),
    [pastas],
  );
```

- [ ] **Passo 3: a consulta da lista**

Substitua o bloco das linhas 748-767 (o `if (pastaSelecionada) { … } else { … }`) por:

```ts
      // A MESMA regra que alimenta o selo da barra — ver filtro-da-caixa.
      const filtro = filtroDaCaixa(pastaSelecionada, idsDosMarcadores);
      if (filtro.precisaTer) {
        consulta = consulta.contains("pastas", [filtro.precisaTer]);
      }
      for (const fora of filtro.naoPodeTer) {
        consulta = consulta.not("pastas", "cs", `{${fora}}`);
      }
```

> Uma exclusão por pasta, e não um `ov` com a lista inteira, por dois motivos: `cs` já é o operador usado hoje (menos risco de escrever a sintaxe errada) e um id com vírgula não teria como quebrar a consulta. A caixa da MD tem 25 marcadores; se um cliente passar de ~80, a URL fica longa e vale trocar por uma função no banco — o ponto está isolado nestas quatro linhas.

Acrescente `idsDosMarcadores` à `queryKey` (linha 710-716), senão a lista não refaz quando as pastas chegam:

```ts
    queryKey: [
      "received_emails",
      pageReceived,
      pastaSelecionada,
      idsDosMarcadores,
      buscaAplicada,
      somenteNaoLidas,
    ],
```

- [ ] **Passo 4: o contador da entrada**

A consulta das linhas 858-896 hoje conta "todos sem marcador" para mostrar ao lado de "Todas". Troque-a por duas contagens que usam o mesmo `filtroDaCaixa` da listagem — assim o selo e a lista não têm como divergir.

Primeiro, uma função **sem gancho nenhum dentro**, que só monta a consulta:

```ts
  /**
   * A consulta de contagem de uma seleção da barra.
   *
   * Monta o filtro pelo MESMO `filtroDaCaixa` da listagem de propósito: quando
   * as duas regras eram escritas à mão, o selo contava spam e lixeira e
   * prometia mensagens que a lista não mostrava (ver o comentário que já existe
   * em Emails.tsx:858).
   */
  const contarSelecao = async (selecao: PastaSelecionada, marcadores: string[]) => {
    let consulta = supabase
      .from("email_mensagens")
      .select("id", { count: "exact", head: true })
      .eq("direcao", "recebido")
      .eq("excluido", false);
    const filtro = filtroDaCaixa(selecao, marcadores);
    if (filtro.precisaTer) consulta = consulta.contains("pastas", [filtro.precisaTer]);
    for (const fora of filtro.naoPodeTer) {
      consulta = consulta.not("pastas", "cs", `{${fora}}`);
    }
    const { count } = await consulta;
    return count ?? 0;
  };
```

Depois as duas consultas, escritas por extenso no corpo do componente. 🔴 Não envolva `useQuery` numa função auxiliar: gancho tem de ser chamado sempre na mesma ordem, e uma função que devolve gancho convida a chamada condicional.

```ts
  const { data: totalDaEntrada = 0 } = useQuery({
    queryKey: ["email_total_selecao", "entrada", idsDosMarcadores],
    queryFn: () => contarSelecao(CAIXA_DE_ENTRADA, idsDosMarcadores),
    enabled: isConnected,
    staleTime: 30_000,
  });

  const { data: totalDeTodos = 0 } = useQuery({
    queryKey: ["email_total_selecao", "todos", idsDosMarcadores],
    queryFn: () => contarSelecao(null, idsDosMarcadores),
    enabled: isConnected,
    staleTime: 30_000,
  });
```

> **Desvio deliberado do documento de desenho.** Ele sugeria estender a RPC `email_contagem_por_marcador` com a linha da entrada. Duas consultas de contagem entregam o mesmo requisito — o selo bater com a lista — **sem migration**, e o fazem por construção, porque as duas passam pelo mesmo `filtroDaCaixa`. Estendendo a RPC, a regra da entrada existiria duas vezes: uma em SQL e outra em TypeScript.

- [ ] **Passo 5: os dois itens na barra**

Em `src/components/email/BarraPastas.tsx`, troque o `<Item rotulo="Todas" …>` (linhas ~176-184) por dois itens, e acrescente as props correspondentes à interface do componente (`totalDaEntrada`, `totalDeTodos`):

```tsx
        <Item
          icone={<Inbox className="h-4 w-4" />}
          rotulo="Caixa de entrada"
          ativo={selecionada === CAIXA_DE_ENTRADA}
          onClick={() => onSelecionar(CAIXA_DE_ENTRADA)}
          total={totalDaEntrada}
          naoLidas={0}
        />
        <Item
          icone={<Mails className="h-4 w-4" />}
          rotulo="Todos os e-mails"
          ativo={selecionada === null}
          onClick={() => onSelecionar(null)}
          total={totalDeTodos}
          naoLidas={0}
        />
```

Importe `Mails` de `lucide-react` e `CAIXA_DE_ENTRADA` de `@/lib/filtro-da-caixa`.

Ajuste também a guarda da linha 168 — hoje ela esconde a barra inteira quando não há nada além de "Todas". Com dois itens fixos que se distinguem, a barra passa a valer sempre que houver caixa conectada; troque a condição por `if (!carregando && !isConnected) return null;` ou remova a guarda se `BarraPastas` já só é renderizada com `isConnected` (é o caso hoje, em `Emails.tsx:1983`).

- [ ] **Passo 6: o nome do filtro aceso**

Em `Emails.tsx:921-925`, o rótulo do chip que mostra o marcador ativo precisa saber o nome novo:

```ts
  const nomeDaPastaSelecionada =
    pastaSelecionada === CAIXA_DE_ENTRADA
      ? "Caixa de entrada"
      : pastaSelecionada === PASTA_SPAM
        ? "Spam"
        : pastaSelecionada === PASTA_LIXEIRA
          ? "Lixeira"
          : (pastas.find((p) => p.pastaId === pastaSelecionada)?.nome ?? "Marcador");
```

E o chip de "limpar filtro" (linha 1878) deve aparecer só quando há filtro de marcador de verdade — não na Caixa de entrada, que é o estado padrão:

```tsx
              {activeTab === "received" &&
                pastaSelecionada &&
                pastaSelecionada !== CAIXA_DE_ENTRADA && (
```

Ao limpar, volte para a entrada, não para Todos:

```tsx
                    onClick={() => escolherPasta(CAIXA_DE_ENTRADA)}
```

- [ ] **Passo 7: o "buscar mais deste marcador" não vale para a entrada**

A linha 929 dispara uma busca no provedor ao abrir um marcador ainda não sincronizado. `CAIXA_DE_ENTRADA` não é pasta do provedor — pedir mais dela devolveria erro. Acrescente a guarda:

```ts
    if (!isConnected || !pastaSelecionada || pastaSelecionada === CAIXA_DE_ENTRADA) return;
```

- [ ] **Passo 8: verificar**

```bash
npm run test 2>&1 | tail -5
npx tsc --noEmit -p tsconfig.app.json 2>&1 | tail -3
npm run lint 2>&1 | tail -3
npm run build 2>&1 | tail -5
```

- [ ] **Passo 9: conferir no navegador, com a caixa da empresa Repply**

Use a empresa **Repply** (é a conta de demonstração; a da MD está com a caixa propositalmente escondida por um gatilho temporário até a validação terminar).

1. Abrir a seção de E-mails cai na **Caixa de entrada**.
2. Mover uma mensagem para um marcador: ela **some da entrada**.
3. Ela aparece em **Todos os e-mails** e no marcador.
4. O número do selo da entrada bate com a quantidade de linhas listadas.
5. Spam e Lixeira continuam mostrando o que está neles.

- [ ] **Passo 10: commitar**

```bash
git commit --only -m "feat(email): separa Caixa de entrada de Todos os e-mails

Mover para um marcador agora tira da entrada, como no Gmail; a mensagem segue
em Todos e no marcador. A secao passa a abrir na entrada. O selo e a lista sao
construidos pelo mesmo filtro, entao nao tem como divergir.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -- src/pages/Emails.tsx src/components/email/BarraPastas.tsx
```

---

## Verificação final do bloco

- [ ] `npm run test` acima de 1.140, com os 6 novos de `filtro-da-caixa`
- [ ] `tsc`, `lint` e `build` sem piorar as linhas de base
- [ ] No navegador, os cinco pontos do Passo 9 da Tarefa 3
- [ ] O botão "Todas / Não lidas" do topo continua funcionando como antes (não foi tocado)
