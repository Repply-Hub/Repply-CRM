# Código/ID na exportação e atualização sem duplicar — plano de implementação

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: use `superpowers:subagent-driven-development`
> (recomendado) ou `superpowers:executing-plans`, tarefa a tarefa. Os passos usam caixinha
> (`- [ ]`) para marcar progresso.

**Objetivo:** a exportação de Negócios ganha a coluna **"Código/ID"** no fim, e a importação passa
a reconhecer esse código para **atualizar** o negócio existente em vez de criar outro — mostrando
a conta antes e nunca gravando direto.

**Arquitetura:** duas funções puras novas em `src/lib/import/` carregam toda a regra (classificar
as linhas em quatro baldes; calcular o de-para campo a campo). O diálogo de importação consulta o
banco, chama as duas e desenha o aviso no passo "conferir", ao lado dos alertas de data e de
responsável que já vivem ali. A gravação entra em `use-bulk-import.ts`, no mesmo mecanismo de
lotes que a inserção já usa. **Nenhuma migration.**

**Pilha:** React 18 + TypeScript + Vite · TanStack Query v5 · shadcn/Radix · Supabase (supabase-js)
· Vitest.

**Desenho:** [`../specs/2026-09-09-codigo-id-na-exportacao-design.md`](../specs/2026-09-09-codigo-id-na-exportacao-design.md).
Leia antes de começar — as decisões numeradas da §3 não se reabrem.

## Restrições globais

Valem para **todas** as tarefas.

- **PT-BR** em interface, comentário, mensagem de erro e commit. Nunca traduza nome de tabela,
  coluna ou variável para inglês — banco e código são em português por decisão (CLAUDE.md §5).
- **Linha de base da verificação** (CLAUDE.md §9), medida em 09/09/2026:
  - `npm run test` → **1.170 verdes em 85 arquivos**. O seu número tem que ser ≥ isso.
  - `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -cE "error TS"` → **31**. O `-p` é
    obrigatório: sem ele o comando não confere nada e devolve sucesso.
  - `npx eslint .` → **433** problemas herdados. O total não pode subir.
  - `npm run build` → tem que compilar.
- 🔴 **Nada de banco.** Sem `apply_migration`, sem DDL, sem INSERT/UPDATE/DELETE. Você **pode**
  ler com SELECT para conferir. Este plano não cria nem altera nada no Postgres.
- 🔴 **Dinheiro nunca passa por `parseFloat`** e campo de dinheiro nunca é `type="number"`
  (CLAUDE.md §7.10). Nenhuma tarefa aqui mexe em dinheiro, mas a exportação passa perto.
- 🔴 **Data em texto não vira `new Date(...)`**: `new Date("2026-09-15")` no horário de Brasília
  devolve 14/09 (CLAUDE.md §7.12). Nenhuma tarefa aqui converte data — se você sentir vontade,
  parou algo errado.
- 🔴 **`XLSX.read` só existe dentro de `src/lib/import/`** (CLAUDE.md §7.14). O teste
  `src/test/uma-leitura-de-planilha-so.test.ts` quebra se alguém tentar. Nenhuma tarefa aqui
  precisa ler planilha.
- 🔴 **Erro do Supabase não é um `Error`.** Use `mensagemDeErro` de `src/lib/mensagem-de-erro.ts`.
  `e instanceof Error ? e.message : '...'` dá **falso** para o erro que interessa e esconde o que
  o banco disse (CLAUDE.md §4.6).
- **Git — outra sessão trabalha nesta mesma pasta e no mesmo índice.**
  `git status --short` numa **chamada de ferramenta separada** antes de commitar. Se aparecer
  arquivo que não é seu, **não pare o trabalho: apenas não o inclua.** Nunca `git add -A`.
  Arquivo novo: `git add <arquivo>`. Depois **sempre**
  `git commit -F msg.txt --only -- <caminhos>`, repetindo os caminhos — o `--only` é o que ignora
  o que a outra sessão deixou estagiado.
  Toda mensagem termina com: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- 🔴 **Sem `git push`.** Quem publica é o dono do produto. `git push` coloca no ar em minutos.

## Estrutura de arquivos

| Arquivo | Responsabilidade | Tarefa |
|---|---|---|
| `src/components/import-pedidos/importPedidosUtils.ts` | *(modificar)* a chave `codigo` entra em `FieldKey`, `FIELDS`, `EMPTY_MAPPING`, `HEADER_RULES`, `MIN_SCORE` | 1 |
| `src/pages/Negocios.tsx` | *(modificar)* `valorDaColuna.codigo` e `larguraPorCampo.codigo` na exportação | 1 |
| `src/components/pedidos/ImportPedidosDialog.tsx` | *(modificar)* `getMappedRows` carrega `codigo`; a prévia busca, classifica e desenha o aviso; a confirmação chama a atualização | 1, 4, 6 |
| `src/lib/import/reencontro-por-codigo.ts` | **(criar)** função pura: separa as linhas em `atualiza` / `sem_codigo` / `nao_encontrado` / `repetido`, e diz se o arquivo inteiro está sem código | 2 |
| `src/lib/import/alteracoes-por-codigo.ts` | **(criar)** função pura: o de-para campo a campo, com as três regras de escrita | 3 |
| `src/hooks/use-bulk-import.ts` | *(modificar)* `atualizarNegociosPorCodigo` — grava e conta o que o banco **aceitou** | 5 |

Os testes ficam ao lado do código (`*.test.ts`), como o resto do projeto.

---

## Tarefa 1: A exportação ganha a coluna "Código/ID"

Entrega independente: depois desta tarefa a planilha sai com 14 colunas e o assistente de
importação já **reconhece** o cabeçalho — mas ainda ignora o valor, que é o estado seguro.

**Arquivos:**
- Modificar: `src/components/import-pedidos/importPedidosUtils.ts:4` (`FieldKey`), `:6` (`FIELDS`),
  `:22` (`EMPTY_MAPPING`), `:40` (`HEADER_RULES`), `:165` (`MIN_SCORE`)
- Modificar: `src/pages/Negocios.tsx` — `valorDaColuna` e `larguraPorCampo` dentro de
  `handleExportExcel`
- Modificar: `src/components/pedidos/ImportPedidosDialog.tsx:250` (`getMappedRows`)
- Criar teste: `src/components/import-pedidos/codigo-id.test.ts`

**Interfaces:**
- Consome: nada.
- Produz: a chave `'codigo'` em `FieldKey`; a entrada `{ key: 'codigo', label: 'Código/ID',
  required: false }` como **última** de `FIELDS`; e `getMappedRows()` passando a devolver
  `codigo: string` em cada linha. As tarefas 2 a 6 dependem das duas coisas.

- [ ] **Passo 1: Escrever o teste que falha**

Crie `src/components/import-pedidos/codigo-id.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { FIELDS, detectImportPedidosMapping, createEmptyMapping } from './importPedidosUtils';

describe('a coluna Código/ID', () => {
  it('é a ÚLTIMA de FIELDS — a ordem daqui é a ordem das colunas da planilha', () => {
    // O desenho decidiu: no fim, depois de "Anexo". A exportação monta o cabeçalho com
    // FIELDS.map(f => f.label), então mudar a posição aqui muda a planilha.
    expect(FIELDS[FIELDS.length - 1]).toEqual({
      key: 'codigo',
      label: 'Código/ID',
      required: false,
    });
  });

  it('não é obrigatória — planilha de base nova não tem essa coluna', () => {
    const codigo = FIELDS.find(f => f.key === 'codigo');
    expect(codigo?.required).toBe(false);
  });

  it('entra no mapeamento vazio, senão o assistente nunca a oferece', () => {
    expect(createEmptyMapping()).toHaveProperty('codigo', '');
  });

  it('é reconhecida sozinha quando a planilha volta da nossa exportação', () => {
    const cabecalhos = ['Negócio', 'Cliente', 'Anexo', 'Código/ID'];
    const linhas = [{
      'Negócio': 'Obra X',
      'Cliente': 'Construtora Y',
      'Anexo': '',
      'Código/ID': '3f2a8b91-0000-4000-8000-000000000001',
    }];
    expect(detectImportPedidosMapping(cabecalhos, linhas).codigo).toBe('Código/ID');
  });

  it('reconhece as escritas que a pessoa pode digitar à mão', () => {
    for (const cabecalho of ['ID', 'Codigo', 'Código', 'Código/ID', 'id do negocio']) {
      const linhas = [{ [cabecalho]: '3f2a8b91-0000-4000-8000-000000000001' }];
      expect(detectImportPedidosMapping([cabecalho], linhas).codigo).toBe(cabecalho);
    }
  });

  it('NÃO confunde com "Marcador", que também é texto curto', () => {
    const linhas = [{ 'Marcador': 'Urgente' }];
    expect(detectImportPedidosMapping(['Marcador'], linhas).codigo).toBe('');
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Rode: `npx vitest run src/components/import-pedidos/codigo-id.test.ts`
Esperado: FALHA. O primeiro teste falha porque o último item de `FIELDS` hoje é `pdf_url`.

- [ ] **Passo 3: A chave entra em `importPedidosUtils.ts`**

Em `src/components/import-pedidos/importPedidosUtils.ts`, na linha 4, acrescente `| 'codigo'`
**no fim** do tipo:

```ts
export type FieldKey = 'negocio' | 'cliente' | 'contato' | 'obra' | 'fabricante' | 'valor' | 'vendedor' | 'observacoes' | 'status' | 'marcador' | 'data_pedido' | 'prazo_resposta' | 'pdf_url' | 'codigo';
```

Em `FIELDS` (linha 6), acrescente como **último** item, depois de `pdf_url`:

```ts
  { key: 'pdf_url', label: 'Anexo', required: false },
  // 🔴 ÚLTIMA DA LISTA, E ISSO É A DECISÃO. A exportação monta o cabeçalho da planilha com
  // `FIELDS.map(f => f.label)`, na ordem daqui — mover esta linha move a coluna do arquivo.
  // O dono do produto pediu no fim, depois de "Anexo", para não mexer na planilha que a
  // equipe já conhece. O rótulo tem as duas palavras de propósito: "ID" é o que o mercado
  // usa, "Código" é o que se fala em português.
  { key: 'codigo', label: 'Código/ID', required: false },
```

Em `EMPTY_MAPPING` (linha 22), acrescente antes do `};`:

```ts
  codigo: '',
```

Em `HEADER_RULES` (linha 40), acrescente antes do `};` que fecha o objeto (linha 163):

```ts
  codigo: [
    { pattern: /^codigo\/id$/, score: 100 },
    { pattern: /^codigo$/, score: 100 },
    { pattern: /^id$/, score: 100 },
    { pattern: /^id\/codigo$/, score: 100 },
    { pattern: /^identificador$/, score: 95 },
    { pattern: /^codigo do negocio$/, score: 95 },
    { pattern: /^id do negocio$/, score: 95 },
    // Solto no meio de outro texto vale menos: "Código do Cliente" não é este campo.
    { pattern: /\bcodigo\b.*\bnegocio\b/, score: 85 },
    { pattern: /\bid\b.*\bnegocio\b/, score: 85 },
  ],
```

> `normalizeText` já tira acento e caixa antes de comparar (linha 247), então `Código/ID` chega
> como `codigo/id`. **Não** escreva os padrões com acento.

Em `MIN_SCORE` (linha 165), acrescente antes do `};`:

```ts
  // Alto de propósito: um cabeçalho que apenas contenha "id" ou "código" não basta.
  // "Código do Cliente" e "ID Bitrix" são outros campos, e casar errado aqui manda a
  // importação atualizar o negócio errado — o pior estrago que este trabalho pode causar.
  codigo: 95,
```

- [ ] **Passo 4: Rodar o teste e ver passar**

Rode: `npx vitest run src/components/import-pedidos/codigo-id.test.ts`
Esperado: **6 passando.**

Se `reconhece as escritas que a pessoa pode digitar à mão` falhar em algum cabeçalho, confira o
score dele contra `MIN_SCORE.codigo = 95` — `getSampleScore` soma pontos por amostra e pode
empurrar acima, mas os padrões `^...$` acima já entregam 95 ou 100 sozinhos.

- [ ] **Passo 5: A exportação escreve o valor**

Em `src/pages/Negocios.tsx`, dentro de `handleExportExcel`, no objeto `valorDaColuna`, acrescente
depois da linha `pdf_url: p => p.pdf_url ?? '',`:

```ts
        // O identificador permanente do negócio. É o que permite exportar, anotar no Excel e
        // devolver ao CRM sem duplicar: sem esta coluna, a importação não tem como saber que a
        // linha é a mesma, e desde 03/09/2026 (23b3d6c9) não há mais deduplicação por conteúdo
        // para segurar a queda.
        //
        // Vai cru, sem formatação: é o mesmo texto que a importação vai comparar do outro lado,
        // e qualquer enfeite aqui quebraria o reencontro.
        codigo: p => p.id,
```

E em `larguraPorCampo`, acrescente `codigo: 40` (o identificador tem 36 caracteres):

```ts
      const larguraPorCampo: Record<string, number> = {
        negocio: 38, cliente: 28, contato: 24, obra: 30, fabricante: 22, valor: 16, vendedor: 22,
        status: 18, marcador: 16, data_pedido: 12, prazo_resposta: 12, observacoes: 40, pdf_url: 40,
        codigo: 40,
      };
```

- [ ] **Passo 6: A importação carrega o valor da linha**

Em `src/components/pedidos/ImportPedidosDialog.tsx`, dentro de `getMappedRows` (linha 250), no
objeto devolvido, acrescente depois de `pdf_url: rest.pdf_url || '',`:

```ts
        // Só carrega. Quem decide o que fazer com o código é a Tarefa 4 — aqui ele apenas deixa
        // de ser descartado no caminho. `use-bulk-import` monta o payload do insert campo a
        // campo, então enquanto a atualização não existir este valor é ignorado sem estragar nada.
        codigo: rest.codigo || '',
```

- [ ] **Passo 7: Conferir que nada quebrou**

Rode, um comando por vez:

```bash
npm run test
```
Esperado: **≥ 1.176 testes verdes** (1.170 da base + os 6 novos), **0 falhando**.

```bash
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -cE "error TS"
```
Esperado: **31**. Subiu? Provavelmente falta `codigo` em `EMPTY_MAPPING`, `HEADER_RULES` ou
`MIN_SCORE` — os três são `Record<FieldKey, ...>` e o compilador exige a chave nova em todos.

```bash
npm run build
```
Esperado: compila.

- [ ] **Passo 8: Commitar**

Confira a fila numa chamada separada:

```bash
git status --short
```

Depois:

```bash
git add src/components/import-pedidos/codigo-id.test.ts
git commit -m "feat(exportacao): a planilha de Negocios ganha a coluna Codigo/ID no fim

A coluna traz o identificador permanente do negocio. E o que vai permitir,
na sequencia deste trabalho, exportar / anotar no Excel / devolver ao CRM
sem duplicar a base - desde 03/09 (23b3d6c9) nao ha mais deduplicacao por
conteudo, entao hoje reimportar uma exportacao cria tudo de novo.

O assistente de importacao ja RECONHECE o cabecalho (FIELDS e a fonte unica
dos dois lados), mas ainda ignora o valor. E o estado seguro: nada muda de
comportamento ate a Tarefa 4.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" --only -- src/components/import-pedidos/importPedidosUtils.ts src/components/import-pedidos/codigo-id.test.ts src/pages/Negocios.tsx src/components/pedidos/ImportPedidosDialog.tsx
```

---

## Tarefa 2: A função pura que separa as linhas em quatro baldes

**Arquivos:**
- Criar: `src/lib/import/reencontro-por-codigo.ts`
- Criar teste: `src/lib/import/reencontro-por-codigo.test.ts`

**Interfaces:**
- Consome: nada (função pura, sem rede e sem React).
- Produz, e a Tarefa 4 depende exatamente destes nomes:
  - `type BaldeDaLinha = 'atualiza' | 'sem_codigo' | 'nao_encontrado' | 'repetido'`
  - `interface LinhaClassificada<T> { linha: T; indice: number; balde: BaldeDaLinha; codigo: string }`
  - `interface ClassificacaoDeLinhas<T> { todas; atualiza; semCodigo; naoEncontrado; repetido: LinhaClassificada<T>[]; arquivoInteiroSemCodigo: boolean }`
  - `function codigosParaConsultar(linhas: { codigo?: unknown }[]): string[]`
  - `function classificarPorCodigo<T extends { codigo?: unknown }>(linhas: T[], codigosQueExistem: ReadonlySet<string>): ClassificacaoDeLinhas<T>`

- [ ] **Passo 1: Escrever o teste que falha**

Crie `src/lib/import/reencontro-por-codigo.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { classificarPorCodigo, codigosParaConsultar } from './reencontro-por-codigo';

const A = '3f2a8b91-0000-4000-8000-00000000000a';
const B = '3f2a8b91-0000-4000-8000-00000000000b';
const C = '3f2a8b91-0000-4000-8000-00000000000c';

describe('codigosParaConsultar', () => {
  it('devolve só o que tem formato de identificador, sem repetir', () => {
    const linhas = [{ codigo: A }, { codigo: A }, { codigo: '' }, { codigo: 'abc' }];
    expect(codigosParaConsultar(linhas)).toEqual([A]);
  });

  it('🔴 filtra o que não tem formato de identificador — senão a consulta INTEIRA cai', () => {
    // O Postgres recusa o SELECT todo com "invalid input syntax for type uuid" quando UM
    // valor da lista está fora do formato. Uma célula com "abc" derrubaria a busca dos
    // 12 mil códigos válidos junto.
    expect(codigosParaConsultar([{ codigo: 'abc' }, { codigo: 'Código/ID' }])).toEqual([]);
  });

  it('aceita o identificador em caixa alta e com espaço em volta', () => {
    expect(codigosParaConsultar([{ codigo: `  ${A.toUpperCase()}  ` }])).toEqual([A]);
  });
});

describe('classificarPorCodigo', () => {
  it('código que existe vai para "atualiza"', () => {
    const r = classificarPorCodigo([{ codigo: A }], new Set([A]));
    expect(r.atualiza).toHaveLength(1);
    expect(r.atualiza[0]).toMatchObject({ balde: 'atualiza', codigo: A, indice: 0 });
  });

  it('célula vazia vai para "sem_codigo"', () => {
    const r = classificarPorCodigo([{ codigo: '' }, { codigo: '   ' }, {}], new Set());
    expect(r.semCodigo).toHaveLength(3);
    expect(r.semCodigo.every(l => l.codigo === '')).toBe(true);
  });

  it('código preenchido que o banco não devolveu vai para "nao_encontrado"', () => {
    const r = classificarPorCodigo([{ codigo: B }], new Set([A]));
    expect(r.naoEncontrado).toHaveLength(1);
    expect(r.atualiza).toHaveLength(0);
  });

  it('texto que nem tem formato de identificador também é "nao_encontrado"', () => {
    const r = classificarPorCodigo([{ codigo: 'abc' }], new Set([A]));
    expect(r.naoEncontrado).toHaveLength(1);
    expect(r.semCodigo).toHaveLength(0);
  });

  it('🔴 código repetido no arquivo recusa TODAS as linhas dele, não só a segunda', () => {
    // Duas linhas com o mesmo código são uma contradição, não uma ordem. Escolher a última
    // em silêncio grava a errada metade das vezes (decisão 10 do desenho).
    const r = classificarPorCodigo([{ codigo: A }, { codigo: A }, { codigo: B }], new Set([A, B]));
    expect(r.repetido).toHaveLength(2);
    expect(r.repetido.map(l => l.indice)).toEqual([0, 1]);
    expect(r.atualiza.map(l => l.codigo)).toEqual([B]);
  });

  it('repetido vence "não encontrado" — a contradição é o problema maior', () => {
    const r = classificarPorCodigo([{ codigo: C }, { codigo: C }], new Set());
    expect(r.repetido).toHaveLength(2);
    expect(r.naoEncontrado).toHaveLength(0);
  });

  it('a mesma linha aparece uma vez só em "todas", com o índice da planilha', () => {
    const r = classificarPorCodigo([{ codigo: A }, { codigo: '' }, { codigo: 'abc' }], new Set([A]));
    expect(r.todas).toHaveLength(3);
    expect(r.todas.map(l => l.indice)).toEqual([0, 1, 2]);
    expect(r.todas.map(l => l.balde)).toEqual(['atualiza', 'sem_codigo', 'nao_encontrado']);
  });

  it('arquivoInteiroSemCodigo é verdadeiro só quando NINGUÉM trouxe código', () => {
    expect(classificarPorCodigo([{ codigo: '' }, {}], new Set()).arquivoInteiroSemCodigo).toBe(true);
    expect(classificarPorCodigo([{ codigo: '' }, { codigo: A }], new Set([A])).arquivoInteiroSemCodigo).toBe(false);
    // Texto inválido CONTA como ter trazido código: o arquivo não é de base nova, é uma
    // volta de exportação com uma célula estragada.
    expect(classificarPorCodigo([{ codigo: 'abc' }], new Set()).arquivoInteiroSemCodigo).toBe(false);
  });

  it('arquivo vazio não quebra', () => {
    const r = classificarPorCodigo([], new Set());
    expect(r.todas).toHaveLength(0);
    expect(r.arquivoInteiroSemCodigo).toBe(true);
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Rode: `npx vitest run src/lib/import/reencontro-por-codigo.test.ts`
Esperado: FALHA — `Failed to resolve import "./reencontro-por-codigo"`.

- [ ] **Passo 3: Escrever a implementação**

Crie `src/lib/import/reencontro-por-codigo.ts`:

```ts
/**
 * O reencontro: qual linha da planilha corresponde a qual negócio que já existe.
 *
 * 🔴 POR QUE ESTE ARQUIVO EXISTE. A deduplicação por conteúdo foi removida em 03/09/2026
 * (`23b3d6c9`): linha repetida passou a ser cadastrada como negócio novo, sem conferência
 * nenhuma. Sem um identificador explícito na planilha, a ida e volta
 * "exportar → anotar no Excel → devolver ao CRM" duplica a base inteira — 12.474 negócios
 * novos ao lado dos velhos, medido em 09/09/2026.
 *
 * A coluna "Código/ID" (Tarefa 1) é o identificador. Este arquivo decide, para cada linha,
 * qual dos quatro destinos ela tem. Nada aqui toca rede, React ou banco.
 *
 * Ver `docs/superpowers/specs/2026-09-09-codigo-id-na-exportacao-design.md` §5.B.
 */

/**
 * O formato do identificador de negócio (`pedidos.id`, um uuid).
 *
 * 🔴 NÃO É FRESCURA DE VALIDAÇÃO. O Postgres recusa a consulta INTEIRA quando um dos valores
 * do `in (...)` está fora do formato — `invalid input syntax for type uuid`. Uma única célula
 * com "abc", ou com o cabeçalho "Código/ID" colado por engano no corpo da planilha, derrubaria
 * a busca dos outros 12 mil códigos válidos junto. Por isso o que não casa nunca chega ao banco.
 */
const FORMATO_DO_CODIGO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Onde a linha vai parar. */
export type BaldeDaLinha = 'atualiza' | 'sem_codigo' | 'nao_encontrado' | 'repetido';

export interface LinhaClassificada<T> {
  linha: T;
  /** Posição na planilha, começando em 0. É como a tela aponta a linha para a pessoa. */
  indice: number;
  balde: BaldeDaLinha;
  /** O código já aparado e em caixa baixa. Vazio quando o balde é `sem_codigo`. */
  codigo: string;
}

export interface ClassificacaoDeLinhas<T> {
  /** Todas as linhas, na ordem da planilha. Cada uma aparece aqui exatamente uma vez. */
  todas: LinhaClassificada<T>[];
  atualiza: LinhaClassificada<T>[];
  semCodigo: LinhaClassificada<T>[];
  naoEncontrado: LinhaClassificada<T>[];
  repetido: LinhaClassificada<T>[];
  /**
   * Nenhuma linha trouxe código?
   *
   * É o que distingue uma importação de BASE NOVA (o arquivo do Bitrix, a planilha de um
   * cliente novo) de uma VOLTA de exportação nossa com uma célula apagada por acidente. A
   * caixinha "criar os sem código como negócios novos" nasce marcada só no primeiro caso
   * (decisão 11 do desenho).
   */
  arquivoInteiroSemCodigo: boolean;
}

/** O código de uma linha, aparado e em caixa baixa. Vazio quando não há nada escrito. */
function codigoDaLinha(linha: { codigo?: unknown }): string {
  const bruto = linha.codigo;
  if (typeof bruto !== 'string' && typeof bruto !== 'number') return '';
  return String(bruto).trim().toLowerCase();
}

/**
 * Os códigos que vale a pena perguntar ao banco: só os que têm o formato certo, sem repetição.
 *
 * Quem chama usa isto para montar o `in (...)`. O que ficou de fora não some — vira
 * `nao_encontrado` em `classificarPorCodigo`, que é o destino honesto: o sistema não consegue
 * distinguir "não existe" de "existe e é de outra empresa", porque a regra de segurança do
 * banco simplesmente não devolve a linha nos dois casos.
 */
export function codigosParaConsultar(linhas: { codigo?: unknown }[]): string[] {
  const unicos = new Set<string>();
  for (const linha of linhas) {
    const codigo = codigoDaLinha(linha);
    if (codigo && FORMATO_DO_CODIGO.test(codigo)) unicos.add(codigo);
  }
  return [...unicos];
}

export function classificarPorCodigo<T extends { codigo?: unknown }>(
  linhas: T[],
  codigosQueExistem: ReadonlySet<string>,
): ClassificacaoDeLinhas<T> {
  // Primeira passada: quantas linhas carregam cada código. É o que revela a contradição —
  // o mesmo código em duas linhas — antes de decidir qualquer destino.
  const vezes = new Map<string, number>();
  for (const linha of linhas) {
    const codigo = codigoDaLinha(linha);
    if (codigo) vezes.set(codigo, (vezes.get(codigo) ?? 0) + 1);
  }

  const todas: LinhaClassificada<T>[] = linhas.map((linha, indice) => {
    const codigo = codigoDaLinha(linha);

    if (!codigo) return { linha, indice, balde: 'sem_codigo' as const, codigo: '' };

    // Repetido decide antes de tudo, inclusive antes de "não encontrado": duas linhas
    // mandando coisas diferentes no mesmo negócio é o problema maior, e é o que a pessoa
    // precisa ver para consertar a planilha.
    if ((vezes.get(codigo) ?? 0) > 1) return { linha, indice, balde: 'repetido' as const, codigo };

    if (!FORMATO_DO_CODIGO.test(codigo) || !codigosQueExistem.has(codigo)) {
      return { linha, indice, balde: 'nao_encontrado' as const, codigo };
    }

    return { linha, indice, balde: 'atualiza' as const, codigo };
  });

  const doBalde = (balde: BaldeDaLinha) => todas.filter(l => l.balde === balde);

  return {
    todas,
    atualiza: doBalde('atualiza'),
    semCodigo: doBalde('sem_codigo'),
    naoEncontrado: doBalde('nao_encontrado'),
    repetido: doBalde('repetido'),
    // `vezes` só recebe código não vazio, então tamanho zero significa que ninguém trouxe
    // nada escrito — inclusive quando o texto era inválido, que conta como ter trazido.
    arquivoInteiroSemCodigo: vezes.size === 0,
  };
}
```

- [ ] **Passo 4: Rodar o teste e ver passar**

Rode: `npx vitest run src/lib/import/reencontro-por-codigo.test.ts`
Esperado: **12 passando** (3 de `codigosParaConsultar` + 9 de `classificarPorCodigo`).

- [ ] **Passo 5: Commitar**

`git status --short` numa chamada separada, depois:

```bash
git add src/lib/import/reencontro-por-codigo.ts src/lib/import/reencontro-por-codigo.test.ts
git commit -m "feat(importacao): a regra que separa as linhas da planilha em quatro baldes

Funcao pura, sem rede e sem React: dado o que a planilha trouxe e os codigos
que o banco devolveu, decide para cada linha se ela ATUALIZA um negocio, se
esta SEM CODIGO, se o codigo NAO FOI ENCONTRADO ou se ele esta REPETIDO no
proprio arquivo.

Duas decisoes com teste que as prende:
- codigo repetido recusa TODAS as linhas dele, nao so a segunda: duas linhas
  no mesmo negocio sao uma contradicao, e escolher a ultima grava a errada
  metade das vezes;
- codigo fora do formato nunca chega ao banco. O Postgres recusa o SELECT
  inteiro quando um valor do in(...) nao e uuid, e uma celula com \"abc\"
  derrubaria a busca dos 12 mil codigos validos junto.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" --only -- src/lib/import/reencontro-por-codigo.ts src/lib/import/reencontro-por-codigo.test.ts
```

---

## Tarefa 3: A função pura do de-para, com as três regras de escrita

**Arquivos:**
- Criar: `src/lib/import/alteracoes-por-codigo.ts`
- Criar teste: `src/lib/import/alteracoes-por-codigo.test.ts`

**Interfaces:**
- Consome: nada (função pura).
- Produz, e as Tarefas 4, 5 e 6 dependem destes nomes:
  - `type CampoAlteravel = 'nome' | 'observacoes' | 'marcador_id'`
  - `interface NegocioAtual { id: string; nome: string | null; observacoes: string | null; marcador_id: string | null; nomeAutomatico: string; rotulo: string }`
  - `interface AlteracaoDeCampo { campo: CampoAlteravel; de: string; para: string }`
  - `interface AlteracaoDeNegocio { id: string; rotulo: string; alteracoes: AlteracaoDeCampo[]; patch: Record<string, string | null> }`
  - `interface ResumoDasAlteracoes { negocios: AlteracaoDeNegocio[]; porCampo: Record<CampoAlteravel, number>; marcadoresDesconhecidos: string[] }`
  - `function calcularAlteracoes(linhas, atuais, marcadoresPorNome): ResumoDasAlteracoes`

- [ ] **Passo 1: Escrever o teste que falha**

Crie `src/lib/import/alteracoes-por-codigo.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { calcularAlteracoes, type NegocioAtual } from './alteracoes-por-codigo';

const ID = '3f2a8b91-0000-4000-8000-00000000000a';

function negocio(over: Partial<NegocioAtual> = {}): NegocioAtual {
  return {
    id: ID,
    nome: null,
    observacoes: null,
    marcador_id: null,
    nomeAutomatico: 'Construtora Alfa | Portobello',
    rotulo: 'Construtora Alfa | Portobello',
    ...over,
  };
}

const atuais = (n: NegocioAtual) => new Map([[n.id, n]]);
const semMarcadores = new Map<string, string>();

describe('calcularAlteracoes — a regra do VAZIO', () => {
  it('célula vazia nunca apaga o que está no CRM', () => {
    const r = calcularAlteracoes(
      [{ codigo: ID, observacoes: '', negocio: '   ', marcador: '' }],
      atuais(negocio({ observacoes: 'combinado por telefone', nome: 'Obra do Porto' })),
      semMarcadores,
    );
    expect(r.negocios).toHaveLength(0);
  });

  it('campo ausente também não mexe', () => {
    const r = calcularAlteracoes(
      [{ codigo: ID }],
      atuais(negocio({ observacoes: 'algo' })),
      semMarcadores,
    );
    expect(r.negocios).toHaveLength(0);
  });
});

describe('calcularAlteracoes — a regra do NOME', () => {
  it('🔴 texto igual ao rótulo automático NÃO grava — é o que a exportação escreveu', () => {
    // Sem esta regra, reimportar uma exportação intocada congelaria "Cliente | Fabricante"
    // como nome próprio em 12.324 negócios (medido em 09/09/2026). Invisível na tela, e o
    // rótulo pararia de acompanhar uma renomeação de cliente.
    const r = calcularAlteracoes(
      [{ codigo: ID, negocio: 'Construtora Alfa | Portobello' }],
      atuais(negocio()),
      semMarcadores,
    );
    expect(r.negocios).toHaveLength(0);
  });

  it('a comparação com o automático ignora espaço sobrando', () => {
    const r = calcularAlteracoes(
      [{ codigo: ID, negocio: '  Construtora Alfa | Portobello  ' }],
      atuais(negocio()),
      semMarcadores,
    );
    expect(r.negocios).toHaveLength(0);
  });

  it('nome de verdade é gravado', () => {
    const r = calcularAlteracoes(
      [{ codigo: ID, negocio: 'Obra do Porto — fachada' }],
      atuais(negocio()),
      semMarcadores,
    );
    expect(r.negocios[0].alteracoes).toEqual([
      { campo: 'nome', de: 'Construtora Alfa | Portobello', para: 'Obra do Porto — fachada' },
    ]);
    expect(r.negocios[0].patch).toEqual({ nome: 'Obra do Porto — fachada' });
  });

  it('nome igual ao que já está gravado não vira alteração', () => {
    const r = calcularAlteracoes(
      [{ codigo: ID, negocio: 'Obra do Porto' }],
      atuais(negocio({ nome: 'Obra do Porto' })),
      semMarcadores,
    );
    expect(r.negocios).toHaveLength(0);
  });
});

describe('calcularAlteracoes — a regra do MARCADOR', () => {
  it('nome conhecido vira o identificador do marcador', () => {
    const r = calcularAlteracoes(
      [{ codigo: ID, marcador: 'Urgente' }],
      atuais(negocio()),
      new Map([['urgente', 'mk-1']]),
    );
    expect(r.negocios[0].patch).toEqual({ marcador_id: 'mk-1' });
    expect(r.porCampo.marcador_id).toBe(1);
  });

  it('🔴 nome desconhecido NÃO cria marcador — deixa como está e avisa', () => {
    // `resolveMarcadorId` cria quando não acha, e é assim que a linha NOVA funciona. No
    // caminho de atualização isso seria criar cadastro em silêncio (decisão 9 do desenho).
    const r = calcularAlteracoes(
      [{ codigo: ID, marcador: 'Inventado' }],
      atuais(negocio()),
      new Map([['urgente', 'mk-1']]),
    );
    expect(r.negocios).toHaveLength(0);
    expect(r.marcadoresDesconhecidos).toEqual(['Inventado']);
  });

  it('o mesmo marcador desconhecido aparece uma vez só na lista', () => {
    const outro = '3f2a8b91-0000-4000-8000-00000000000b';
    const r = calcularAlteracoes(
      [{ codigo: ID, marcador: 'Inventado' }, { codigo: outro, marcador: 'inventado' }],
      new Map([[ID, negocio()], [outro, negocio({ id: outro })]]),
      semMarcadores,
    );
    expect(r.marcadoresDesconhecidos).toEqual(['Inventado']);
  });

  it('marcador que já é o do negócio não vira alteração', () => {
    const r = calcularAlteracoes(
      [{ codigo: ID, marcador: 'Urgente' }],
      atuais(negocio({ marcador_id: 'mk-1' })),
      new Map([['urgente', 'mk-1']]),
    );
    expect(r.negocios).toHaveLength(0);
  });
});

describe('calcularAlteracoes — o resumo', () => {
  it('conta por campo e junta as alterações do mesmo negócio num patch só', () => {
    const r = calcularAlteracoes(
      [{ codigo: ID, observacoes: 'nova nota', marcador: 'Urgente' }],
      atuais(negocio({ observacoes: 'nota velha' })),
      new Map([['urgente', 'mk-1']]),
    );
    expect(r.negocios).toHaveLength(1);
    expect(r.negocios[0].patch).toEqual({ observacoes: 'nova nota', marcador_id: 'mk-1' });
    expect(r.porCampo).toEqual({ nome: 0, observacoes: 1, marcador_id: 1 });
  });

  it('linha cujo código não está no mapa é ignorada em silêncio', () => {
    // Não é erro: a Tarefa 2 já separou essas linhas em outro balde antes de chegar aqui.
    const r = calcularAlteracoes([{ codigo: 'sumiu', observacoes: 'x' }], new Map(), semMarcadores);
    expect(r.negocios).toHaveLength(0);
  });

  it('o rótulo do negócio acompanha, para a tela dizer de quem é a mudança', () => {
    const r = calcularAlteracoes(
      [{ codigo: ID, observacoes: 'nova' }],
      atuais(negocio({ rotulo: 'Obra do Porto' })),
      semMarcadores,
    );
    expect(r.negocios[0].rotulo).toBe('Obra do Porto');
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Rode: `npx vitest run src/lib/import/alteracoes-por-codigo.test.ts`
Esperado: FALHA — `Failed to resolve import "./alteracoes-por-codigo"`.

- [ ] **Passo 3: Escrever a implementação**

Crie `src/lib/import/alteracoes-por-codigo.ts`:

```ts
/**
 * O de-para: o que exatamente muda em cada negócio quando a planilha volta.
 *
 * Três campos, e só três: o nome do negócio, as observações e o marcador (decisão 4 do
 * desenho). Cliente, Fabricante, Valor, Etapa, Responsável e as datas são lidos e ignorados —
 * eles continuam mudando só dentro do CRM, onde há histórico de quem mudou. Deixar a planilha
 * mexer neles reativaria dois defeitos medidos: nome de cliente que não casa CRIA uma
 * construtora duplicada, e nome de responsável que não casa joga o negócio em quem importou
 * (4.777 negócios na MD, 01 e 04/09/2026).
 *
 * As três regras de escrita, todas com teste que as prende:
 *   1. Vazio não mexe. Célula em branco é "não informado", nunca "apague".
 *   2. Nome igual ao rótulo automático não mexe — é o que a nossa própria exportação escreveu.
 *   3. Marcador desconhecido não é criado; fica como está e entra no aviso.
 *
 * Sem rede, sem React, sem banco. Ver o desenho §5.B.
 */

export type CampoAlteravel = 'nome' | 'observacoes' | 'marcador_id';

/** O negócio como ele está no banco agora, com o que a comparação precisa saber. */
export interface NegocioAtual {
  id: string;
  nome: string | null;
  observacoes: string | null;
  marcador_id: string | null;
  /**
   * O rótulo que a tela monta quando `nome` está vazio: `"cliente | fabricante"`.
   * É contra ele que a regra 2 compara — ver `getNomeNegocioAutomatico` em
   * `src/lib/nome-negocio.ts`, que é quem a exportação usa.
   */
  nomeAutomatico: string;
  /** Como chamar este negócio na tela do aviso. */
  rotulo: string;
}

/** A linha da planilha, já mapeada pelo assistente. */
export interface LinhaParaAtualizar {
  codigo: string;
  negocio?: unknown;
  observacoes?: unknown;
  marcador?: unknown;
}

export interface AlteracaoDeCampo {
  campo: CampoAlteravel;
  /** O que está hoje, pronto para a tela. Vazio quando o campo está em branco no CRM. */
  de: string;
  para: string;
}

export interface AlteracaoDeNegocio {
  id: string;
  rotulo: string;
  alteracoes: AlteracaoDeCampo[];
  /** O que vai para o `update`. Nunca é vazio: negócio sem alteração não entra na lista. */
  patch: Record<string, string | null>;
}

export interface ResumoDasAlteracoes {
  negocios: AlteracaoDeNegocio[];
  porCampo: Record<CampoAlteravel, number>;
  /** Nomes de marcador que a planilha trouxe e a empresa não tem, na escrita original. */
  marcadoresDesconhecidos: string[];
}

/** Texto da planilha, aparado. Vazio quando não há nada escrito — e vazio nunca mexe. */
function texto(valor: unknown): string {
  if (typeof valor !== 'string' && typeof valor !== 'number') return '';
  return String(valor).trim();
}

/** Para comparar rótulo com rótulo sem tropeçar em espaço duplicado ou caixa. */
function paraComparar(valor: string): string {
  return valor.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function calcularAlteracoes(
  linhas: LinhaParaAtualizar[],
  atuais: ReadonlyMap<string, NegocioAtual>,
  /** Marcadores da empresa: nome em caixa baixa → identificador. */
  marcadoresPorNome: ReadonlyMap<string, string>,
): ResumoDasAlteracoes {
  const negocios: AlteracaoDeNegocio[] = [];
  const porCampo: Record<CampoAlteravel, number> = { nome: 0, observacoes: 0, marcador_id: 0 };
  const desconhecidos = new Map<string, string>();

  for (const linha of linhas) {
    const atual = atuais.get(linha.codigo);
    // Linha sem par não é erro aqui: a classificação (reencontro-por-codigo.ts) já a mandou
    // para outro balde antes desta função ser chamada.
    if (!atual) continue;

    const alteracoes: AlteracaoDeCampo[] = [];
    const patch: Record<string, string | null> = {};

    // ---- nome ----
    const nomeNovo = texto(linha.negocio);
    if (nomeNovo) {
      const nomeHoje = atual.nome?.trim() ?? '';
      const jaEIgual = paraComparar(nomeNovo) === paraComparar(nomeHoje);
      // 🔴 A REGRA QUE IMPEDE O ESTRAGO SILENCIOSO. A exportação escreve o rótulo automático
      // quando o negócio não tem nome próprio, então reimportar sem editar traria esse mesmo
      // texto de volta. Gravá-lo transformaria "sem nome" em "chamado assim para sempre" em
      // 12.324 negócios, sem nada mudar na tela.
      const eOAutomatico = paraComparar(nomeNovo) === paraComparar(atual.nomeAutomatico);
      if (!jaEIgual && !eOAutomatico) {
        alteracoes.push({ campo: 'nome', de: nomeHoje || atual.nomeAutomatico, para: nomeNovo });
        patch.nome = nomeNovo;
        porCampo.nome += 1;
      }
    }

    // ---- observações ----
    const obsNova = texto(linha.observacoes);
    if (obsNova) {
      const obsHoje = atual.observacoes?.trim() ?? '';
      if (obsNova !== obsHoje) {
        alteracoes.push({ campo: 'observacoes', de: obsHoje, para: obsNova });
        patch.observacoes = obsNova;
        porCampo.observacoes += 1;
      }
    }

    // ---- marcador ----
    const marcadorNovo = texto(linha.marcador);
    if (marcadorNovo) {
      const id = marcadoresPorNome.get(marcadorNovo.toLowerCase());
      if (!id) {
        // Guarda a PRIMEIRA escrita que apareceu, para a tela mostrar do jeito que a pessoa
        // escreveu — e a chave em caixa baixa impede o mesmo nome entrar duas vezes.
        if (!desconhecidos.has(marcadorNovo.toLowerCase())) {
          desconhecidos.set(marcadorNovo.toLowerCase(), marcadorNovo);
        }
      } else if (id !== atual.marcador_id) {
        alteracoes.push({ campo: 'marcador_id', de: atual.marcador_id ?? '', para: marcadorNovo });
        patch.marcador_id = id;
        porCampo.marcador_id += 1;
      }
    }

    if (alteracoes.length > 0) {
      negocios.push({ id: atual.id, rotulo: atual.rotulo, alteracoes, patch });
    }
  }

  return { negocios, porCampo, marcadoresDesconhecidos: [...desconhecidos.values()] };
}

/** As frases do aviso. Vazio quando não há nada a dizer. */
export function textoDoResumoDeAlteracoes(resumo: ResumoDasAlteracoes): string[] {
  if (resumo.negocios.length === 0) return [];

  const quantos = resumo.negocios.length === 1
    ? '1 negócio será atualizado'
    : `${resumo.negocios.length} negócios serão atualizados`;

  const pedacos: string[] = [];
  if (resumo.porCampo.observacoes > 0) pedacos.push(`${resumo.porCampo.observacoes} em Observações`);
  if (resumo.porCampo.marcador_id > 0) pedacos.push(`${resumo.porCampo.marcador_id} no Marcador`);
  if (resumo.porCampo.nome > 0) pedacos.push(`${resumo.porCampo.nome} no nome`);

  const frases = [`${quantos} — ${pedacos.join(', ')}.`];

  if (resumo.marcadoresDesconhecidos.length > 0) {
    const lista = resumo.marcadoresDesconhecidos.slice(0, 5).map(m => `"${m}"`).join(', ');
    const resto = resumo.marcadoresDesconhecidos.length > 5
      ? ` e mais ${resumo.marcadoresDesconhecidos.length - 5}`
      : '';
    frases.push(
      `Marcador que não existe aqui${resto ? '' : ''}: ${lista}${resto}. Esses negócios ficam com o marcador que já têm — a importação não cria marcador novo.`,
    );
  }

  return frases;
}
```

- [ ] **Passo 4: Rodar o teste e ver passar**

Rode: `npx vitest run src/lib/import/alteracoes-por-codigo.test.ts`
Esperado: **13 passando.**

- [ ] **Passo 5: Rodar a bateria toda**

```bash
npm run test
```
Esperado: **≥ 1.201 verdes** (1.170 + 6 da Tarefa 1 + 12 da Tarefa 2 + 13 desta), 0 falhando.

```bash
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -cE "error TS"
```
Esperado: **31**.

- [ ] **Passo 6: Commitar**

`git status --short` numa chamada separada, depois:

```bash
git add src/lib/import/alteracoes-por-codigo.ts src/lib/import/alteracoes-por-codigo.test.ts
git commit -m "feat(importacao): o de-para campo a campo, com as tres regras de escrita

So tres campos podem mudar por planilha: nome do negocio, observacoes e
marcador. As tres regras que protegem o resto, cada uma com teste:

1. Vazio nunca apaga. Celula em branco e \"nao informado\".
2. Nome igual ao rotulo automatico nao grava. A exportacao escreve
   \"Cliente | Fabricante\" quando o negocio nao tem nome proprio; gravar isso
   de volta congelaria 12.324 nomes sem nada mudar na tela.
3. Marcador desconhecido nao e criado. Fica como esta e entra no aviso -
   criar cadastro em silencio e o caminho de atualizacao e o caminho cuidadoso.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" --only -- src/lib/import/alteracoes-por-codigo.ts src/lib/import/alteracoes-por-codigo.test.ts
```

---

## Tarefa 4: A prévia busca os negócios e mostra a conta

**Arquivos:**
- Modificar: `src/components/pedidos/ImportPedidosDialog.tsx` — um `useEffect` novo perto de
  `avisoDeResponsaveis` (linha ~383), o bloco de aviso no passo `preview` (depois do bloco
  `avisoDeResponsaveis`, ~linha 800), e um estado novo

**Interfaces:**
- Consome: `codigosParaConsultar`, `classificarPorCodigo` (Tarefa 2); `calcularAlteracoes`,
  `textoDoResumoDeAlteracoes`, `NegocioAtual` (Tarefa 3); `getMappedRows()` devolvendo `codigo`
  (Tarefa 1).
- Produz, para as Tarefas 5 e 6: o estado `reencontro`, do tipo
  `{ classificacao: ClassificacaoDeLinhas<LinhaMapeada>; resumo: ResumoDasAlteracoes } | null`,
  e o estado `criarOsSemCodigo: boolean`.

- [ ] **Passo 1: O estado e a busca**

Em `src/components/pedidos/ImportPedidosDialog.tsx`, junto dos outros `useState` do topo do
componente, acrescente:

```tsx
  // O reencontro por Código/ID. Nulo enquanto a busca não terminou — a tela mostra
  // "conferindo…" nesse intervalo, em vez de prometer um número que ainda vai mudar.
  const [reencontro, setReencontro] = useState<{
    classificacao: ClassificacaoDeLinhas<Record<string, unknown>>;
    resumo: ResumoDasAlteracoes;
  } | null>(null);
  const [conferindoCodigos, setConferindoCodigos] = useState(false);
  // A caixinha do balde "sem código". Quem decide o valor inicial é a classificação, no efeito
  // abaixo: marcada só quando o arquivo inteiro está sem código (decisão 11 do desenho).
  const [criarOsSemCodigo, setCriarOsSemCodigo] = useState(true);
```

E os imports, junto dos outros de `@/lib/import/`:

```tsx
import {
  codigosParaConsultar,
  classificarPorCodigo,
  type ClassificacaoDeLinhas,
} from '@/lib/import/reencontro-por-codigo';
import {
  calcularAlteracoes,
  textoDoResumoDeAlteracoes,
  type NegocioAtual,
  type ResumoDasAlteracoes,
} from '@/lib/import/alteracoes-por-codigo';
import { getNomeNegocioAutomatico } from '@/lib/nome-negocio';
```

- [ ] **Passo 2: O efeito que consulta o banco**

Logo depois do `useMemo` de `avisoDeResponsaveis` (~linha 388), acrescente:

```tsx
  // Busca no banco os negócios que a planilha diz atualizar, e monta o de-para.
  //
  // Efeito e não `useMemo` porque isto vai ao servidor. Roda só no passo "conferir", que é
  // onde o aviso aparece — e onde a pessoa ainda pode voltar e mudar o mapeamento.
  useEffect(() => {
    if (step !== 'preview') { setReencontro(null); return; }

    let cancelado = false;
    (async () => {
      setConferindoCodigos(true);
      try {
        const linhas = previewRows as Record<string, unknown>[];
        const codigos = codigosParaConsultar(linhas);

        // Busca em lotes de 200, por chave primária — a consulta mais barata que existe nesta
        // tabela. A regra de segurança do banco filtra sozinha: código de outra empresa
        // simplesmente não volta, e vira "não encontrado" como qualquer código inexistente.
        const encontrados = new Map<string, NegocioAtual>();
        for (let i = 0; i < codigos.length; i += 200) {
          const lote = codigos.slice(i, i + 200);
          const { data, error } = await supabase
            .from('pedidos')
            .select('id, nome, observacoes, marcador_id, cliente:clientes(empresa), fabricante:fabricantes(nome)')
            .in('id', lote);
          if (error) throw error;
          for (const p of (data ?? []) as any[]) {
            const automatico = getNomeNegocioAutomatico(p.cliente, p.fabricante);
            encontrados.set(String(p.id).toLowerCase(), {
              id: p.id,
              nome: p.nome ?? null,
              observacoes: p.observacoes ?? null,
              marcador_id: p.marcador_id ?? null,
              nomeAutomatico: automatico,
              rotulo: (p.nome?.trim() || automatico),
            });
          }
        }

        // Marcadores da empresa, para a regra 3: o que não estiver aqui não é criado.
        const marcadoresPorNome = new Map<string, string>();
        if (empresaId) {
          const { data } = await supabase
            .from('marcadores').select('id, nome').eq('empresa_id', empresaId);
          for (const m of (data ?? []) as any[]) {
            marcadoresPorNome.set(String(m.nome).trim().toLowerCase(), m.id);
          }
        }

        if (cancelado) return;

        const classificacao = classificarPorCodigo(linhas, new Set(encontrados.keys()));
        const resumo = calcularAlteracoes(
          classificacao.atualiza.map(l => ({
            codigo: l.codigo,
            negocio: (l.linha as any).negocio,
            observacoes: (l.linha as any).observacoes,
            marcador: (l.linha as any).marcador,
          })),
          encontrados,
          marcadoresPorNome,
        );

        setReencontro({ classificacao, resumo });
        // Arquivo inteiro sem código é importação de base nova: a caixinha nasce marcada e
        // tudo segue como sempre foi. Arquivo misto é volta de exportação, e célula vazia ali
        // é mais provavelmente acidente do que negócio novo de propósito.
        setCriarOsSemCodigo(classificacao.arquivoInteiroSemCodigo);
      } catch (err) {
        if (!cancelado) {
          setReencontro(null);
          toast.error(`Não foi possível conferir os códigos: ${mensagemDeErro(err)}`);
        }
      } finally {
        if (!cancelado) setConferindoCodigos(false);
      }
    })();

    return () => { cancelado = true; };
  }, [step, previewRows, empresaId]);
```

Acrescente o import de `mensagemDeErro` se ainda não existir no arquivo:

```tsx
import { mensagemDeErro } from '@/lib/mensagem-de-erro';
```

- [ ] **Passo 3: O bloco do aviso na tela**

No passo `preview`, **depois** do bloco `{avisoDeResponsaveis && (...)}`, acrescente:

```tsx
            {conferindoCodigos && (
              <div className="rounded-xl border border-border/50 bg-card p-4 text-[11px] text-muted-foreground">
                Conferindo os Códigos/ID contra os negócios já cadastrados…
              </div>
            )}

            {reencontro && !conferindoCodigos && (
              <div className="rounded-xl border border-border/50 bg-card p-4 flex flex-col gap-3">
                {/* Conta que dá zero não aparece. Um arquivo saudável mostra uma linha só, e é
                    isso que faz as outras chamarem atenção quando surgem. */}
                {reencontro.resumo.negocios.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    {textoDoResumoDeAlteracoes(reencontro.resumo).map(frase => (
                      <p key={frase} className="text-[11px] leading-relaxed text-foreground">{frase}</p>
                    ))}
                    <details className="text-[11px] text-muted-foreground">
                      <summary className="cursor-pointer select-none font-medium text-primary">
                        Ver o que muda nas primeiras linhas
                      </summary>
                      <ul className="mt-2 flex list-none flex-col gap-2 p-0">
                        {reencontro.resumo.negocios.slice(0, 20).map(n => (
                          <li key={n.id} className="rounded-lg bg-muted/40 p-2">
                            <span className="font-semibold text-foreground">{n.rotulo}</span>
                            {n.alteracoes.map(a => (
                              <div key={a.campo} className="mt-0.5">
                                <span className="uppercase tracking-wide">{a.campo === 'marcador_id' ? 'marcador' : a.campo}</span>
                                {': '}
                                <span className="line-through opacity-60">{a.de || '(vazio)'}</span>
                                {' → '}
                                <span className="text-foreground">{a.para}</span>
                              </div>
                            ))}
                          </li>
                        ))}
                      </ul>
                      {reencontro.resumo.negocios.length > 20 && (
                        <p className="mt-2">E mais {reencontro.resumo.negocios.length - 20} negócio(s).</p>
                      )}
                    </details>
                  </div>
                )}

                {reencontro.classificacao.semCodigo.length > 0 && (
                  <label className="flex items-start gap-2 text-[11px] leading-relaxed text-foreground">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={criarOsSemCodigo}
                      onChange={e => setCriarOsSemCodigo(e.target.checked)}
                    />
                    <span>
                      <strong>{reencontro.classificacao.semCodigo.length} linha(s) não têm Código/ID.</strong>{' '}
                      Marque para cadastrá-las como negócios novos; desmarque para descartá-las.
                    </span>
                  </label>
                )}

                {reencontro.classificacao.naoEncontrado.length > 0 && (
                  <p className="text-[11px] leading-relaxed text-amber-800">
                    <strong>{reencontro.classificacao.naoEncontrado.length} linha(s) trazem um Código/ID que
                    não existe aqui</strong> — foram recusadas. Ou o código está errado, ou o negócio é de
                    outra empresa. Linhas:{' '}
                    {reencontro.classificacao.naoEncontrado.slice(0, 10).map(l => l.indice + 2).join(', ')}
                    {reencontro.classificacao.naoEncontrado.length > 10 ? '…' : ''}
                  </p>
                )}

                {reencontro.classificacao.repetido.length > 0 && (
                  <p className="text-[11px] leading-relaxed text-destructive">
                    <strong>{reencontro.classificacao.repetido.length} linha(s) repetem um Código/ID já usado
                    no arquivo</strong> — todas foram recusadas. Duas linhas mandando coisas diferentes no
                    mesmo negócio é contradição, e o sistema não escolhe por você. Linhas:{' '}
                    {reencontro.classificacao.repetido.slice(0, 10).map(l => l.indice + 2).join(', ')}
                    {reencontro.classificacao.repetido.length > 10 ? '…' : ''}
                  </p>
                )}
              </div>
            )}
```

> `l.indice + 2` converte para o número da linha no Excel: o índice começa em 0 e a planilha tem
> uma linha de cabeçalho.

- [ ] **Passo 4: Conferir na tela**

Rode `npm run dev` e, em `/app`, abra Importar Negócios com uma planilha exportada do próprio
sistema. Confira, nesta ordem:

1. Sem editar nada → o bloco aparece **sem** a linha de alterações (zero não aparece), e a
   caixinha do "sem código" não existe porque não há linha sem código.
2. Apague a célula de código de uma linha → a caixinha aparece **desmarcada**.
3. Troque um código por `abc` → aparece a linha de "não existe aqui".

- [ ] **Passo 5: Conferir que nada quebrou**

```bash
npm run test
```
Esperado: **≥ 1.201 verdes** — esta tarefa não acrescenta teste, então o número não muda.

```bash
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -cE "error TS"
```
Esperado: **31**.

```bash
npx eslint src/components/pedidos/ImportPedidosDialog.tsx
```
Esperado: nenhum erro **novo** em relação ao que o arquivo já tinha.

- [ ] **Passo 6: Commitar**

`git status --short` numa chamada separada, depois:

```bash
git commit -m "feat(importacao): a previa mostra a conta antes de gravar

O passo \"conferir\" passa a separar as linhas em quatro contas: quantos
negocios serao atualizados (com o resumo por campo e o de-para das primeiras
linhas), quantas linhas estao sem codigo, quantas trazem codigo inexistente e
quantas repetem um codigo do proprio arquivo.

Conta que da zero nao aparece: arquivo saudavel mostra uma linha so, e e isso
que faz as outras chamarem atencao quando surgem.

A caixinha dos \"sem codigo\" nasce marcada apenas quando o arquivo inteiro
esta sem codigo - ai e importacao de base nova e nada muda. Arquivo misto e
volta de exportacao, e celula vazia ali e mais provavelmente acidente.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" --only -- src/components/pedidos/ImportPedidosDialog.tsx
```

---

## Tarefa 5: A gravação, contando o que o banco aceitou

**Arquivos:**
- Modificar: `src/hooks/use-bulk-import.ts` — nova função exportada pelo hook
- Criar teste: `src/hooks/atualizacao-por-codigo.test.ts`

**Interfaces:**
- Consome: `AlteracaoDeNegocio` (Tarefa 3).
- Produz, para a Tarefa 6:
  `atualizarNegociosPorCodigo(alteracoes: AlteracaoDeNegocio[], aoProgredir?: (feitos: number) => void): Promise<ResultadoDaAtualizacao>`
  com `interface ResultadoDaAtualizacao { pedidos: number; aceitos: number; recusados: number; motivos: Record<string, number> }`

- [ ] **Passo 1: Escrever o teste que falha**

Crie `src/hooks/atualizacao-por-codigo.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { contarResultadoDaAtualizacao } from './use-bulk-import';

describe('contarResultadoDaAtualizacao', () => {
  it('🔴 conta o que o banco DEVOLVEU, não o que foi pedido', () => {
    // A regra de segurança recusa em silêncio: um vendedor comum só edita os próprios
    // negócios, e `update` de linha alheia não dá erro — simplesmente não altera nada.
    // Prometer 3 e ter mudado 1 é pior do que não avisar (dívida técnica item 47).
    const r = contarResultadoDaAtualizacao(3, [{ id: 'a' }], []);
    expect(r).toEqual({ pedidos: 3, aceitos: 1, recusados: 2, motivos: {} });
  });

  it('sem recusa, aceitos é igual a pedidos', () => {
    const r = contarResultadoDaAtualizacao(2, [{ id: 'a' }, { id: 'b' }], []);
    expect(r).toMatchObject({ pedidos: 2, aceitos: 2, recusados: 0 });
  });

  it('erro de verdade entra em motivos, agrupado', () => {
    const r = contarResultadoDaAtualizacao(2, [], ['tempo esgotado', 'tempo esgotado']);
    expect(r.motivos).toEqual({ 'tempo esgotado': 2 });
    expect(r.recusados).toBe(2);
  });

  it('nada pedido devolve tudo zerado', () => {
    expect(contarResultadoDaAtualizacao(0, [], [])).toEqual({
      pedidos: 0, aceitos: 0, recusados: 0, motivos: {},
    });
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Rode: `npx vitest run src/hooks/atualizacao-por-codigo.test.ts`
Esperado: FALHA — `contarResultadoDaAtualizacao is not a function`.

- [ ] **Passo 3: Escrever a implementação**

Em `src/hooks/use-bulk-import.ts`, acrescente **fora** do hook (no topo do arquivo, depois dos
imports) — é o que permite testar sem montar React:

```ts
import type { AlteracaoDeNegocio } from '@/lib/import/alteracoes-por-codigo';

export interface ResultadoDaAtualizacao {
  /** Quantos negócios a planilha mandou alterar. */
  pedidos: number;
  /** Quantos o banco de fato alterou. */
  aceitos: number;
  recusados: number;
  /** Erro de verdade, agrupado pela frase. Recusa silenciosa não aparece aqui. */
  motivos: Record<string, number>;
}

/**
 * A conta honesta do que aconteceu.
 *
 * 🔴 SEPARADA DA GRAVAÇÃO DE PROPÓSITO, para poder ser testada sem banco — e porque a regra
 * que ela carrega é a mais fácil de errar do trabalho inteiro.
 *
 * A política de `pedidos` deixa um vendedor comum EDITAR só os próprios negócios (ele VÊ os
 * da empresa toda, o que é outra coisa). Um `update` numa linha que a política recusa **não
 * dá erro**: ele simplesmente não altera nada e devolve zero linhas. Então "quantos foram
 * alterados" só se sabe contando o que voltou do `select()` da gravação — nunca somando o
 * que foi pedido.
 */
export function contarResultadoDaAtualizacao(
  pedidos: number,
  devolvidos: Array<{ id: string }>,
  errosDeVerdade: string[],
): ResultadoDaAtualizacao {
  const motivos: Record<string, number> = {};
  for (const motivo of errosDeVerdade) {
    const chave = motivo.length > 80 ? `${motivo.slice(0, 80)}…` : motivo;
    motivos[chave] = (motivos[chave] ?? 0) + 1;
  }
  const aceitos = devolvidos.length;
  return { pedidos, aceitos, recusados: Math.max(0, pedidos - aceitos), motivos };
}
```

E **dentro** do `useBulkImport`, junto das outras funções que ele devolve:

```ts
  /**
   * Grava as alterações vindas da planilha.
   *
   * Uma gravação POR NEGÓCIO, e isso é inevitável: cada um recebe valores diferentes, então
   * não existe um `update` só que sirva para todos. Segue o mesmo limite de 4 em paralelo da
   * inserção — mais que isso não acelera (a regra de segurança do banco é o gargalo) e
   * atrapalha o resto do app.
   */
  async function atualizarNegociosPorCodigo(
    alteracoes: AlteracaoDeNegocio[],
    aoProgredir?: (feitos: number) => void,
  ): Promise<ResultadoDaAtualizacao> {
    const devolvidos: Array<{ id: string }> = [];
    const erros: string[] = [];
    let feitos = 0;

    const fila = [...alteracoes];
    const trabalhador = async () => {
      for (;;) {
        const item = fila.shift();
        if (!item) return;
        try {
          const { data, error } = await supabase
            .from('pedidos')
            .update(item.patch)
            .eq('id', item.id)
            .select('id');
          if (error) throw error;
          // Vazio aqui NÃO é erro: é a política do banco recusando em silêncio.
          if (data && data.length > 0) devolvidos.push({ id: item.id });
        } catch (err) {
          erros.push(mensagemDeErro(err, 'Não foi possível atualizar'));
        } finally {
          feitos += 1;
          aoProgredir?.(feitos);
        }
      }
    };

    await Promise.all([trabalhador(), trabalhador(), trabalhador(), trabalhador()]);
    return contarResultadoDaAtualizacao(alteracoes.length, devolvidos, erros);
  }
```

Acrescente `atualizarNegociosPorCodigo` ao objeto que o hook devolve, e o import de
`mensagemDeErro`:

```ts
import { mensagemDeErro } from '@/lib/mensagem-de-erro';
```

- [ ] **Passo 4: Rodar o teste e ver passar**

Rode: `npx vitest run src/hooks/atualizacao-por-codigo.test.ts`
Esperado: **4 passando.**

- [ ] **Passo 5: Commitar**

`git status --short` numa chamada separada, depois:

```bash
git add src/hooks/atualizacao-por-codigo.test.ts
git commit -m "feat(importacao): grava as alteracoes e conta o que o banco ACEITOU

Uma gravacao por negocio (cada um recebe valores diferentes), com o mesmo
limite de 4 em paralelo que a insercao ja usa.

O ponto delicado, isolado numa funcao pura com teste: a politica de pedidos
deixa vendedor comum EDITAR so os proprios negocios - ele VE os da empresa
toda, o que e outra coisa - e a recusa e SILENCIOSA. O update nao da erro,
apenas nao altera nada. Entao \"quantos mudaram\" sai do select() da gravacao,
nunca da soma do que foi pedido. Prometer 38 e ter mudado 20 seria pior que
nao avisar.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" --only -- src/hooks/use-bulk-import.ts src/hooks/atualizacao-por-codigo.test.ts
```

---

## Tarefa 6: Ligar a confirmação e contar na tela final

**Arquivos:**
- Modificar: `src/components/pedidos/ImportPedidosDialog.tsx` — `handleImport` (o bloco que hoje
  chama `importNegocios`, ~linha 495) e a tela do passo `done` (~linha 967)

**Interfaces:**
- Consome: `reencontro` e `criarOsSemCodigo` (Tarefa 4); `atualizarNegociosPorCodigo` e
  `ResultadoDaAtualizacao` (Tarefa 5).
- Produz: nada — é a última tarefa.

- [ ] **Passo 1: A confirmação separa os dois caminhos**

Em `handleImport`, **antes** da linha `const summary = await importNegocios(...)`, acrescente:

```tsx
      // Dois caminhos, e eles não se misturam: quem tem código é ATUALIZADO, quem não tem é
      // CADASTRADO (e só se a pessoa deixou a caixinha marcada). Recusado por código
      // inexistente ou repetido não entra em nenhum dos dois — foi decidido na prévia.
      let resultadoAtualizacao: ResultadoDaAtualizacao | null = null;
      if (reencontro && reencontro.resumo.negocios.length > 0) {
        const avisoAtualizacao = toast.loading(
          `Atualizando ${reencontro.resumo.negocios.length} negócio(s)...`,
        );
        resultadoAtualizacao = await atualizarNegociosPorCodigo(
          reencontro.resumo.negocios,
          feitos => toast.loading(
            `Atualizando... ${feitos} de ${reencontro.resumo.negocios.length}`,
            { id: avisoAtualizacao },
          ),
        );
        toast.dismiss(avisoAtualizacao);
      }
```

E troque a linha do `importNegocios` para só receber as linhas que devem virar negócio novo:

```tsx
      // Só o balde "sem código", e só com a caixinha marcada. Sem o reencontro (planilha sem a
      // coluna Código/ID mapeada) tudo entra, que é o comportamento de sempre.
      const indicesParaCadastrar = reencontro
        ? new Set(criarOsSemCodigo ? reencontro.classificacao.semCodigo.map(l => l.indice) : [])
        : null;
      const linhasParaCadastrar = indicesParaCadastrar
        ? enrichedRows.filter((_, i) => indicesParaCadastrar.has(i))
        : enrichedRows;

      const summary = linhasParaCadastrar.length > 0
        ? await importNegocios(linhasParaCadastrar, undefined, funilId, empresaId)
        : { total: 0, inserted: 0, ignored: 0, motivosFalha: {} };
```

> 🔴 Os índices de `enrichedRows` batem com os de `previewRows` porque `enrichedRows` é
> `rows.map(...)`, um-para-um e na mesma ordem. Se alguém acrescentar um `filter` ali, esta
> correspondência quebra em silêncio — e as linhas erradas seriam cadastradas.

Acrescente `atualizarNegociosPorCodigo` à desestruturação de `useBulkImport()` no componente.

- [ ] **Passo 2: A tela final conta as duas coisas**

No `setImportResult({...})`, acrescente os campos novos:

```tsx
        atualizados: resultadoAtualizacao?.aceitos ?? 0,
        atualizacoesRecusadas: resultadoAtualizacao?.recusados ?? 0,
        naoEncontrados: reencontro?.classificacao.naoEncontrado.length ?? 0,
        repetidos: reencontro?.classificacao.repetido.length ?? 0,
```

Acrescente os quatro ao tipo de `importResult` (procure a `interface` ou o `useState` dele no
topo do arquivo) como `number`.

E no passo `done`, acrescente depois do bloco que hoje mostra os inseridos:

```tsx
              {importResult.atualizados > 0 && (
                <p className="text-sm text-foreground">
                  <strong>{importResult.atualizados}</strong> negócio(s) atualizado(s).
                </p>
              )}

              {/* 🔴 A frase mais importante desta tela. Sem ela, a pessoa acha que alterou 38
                  quando alterou 20 — e só descobre semanas depois, se descobrir. */}
              {importResult.atualizacoesRecusadas > 0 && (
                <p className="text-sm text-amber-800">
                  <strong>{importResult.atualizacoesRecusadas}</strong> negócio(s) não puderam ser
                  alterados. O mais provável é que sejam de outra pessoa: só é possível editar os
                  próprios negócios, a menos que você seja gestor ou tenha a permissão de editar
                  Negócios.
                </p>
              )}

              {(importResult.naoEncontrados > 0 || importResult.repetidos > 0) && (
                <p className="text-sm text-muted-foreground">
                  {importResult.naoEncontrados > 0 && `${importResult.naoEncontrados} linha(s) com Código/ID inexistente. `}
                  {importResult.repetidos > 0 && `${importResult.repetidos} linha(s) com Código/ID repetido. `}
                  Nenhuma delas entrou.
                </p>
              )}
```

- [ ] **Passo 3: Invalidar os painéis certos**

Onde hoje estão os quatro `qc.invalidateQueries`, troque por:

```tsx
      // A lista completa de chaves que dependem de `pedidos` — inclui painéis que não parecem
      // ligados, como o faturamento mensal e o Plano de Vendas (CLAUDE.md §6.6). Atualizar um
      // negócio muda o mesmo dado que criar um.
      invalidarPaineisDeNegocios(qc);
      qc.invalidateQueries({ queryKey: ['clientes'] });
```

Com o import:

```tsx
import { invalidarPaineisDeNegocios } from '@/hooks/use-pedidos';
```

- [ ] **Passo 4: O ensaio ponta a ponta**

Rode `npm run dev` e faça, na MD, exatamente o ensaio do desenho §8:

1. Exportar negócios → a planilha sai com **14 colunas**, a última "Código/ID" preenchida.
2. **Reimportar sem editar nada** → o aviso diz **0 alterações**.
   🔴 Se aparecer "12.324 mudam no nome", a regra do nome (Tarefa 3) não está funcionando —
   **pare e conserte antes de seguir.**
3. Montar um arquivo de **7 linhas**, de negócios diferentes: 3 com Observação editada e código
   intacto · 1 com o código apagado · 1 com código inventado · 2 carregando o **mesmo** código
   (o de um sexto negócio, colado duas vezes). Reimportar → o aviso diz **3 atualizações ·
   1 sem código · 1 não encontrado · 2 repetidas**, e a caixinha está **desmarcada**.
4. Confirmar → a tela final diz 3 atualizados. Abrir um dos 3 e conferir no histórico que a
   alteração ficou registrada.

- [ ] **Passo 5: A verificação completa**

```bash
npm run test
```
Esperado: **≥ 1.205 verdes** (1.170 + 6 + 12 + 13 + 4), 0 falhando.

```bash
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -cE "error TS"
```
Esperado: **31**.

```bash
npm run build
```
Esperado: compila.

```bash
npx eslint .
```
Esperado: **433** problemas. Não pode subir.

- [ ] **Passo 6: Commitar**

`git status --short` numa chamada separada, depois:

```bash
git commit -m "feat(importacao): confirmar atualiza os que tem codigo e cadastra so os escolhidos

Fecha a ida e volta: exportar, anotar no Excel e devolver ao CRM sem duplicar.

Os dois caminhos nao se misturam - quem tem codigo e atualizado, quem nao tem
e cadastrado apenas se a caixinha ficou marcada, e o que foi recusado na
previa nao entra em nenhum dos dois.

A tela final conta o que o banco aceitou, e diz quando alguma alteracao foi
recusada por ser de outra pessoa. Invalida a lista inteira de paineis que
dependem de pedidos (CLAUDE.md 6.6): atualizar um negocio move o mesmo numero
que criar um.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" --only -- src/components/pedidos/ImportPedidosDialog.tsx
```

---

## Depois de tudo pronto

- [ ] **Atualizar a dívida técnica.** `docs/divida-tecnica.md` — o item que descreve a
  deduplicação removida ganha a nota de que a ida e volta por Código/ID passou a existir. **Não**
  marque nada como resolvido: a deduplicação por conteúdo continua sem existir de propósito, e a
  planilha do Bitrix continua sem código.
- [ ] **Avisar o dono do produto** do que ficou de fora e continua valendo: a planilha ainda não
  carrega o nome que veio do Bitrix (11.453 negócios da MD), que é o item §9 do desenho.
- [ ] 🔴 **Não publicar.** `git push` coloca no ar em minutos, e quem decide é o dono do produto.
