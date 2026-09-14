# Tela "Hoje": contraste, rosto do responsável e colunas ajustáveis — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tabela do time mostra o rosto de cada responsável, cabe no espaço da página e deixa ajustar as colunas; todo o bloco "No geral" ganha o contraste do dashboard de referência; a pauta vazia aponta para a tabela com um botão; e a lista de sons perde o rótulo "Criados pela Repply".

**Architecture:** As duas funções de banco da tabela (`negocios_em_risco_de` e `negocios_em_risco`) passam a devolver o identificador e a foto do dono — é a única mudança no banco, e nenhuma regra de quem vê o quê muda. O resto é tela: quatro regras puras novas em `src/lib/` (iniciais, larguras de coluna, frase do aviso, "é meu?"), a tabela do time, o Radar, os estados vazios de `Hoje.tsx` e o cartão de sons.

**Tech Stack:** React 18 + TypeScript + Vite, Tailwind 3.4, shadcn/Radix (`Avatar`, `Button`), TanStack Query v5, Vitest + Testing Library (jsdom), Postgres/Supabase.

**Desenho:** `docs/superpowers/specs/2026-09-14-hoje-contraste-rostos-e-colunas-design.md`

**Quem executa:** as Tarefas 1 a 8, um subagente por tarefa. A Tarefa 9, o controlador — ela tem os portões do dono do produto.

## Global Constraints

- 🔴 **Dado real não entra em teste, plano, comentário nem migration** (CLAUDE.md §6.9). Use "Ana Souza", "Bruno Lima", "Obra Exemplo", 180000.
- 🔴 **Cor sempre por token do projeto** (CLAUDE.md §8), nunca valor solto. Opacidade sobre token vale: `bg-foreground/[0.06]`.
- 🔴 `tsconfig.app.json` fixa `lib: ["ES2020", ...]`: nada de `replaceAll`, `Array.prototype.at` ou outra API de ES2021+.
- 🔴 **Índice do git compartilhado com outras sessões** (há outras trabalhando na mesma pasta agora): nunca `git add -A`, `git add .`, `git commit -a` nem `git stash`; não toque em arquivo que não é da sua tarefa, mesmo que apareça modificado no `git status`. Arquivo novo: `git add -N <arquivo>`; commit: `git commit -m "<msg>" --only -- <caminhos>`.
- Mensagem de commit sem acento, terminando com `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- 🔴 **Nada é publicado antes da Tarefa 9** — nem `git push`, nem migration aplicada.
- 🔴 **`localStorage` sempre dentro de `try/catch`:** aba anônima e navegador que bloqueia armazenamento lançam erro ao ler e ao gravar.
- 🔴 **Mudar o `RETURNS TABLE` exige `DROP` + `CREATE`, e o `DROP` apaga a permissão em silêncio.** Medido em 14/09/2026, de manhã e de novo na revisão deste plano:

  | função | `md5(prosrc)` hoje | permissão hoje | `md5(prosrc)` depois |
  |---|---|---|---|
  | `negocios_em_risco_de(uuid, uuid[], uuid[], uuid, integer, text[], integer, integer)` | `dc3e5f918b165fc8c27abfb1bbd40365` (3.149) | `postgres=X/postgres \| service_role=X/postgres` | `6bc82788c32cd8f3ee3cc8be39918a9f` (3.239) |
  | `negocios_em_risco(uuid[], uuid[], uuid, integer, text[], integer, integer)` | `128b6304a969066943f8954776237830` (327) | `postgres=X/postgres \| authenticated=X/postgres \| service_role=X/postgres` | `4068e9627a824d2a2e1233d94ffa3a21` (376) |

  O "depois" foi calculado a partir do corpo que está no ar, copiado de `pg_get_functiondef` e conferido byte a byte pelo md5. Conferido também em 14/09/2026: nenhuma outra função, dependência registrada ou tarefa agendada do banco cita as duas; `usuarios.avatar_url` é `text` e `pedidos.usuario_id` é `uuid`.
- 🔴 **O espaço da tabela do time na página é 926 px** — em notebook 1366x768 e em monitor grande, igual: a página "Hoje" tem no máximo 1.024 px (`max-w-5xl`), menos 24 px de respiro de cada lado, 1 px de borda e 24 px de respiro do cartão de cada lado. As larguras-padrão da Tarefa 5 somam exatamente isso, a partir de medidas feitas no navegador em 14/09/2026 (com Satoshi e com a fonte do sistema, a diferença foi de 1 a 2 px):
  - botões: "Abrir negócio" 111 px; "Retomar depois" 125 px; "Ver a tabela" 99 px;
  - números: "R$ 9.999.999,99" 126 px; "999 dias" 68 px;
  - títulos: "Sem mexer há" 79 px; "Responsável" 70 px.
- Verificação: `npx vitest run <arquivos>`; `npx tsc --noEmit -p tsconfig.app.json` (linha de base de 14/09/2026: 36 erros herdados, nenhum nos arquivos deste plano — outras sessões podem mudar o total, então o critério é **nenhum erro nos arquivos tocados**); `npm run build`.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade | Tarefa |
|---|---|---|
| `src/lib/iniciais.ts` e `iniciais.test.ts` (novos) | as letras do círculo da foto | 1 |
| `src/components/pedidos/CampoDeResponsaveis.tsx` | passa a importar `iniciais` | 1 |
| `src/lib/larguras-de-colunas.ts` e `larguras-de-colunas.test.ts` (novos) | largura-padrão, mínima, ler e gravar o guardado | 2 |
| `supabase/migrations/20260914153000_tabela_do_time_com_rosto.sql` (novo) | as duas funções devolvem `responsavel_id` e `responsavel_avatar` | 3 |
| `src/integrations/supabase/types.ts` | o retorno de `negocios_em_risco` ganha as duas colunas | 3 |
| `src/hooks/use-dashboard.ts` | o tipo `NegocioEmRisco` ganha as duas colunas | 3 |
| `supabase/functions/pauta-resumo-diario/corpo.ts` | o tipo `NegocioDaEquipe` ganha as duas colunas | 3 |
| `src/components/pauta/TabelaDoTime.tsx` | rosto, botão laranja, faixa do título e âncora (4); larguras e alças (5) | 4, 5 |
| `src/components/pauta/tabela-do-time.test.tsx` | prende rosto, botão e âncora (4); larguras (5) | 4, 5 |
| `src/components/pauta/RadarDeRisco.tsx` | contraste nos cartões, no resumo por fabricante e no gráfico | 6 |
| `src/components/pauta/radar-ordem.test.tsx` | prende o rótulo sem caixa-alta | 6 |
| `src/lib/aviso-da-tabela.ts` e `aviso-da-tabela.test.ts` (novos) | a frase do aviso da pauta vazia | 7 |
| `src/lib/responsavel-para-o-dialogo.ts` e `responsavel-para-o-dialogo.test.ts` (novos) | "é meu?" pelo identificador, com volta pelo nome | 7 |
| `src/pages/Hoje.tsx` | aviso com botão; "é meu?" pelo identificador | 7 |
| `src/pages/hoje-estados.test.tsx` e `src/pages/Hoje.test.tsx` | prendem o aviso nos estados vazios | 7 |
| `src/components/configuracoes/CardDeSom.tsx` e `CardDeSom.test.tsx` | sai o rótulo | 8 |
| `docs/divida-tecnica.md` | o item 69 vai para "Resolvidos" | 8 |

---

### Task 1: As iniciais num lugar só

**Files:**
- Create: `src/lib/iniciais.ts`
- Test: `src/lib/iniciais.test.ts`
- Modify: `src/components/pedidos/CampoDeResponsaveis.tsx` (import na linha 4; função local na linha 57)

**Interfaces:**
- Consumes: nada.
- Produces: `iniciais(nome: string): string` — usada pela Tarefa 4.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/lib/iniciais.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { iniciais } from './iniciais';

/**
 * O QUE ESTE ARQUIVO PRENDE: as letras do círculo da foto quando a pessoa não tem foto. Duas telas
 * desenham esse círculo — o campo de responsáveis do negócio e a tabela do time da tela "Hoje" —,
 * e a mesma pessoa não pode aparecer com letras diferentes em cada uma.
 */
describe('iniciais', () => {
  it('nome e sobrenome: a primeira letra de cada', () => {
    expect(iniciais('Ana Souza')).toBe('AS');
  });

  it('nome composto: a primeira do primeiro nome e a do último', () => {
    expect(iniciais('Ana Maria de Souza')).toBe('AS');
  });

  it('um nome só: as duas primeiras letras', () => {
    expect(iniciais('Ana')).toBe('AN');
  });

  it('espaços sobrando não viram letra', () => {
    expect(iniciais('  Bruno   Lima  ')).toBe('BL');
  });

  it('nome vazio vira interrogação, e não um círculo em branco', () => {
    expect(iniciais('')).toBe('?');
    expect(iniciais('   ')).toBe('?');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run src/lib/iniciais.test.ts
```

Esperado: FALHA com `Failed to resolve import "./iniciais"`.

- [ ] **Step 3: Escrever a função**

Criar `src/lib/iniciais.ts`:

```ts
/**
 * As letras do círculo da foto quando a pessoa não tem foto: a primeira do primeiro nome e a do
 * último, ou as duas primeiras de um nome só.
 *
 * Mora aqui, e não dentro de cada tela, porque duas telas desenham o mesmo círculo — o campo de
 * responsáveis do negócio e a tabela do time da tela "Hoje". Duas cópias da mesma regra divergem
 * em silêncio, e a mesma pessoa apareceria com letras diferentes em cada lugar.
 */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
npx vitest run src/lib/iniciais.test.ts
```

Esperado: `Tests 5 passed`.

- [ ] **Step 5: `CampoDeResponsaveis` usa a função compartilhada**

Em `src/components/pedidos/CampoDeResponsaveis.tsx`:
- remover a função local inteira (linha 57):

```ts
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}
```

- e acrescentar, logo abaixo da linha `import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';`:

```ts
import { iniciais } from '@/lib/iniciais';
```

Se houver comentário logo acima da função local que só fale dela, remova junto.

- [ ] **Step 6: Conferir que o campo continua igual**

```bash
npx vitest run src/lib/iniciais.test.ts src/components/pedidos/CampoDeResponsaveis.test.tsx src/components/pedidos/CampoDeResponsaveis.foto.test.tsx
```

Esperado: todos passam.

- [ ] **Step 7: Commitar**

```bash
git add -N src/lib/iniciais.ts src/lib/iniciais.test.ts
git commit -m "refactor(pessoas): as iniciais do circulo da foto passam a morar num lugar so

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" --only -- src/lib/iniciais.ts src/lib/iniciais.test.ts src/components/pedidos/CampoDeResponsaveis.tsx
```

---

### Task 2: A regra das larguras de coluna

**Files:**
- Create: `src/lib/larguras-de-colunas.ts`
- Test: `src/lib/larguras-de-colunas.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces (usadas pela Tarefa 5):
  - `type ColunaAjustavel = { chave: string; padrao: number; minima: number }`
  - `type Larguras = Record<string, number>`
  - `largurasPadrao(colunas: ColunaAjustavel[]): Larguras`
  - `lerLarguras(chaveGuardada: string, colunas: ColunaAjustavel[], armazenamento?: Pick<Storage, 'getItem'> | null): Larguras`
  - `gravarLarguras(chaveGuardada: string, larguras: Larguras, armazenamento?: Pick<Storage, 'setItem'> | null): void`
  - `ajustarLargura(larguras: Larguras, coluna: ColunaAjustavel, novaLargura: number): Larguras`
  - `restaurarColuna(larguras: Larguras, coluna: ColunaAjustavel): Larguras`
  - `somaDasLarguras(larguras: Larguras, colunas: ColunaAjustavel[]): number`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/lib/larguras-de-colunas.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  ajustarLargura,
  gravarLarguras,
  largurasPadrao,
  lerLarguras,
  restaurarColuna,
  somaDasLarguras,
  type ColunaAjustavel,
} from './larguras-de-colunas';

/**
 * O QUE ESTE ARQUIVO PRENDE: a tabela do time nasce cabendo na página e guarda o ajuste de cada
 * pessoa no navegador dela — e NUNCA quebra por causa do guardado. O `localStorage` pode vir vazio,
 * com texto que não é JSON, com uma coluna a menos, ou lançar erro (aba anônima, navegador que
 * bloqueia). Em todos esses casos vale a largura-padrão.
 */

const COLUNAS: ColunaAjustavel[] = [
  { chave: 'negocio', padrao: 200, minima: 140 },
  { chave: 'valor', padrao: 110, minima: 90 },
];
const CHAVE = 'teste_larguras_v1';

function armazenamento(inicial: Record<string, string> = {}) {
  const dados = { ...inicial };
  return {
    dados,
    getItem: (k: string) => (k in dados ? dados[k] : null),
    setItem: (k: string, v: string) => {
      dados[k] = v;
    },
  };
}

const quebrado = {
  getItem: (): string | null => {
    throw new Error('bloqueado');
  },
  setItem: (): void => {
    throw new Error('bloqueado');
  },
};

describe('larguras de colunas', () => {
  it('sem nada guardado, vale a largura-padrão', () => {
    expect(lerLarguras(CHAVE, COLUNAS, armazenamento())).toEqual({ negocio: 200, valor: 110 });
  });

  it('o guardado válido é o que vale', () => {
    const a = armazenamento({ [CHAVE]: JSON.stringify({ negocio: 260, valor: 120 }) });
    expect(lerLarguras(CHAVE, COLUNAS, a)).toEqual({ negocio: 260, valor: 120 });
  });

  it('🔴 guardado quebrado volta ao padrão, e não quebra a tabela', () => {
    expect(lerLarguras(CHAVE, COLUNAS, armazenamento({ [CHAVE]: 'isto não é json' }))).toEqual(
      largurasPadrao(COLUNAS),
    );
    expect(lerLarguras(CHAVE, COLUNAS, armazenamento({ [CHAVE]: '42' }))).toEqual(largurasPadrao(COLUNAS));
    expect(lerLarguras(CHAVE, COLUNAS, armazenamento({ [CHAVE]: '[1,2]' }))).toEqual(largurasPadrao(COLUNAS));
  });

  it('coluna que não estava no guardado nasce na largura-padrão', () => {
    const a = armazenamento({ [CHAVE]: JSON.stringify({ negocio: 260 }) });
    expect(lerLarguras(CHAVE, COLUNAS, a)).toEqual({ negocio: 260, valor: 110 });
  });

  it('largura guardada abaixo da mínima sobe para a mínima; valor inválido volta ao padrão', () => {
    const a = armazenamento({ [CHAVE]: JSON.stringify({ negocio: 10, valor: 'x' }) });
    expect(lerLarguras(CHAVE, COLUNAS, a)).toEqual({ negocio: 140, valor: 110 });
  });

  it('🔴 localStorage que lança erro não quebra nem a leitura nem a gravação', () => {
    expect(lerLarguras(CHAVE, COLUNAS, quebrado)).toEqual(largurasPadrao(COLUNAS));
    expect(() => gravarLarguras(CHAVE, { negocio: 200, valor: 110 }, quebrado)).not.toThrow();
  });

  it('gravar guarda o que a leitura devolve depois', () => {
    const a = armazenamento();
    gravarLarguras(CHAVE, { negocio: 230, valor: 100 }, a);
    expect(lerLarguras(CHAVE, COLUNAS, a)).toEqual({ negocio: 230, valor: 100 });
  });

  it('ajustar respeita a mínima e arredonda', () => {
    const base = largurasPadrao(COLUNAS);
    expect(ajustarLargura(base, COLUNAS[0], 50).negocio).toBe(140);
    expect(ajustarLargura(base, COLUNAS[0], 250.6).negocio).toBe(251);
  });

  it('restaurar volta aquela coluna, e só ela, ao padrão', () => {
    expect(restaurarColuna({ negocio: 300, valor: 130 }, COLUNAS[0])).toEqual({ negocio: 200, valor: 130 });
  });

  it('a soma é o tamanho da tabela', () => {
    expect(somaDasLarguras({ negocio: 200, valor: 110 }, COLUNAS)).toBe(310);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run src/lib/larguras-de-colunas.test.ts
```

Esperado: FALHA com `Failed to resolve import "./larguras-de-colunas"`.

- [ ] **Step 3: Escrever a regra**

Criar `src/lib/larguras-de-colunas.ts`:

```ts
/**
 * AS LARGURAS DAS COLUNAS DE UMA TABELA QUE A PESSOA PODE AJUSTAR — pedido do dono do produto em
 * 14/09/2026 para a tabela do time da tela "Hoje": por padrão tudo cabe no espaço da página, e
 * quem quiser arrasta a borda do título. O ajuste fica guardado NO NAVEGADOR daquela pessoa.
 *
 * 🔴 O GUARDADO NUNCA QUEBRA A TABELA. `localStorage` pode lançar erro (aba anônima, navegador que
 * bloqueia armazenamento) e pode trazer lixo — texto que não é JSON, uma versão antiga com uma
 * coluna a menos, um número negativo. Em qualquer desses casos vale a largura-padrão da coluna.
 *
 * Regra pura, sem React: é o que deixa testar cada caso sem montar a tabela.
 */
export type ColunaAjustavel = {
  /** Nome estável da coluna no guardado. Mudar o nome perde o ajuste que as pessoas fizeram. */
  chave: string;
  /** Largura em pixels com que a coluna nasce. */
  padrao: number;
  /** Menor largura aceita: sem ela, arrastar podia esmagar a coluna até sumir. */
  minima: number;
};

export type Larguras = Record<string, number>;

type Leitor = Pick<Storage, 'getItem'>;
type Gravador = Pick<Storage, 'setItem'>;

function armazenamentoDoNavegador(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    // Só acessar `window.localStorage` já lança erro em alguns navegadores com armazenamento bloqueado.
    return null;
  }
}

function larguraValida(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor) && valor > 0;
}

export function largurasPadrao(colunas: ColunaAjustavel[]): Larguras {
  const resultado: Larguras = {};
  for (const c of colunas) resultado[c.chave] = c.padrao;
  return resultado;
}

export function lerLarguras(
  chaveGuardada: string,
  colunas: ColunaAjustavel[],
  armazenamento: Leitor | null = armazenamentoDoNavegador(),
): Larguras {
  const padrao = largurasPadrao(colunas);
  if (!armazenamento) return padrao;

  let bruto: string | null;
  try {
    bruto = armazenamento.getItem(chaveGuardada);
  } catch {
    return padrao;
  }
  if (!bruto) return padrao;

  let guardado: unknown;
  try {
    guardado = JSON.parse(bruto);
  } catch {
    return padrao;
  }
  if (!guardado || typeof guardado !== 'object' || Array.isArray(guardado)) return padrao;

  const resultado: Larguras = {};
  for (const c of colunas) {
    const valor = (guardado as Record<string, unknown>)[c.chave];
    resultado[c.chave] = larguraValida(valor) ? Math.max(c.minima, Math.round(valor)) : c.padrao;
  }
  return resultado;
}

export function gravarLarguras(
  chaveGuardada: string,
  larguras: Larguras,
  armazenamento: Gravador | null = armazenamentoDoNavegador(),
): void {
  if (!armazenamento) return;
  try {
    armazenamento.setItem(chaveGuardada, JSON.stringify(larguras));
  } catch {
    // Sem onde guardar, o ajuste vale só até recarregar a página. Não é motivo para quebrar a tela.
  }
}

export function ajustarLargura(larguras: Larguras, coluna: ColunaAjustavel, novaLargura: number): Larguras {
  return { ...larguras, [coluna.chave]: Math.max(coluna.minima, Math.round(novaLargura)) };
}

export function restaurarColuna(larguras: Larguras, coluna: ColunaAjustavel): Larguras {
  return { ...larguras, [coluna.chave]: coluna.padrao };
}

export function somaDasLarguras(larguras: Larguras, colunas: ColunaAjustavel[]): number {
  return colunas.reduce((soma, c) => soma + (larguras[c.chave] ?? c.padrao), 0);
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
npx vitest run src/lib/larguras-de-colunas.test.ts
```

Esperado: `Tests 10 passed`.

- [ ] **Step 5: Commitar**

```bash
git add -N src/lib/larguras-de-colunas.ts src/lib/larguras-de-colunas.test.ts
git commit -m "feat(tabelas): regra das larguras de coluna que a pessoa ajusta e o navegador guarda

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" --only -- src/lib/larguras-de-colunas.ts src/lib/larguras-de-colunas.test.ts
```

---

### Task 3: A tabela do time recebe quem é o dono e a foto dele

**Files:**
- Create: `supabase/migrations/20260914153000_tabela_do_time_com_rosto.sql`
- Modify: `src/integrations/supabase/types.ts` (bloco `negocios_em_risco`, perto da linha 4790)
- Modify: `src/hooks/use-dashboard.ts` (tipo `NegocioEmRisco`, perto da linha 216)
- Modify: `supabase/functions/pauta-resumo-diario/corpo.ts` (`interface NegocioDaEquipe`, perto da linha 68)

**Interfaces:**
- Consumes: nada.
- Produces: `NegocioEmRisco.responsavel_id?: string | null` e `NegocioEmRisco.responsavel_avatar?: string | null` (Tarefas 4 e 7).

🔴 **NADA É APLICADO NO BANCO NESTA TAREFA.** O controlador conferiu em 14/09/2026 que os corpos e as permissões no ar são os do bloco Global Constraints; a Tarefa 9 confere de novo, ensaia e só aplica com o "pode" do dono do produto.

- [ ] **Step 1: Escrever a migration**

Criar `supabase/migrations/20260914153000_tabela_do_time_com_rosto.sql` com EXATAMENTE este conteúdo (os corpos entre `$function$` são conferidos byte a byte no Step 3 — não reformate, não reindente, não acrescente comentário dentro deles):

```sql
-- ============================================================================
-- A TABELA DO TIME RECEBE QUEM É O DONO E A FOTO DELE
-- ============================================================================
--
-- Pedido do dono do produto em 14/09/2026 (desenho em
-- `docs/superpowers/specs/2026-09-14-hoje-contraste-rostos-e-colunas-design.md`): o rosto do
-- responsável na coluna "Responsável" da tabela do time da tela "Hoje".
--
-- As duas funções passam a devolver duas colunas a mais, NO FIM da lista:
--   · `responsavel_id`     — o `usuarios.id` do dono;
--   · `responsavel_avatar` — o `usuarios.avatar_url` do dono.
-- De brinde, `responsavel_id` resolve o item 69 da dívida técnica: a tela decidia "é meu?"
-- comparando NOMES, e dois homônimos na mesma empresa confundiam a conta.
--
-- NENHUMA REGRA DE QUEM VÊ O QUÊ MUDA. Os corpos abaixo são os que estavam no ar em 14/09/2026,
-- colhidos com `pg_get_functiondef` e conferidos byte a byte pelo md5, com só estas trocas:
--   negocios_em_risco_de — `u.avatar_url AS vendedor_avatar` logo depois de `u.nome AS vendedor_nome`,
--                          em `abertos`; `pagina.usuario_id` e `pagina.vendedor_avatar` no fim do
--                          SELECT final; as duas colunas no fim do RETURNS TABLE.
--   negocios_em_risco    — as duas colunas no fim do RETURNS TABLE e do SELECT.
-- md5(prosrc), antes -> depois:
--   negocios_em_risco_de  dc3e5f918b165fc8c27abfb1bbd40365 (3.149) -> 6bc82788c32cd8f3ee3cc8be39918a9f (3.239)
--   negocios_em_risco     128b6304a969066943f8954776237830 (327)   -> 4068e9627a824d2a2e1233d94ffa3a21 (376)
-- O corpo de `negocios_em_risco_de` no ar tem a mesma lógica do de
-- `20260909130000_negocios_em_risco.sql`, só sem os comentários de dentro do corpo — por isso o md5
-- daquele arquivo não bate com o do banco.
--
-- 🔴 POR QUE `DROP` + `CREATE`, e não `CREATE OR REPLACE`: o Postgres não deixa trocar as colunas
-- de saída de uma função existente. E o `DROP` APAGA A PERMISSÃO EM SILÊNCIO — por isso ela é
-- refeita aqui mesmo, na mesma transação, exatamente como estava (medido em 14/09/2026):
--   negocios_em_risco_de  ->  postgres=X/postgres | service_role=X/postgres
--   negocios_em_risco     ->  postgres=X/postgres | authenticated=X/postgres | service_role=X/postgres
--
-- 🔴 `negocios_em_risco_de` CONTINUA FECHADA PARA O NAVEGADOR. Ela aceita o identificador de
-- QUALQUER pessoa e roda com privilégio, pulando a regra de segurança: aberta a `authenticated`,
-- qualquer um consultaria a carteira de qualquer outro. Só o servidor (o e-mail das 7h) a chama.
-- Função nova nasce executável por PUBLIC e com os privilégios-padrão do projeto (que alcançam
-- `anon` e `authenticated`); o `REVOKE` abaixo tira tudo antes do `GRANT`.
--
-- Compatível com o site no ar: ele chama `negocios_em_risco` com os mesmos parâmetros e ignora as
-- colunas a mais. O e-mail das 7h chama `negocios_em_risco_de` do mesmo jeito.
--
-- `NOTIFY pgrst, 'reload schema'` no fim: a API do banco passa a enxergar as colunas novas na hora.
--
-- PARA VOLTAR ATRÁS: `DROP` das duas e `CREATE` com as definições de antes (a lógica de
-- `20260909130000_negocios_em_risco.sql`), com a MESMA permissão acima. O arquivo de volta, com as
-- definições exatas, é gerado com `pg_get_functiondef` logo antes de aplicar.
-- ============================================================================

BEGIN;

DROP FUNCTION public.negocios_em_risco(uuid[], uuid[], uuid, integer, text[], integer, integer);
DROP FUNCTION public.negocios_em_risco_de(uuid, uuid[], uuid[], uuid, integer, text[], integer, integer);

CREATE FUNCTION public.negocios_em_risco_de(p_usuario_id uuid, p_usuario_ids uuid[] DEFAULT NULL::uuid[], p_fabricante_ids uuid[] DEFAULT NULL::uuid[], p_funil_id uuid DEFAULT NULL::uuid, p_dias_parado integer DEFAULT 7, p_etapas text[] DEFAULT NULL::text[], p_limite integer DEFAULT 10, p_deslocamento integer DEFAULT 0)
 RETURNS TABLE(id uuid, nome text, fabrica text, etapa text, responsavel text, valor numeric, dias_parado integer, total_geral bigint, valor_geral numeric, responsavel_id uuid, responsavel_avatar text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH gente AS (
    SELECT u.id
    FROM public.usuarios u
    WHERE u.empresa_id = (SELECT dono.empresa_id FROM public.usuarios dono WHERE dono.id = p_usuario_id)
       OR u.id = p_usuario_id
  ),
  hoje AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d),
  abertos AS (
    SELECT
      p.id,
      p.usuario_id,
      p.nome,
      p.cliente_id,
      p.campos_extras,
      p.valor_total,
      u.nome AS vendedor_nome,
      u.avatar_url AS vendedor_avatar,
      f.nome AS fabricante_nome,
      COALESCE(k.nome, p.status) AS etapa_label,
      COALESCE(uh.ultima_atividade, p.created_at) AS ultima_atividade
    FROM public.pedidos p
    JOIN gente g ON g.id = p.usuario_id
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
  ),
  meus AS (
    SELECT * FROM marcado
    WHERE (parado OR sem_proxima_acao)
      AND (
        (SELECT public.ve_pauta_de_todos(p_usuario_id))
        OR usuario_id = p_usuario_id
      )
  )
  SELECT
    pagina.id,
    coalesce(
      nullif(trim(pagina.nome), ''),
      nullif(trim(pagina.campos_extras ->> 'Negócio'), ''),
      nullif(trim(cl.empresa), '') || coalesce(' | ' || pagina.fabricante_nome, ''),
      'Negócio sem nome'
    ),
    pagina.fabricante_nome,
    pagina.etapa_label,
    pagina.vendedor_nome,
    pagina.valor_total,
    ((SELECT d FROM hoje) - pagina.parado_desde)::integer,
    pagina.total_geral,
    pagina.valor_geral,
    pagina.usuario_id,
    pagina.vendedor_avatar
  FROM (
    SELECT m.*, (count(*) OVER ())::bigint AS total_geral, (sum(m.valor_total) OVER ())::numeric AS valor_geral
    FROM meus m
    ORDER BY m.valor_total DESC NULLS LAST, m.id
    OFFSET greatest(p_deslocamento, 0)
    LIMIT greatest(least(p_limite, 100), 1)
  ) pagina
  LEFT JOIN public.clientes cl ON cl.id = pagina.cliente_id
  ORDER BY pagina.valor_total DESC NULLS LAST, pagina.id;
$function$;

-- 🔴 A permissão de antes, exatamente: só o servidor.
REVOKE ALL ON FUNCTION public.negocios_em_risco_de(uuid, uuid[], uuid[], uuid, integer, text[], integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.negocios_em_risco_de(uuid, uuid[], uuid[], uuid, integer, text[], integer, integer) TO service_role;

CREATE FUNCTION public.negocios_em_risco(p_usuario_ids uuid[] DEFAULT NULL::uuid[], p_fabricante_ids uuid[] DEFAULT NULL::uuid[], p_funil_id uuid DEFAULT NULL::uuid, p_dias_parado integer DEFAULT 7, p_etapas text[] DEFAULT NULL::text[], p_limite integer DEFAULT 10, p_deslocamento integer DEFAULT 0)
 RETURNS TABLE(id uuid, nome text, fabrica text, etapa text, responsavel text, valor numeric, dias_parado integer, total_geral bigint, responsavel_id uuid, responsavel_avatar text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT n.id, n.nome, n.fabrica, n.etapa, n.responsavel, n.valor, n.dias_parado, n.total_geral,
         n.responsavel_id, n.responsavel_avatar
  FROM public.negocios_em_risco_de(
         public.get_my_usuario_id(),
         p_usuario_ids, p_fabricante_ids, p_funil_id, p_dias_parado, p_etapas, p_limite, p_deslocamento
       ) n
  ORDER BY n.valor DESC NULLS LAST, n.id;
$function$;

-- 🔴 A permissão de antes, exatamente: quem está logado e o servidor.
REVOKE ALL ON FUNCTION public.negocios_em_risco(uuid[], uuid[], uuid, integer, text[], integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.negocios_em_risco(uuid[], uuid[], uuid, integer, text[], integer, integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
```

- [ ] **Step 2: Conferir a estrutura do arquivo**

```bash
f=supabase/migrations/20260914153000_tabela_do_time_com_rosto.sql
echo "DROP: $(grep -c '^DROP FUNCTION' $f) | CREATE: $(grep -c '^CREATE FUNCTION' $f) | REVOKE: $(grep -c '^REVOKE ALL' $f) | GRANT: $(grep -c '^GRANT EXECUTE' $f) | NOTIFY: $(grep -c "^NOTIFY pgrst" $f)"
```

Esperado: `DROP: 2 | CREATE: 2 | REVOKE: 2 | GRANT: 2 | NOTIFY: 1`.

- [ ] **Step 3: Conferir os corpos byte a byte**

```bash
node -e '
const fs=require("fs"),c=require("crypto");
const t=fs.readFileSync("supabase/migrations/20260914153000_tabela_do_time_com_rosto.sql","utf8").replace(/\r\n/g,"\n");
const re=/CREATE\s+FUNCTION\s+public\.(negocios_em_risco(?:_de)?)\s*\(/g;
let m;
while((m=re.exec(t))){
  const resto=t.slice(m.index);
  const ini=resto.indexOf("AS $function$")+"AS $function$".length;
  const corpo=resto.slice(ini, resto.indexOf("$function$", ini));
  console.log(m[1], c.createHash("md5").update(corpo,"utf8").digest("hex"), corpo.length);
}'
```

Esperado, exatamente:

```
negocios_em_risco_de 6bc82788c32cd8f3ee3cc8be39918a9f 3239
negocios_em_risco 4068e9627a824d2a2e1233d94ffa3a21 376
```

Se algum não bater, o corpo foi alterado em relação ao que está no ar (um espaço, uma linha, um comentário). **Não siga:** compare com o bloco do Step 1 e corrija até bater.

- [ ] **Step 4: Tipos**

4a. Em `src/integrations/supabase/types.ts`, no bloco `negocios_em_risco`, trocar

```ts
        Returns: {
          dias_parado: number
          etapa: string
          fabrica: string | null
          id: string
          nome: string
          responsavel: string | null
          total_geral: number
          valor: number
        }[]
```

por

```ts
        Returns: {
          dias_parado: number
          etapa: string
          fabrica: string | null
          id: string
          nome: string
          responsavel: string | null
          responsavel_avatar: string | null
          responsavel_id: string
          total_geral: number
          valor: number
        }[]
```

4b. Em `src/hooks/use-dashboard.ts`, trocar

```ts
// Uma linha da tabela do time. Espelha `negocios_em_risco` (migration 20260909130000), coluna
```

por

```ts
// Uma linha da tabela do time. Espelha `negocios_em_risco` (migrations 20260909130000 e 20260914153000), coluna
```

e, no tipo `NegocioEmRisco`, trocar

```ts
  responsavel: string | null;
  valor: number | null;
```

por

```ts
  responsavel: string | null;
  /**
   * O `usuarios.id` do dono (migration 20260914153000). É com ele que a tela decide "é meu?" —
   * comparar nome confundia homônimos (item 69 da dívida técnica, resolvido em 14/09/2026).
   * Opcional porque some quando o site novo fala com o banco anterior à migration; aí a tela volta
   * a comparar o nome.
   */
  responsavel_id?: string | null;
  /** A foto do dono (`usuarios.avatar_url`). Sem foto, a tela desenha as iniciais. */
  responsavel_avatar?: string | null;
  valor: number | null;
```

4c. Em `supabase/functions/pauta-resumo-diario/corpo.ts`, na `interface NegocioDaEquipe`, trocar

```ts
  total_geral: number;
  valor_geral: number | null;
}
```

por

```ts
  total_geral: number;
  valor_geral: number | null;
  // As duas abaixo chegam desde a migration 20260914153000, mas o e-mail NÃO as usa — por isso
  // opcionais: nada no e-mail pode passar a depender delas sem uma decisão.
  responsavel_id?: string | null;
  responsavel_avatar?: string | null;
}
```

- [ ] **Step 5: Tipos e testes do e-mail**

```bash
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "use-dashboard\.ts|supabase/types\.ts|pauta-resumo-diario/corpo\.ts|corpo-do-resumo-diario"
npx vitest run src/lib/corpo-do-resumo-diario.test.ts
```

Esperado: o primeiro comando não imprime nada; o teste do e-mail continua passando.

- [ ] **Step 6: Commitar**

```bash
git add -N supabase/migrations/20260914153000_tabela_do_time_com_rosto.sql
git commit -m "feat(hoje): a tabela do time recebe quem e o dono e a foto dele

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" --only -- supabase/migrations/20260914153000_tabela_do_time_com_rosto.sql src/integrations/supabase/types.ts src/hooks/use-dashboard.ts supabase/functions/pauta-resumo-diario/corpo.ts
```

---

### Task 4: A tabela do time — rosto do dono, botão laranja, faixa do título e âncora

**Files:**
- Modify: `src/components/pauta/TabelaDoTime.tsx`
- Test: `src/components/pauta/tabela-do-time.test.tsx`

**Interfaces:**
- Consumes: `iniciais` (Tarefa 1); `NegocioEmRisco.responsavel_avatar` (Tarefa 3).
- Produces: a âncora `id="tabela-do-time"` no cartão da tabela (usada pela Tarefa 7).

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar ao fim de `src/components/pauta/tabela-do-time.test.tsx` (o arquivo já tem o esboço do `supabase.rpc` com `responsavel: 'Ana Souza'` e o `montar(filtros, podeVerDeTodos)`):

```tsx
describe('a tabela do time: rosto do dono, botão laranja e âncora', () => {
  it('🔴 o dono aparece no círculo, com as iniciais quando não há foto', async () => {
    montar({}, true);
    // O jsdom não carrega imagem, então a FOTO em si é conferida nas fotos da tela antes de
    // publicar. O que se prende aqui é o círculo com as iniciais — que é também o que aparece
    // enquanto a foto carrega ou quando ela falha.
    expect(await screen.findAllByText('AS')).toHaveLength(10);
  });

  it('sem a chave, não há círculo de dono', async () => {
    montar({}, false);
    await screen.findByText('Negócio 0');
    expect(screen.queryByText('AS')).toBeNull();
  });

  it('"Abrir negócio" é o botão principal, laranja como na pauta', async () => {
    montar();
    const botoes = await screen.findAllByRole('button', { name: 'Abrir negócio' });
    expect(botoes[0].className).toContain('bg-primary');
  });

  it('o cartão tem a âncora que o aviso da pauta vazia usa', async () => {
    const { container } = montar();
    await screen.findByText('Negócio 0');
    expect(container.querySelector('#tabela-do-time')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run src/components/pauta/tabela-do-time.test.tsx
```

Esperado: os quatro casos novos FALHAM; os antigos continuam passando.

- [ ] **Step 3: Implementar**

Em `src/components/pauta/TabelaDoTime.tsx`:

3a. Imports — acrescentar logo abaixo de `import { Button } from '@/components/ui/button';`:

```tsx
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { iniciais } from '@/lib/iniciais';
```

3b. O cartão ganha a âncora. Trocar

```tsx
    <Card className={`${MOLDURA_DA_PAUTA} mt-5`}>
```

por

```tsx
    // 🔴 `id="tabela-do-time"` é a âncora do botão "Ver a tabela" do aviso da pauta vazia
    // (`AvisoDaTabela`, em `src/pages/Hoje.tsx`). `scroll-mt-4` deixa um respiro acima do cartão.
    <Card id="tabela-do-time" className={`${MOLDURA_DA_PAUTA} mt-5 scroll-mt-4`}>
```

3c. A faixa do título das colunas. Trocar

```tsx
                  <tr className="bg-muted text-[11px] uppercase tracking-wider text-muted-foreground">
```

por

```tsx
                  {/* A faixa do título das colunas, com o contraste do dashboard de referência
                      (pedido de 14/09/2026): mais escura que o fundo, texto forte e sem caixa-alta.
                      `foreground` com transparência escurece no tema claro e clareia no escuro, sem
                      regra por tema. */}
                  <tr className="bg-foreground/[0.06] text-xs text-card-foreground">
```

3d. O rosto do dono. Trocar

```tsx
                      {podeVerDeTodos && (
                        <td className="px-3 py-2 text-muted-foreground">{n.responsavel ?? '—'}</td>
                      )}
```

por

```tsx
                      {podeVerDeTodos && (
                        <td className="px-3 py-2 text-card-foreground">
                          {/* O rosto do dono; sem foto, as iniciais — o mesmo círculo do campo de
                              responsáveis do negócio (`CampoDeResponsaveis`). `AvatarFallback`
                              também cobre a foto que demora ou falha ao carregar. */}
                          <span className="flex min-w-0 items-center gap-2">
                            <Avatar className="h-7 w-7 shrink-0">
                              {n.responsavel_avatar && (
                                <AvatarImage src={n.responsavel_avatar} alt="" className="h-full w-full object-cover" />
                              )}
                              <AvatarFallback className="bg-muted text-[10px] font-medium text-muted-foreground">
                                {iniciais(n.responsavel ?? '')}
                              </AvatarFallback>
                            </Avatar>
                            <span className="truncate" title={n.responsavel ?? undefined}>
                              {n.responsavel ?? '—'}
                            </span>
                          </span>
                        </td>
                      )}
```

3e. O botão laranja. Trocar

```tsx
                          <Button size="sm" variant="outline" onClick={() => onAbrir(n.id)}>
                            Abrir negócio
                          </Button>
```

por

```tsx
                          {/* O botão principal, laranja como o da pauta logo acima (pedido de
                              14/09/2026): abrir o negócio é a ação desta tabela. */}
                          <Button size="sm" onClick={() => onAbrir(n.id)}>
                            Abrir negócio
                          </Button>
```

- [ ] **Step 4: Rodar e ver passar**

```bash
npx vitest run src/components/pauta/tabela-do-time.test.tsx src/components/pauta/radar-ordem.test.tsx
```

Esperado: todos passam.

- [ ] **Step 5: Commitar**

```bash
git commit -m "feat(hoje): a tabela do time mostra o rosto do dono, abre o negocio em laranja e ganha a faixa de contraste

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" --only -- src/components/pauta/TabelaDoTime.tsx src/components/pauta/tabela-do-time.test.tsx
```

---

### Task 5: A tabela do time — colunas que cabem e que se arrastam

**Files:**
- Modify: `src/components/pauta/TabelaDoTime.tsx`
- Test: `src/components/pauta/tabela-do-time.test.tsx`

**Interfaces:**
- Consumes: `lerLarguras`, `gravarLarguras`, `ajustarLargura`, `restaurarColuna`, `somaDasLarguras`, `ColunaAjustavel` (Tarefa 2); o cartão já com rosto, botão laranja e faixa (Tarefa 4).
- Produces: nada para tarefas seguintes.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar ao fim de `src/components/pauta/tabela-do-time.test.tsx`:

```tsx
describe('as larguras da tabela do time', () => {
  const CHAVE_COM = 'repply_hoje_larguras_tabela_do_time_com_responsavel_v1';
  const alca = (rotulo: string) =>
    screen.getByRole('separator', { name: `Ajustar a largura da coluna ${rotulo}` });

  beforeEach(() => localStorage.clear());

  async function colunas(container: HTMLElement) {
    await screen.findByText('Negócio 0');
    return Array.from(container.querySelectorAll('col')) as HTMLElement[];
  }

  it('🔴 por padrão a soma cabe no espaço da tabela na página: 926 px, com e sem a coluna Responsável', async () => {
    const com = montar({}, true);
    expect(await colunas(com.container)).toHaveLength(7);
    expect((com.container.querySelector('table') as HTMLElement).style.width).toBe('926px');

    cleanup();
    const sem = montar({}, false);
    expect(await colunas(sem.container)).toHaveLength(6);
    expect((sem.container.querySelector('table') as HTMLElement).style.width).toBe('926px');
  });

  it('a largura guardada neste navegador é a que aparece; o que não foi guardado nasce no padrão', async () => {
    localStorage.setItem(CHAVE_COM, JSON.stringify({ negocio: 333 }));
    const { container } = montar();
    const cols = await colunas(container);
    expect(cols[0].style.width).toBe('333px');
    expect(cols[1].style.width).toBe('76px');
  });

  it('as setas do teclado ajustam a coluna, e o ajuste fica guardado', async () => {
    const { container } = montar();
    const cols = await colunas(container);
    expect(cols[0].style.width).toBe('154px');

    fireEvent.keyDown(alca('Negócio'), { key: 'ArrowRight' });

    await waitFor(() => expect(cols[0].style.width).toBe('170px'));
    expect(JSON.parse(localStorage.getItem(CHAVE_COM) as string).negocio).toBe(170);
  });

  it('dois cliques na alça voltam a coluna à largura-padrão', async () => {
    localStorage.setItem(CHAVE_COM, JSON.stringify({ negocio: 333 }));
    const { container } = montar();
    const cols = await colunas(container);

    fireEvent.doubleClick(alca('Negócio'));

    await waitFor(() => expect(cols[0].style.width).toBe('154px'));
    expect(JSON.parse(localStorage.getItem(CHAVE_COM) as string).negocio).toBe(154);
  });

  it('o título da coluna continua com o nome dela, e não com o texto da alça', async () => {
    montar();
    await screen.findByText('Negócio 0');
    expect(screen.getByRole('columnheader', { name: 'Responsável' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run src/components/pauta/tabela-do-time.test.tsx
```

Esperado: os casos novos de largura FALHAM (não há `<col>` nem alça); o do título pode passar desde já — ele prende que continue passando.

- [ ] **Step 3: Imports, colunas e a alça**

3a. Trocar `import { useState } from 'react';` por:

```tsx
import { useRef, useState } from 'react';
```

e acrescentar logo abaixo de `import { iniciais } from '@/lib/iniciais';`:

```tsx
import {
  ajustarLargura,
  gravarLarguras,
  lerLarguras,
  restaurarColuna,
  somaDasLarguras,
  type ColunaAjustavel,
} from '@/lib/larguras-de-colunas';
```

3b. Acrescentar logo depois da constante `TETO_DO_SERVIDOR` (antes de `interface Props`):

```tsx
/**
 * AS LARGURAS-PADRÃO, EM PIXELS — pedido de 14/09/2026: por padrão, tudo cabe.
 *
 * O espaço é o da PÁGINA, não o da tela: "Hoje" tem no máximo 1.024 px (`max-w-5xl`), e tirando o
 * respiro da página (24 px de cada lado), a borda e o respiro do cartão (1 + 24 px de cada lado)
 * sobram 926 px — em notebook 1366x768 e em monitor grande, igual. As duas listas somam isso.
 *
 * MEDIDO no navegador em 14/09/2026, e não chutado (com Satoshi e com a fonte do sistema, a
 * diferença foi de 1 a 2 px):
 *   · "Abrir negócio" 111 px + 8 px de espaço + "Retomar depois" 125 px → ações com 260 px;
 *   · "R$ 9.999.999,99" 126 px → valor com 144 px. Acima de R$ 10 milhões o texto corta com "…" e
 *     o valor inteiro aparece ao passar o mouse;
 *   · "999 dias" 68 px → 84 px.
 * Cada célula tem 8 px de respiro de cada lado (`px-2`). O que sobra vai para negócio, fabricante
 * e etapa; fabricante e etapa cortam com "…" e mostram o texto inteiro ao passar o mouse.
 *
 * `chave` é o nome no guardado do navegador: mudar uma chave apaga o ajuste que as pessoas fizeram
 * naquela coluna. A coluna das ações não tem alça — a largura dela é a dos dois botões.
 */
const COLUNAS_COM_RESPONSAVEL: ColunaAjustavel[] = [
  { chave: 'negocio', padrao: 154, minima: 120 },
  { chave: 'fabricante', padrao: 76, minima: 56 },
  { chave: 'etapa', padrao: 76, minima: 56 },
  { chave: 'responsavel', padrao: 132, minima: 96 },
  { chave: 'valor', padrao: 144, minima: 110 },
  { chave: 'dias', padrao: 84, minima: 70 },
  { chave: 'acoes', padrao: 260, minima: 260 },
];

const COLUNAS_SEM_RESPONSAVEL: ColunaAjustavel[] = [
  { chave: 'negocio', padrao: 238, minima: 120 },
  { chave: 'fabricante', padrao: 100, minima: 56 },
  { chave: 'etapa', padrao: 100, minima: 56 },
  { chave: 'valor', padrao: 144, minima: 110 },
  { chave: 'dias', padrao: 84, minima: 70 },
  { chave: 'acoes', padrao: 260, minima: 260 },
];

/** Uma chave por forma da tabela: as larguras de uma não servem na outra. */
const CHAVE_COM_RESPONSAVEL = 'repply_hoje_larguras_tabela_do_time_com_responsavel_v1';
const CHAVE_SEM_RESPONSAVEL = 'repply_hoje_larguras_tabela_do_time_sem_responsavel_v1';

/** Quanto cada toque de seta anda, para quem ajusta pelo teclado. */
const PASSO_DO_TECLADO = 16;

/**
 * A ALÇA NA BORDA DIREITA DO TÍTULO DE UMA COLUNA. Arrastar muda a largura; dois cliques voltam ao
 * padrão; as setas ←/→ ajustam pelo teclado, para quem não usa mouse.
 *
 * Durante o arraste só a tela muda (`onMudar`); o fim do gesto grava (`onSoltar`). Gravar a cada
 * movimento do ponteiro escreveria no navegador dezenas de vezes por segundo.
 *
 * `setPointerCapture` mantém o arraste vivo quando o ponteiro sai da alça — sem ele, arrastar
 * rápido "solta" a coluna no meio do gesto.
 */
function AlcaDeLargura({
  rotulo,
  largura,
  onMudar,
  onSoltar,
  onRestaurar,
}: {
  rotulo: string;
  largura: number;
  onMudar: (novaLargura: number) => void;
  onSoltar: (novaLargura: number) => void;
  onRestaurar: () => void;
}) {
  const arraste = useRef<{ x: number; largura: number; ultima: number } | null>(null);

  const terminar = () => {
    if (!arraste.current) return;
    const final = arraste.current.ultima;
    arraste.current = null;
    onSoltar(final);
  };

  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={`Ajustar a largura da coluna ${rotulo}`}
      aria-valuenow={largura}
      tabIndex={0}
      className="absolute right-0 top-0 h-full w-2 cursor-col-resize touch-none select-none border-r-2 border-border hover:border-primary focus-visible:border-primary focus-visible:outline-none"
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        arraste.current = { x: e.clientX, largura, ultima: largura };
      }}
      onPointerMove={(e) => {
        if (!arraste.current) return;
        arraste.current.ultima = arraste.current.largura + e.clientX - arraste.current.x;
        onMudar(arraste.current.ultima);
      }}
      onPointerUp={terminar}
      onPointerCancel={terminar}
      onDoubleClick={onRestaurar}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        onSoltar(largura + (e.key === 'ArrowRight' ? PASSO_DO_TECLADO : -PASSO_DO_TECLADO));
      }}
    />
  );
}
```

- [ ] **Step 4: O estado das larguras**

Dentro de `TabelaDoTime`, logo depois de `const [quantos, setQuantos] = useState(PAGINA);`, acrescentar:

```tsx
  // As larguras das colunas: uma lista para cada forma da tabela, e o ajuste guardado neste
  // navegador. Ver `COLUNAS_COM_RESPONSAVEL` e `src/lib/larguras-de-colunas.ts`.
  const colunas = podeVerDeTodos ? COLUNAS_COM_RESPONSAVEL : COLUNAS_SEM_RESPONSAVEL;
  const chaveGuardada = podeVerDeTodos ? CHAVE_COM_RESPONSAVEL : CHAVE_SEM_RESPONSAVEL;
  const [larguras, setLarguras] = useState(() => lerLarguras(chaveGuardada, colunas));

  // A forma da tabela muda quando a chave `pauta_de_todos` chega depois da primeira pintura ou
  // muda com a tela aberta: as larguras são relidas do guardado da outra forma. Ajuste DURANTE a
  // renderização, pelo mesmo motivo do `recorteMostrado` logo abaixo — um efeito pintaria uma vez
  // a tabela nova com as larguras da forma antiga.
  const [chaveMostrada, setChaveMostrada] = useState(chaveGuardada);
  if (chaveMostrada !== chaveGuardada) {
    setChaveMostrada(chaveGuardada);
    setLarguras(lerLarguras(chaveGuardada, colunas));
  }

  const mudarLargura = (coluna: ColunaAjustavel, nova: number) =>
    setLarguras((atual) => ajustarLargura(atual, coluna, nova));

  // O fim do gesto muda e grava. A conta parte das larguras DESTA renderização, e isso é seguro:
  // durante um arraste só a coluna arrastada muda, e o valor final dela vem do ponteiro, não do
  // estado.
  const soltarLargura = (coluna: ColunaAjustavel, nova: number) => {
    const final = ajustarLargura(larguras, coluna, nova);
    setLarguras(final);
    gravarLarguras(chaveGuardada, final);
  };

  const restaurarLargura = (coluna: ColunaAjustavel) => {
    const final = restaurarColuna(larguras, coluna);
    setLarguras(final);
    gravarLarguras(chaveGuardada, final);
  };

  const coluna = (chave: string) => colunas.find((c) => c.chave === chave) as ColunaAjustavel;

  /**
   * Um título de coluna com a alça na borda direita.
   *
   * 🔴 `aria-label` NO `<th>`: sem ele, o nome acessível do título viraria "Responsável Ajustar a
   * largura da coluna Responsável" — o leitor de tela repetiria a frase da alça a cada célula, e o
   * teste que procura a coluna pelo nome deixaria de achá-la.
   */
  const titulo = (c: ColunaAjustavel, rotulo: string, alinhamento: 'left' | 'right') => (
    <th
      aria-label={rotulo}
      className={`relative px-2 py-2 font-semibold ${alinhamento === 'right' ? 'text-right' : 'text-left'}`}
    >
      {rotulo}
      <AlcaDeLargura
        rotulo={rotulo}
        largura={larguras[c.chave]}
        onMudar={(nova) => mudarLargura(c, nova)}
        onSoltar={(nova) => soltarLargura(c, nova)}
        onRestaurar={() => restaurarLargura(c)}
      />
    </th>
  );
```

- [ ] **Step 5: A tabela usa as larguras**

Trocar o trecho que começa no comentário `{/* 🔴 A ROLAGEM HORIZONTAL É DESTA CAIXA, NUNCA DA PÁGINA.` e termina no `</div>` logo antes do comentário `{/* O rodapé diz SEMPRE onde a pessoa está na lista` — ou seja, o comentário, a `<div className="overflow-x-auto">` e a tabela inteira — por:

```tsx
            {/* 🔴 A ROLAGEM HORIZONTAL É DESTA CAIXA, NUNCA DA PÁGINA. Desde 14/09/2026 cada coluna
                tem largura própria (`table-layout: fixed`, larguras em `COLUNAS_COM_RESPONSAVEL` e
                `COLUNAS_SEM_RESPONSAVEL`), escolhidas para a soma caber no espaço da tabela na
                página. A caixa só rola quando a pessoa alarga colunas além desse espaço — e rola por
                dentro, com o resto da tela parado (parente do CLAUDE.md §7.11: transbordo é o que
                prende o usuário). Antes, com a largura automática, o navegador repartia o espaço
                pelo tamanho do texto, e um nome de negócio comprido espremia as outras colunas. */}
            <div className="overflow-x-auto">
              <table
                className="min-w-full text-sm"
                // A soma das larguras, e não `w-full`: é o que faz alargar uma coluna alargar a
                // tabela (e a caixa rolar) em vez de espremer as vizinhas. `min-w-full` estica as
                // colunas na proporção quando sobra espaço.
                style={{ tableLayout: 'fixed', width: somaDasLarguras(larguras, colunas) }}
              >
                <colgroup>
                  {colunas.map((c) => (
                    <col key={c.chave} style={{ width: `${larguras[c.chave]}px` }} />
                  ))}
                </colgroup>
                <thead>
                  {/* A faixa do título das colunas, com o contraste do dashboard de referência
                      (pedido de 14/09/2026): mais escura que o fundo, texto forte e sem caixa-alta.
                      `foreground` com transparência escurece no tema claro e clareia no escuro, sem
                      regra por tema. */}
                  <tr className="bg-foreground/[0.06] text-xs text-card-foreground">
                    {titulo(coluna('negocio'), 'Negócio', 'left')}
                    {titulo(coluna('fabricante'), 'Fabricante', 'left')}
                    {titulo(coluna('etapa'), 'Etapa', 'left')}
                    {podeVerDeTodos && titulo(coluna('responsavel'), 'Responsável', 'left')}
                    {titulo(coluna('valor'), 'Valor', 'right')}
                    {titulo(coluna('dias'), 'Sem mexer há', 'right')}
                    <th className="px-2 py-2 text-right font-semibold">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((n) => (
                    <tr
                      key={n.id}
                      className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/50"
                      onClick={() => onAbrir(n.id)}
                    >
                      <td className="px-2 py-2 font-medium text-card-foreground">
                        {/* Até duas linhas: o nome é o que se lê primeiro, e cortar na primeira
                            esconderia a fabricante nos nomes montados como "Cliente | Fabricante". */}
                        <span className="line-clamp-2" title={n.nome}>
                          {n.nome}
                        </span>
                      </td>
                      <td className="truncate px-2 py-2 text-muted-foreground" title={n.fabrica ?? undefined}>
                        {n.fabrica ?? '—'}
                      </td>
                      <td className="truncate px-2 py-2 text-muted-foreground" title={n.etapa ?? undefined}>
                        {n.etapa ?? '—'}
                      </td>
                      {podeVerDeTodos && (
                        <td className="px-2 py-2 text-card-foreground">
                          {/* O rosto do dono; sem foto, as iniciais — o mesmo círculo do campo de
                              responsáveis do negócio (`CampoDeResponsaveis`). `AvatarFallback`
                              também cobre a foto que demora ou falha ao carregar. */}
                          <span className="flex min-w-0 items-center gap-2">
                            <Avatar className="h-7 w-7 shrink-0">
                              {n.responsavel_avatar && (
                                <AvatarImage src={n.responsavel_avatar} alt="" className="h-full w-full object-cover" />
                              )}
                              <AvatarFallback className="bg-muted text-[10px] font-medium text-muted-foreground">
                                {iniciais(n.responsavel ?? '')}
                              </AvatarFallback>
                            </Avatar>
                            <span className="truncate" title={n.responsavel ?? undefined}>
                              {n.responsavel ?? '—'}
                            </span>
                          </span>
                        </td>
                      )}
                      <td
                        className="truncate px-2 py-2 text-right font-mono font-semibold tabular-nums text-card-foreground"
                        title={n.valor === null ? undefined : formatarMoedaBRL(n.valor)}
                      >
                        {n.valor === null ? '—' : formatarMoedaBRL(n.valor)}
                      </td>
                      <td className="truncate px-2 py-2 text-right font-mono font-semibold tabular-nums text-card-foreground">
                        {n.dias_parado === null
                          ? '—'
                          : `${n.dias_parado} ${n.dias_parado === 1 ? 'dia' : 'dias'}`}
                      </td>
                      {/* 🔴 O clique dos botões PARA AQUI. A linha inteira também abre o negócio
                          — é o gesto que esta tabela já tinha antes das ações existirem, e tirá-lo
                          seria regressão silenciosa para quem se acostumou. Sem o
                          `stopPropagation`, "Retomar depois" abriria o painel do negócio ao mesmo
                          tempo em que abre o diálogo. */}
                      <td className="px-2 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-2">
                          {/* O botão principal, laranja como o da pauta logo acima (pedido de
                              14/09/2026): abrir o negócio é a ação desta tabela. */}
                          <Button size="sm" onClick={() => onAbrir(n.id)}>
                            Abrir negócio
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => onRetomar(n)}>
                            Retomar depois
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
```

- [ ] **Step 6: Rodar e ver passar**

```bash
npx vitest run src/components/pauta/tabela-do-time.test.tsx src/lib/larguras-de-colunas.test.ts src/components/pauta/radar-ordem.test.tsx
```

Esperado: todos passam, inclusive os antigos (em especial "a coluna Responsável só existe para quem tem a chave").

- [ ] **Step 7: Tipos**

```bash
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "TabelaDoTime|tabela-do-time|larguras-de-colunas"
```

Esperado: nada impresso.

- [ ] **Step 8: Commitar**

```bash
git commit -m "feat(hoje): as colunas da tabela do time cabem na pagina e se ajustam arrastando a borda

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" --only -- src/components/pauta/TabelaDoTime.tsx src/components/pauta/tabela-do-time.test.tsx
```

---

### Task 6: Contraste nos cartões de risco, no resumo por fabricante e no gráfico

**Files:**
- Modify: `src/components/pauta/RadarDeRisco.tsx`
- Test: `src/components/pauta/radar-ordem.test.tsx`

**Interfaces:**
- Consumes: nada.
- Produces: nada.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar ao fim do `describe('a ordem do Radar', …)` de `src/components/pauta/radar-ordem.test.tsx`, antes do `});` que o fecha:

```tsx
  it('o rótulo dos cartões sai do cinza em caixa-alta, pelo contraste de 14/09/2026', () => {
    desenhar();
    const rotulo = screen.getByText('Negócios Parados');
    expect(rotulo.className).not.toContain('uppercase');
    expect(rotulo.className).toContain('text-card-foreground');
  });
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run src/components/pauta/radar-ordem.test.tsx
```

Esperado: o caso novo FALHA.

- [ ] **Step 3: Implementar**

Em `src/components/pauta/RadarDeRisco.tsx`:

3a. Os três rótulos dos cartões ("Negócios Parados", "Sem Próxima Ação", "Valor em Risco"). Conferir que são três:

```bash
grep -c 'text-\[11px\] font-semibold text-muted-foreground uppercase tracking-wider' src/components/pauta/RadarDeRisco.tsx
```

Esperado: `3`. Trocar TODAS as ocorrências de

```tsx
className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider"
```

por

```tsx
className="text-xs font-semibold text-card-foreground"
```

O TEXTO dos rótulos não muda — `radar-ordem.test.tsx` procura "Negócios Parados".

3b. O cabeçalho do "Resumo por fabricante". Trocar

```tsx
                    <tr className="bg-muted text-[11px] uppercase tracking-wider text-muted-foreground">
```

por

```tsx
                    {/* A mesma faixa da tabela do time: contraste do dashboard de referência. */}
                    <tr className="bg-foreground/[0.06] text-xs text-card-foreground">
```

3c. A grade e o eixo de valores do "Risco por Vendedor". Trocar

```tsx
                  <CartesianGrid {...commonGridProps} vertical horizontal={false} />
                  <XAxis type="number" {...commonAxisProps} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
```

por

```tsx
                  <CartesianGrid {...commonGridProps} stroke="hsl(var(--border))" vertical horizontal={false} />
                  <XAxis
                    type="number"
                    {...commonAxisProps}
                    tick={{ ...commonAxisProps.tick, fill: 'hsl(var(--card-foreground))' }}
                    tickFormatter={v => `${(v / 1000).toFixed(0)}k`}
                  />
```

3d. O comentário do topo do arquivo, que dizia que a grade e o eixo continuavam nos padrões compartilhados. Trocar

```tsx
// Os nomes na cor do texto principal, e não no cinza secundário: são o que se lê primeiro no
// gráfico. A grade e o eixo de valores continuam em `commonAxisProps`/`commonGridProps`, que são
// compartilhados com o Dashboard — mexer lá mudaria aquela tela também.
```

por

```tsx
// Os nomes na cor do texto principal, e não no cinza secundário: são o que se lê primeiro no
// gráfico. Desde 14/09/2026 a grade e os valores do eixo também ganham a força do tema — trocados
// só no gráfico daqui, porque `commonAxisProps`/`commonGridProps` são compartilhados com o
// Dashboard e mexer lá mudaria aquela tela também.
```

- [ ] **Step 4: Rodar e ver passar**

```bash
npx vitest run src/components/pauta/radar-ordem.test.tsx src/components/pauta/tabela-do-time.test.tsx
```

Esperado: todos passam.

- [ ] **Step 5: Commitar**

```bash
git commit -m "style(hoje): cartoes de risco, resumo por fabricante e grafico ganham o contraste do dashboard de referencia

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" --only -- src/components/pauta/RadarDeRisco.tsx src/components/pauta/radar-ordem.test.tsx
```

---

### Task 7: A pauta vazia aponta para a tabela, e "é meu?" pelo identificador

**Files:**
- Create: `src/lib/aviso-da-tabela.ts`, `src/lib/aviso-da-tabela.test.ts`
- Create: `src/lib/responsavel-para-o-dialogo.ts`, `src/lib/responsavel-para-o-dialogo.test.ts`
- Modify: `src/pages/Hoje.tsx`
- Test: `src/pages/hoje-estados.test.tsx` (monta a tela COM a chave `pauta_de_todos`), `src/pages/Hoje.test.tsx` (monta SEM a chave)

**Interfaces:**
- Consumes: a âncora `#tabela-do-time` (Tarefa 4); `NegocioEmRisco.responsavel_id` (Tarefa 3).
- Produces: nada.

- [ ] **Step 1: Os testes das duas regras**

Criar `src/lib/aviso-da-tabela.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { fraseDoAvisoDaTabela } from './aviso-da-tabela';

/**
 * O QUE ESTE ARQUIVO PRENDE: o aviso da pauta vazia diz "pedem atenção", nunca "parados" — a
 * tabela lista `parado OR sem_proxima_acao`, e chamar tudo de "parado" contaria errado. E fala dos
 * negócios DA PESSOA quando ela não tem a chave `pauta_de_todos`.
 */
describe('fraseDoAvisoDaTabela', () => {
  it('sem negócio na tabela, não há aviso', () => {
    expect(fraseDoAvisoDaTabela(0, true)).toBeNull();
    expect(fraseDoAvisoDaTabela(-1, true)).toBeNull();
    expect(fraseDoAvisoDaTabela(Number.NaN, false)).toBeNull();
  });

  it('com a chave, fala dos negócios que a tabela mostra', () => {
    expect(fraseDoAvisoDaTabela(145, true)).toBe(
      'Quer adiantar? Os 145 negócios que pedem atenção estão na tabela logo abaixo.',
    );
    expect(fraseDoAvisoDaTabela(1, true)).toBe(
      'Quer adiantar? O negócio que pede atenção está na tabela logo abaixo.',
    );
  });

  it('sem a chave, fala dos negócios da pessoa', () => {
    expect(fraseDoAvisoDaTabela(12, false)).toBe(
      'Quer adiantar? Seus 12 negócios que pedem atenção estão na tabela logo abaixo.',
    );
    expect(fraseDoAvisoDaTabela(1, false)).toBe(
      'Quer adiantar? Seu negócio que pede atenção está na tabela logo abaixo.',
    );
  });
});
```

Criar `src/lib/responsavel-para-o-dialogo.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { responsavelParaODialogo } from './responsavel-para-o-dialogo';

/**
 * O QUE ESTE ARQUIVO PRENDE: o "é meu?" do "Retomar depois" clicado na tabela do time. Decidido
 * pelo NOME, dois homônimos na mesma empresa faziam o diálogo dizer "volta para a sua pauta" sobre
 * o negócio do colega (item 69 da dívida técnica). Pelo identificador, não erra — e, sem
 * identificador (site novo com o banco antigo), volta a comparar o nome.
 */
describe('responsavelParaODialogo', () => {
  const eu = { id: 'u-1', nome: 'Ana Souza' };

  it('mesmo identificador: o negócio é meu, o diálogo não nomeia ninguém', () => {
    expect(responsavelParaODialogo({ responsavel: 'Ana Souza', responsavel_id: 'u-1' }, eu)).toBeNull();
  });

  it('🔴 homônimo com outro identificador: o negócio é do colega', () => {
    expect(responsavelParaODialogo({ responsavel: 'Ana Souza', responsavel_id: 'u-2' }, eu)).toBe('Ana Souza');
  });

  it('sem identificador, compara o nome como antes', () => {
    expect(responsavelParaODialogo({ responsavel: ' ana souza ', responsavel_id: null }, eu)).toBeNull();
    expect(responsavelParaODialogo({ responsavel: 'Bruno Lima' }, eu)).toBe('Bruno Lima');
  });

  it('sem dono, não há quem nomear', () => {
    expect(responsavelParaODialogo({ responsavel: null, responsavel_id: 'u-2' }, eu)).toBeNull();
    expect(responsavelParaODialogo({ responsavel: '   ' }, eu)).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run src/lib/aviso-da-tabela.test.ts src/lib/responsavel-para-o-dialogo.test.ts
```

Esperado: FALHA com os dois imports não resolvidos.

- [ ] **Step 3: As duas regras**

Criar `src/lib/aviso-da-tabela.ts`:

```ts
/**
 * A frase do aviso da pauta vazia na tela "Hoje" — pedido do dono do produto em 14/09/2026: quando
 * a pauta está vazia, apontar para a tabela logo abaixo, no mesmo lugar onde a tela diz isso.
 *
 * 🔴 "PEDEM ATENÇÃO", E NÃO "PARADOS". A tabela do time lista `parado OR sem_proxima_acao`
 * (`negocios_em_risco`), e boa parte dela entra só por não ter próxima ação marcada. O título da
 * própria tabela e o e-mail das 7h já tomam o mesmo cuidado.
 *
 * Devolve `null` quando não há negócio na tabela: sem destino, não há aviso.
 */
export function fraseDoAvisoDaTabela(total: number, podeVerDeTodos: boolean): string | null {
  if (!Number.isFinite(total) || total <= 0) return null;
  if (total === 1) {
    return podeVerDeTodos
      ? 'Quer adiantar? O negócio que pede atenção está na tabela logo abaixo.'
      : 'Quer adiantar? Seu negócio que pede atenção está na tabela logo abaixo.';
  }
  return podeVerDeTodos
    ? `Quer adiantar? Os ${total} negócios que pedem atenção estão na tabela logo abaixo.`
    : `Quer adiantar? Seus ${total} negócios que pedem atenção estão na tabela logo abaixo.`;
}
```

Criar `src/lib/responsavel-para-o-dialogo.ts`:

```ts
/**
 * O nome a mostrar no diálogo "Retomar depois" aberto pela tabela do time — ou `null` quando o
 * negócio é de quem está olhando.
 *
 * O diálogo usa esse nome para trocar de texto: "este negócio é de Fulano, e Fulano recebe um
 * aviso" contra "o negócio volta para a sua pauta". A tabela manda o nome do dono em TODA linha,
 * inclusive nas da própria pessoa, então é preciso decidir "é meu?".
 *
 * 🔴 PELO IDENTIFICADOR: `responsavel_id` contra `profile.id`, os dois `usuarios.id` (CLAUDE.md
 * §4.5). Comparando nomes, dois homônimos na mesma empresa faziam o diálogo prometer "volta para a
 * sua pauta" sobre o negócio do colega, enquanto o banco mandava a tarefa e o aviso para o colega
 * (item 69 da dívida técnica). Sem identificador — site novo falando com o banco anterior à
 * migration 20260914153000 —, volta a comparar o nome, como era antes.
 */
export function responsavelParaODialogo(
  linha: { responsavel: string | null; responsavel_id?: string | null },
  eu: { id?: string | null; nome?: string | null } | null | undefined,
): string | null {
  const dono = (linha.responsavel ?? '').trim();
  if (!dono) return null;
  if (linha.responsavel_id && eu?.id) return linha.responsavel_id === eu.id ? null : dono;
  return dono.toLowerCase() === (eu?.nome ?? '').trim().toLowerCase() ? null : dono;
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
npx vitest run src/lib/aviso-da-tabela.test.ts src/lib/responsavel-para-o-dialogo.test.ts
```

Esperado: todos passam.

- [ ] **Step 5: Os testes da tela com a chave (`hoje-estados.test.tsx`)**

5a. Trocar

```tsx
import { render, screen, cleanup } from '@testing-library/react';
```

por

```tsx
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
```

5b. Trocar

```tsx
vi.mock('@/hooks/use-dashboard', () => ({
  useNegociosEmRisco: () => ({ data: { total: 0 }, isLoading: false, status: 'success' }),
}));
```

por

```tsx
// Quantos negócios a tabela do time de baixo tem — cada teste do aviso da pauta vazia escolhe.
const cenario = vi.hoisted(() => ({ totalDoTime: 0 }));
vi.mock('@/hooks/use-dashboard', () => ({
  useNegociosEmRisco: () => ({ data: { total: cenario.totalDoTime }, isLoading: false, status: 'success' }),
}));
```

5c. Trocar

```tsx
afterEach(() => {
  cleanup();
  mockPauta.mockReset();
});
```

por

```tsx
afterEach(() => {
  cleanup();
  mockPauta.mockReset();
  cenario.totalDoTime = 0;
});
```

5d. Acrescentar no fim do `describe('os estados da tela "Hoje"', …)`, antes do `});` que o fecha:

```tsx
  it('🔴 zerou com negócios na tabela de baixo: aviso com botão que aponta a tabela', () => {
    cenario.totalDoTime = 145;
    mockPauta.mockReturnValue({ data: [feito('a')], isLoading: false });
    desenhar();
    expect(screen.getByText('Pauta de hoje zerada')).toBeInTheDocument();
    // Este arquivo monta a tela COM a chave `pauta_de_todos`.
    expect(
      screen.getByText('Quer adiantar? Os 145 negócios que pedem atenção estão na tabela logo abaixo.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver a tabela' })).toBeInTheDocument();
  });

  it('zerou com a tabela de baixo vazia: nada para apontar, nenhum aviso', () => {
    mockPauta.mockReturnValue({ data: [feito('a')], isLoading: false });
    desenhar();
    expect(screen.getByText('Pauta de hoje zerada')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver a tabela' })).toBeNull();
  });

  it('"Ver a tabela" desce a tela até a tabela do time', () => {
    cenario.totalDoTime = 145;
    mockPauta.mockReturnValue({ data: [feito('a')], isLoading: false });
    // O Radar é esboço neste arquivo: a âncora de verdade mora na `TabelaDoTime`, e aqui ela é posta
    // à mão. O jsdom não implementa `scrollIntoView`.
    const alvo = document.createElement('div');
    alvo.id = 'tabela-do-time';
    alvo.scrollIntoView = vi.fn();
    document.body.appendChild(alvo);
    try {
      desenhar();
      fireEvent.click(screen.getByRole('button', { name: 'Ver a tabela' }));
      expect(alvo.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    } finally {
      alvo.remove();
    }
  });
```

- [ ] **Step 6: Os testes da tela sem a chave (`Hoje.test.tsx`)**

A frase corrida "O que pede atenção está na tabela logo abaixo — N negócios." sai da tela (é o que o aviso novo substitui). Trocar

```tsx
    it('continua dizendo "Sua fila está vazia", e aponta a tabela de baixo', () => {
      prepararTela({ pauta: [], tabelaDoTime: { total: 5 } });
      montarATela();

      expect(manchete()).toBe('Sua fila está vazia');
      expect(screen.getByText(/O que pede atenção está na tabela logo abaixo — 5 negócios\./)).toBeInTheDocument();
      expect(screen.queryByText(/Seu dia está seu/)).toBeNull();
    });

    it('sem resposta da tabela também — ausência de resposta não é tabela vazia', () => {
      prepararTela({ pauta: [], tabelaDoTime: 'sem resposta' });
      montarATela();

      expect(manchete()).toBe('Sua fila está vazia');
      expect(screen.queryByText(/Seu dia está seu/)).toBeNull();
    });
```

por

```tsx
    it('continua dizendo "Sua fila está vazia", e aponta a tabela de baixo com um botão', () => {
      prepararTela({ pauta: [], tabelaDoTime: { total: 5 } });
      montarATela();

      expect(manchete()).toBe('Sua fila está vazia');
      // Este arquivo monta a tela SEM a chave `pauta_de_todos` (o esboço de
      // `usePossoVerPautaDeTodos` devolve falso): o aviso fala dos negócios da própria pessoa.
      expect(
        screen.getByText('Quer adiantar? Seus 5 negócios que pedem atenção estão na tabela logo abaixo.'),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Ver a tabela' })).toBeInTheDocument();
      expect(screen.queryByText(/Seu dia está seu/)).toBeNull();
    });

    it('sem resposta da tabela também — ausência de resposta não é tabela vazia', () => {
      prepararTela({ pauta: [], tabelaDoTime: 'sem resposta' });
      montarATela();

      expect(manchete()).toBe('Sua fila está vazia');
      expect(screen.queryByText(/Seu dia está seu/)).toBeNull();
      // E não aponta para uma tabela que não respondeu.
      expect(screen.queryByRole('button', { name: 'Ver a tabela' })).toBeNull();
    });
```

- [ ] **Step 7: Rodar e ver falhar**

```bash
npx vitest run src/pages/hoje-estados.test.tsx src/pages/Hoje.test.tsx
```

Esperado: os casos novos e o de "Seus 5 negócios" FALHAM; os demais passam.

- [ ] **Step 8: Implementar em `Hoje.tsx`**

8a. Imports. Trocar `import { Check, Clock, Sun } from 'lucide-react';` por:

```tsx
import { ArrowDown, Check, Clock, Sun } from 'lucide-react';
```

e acrescentar logo abaixo de `import { separarAPauta } from '@/lib/pauta-do-dia';`:

```tsx
import { fraseDoAvisoDaTabela } from '@/lib/aviso-da-tabela';
import { responsavelParaODialogo } from '@/lib/responsavel-para-o-dialogo';
```

8b. O componente do aviso. Acrescentar logo antes de `function ItemPauta({`:

```tsx
/**
 * O AVISO DA PAUTA VAZIA — pedido de 14/09/2026: quando a pauta está vazia, apontar para a tabela
 * logo abaixo, com um botão que desce até ela (a âncora `#tabela-do-time` é da `TabelaDoTime`).
 * Sem negócio na tabela, não aparece nada.
 */
function AvisoDaTabela({ total, podeVerDeTodos }: { total: number; podeVerDeTodos: boolean }) {
  const frase = fraseDoAvisoDaTabela(total, podeVerDeTodos);
  if (!frase) return null;
  return (
    <div className="mt-2 flex max-w-xl flex-wrap items-center justify-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <ArrowDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="text-sm text-card-foreground">{frase}</span>
      <Button
        size="sm"
        onClick={() =>
          document.getElementById('tabela-do-time')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      >
        Ver a tabela
      </Button>
    </div>
  );
}
```

8c. "É meu?" pelo identificador. Em `aoRetomarDaTabela`, trocar

```tsx
    const dono = (linha.responsavel ?? '').trim();
    const euMesmo = dono.toLowerCase() === (profile?.nome ?? '').trim().toLowerCase();
    setAlvo({
      pedidoId: linha.id,
      titulo: linha.nome,
      responsavel: !dono || euMesmo ? null : dono,
    });
```

por

```tsx
    setAlvo({
      pedidoId: linha.id,
      titulo: linha.nome,
      responsavel: responsavelParaODialogo(linha, profile),
    });
```

E, no comentário logo acima de `function aoRetomarDaTabela`, trocar o último parágrafo — da linha que começa com `   * Por isso a comparação com o próprio nome.` até o `   */` que fecha o comentário — por:

```tsx
   * Por isso a pergunta "é meu?", que desde 14/09/2026 compara o IDENTIFICADOR do dono com o de
   * quem está logado — `responsavelParaODialogo` (`src/lib/responsavel-para-o-dialogo.ts`).
   * Comparando nomes, dois homônimos faziam o diálogo prometer "volta para a sua pauta" sobre o
   * negócio do colega (item 69 da dívida técnica). Sem identificador, cai no nome, como antes.
   */
```

8d. O aviso na pauta zerada. Trocar

```tsx
                : `Os ${negociosDoDia} negócios do dia receberam retorno. A pauta de amanhã nasce de manhã.`}
            </p>
          </div>
```

por

```tsx
                : `Os ${negociosDoDia} negócios do dia receberam retorno. A pauta de amanhã nasce de manhã.`}
            </p>
            {/* Só com a tabela de baixo RESPONDIDA: apontar para uma tabela que ainda carrega, ou que
                deu erro, seria prometer uma lista que a pessoa não vai encontrar. */}
            {timeRespondeu && <AvisoDaTabela total={totalDoTime} podeVerDeTodos={podeVerDeTodos} />}
          </div>
```

8e. O aviso na fila vazia. Trocar

```tsx
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              Nada seu passou do prazo e não há compromisso na agenda de hoje.{' '}
              {totalDoTime > 0
                ? `O que pede atenção está na tabela logo abaixo — ${totalDoTime} ${totalDoTime === 1 ? 'negócio' : 'negócios'}.`
                : 'O que pede atenção está na tabela logo abaixo.'}
            </p>
```

por

```tsx
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              Nada seu passou do prazo e não há compromisso na agenda de hoje.
            </p>
            {/* O aviso com botão substitui a frase corrida que dizia a mesma coisa e passava batida
                (pedido de 14/09/2026). Sem resposta da tabela, não há aviso — pelo mesmo motivo do
                estado de cima. */}
            {timeRespondeu && <AvisoDaTabela total={totalDoTime} podeVerDeTodos={podeVerDeTodos} />}
```

- [ ] **Step 9: Rodar e ver passar**

```bash
npx vitest run src/pages/hoje-estados.test.tsx src/pages/Hoje.test.tsx src/lib/aviso-da-tabela.test.ts src/lib/responsavel-para-o-dialogo.test.ts
```

Esperado: todos passam.

- [ ] **Step 10: Tipos e commit**

```bash
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "pages/Hoje\.tsx|hoje-estados|Hoje\.test|aviso-da-tabela|responsavel-para-o-dialogo"
```

Esperado: nada impresso.

```bash
git add -N src/lib/aviso-da-tabela.ts src/lib/aviso-da-tabela.test.ts src/lib/responsavel-para-o-dialogo.ts src/lib/responsavel-para-o-dialogo.test.ts
git commit -m "feat(hoje): a pauta vazia aponta para a tabela com um botao, e o e meu? compara o identificador

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" --only -- src/lib/aviso-da-tabela.ts src/lib/aviso-da-tabela.test.ts src/lib/responsavel-para-o-dialogo.ts src/lib/responsavel-para-o-dialogo.test.ts src/pages/Hoje.tsx src/pages/hoje-estados.test.tsx src/pages/Hoje.test.tsx
```

---

### Task 8: Sons sem o rótulo, e o item 69 da dívida em "Resolvidos"

**Files:**
- Modify: `src/components/configuracoes/CardDeSom.tsx` (linha 99), `src/components/configuracoes/CardDeSom.test.tsx` (linha 27)
- Modify: `docs/divida-tecnica.md` (item 69, perto da linha 2737; seção "Resolvidos", perto da linha 2865)

**Interfaces:**
- Consumes: os nomes das Tarefas 3 e 7 (`20260914153000_tabela_do_time_com_rosto.sql`, `responsavelParaODialogo`), só para o texto da dívida.
- Produces: nada.

- [ ] **Step 1: O teste que falha**

Em `src/components/configuracoes/CardDeSom.test.tsx`, trocar

```tsx
    expect(screen.getByText('Criados pela Repply')).toBeTruthy();
```

por

```tsx
    // 🔴 Sem o rótulo "Criados pela Repply" (pedido de 14/09/2026): para quem usa, todos os sons
    // foram feitos pela Repply, e o rótulo separava a lista sem motivo.
    expect(screen.queryByText('Criados pela Repply')).toBeNull();
```

```bash
npx vitest run src/components/configuracoes/CardDeSom.test.tsx
```

Esperado: esse caso FALHA.

- [ ] **Step 2: Tirar o rótulo**

Em `src/components/configuracoes/CardDeSom.tsx`, remover só a linha:

```tsx
            <p className="px-2 pt-2 text-[11px] text-muted-foreground">Criados pela Repply</p>
```

As duas listas (`principais` e `daRepply`) continuam na mesma ordem, uma logo depois da outra.

```bash
npx vitest run src/components/configuracoes/CardDeSom.test.tsx
```

Esperado: todos passam, e o caso dos 10 sons continua verde.

- [ ] **Step 3: O item 69 sai da lista de abertos**

Em `docs/divida-tecnica.md`, remover o bloco que começa na linha `## 69. "É meu?" decidido pelo NOME na tabela do time — com homônimos, a tela diz uma coisa e o banco faz outra` e vai até a linha `---` logo antes de `## 70. Datas que mudam de dia fora do banco: o que sobrou da varredura de 11/09` — incluindo essa linha `---` e a linha em branco depois dela. (O índice do topo do arquivo não tem linha para o item 69; não há o que tirar lá.)

Conferir:

```bash
grep -c '^## 69\.' docs/divida-tecnica.md
grep -n -B 3 '^## 70\.' docs/divida-tecnica.md
```

Esperado: `0`; e, acima de `## 70.`, uma linha `---` com uma linha em branco de cada lado, logo depois do fim do item 68.

- [ ] **Step 4: O item 69 entra em "Resolvidos"**

A regra do próprio arquivo: "Ao resolver um item, mova-o para uma seção 'Resolvidos' no fim deste documento, com a data e o commit". As entradas de lá são `### DD/MM/AAAA — título`, a mais nova em cima. Logo abaixo da linha `## Resolvidos` e da linha em branco que a segue — antes de `### 21/08/2026 — seleção em massa na lista de Negócios` —, acrescentar:

```markdown
### 14/09/2026 — "é meu?" da tabela do time decidido pelo identificador (era o item 69)

> ✅ **Resolvido na leva de 14/09/2026** — migration `20260914153000_tabela_do_time_com_rosto.sql`
> e `src/lib/responsavel-para-o-dialogo.ts`. Os commits são os que tocam esses dois arquivos
> (`git log -- src/lib/responsavel-para-o-dialogo.ts`).

**O que estava errado.** "Retomar depois" clicado na tabela do time decidia se o negócio era de
quem estava olhando comparando o NOME do dono com o de quem estava logado, porque
`negocios_em_risco` devolvia só o nome. Com dois homônimos na mesma empresa, a tela afirmava "o
negócio volta para a sua pauta" e "uma tarefa foi criada no seu nome", enquanto o banco,
corretamente, mandava a tarefa e o aviso para a homônima. Medido em 10/09/2026: nenhum homônimo
entre 38 usuários vivos — e nada no banco impedia o primeiro.

**O conserto.** As duas funções da tabela passaram a devolver `responsavel_id` (e
`responsavel_avatar`, para o rosto na coluna Responsável). `responsavelParaODialogo` compara o
identificador do dono com `profile.id`; sem identificador — site novo falando com o banco anterior
à migration —, volta a comparar o nome, como antes.

```

- [ ] **Step 5: Commitar**

```bash
git commit -m "docs(configuracoes): a lista de sons perde o rotulo Criados pela Repply, e o item 69 da divida vai para Resolvidos

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" --only -- src/components/configuracoes/CardDeSom.tsx src/components/configuracoes/CardDeSom.test.tsx docs/divida-tecnica.md
```

---

### Task 9: Publicar, com os portões

**Quem executa:** o controlador. 🔴 **Três portões do dono do produto, nesta ordem:** o "pode" da mudança no banco, o aval das fotos da tela, e só então o site. Nada pula portão.

- [ ] **Step 1: Verificação completa numa cópia isolada**

Pelo roteiro da memória `worktree-com-juncao-apaga-node-modules`: `git worktree add --detach ../<pasta> origin/main`, junção do `node_modules`, `.env` copiado. Na cópia, medir os erros de tipo e o eslint dos arquivos da leva ANTES; cherry-pick de TODOS os commits desta leva — desenho, plano e Tarefas 1 a 8, na ordem —; e então:

```bash
npm run build
npx vitest related --run <todos os arquivos que a leva tocou>
npx tsc --noEmit -p tsconfig.app.json
npx eslint <todos os arquivos que a leva tocou>
```

Esperado: o build compila; os testes passam; os erros de tipo não sobem em relação ao medido antes na mesma cópia; o eslint não acusa mais problemas nos arquivos modificados do que acusava antes, e nenhum nos arquivos novos. 🔴 **Remover a junção ANTES de apagar a cópia**, no fim da Tarefa.

- [ ] **Step 2: Ensaio no banco (só com o "pode ensaiar")**

Pelo método da memória `ensaio-de-migration-em-producao`, com o arquivo commitado:
1. **Sonda** — criar tabela, inserir e terminar em erro; `to_regclass` tem de voltar nulo.
2. **Conferir de novo** md5 e permissão de antes (Global Constraints). Se algum mudou, **parar**: alguém mexeu depois da revisão deste plano.
3. **Arquivo de volta**, no scratchpad: `DROP` das duas novas e `CREATE` com a saída de `pg_get_functiondef` de agora, com o `REVOKE`/`GRANT` de hoje.
4. **Ensaio, num `execute_sql` só**, com uma pessoa COM a chave `pauta_de_todos` e uma SEM, escolhidas na hora (os identificadores ficam só na conversa, nunca em arquivo):
   - `set_config('lock_timeout', '5s', true)`;
   - tabela temporária `antes` com `negocios_em_risco_de(<pessoa>, p_limite := 100)` das duas pessoas, marcando quem é quem;
   - a migration sem o `BEGIN;` e o `COMMIT;`;
   - tabela temporária `depois` com a mesma chamada;
   - conferências:
     - (a) `antes EXCEPT depois` e `depois EXCEPT antes`, nas nove colunas antigas → **0 e 0** (mesmos negócios, mesma ordem de valor, mesmos totais);
     - (b) linhas de `depois` com `responsavel_id` nulo → **0**; quantas têm `responsavel_avatar`;
     - (c) a permissão das duas funções igual à de antes;
     - (d) `md5(prosrc)` das duas igual ao "depois" do Global Constraints;
     - (e) COMO USUÁRIO DE VERDADE (`set_config('request.jwt.claims', …)` + `set_config('role', 'authenticated', true)`), para cada pessoa: `negocios_em_risco(p_limite := 100)` devolve o mesmo número de linhas e o mesmo `total_geral` de `depois`, com as duas colunas novas; e chamar `negocios_em_risco_de` é **RECUSADO** (`insufficient_privilege`); depois `reset role`;
   - `raise exception 'ENSAIO-RESULTADO %', <json com tudo>` no fim, para desfazer.
5. Mostrar ao dono do produto o resultado e a rota de volta, e **pedir o "pode"**.

- [ ] **Step 3: Aplicar e conferir**

Com o "pode": `apply_migration` (nome `tabela_do_time_com_rosto`) com o conteúdo commitado. Logo depois:
- permissão das duas igual à de antes — 🔴 se `authenticated` aparecer em `negocios_em_risco_de`, **reemitir a permissão na hora**;
- `md5(prosrc)` das duas igual ao "depois" do Global Constraints;
- a chamada como usuário de verdade devolvendo as duas colunas.

- [ ] **Step 4: Fotos da tela para o dono do produto**

Na cópia isolada, subir o servidor de desenvolvimento por uma configuração própria no `.claude/launch.json`, numa porta livre, e abrir no navegador embutido. **O login é do dono do produto** — eu não digito senha. Fotos, no tema claro e no escuro:
- a tela "Hoje" inteira;
- a tabela do time com os rostos, as colunas cabendo e os botões laranja; uma coluna arrastada e depois restaurada com dois cliques;
- os cartões de risco, o resumo por fabricante e o gráfico;
- o aviso da pauta vazia. Se a pauta de quem está logado não estiver vazia, a foto sai de uma troca TEMPORÁRIA só na cópia isolada — em `Hoje.tsx`, `const total = naTela.length;` vira `const total = 0;` —, desfeita com `git checkout -- src/pages/Hoje.tsx` logo depois da foto e **nunca commitada**;
- Configurações, no cartão de som das notificações, sem o rótulo.

Ajustar a opacidade da faixa (`bg-foreground/[0.06]`) se a foto pedir. Se a tabela ficar apertada com 926 px, mostrar também a variante com a página em até 1.152 px (`max-w-6xl` no lugar de `max-w-5xl` na `div` de fora de `Hoje.tsx`) — a escolha é do dono do produto. Cada ajuste escolhido vira um commit próprio, com foto refeita. **Só seguir com a aprovação dele.**

- [ ] **Step 5: Publicar o site**

Cherry-pick de todos os commits desta leva — desenho, plano, Tarefas 1 a 8 e os ajustes de foto — sobre `origin/main`, pelo roteiro de envio sem corrida: conferir sobreposição com commits novos de outras sessões, `git fetch` e push na mesma janela. Conferir a publicação na Vercel pelo SHA (`gh api repos/Repply-Hub/Repply-CRM/commits/<sha>/status`) e procurar no código publicado as frases "Ver a tabela" e "Ajustar a largura da coluna".

- [ ] **Step 6: Limpar**

Parar o servidor da cópia isolada; 🔴 **remover a junção do `node_modules` antes de apagar a pasta**; conferir que o `node_modules` de verdade continua inteiro (`npx vitest --version` na pasta principal).
