# Plano A — Ver o negócio sem sair da tela

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: use `superpowers:subagent-driven-development`
> (recomendado) ou `superpowers:executing-plans`, tarefa a tarefa. Os passos usam caixinha
> (`- [ ]`) para marcar progresso.

**Objetivo:** tirar o painel de detalhe do negócio de dentro de `src/pages/Negocios.tsx` e
transformá-lo numa peça própria, usada também pela fila da tela "Hoje", pela tabela de risco e
pelas fichas de empresa e de contato — de modo que "Abrir negócio" pare de tirar a pessoa da tela
onde ela está.

**Arquitetura:** o bloco `viewOrderSheet` (linhas 2320–2702 de `Negocios.tsx`) mais os dois
diálogos de tarefa (2705–2723) e o `FilePreviewDialog` (3727) viram um componente só,
`PainelDoNegocio`, que **busca os próprios dados** a partir de um identificador. As telas passam
a montar `<PainelDoNegocio pedidoId={…} onClose={…} />` em vez de navegar. O parâmetro de
endereço `?negocio=<id>` deixa de ser exclusivo da tela de Negócios e passa a valer em qualquer
tela, por um hook compartilhado.

**Pilha:** React 18 + TypeScript + Vite · React Router 6 · TanStack Query v5 · shadcn/Radix ·
Vitest.

## Restrições globais

Valem para **todas** as tarefas deste plano.

- **PT-BR** em interface, comentário, mensagem de erro e commit. Nunca traduza nome de tabela,
  coluna ou variável para inglês — o banco e o código são em português por decisão (CLAUDE.md §5).
- **Verificação antes de dizer "feito"** (CLAUDE.md §9), com estes números como linha de base:
  - `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -cE "error TS"` → **31**. O `-p` é
    obrigatório; sem ele o comando não confere nada e devolve sucesso.
  - `npm run test` → **1140** testes verdes em 81 arquivos. O seu número tem que ser ≥ isso.
  - `npm run build` → tem que compilar.
  - `npx eslint <arquivos tocados>` → o total do projeto (433) não pode subir.
- **Git:** `git status --short` num comando **separado** antes de commitar. Outra sessão do Claude
  trabalha nesta mesma pasta e no mesmo índice do git. Se aparecer arquivo que não é seu, **PARE
  e avise**. Nunca `git add -A`. Arquivo novo: `git add <arquivo>`. Arquivo já versionado:
  `git commit -m "<msg>" --only -- <caminhos>` (o `-m` **antes** do `--only`).
  Toda mensagem de commit termina com:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- **Nada de publicar.** Sem `git push`. Sem `apply_migration`. Este plano não toca no banco.
- **`<ConteudoDialogo>`/`ConteudoDoPainel`, nunca `<DialogContent>` cru** (CLAUDE.md §7.11).
- **`lazyComRetry`, nunca `React.lazy` direto** (CLAUDE.md §7.5).
- **Erro do Supabase não é `Error`** (CLAUDE.md §4.6): use `mensagemDeErro` de
  `src/lib/mensagem-de-erro.ts`, nunca `e instanceof Error ? e.message : '...'`.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/components/pedidos/PainelDoNegocio.tsx` **(novo)** | O painel inteiro: busca o negócio pelo identificador, desenha os quatro estados, e leva junto os diálogos que só ele usa (nova tarefa, editar tarefa, prévia de arquivo) |
| `src/hooks/use-negocio-no-endereco.ts` **(novo)** | Lê e escreve `?negocio=<id>` em **qualquer** tela, preservando os outros parâmetros |
| `src/hooks/use-negocio-no-endereco.test.ts` **(novo)** | Prende o contrato do parâmetro: preserva o resto, remove ao fechar |
| `src/test/painel-do-negocio-e-uma-peca-so.test.ts` **(novo)** | Guarda estrutural: impede que uma segunda cópia do painel nasça em outra tela |
| `src/pages/Negocios.tsx` | Passa a montar o componente. Perde ~420 linhas |
| `src/pages/Hoje.tsx` | A fila abre o painel em vez de navegar |
| `src/components/pauta/RadarDeRisco.tsx` | A tabela abre o painel em vez de navegar |
| `src/components/pedidos/PainelDeNegocios.tsx` | As fichas de empresa e contato abrem o painel em vez de navegar |

---

## Tarefa 1: `PainelDoNegocio` nasce, e Negócios passa a usá-lo

Esta tarefa **não muda nenhum comportamento**. Ao terminar, a tela de Negócios tem que fazer
exatamente o que fazia — o painel abre pelo `?negocio=`, pelo clique na linha, mostra os mesmos
quatro estados, e os botões Editar/Fechar/Excluir agem igual.

**Arquivos:**
- Criar: `src/components/pedidos/PainelDoNegocio.tsx`
- Modificar: `src/pages/Negocios.tsx` (remover 2320–2702, 2705–2723 e a linha 3727; montar o
  componente no lugar)

**Interfaces:**
- Consome: `usePedidoPorId(pedidoId?: string | null, habilitado = true)` de `@/hooks/use-pedidos`
  — já existe, devolve `PedidoWithRelations | null` e cobre carregando/erro/não-encontrado.
- Produz:
  ```ts
  export interface PainelDoNegocioProps {
    /** Identificador do negócio. `null` mantém o painel fechado. */
    pedidoId: string | null;
    /** Chamado ao fechar por qualquer caminho: botão Fechar, Esc, clique fora. */
    onClose: () => void;
    /**
     * Exclusão. Quando NÃO for passada, o botão Excluir não é desenhado.
     * Só a tela de Negócios passa: a exclusão de lá reaproveita a máquina de seleção em massa
     * (`setSelected` + `setConfirmDeleteOpen`), que não existe nas outras telas.
     */
    onExcluir?: (pedidoId: string) => void;
  }
  export function PainelDoNegocio(props: PainelDoNegocioProps): JSX.Element;
  ```

- [ ] **Passo 1: criar o arquivo com o esqueleto e os dados**

Crie `src/components/pedidos/PainelDoNegocio.tsx` começando por este cabeçalho — os imports são
exatamente os que `Negocios.tsx` já usa para o bloco (linhas 8, 19–22, 25–30 e 78 de lá):

```tsx
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Sheet, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Building, Calendar as CalendarIcon, Clock, DollarSign, Factory, FileText, History, Loader2, MessageSquare, Pencil, Plus, Tag, Trash2, User } from 'lucide-react';
import { ConteudoDoPainel, CabecalhoDoPainel, CorpoDoPainel, RodapeDoPainel } from '@/components/shared/DialogoResponsivo';
import { PainelDeResponsaveis } from '@/components/pedidos/PainelDeResponsaveis';
import { HistoricoMovimentacaoNegocio } from '@/components/pedidos/HistoricoMovimentacaoNegocio';
import { ComentariosNegocio } from '@/components/pedidos/ComentariosNegocio';
import { ContatosDoNegocio } from '@/components/pedidos/ContatosDoNegocio';
import { HistoricoDoNegocio } from '@/components/pedidos/HistoricoDoNegocio';
import { UserProfilePopover } from '@/components/layout/UserProfilePopover';
import { TarefaFormDialog } from '@/components/tarefas/TarefaFormDialog';
import { FilePreviewDialog, type FilePreviewTarget } from '@/components/chat/FilePreviewDialog';
import { usePedidoPorId, usePedidoHistoricoStatus } from '@/hooks/use-pedidos';
import { useTarefasPorPedido, type Tarefa } from '@/hooks/use-tarefas';
import { useTarefasKanbanColunas } from '@/hooks/use-tarefas-kanban-colunas';
import { useSecaoLigada } from '@/hooks/use-secoes';
import { useAuth } from '@/hooks/use-auth';
```

⚠️ **Confira cada caminho de import contra `Negocios.tsx` antes de escrever.** Alguns nomes deste
projeto enganam: `ConteudoDoPainel` vem de `DialogoResponsivo`, não de `ui/sheet`; e
`PainelDeResponsaveis` (o do negócio) não é `PainelDeNegocios` (o das fichas). Se algum símbolo
não existir no caminho que você escreveu, o `tsc` acusa — rode-o antes de seguir.

O corpo do componente recria o estado que hoje mora em `Negocios.tsx`:

```tsx
export function PainelDoNegocio({ pedidoId, onClose, onExcluir }: PainelDoNegocioProps) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const empresaId = profile?.empresa_id ?? profile?.empresas?.id ?? undefined;

  // O painel busca o próprio negócio. É o que permite abri-lo de uma tela que não carregou a
  // lista — a pauta e a tabela de risco mostram justamente os negócios mais parados, que quase
  // nunca estão na primeira página da lista de Negócios (Etapa 1, 05/09/2026).
  const { data: negocio, isLoading, isError } = usePedidoPorId(pedidoId);
  const { data: tarefasNegocio } = useTarefasPorPedido(pedidoId);
  const { data: historicoStatusNegocio } = usePedidoHistoricoStatus(pedidoId);
  const { data: tarefasKanbanColunas = [] } = useTarefasKanbanColunas(empresaId);
  const tarefaKanbanStages = tarefasKanbanColunas.map(c => ({ key: c.slug, label: c.nome }));

  // `=== true` em todo uso, nunca `!== false`: enquanto a resposta não chega, a cascata esconde.
  // Bloco que aparece e some meio segundo depois é pior de usar que bloco que demora.
  const { ligada: temTarefas } = useSecaoLigada('tarefas');
  const { ligada: temObras } = useSecaoLigada('obras');

  const [addTarefaOpen, setAddTarefaOpen] = useState(false);
  const [editingTarefaNegocio, setEditingTarefaNegocio] = useState<Tarefa | null>(null);
  const [pdfPreview, setPdfPreview] = useState<FilePreviewTarget | null>(null);
  // …JSX no Passo 2
}
```

- [ ] **Passo 2: mover o JSX, sem reescrever**

Copie **literalmente** as linhas 2320–2702 de `src/pages/Negocios.tsx` para dentro do `return` do
componente, e depois faça só estas substituições mecânicas:

| No original | No componente |
|---|---|
| `selectedViewOrder` | `negocio` |
| `viewOrderId` | `pedidoId` |
| `fecharPainel` | `onClose` |
| `open={!!viewOrderId}` | `open={!!pedidoId}` |
| o bloco `onClick` do botão Excluir | `onClick={() => onExcluir?.(pedidoId!)}` |
| o botão Excluir inteiro | envolvido em `{onExcluir && ( … )}` |

🔴 **Não "melhore" nada enquanto move.** Os comentários daquele bloco registram achados de
revisão — por exemplo, o de 06/09/2026 explicando por que Editar e Fechar ficam sempre montados
com `disabled` em vez de sumir e aparecer. Apagar o comentário é apagar o motivo, e o próximo
leitor desfaz o conserto. Traga todos.

Logo abaixo do `</Sheet>`, dentro de um fragmento, traga os três diálogos que hoje vivem soltos
em `Negocios.tsx` (linhas 2705–2723 e 3727) — eles só servem a este painel:

```tsx
      <TarefaFormDialog
        open={addTarefaOpen}
        onOpenChange={setAddTarefaOpen}
        editingTarefa={null}
        kanbanStages={tarefaKanbanStages}
        extraFields={{ pedido_id: pedidoId!, cliente_id: negocio?.cliente_id }}
      />
      <TarefaFormDialog
        open={!!editingTarefaNegocio}
        onOpenChange={(open) => { if (!open) setEditingTarefaNegocio(null); }}
        editingTarefa={editingTarefaNegocio}
        kanbanStages={tarefaKanbanStages}
        extraFields={{ pedido_id: pedidoId!, cliente_id: negocio?.cliente_id }}
      />
      <FilePreviewDialog file={pdfPreview} onClose={() => setPdfPreview(null)} />
```

- [ ] **Passo 3: conferir que os quatro estados continuam lá**

O painel tem quatro estados e os quatro estão no bloco que você moveu. Leia o seu arquivo e
confirme que existem:

1. **achado** — desenha o negócio;
2. **carregando** — `isLoading`, com o `Loader2` girando;
3. **erro** — `isError`;
4. **não disponível** — busca terminou e voltou vazio: *"Este negócio não está mais disponível."*

O quarto é o que impede o painel de girar para sempre quando o identificador não existe mais, e
`src/test/painel-do-negocio-busca-por-id.test.ts` (da Etapa 1) já o prende. Se você perdeu algum,
volte ao original e traga.

- [ ] **Passo 4: Negócios passa a montar o componente**

Em `src/pages/Negocios.tsx`:

1. Apague as linhas 2320–2702 (`const viewOrderSheet = ( … )`), 2705–2723 (`addTarefaDialog` e
   `editTarefaDialog`) e a 3727 (`<FilePreviewDialog … />`).
2. Apague o estado que só eles usavam: `addTarefaOpen`, `editingTarefaNegocio`, `pdfPreview`
   (linhas 710–712) e os hooks `useTarefasPorPedido`, `usePedidoHistoricoStatus`,
   `useTarefasKanbanColunas`, `tarefaKanbanStages`. **Confira com `grep` que ninguém mais os usa
   antes de apagar** — `temObras` e `temTarefas`, por exemplo, são usados fora do painel também.
3. No lugar de `{viewOrderSheet}` (linha 3721), monte:

```tsx
      <PainelDoNegocio
        pedidoId={viewOrderId}
        onClose={fecharPainel}
        onExcluir={(alvo) => {
          // A exclusão daqui reaproveita a máquina de seleção em massa desta tela. Por isso ela
          // é `prop` e não vive dentro do painel: as outras telas não têm essa máquina.
          fecharPainel();
          setDeleteAllFilteredMode(false);
          setSelected(new Set([alvo]));
          setConfirmDeleteOpen(true);
        }}
      />
```

4. Apague os imports que ficaram órfãos. O `tsc` **não** acusa import não usado neste projeto
   (`noUnusedLocals` está desligado) — quem acusa é o `eslint`. Rode-o nos arquivos tocados.

- [ ] **Passo 5: guarda estrutural contra a segunda cópia**

Crie `src/test/painel-do-negocio-e-uma-peca-so.test.ts`. Este teste existe porque o projeto já se
machucou exatamente assim: a ficha do contato e a da empresa tinham dois painéis copiados, e a
correção de um não alcançava o outro (commit `3069249d`, 07/09/2026). O mesmo vale para a leitura
de planilha (CLAUDE.md §7.14).

A varredura segue **exatamente** a técnica de `src/test/uma-leitura-de-planilha-so.test.ts`, que
já funciona neste repositório — recursão com `readdirSync`, sem depender de `glob`:

```ts
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function arquivosDeCodigo(dir: string, achados: string[] = []): string[] {
  for (const item of readdirSync(dir)) {
    if (item === 'node_modules' || item === 'dist') continue;
    const caminho = join(dir, item);
    if (statSync(caminho).isDirectory()) {
      arquivosDeCodigo(caminho, achados);
    } else if (/\.(ts|tsx)$/.test(item) && !/\.test\.(ts|tsx)$/.test(item)) {
      achados.push(caminho);
    }
  }
  return achados;
}

/**
 * O painel de detalhe do negócio existe UMA vez, em PainelDoNegocio.tsx.
 *
 * Se este teste falhar, alguém está desenhando um segundo painel em outra tela. O caminho certo
 * é montar `<PainelDoNegocio pedidoId={…} onClose={…} />`, não recriar o Sheet.
 *
 * Existe porque o projeto já se machucou assim: a ficha da empresa e a do contato tinham dois
 * painéis copiados, e o conserto de um não alcançava o outro (commit 3069249d, 07/09/2026).
 */
describe('o painel do negócio é uma peça só', () => {
  it('🔴 só PainelDoNegocio.tsx monta o painel de detalhe do negócio', () => {
    const culpados = arquivosDeCodigo('src')
      .filter((c) => !c.endsWith('PainelDoNegocio.tsx'))
      .filter((c) => {
        const texto = readFileSync(c, 'utf8');
        return texto.includes('CabecalhoDoPainel') && texto.includes('usePedidoPorId');
      });
    expect(culpados).toEqual([]);
  });
});
```

⚠️ **Confira o par de marcas antes de fechar a tarefa.** O teste acusa quem usa `CabecalhoDoPainel`
**e** `usePedidoPorId` no mesmo arquivo. Se depois da Tarefa 1 sobrar algum arquivo legítimo com
essa combinação (por exemplo o painel de Obras, que usa `CabecalhoDoPainel` mas não
`usePedidoPorId`), o teste passa. Rode-o e leia a lista antes de dar por encerrado — se vier
alguém legítimo, acrescente uma lista de permitidos como a `PODEM_LER_PLANILHA` do teste vizinho,
em vez de afrouxar a marca.

- [ ] **Passo 6: rodar e conferir**

```bash
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -cE "error TS"
npm run test
npm run build
npx eslint src/components/pedidos/PainelDoNegocio.tsx src/pages/Negocios.tsx
```

Esperado: **31** · **≥1141** verdes (os 1140 + o novo) · build compila · eslint sem erro novo.

Confira também o encolhimento, que é metade do motivo desta tarefa:

```bash
wc -l src/pages/Negocios.tsx
```
Esperado: por volta de **3.310** linhas (eram 3.732).

- [ ] **Passo 7: commitar**

```bash
git status --short
git add src/components/pedidos/PainelDoNegocio.tsx src/test/painel-do-negocio-e-uma-peca-so.test.ts
git commit -m "refactor(negocios): o painel de detalhe vira peca propria, sem mudar comportamento

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" --only -- src/components/pedidos/PainelDoNegocio.tsx src/test/painel-do-negocio-e-uma-peca-so.test.ts src/pages/Negocios.tsx
```

---

## Tarefa 2: `?negocio=<id>` passa a valer em qualquer tela

**Arquivos:**
- Criar: `src/hooks/use-negocio-no-endereco.ts`
- Criar: `src/hooks/use-negocio-no-endereco.test.ts`

**Interfaces:**
- Produz:
  ```ts
  /** Lê e escreve `?negocio=<id>` preservando todos os outros parâmetros da tela. */
  export function useNegocioNoEndereco(): {
    negocioAberto: string | null;
    abrirNegocio: (id: string) => void;
    fecharNegocio: () => void;
  };
  /** A parte pura, para poder testar sem montar React. */
  export function comNegocio(busca: URLSearchParams, id: string | null): URLSearchParams;
  ```

- [ ] **Passo 1: escrever o teste que falha**

Crie `src/hooks/use-negocio-no-endereco.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { comNegocio } from './use-negocio-no-endereco';

describe('comNegocio', () => {
  it('acrescenta o negócio sem apagar os outros filtros', () => {
    const antes = new URLSearchParams('etapas=negociacao&fabricantes=abc');
    const depois = comNegocio(antes, 'n-1');
    expect(depois.get('negocio')).toBe('n-1');
    expect(depois.get('etapas')).toBe('negociacao');
    expect(depois.get('fabricantes')).toBe('abc');
  });

  it('remove o parâmetro quando o negócio é nulo, e preserva o resto', () => {
    const antes = new URLSearchParams('negocio=n-1&etapas=negociacao');
    const depois = comNegocio(antes, null);
    expect(depois.has('negocio')).toBe(false);
    expect(depois.get('etapas')).toBe('negociacao');
  });

  it('não modifica o objeto recebido', () => {
    const antes = new URLSearchParams('etapas=negociacao');
    comNegocio(antes, 'n-1');
    expect(antes.has('negocio')).toBe(false);
  });
});
```

O terceiro caso não é preciosismo: `URLSearchParams` é mutável, e `setSearchParams` do React
Router recebe o objeto por referência. Mutar o que veio produz telas que mudam de filtro sozinhas
— foi por isso que `escreverFiltrosNoEndereco` (`src/lib/filtros-do-painel.ts`, Etapa 2) devolve
uma cópia. **Leia aquele arquivo e siga o mesmo padrão.**

- [ ] **Passo 2: rodar e ver falhar**

```bash
npx vitest run src/hooks/use-negocio-no-endereco.test.ts
```
Esperado: FALHA — `Failed to resolve import "./use-negocio-no-endereco"`.

- [ ] **Passo 3: escrever o hook**

```ts
import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Devolve uma CÓPIA da busca com `?negocio=<id>` posto ou tirado.
 *
 * Cópia, não o original: `URLSearchParams` é mutável e o React Router recebe o objeto por
 * referência — mutar o que veio faz a tela trocar de filtro sozinha. Mesmo motivo de
 * `escreverFiltrosNoEndereco` em `src/lib/filtros-do-painel.ts`.
 */
export function comNegocio(busca: URLSearchParams, id: string | null): URLSearchParams {
  const copia = new URLSearchParams(busca);
  if (id) copia.set('negocio', id);
  else copia.delete('negocio');
  return copia;
}

/**
 * O negócio aberto vive no ENDEREÇO, não em estado da tela.
 *
 * Assim recarregar a página mantém o painel aberto, o botão de voltar do navegador o fecha, e o
 * link serve para mandar a alguém. É o mesmo parâmetro que a tela de Negócios já usava — o que
 * muda é que agora ele vale em qualquer tela.
 */
export function useNegocioNoEndereco() {
  const [busca, setBusca] = useSearchParams();
  const negocioAberto = busca.get('negocio');

  const abrirNegocio = useCallback(
    (id: string) => setBusca(comNegocio(busca, id), { replace: false }),
    [busca, setBusca],
  );
  // `replace: true` ao fechar: abrir e fechar o painel não deve encher o histórico do navegador
  // de passos que a pessoa não deu.
  const fecharNegocio = useCallback(
    () => setBusca(comNegocio(busca, null), { replace: true }),
    [busca, setBusca],
  );

  return { negocioAberto, abrirNegocio, fecharNegocio };
}
```

- [ ] **Passo 4: rodar e ver passar**

```bash
npx vitest run src/hooks/use-negocio-no-endereco.test.ts
```
Esperado: **3 passed**.

- [ ] **Passo 5: commitar**

```bash
git status --short
git add src/hooks/use-negocio-no-endereco.ts src/hooks/use-negocio-no-endereco.test.ts
git commit -m "feat(negocios): o negocio aberto passa a viver no endereco de qualquer tela

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tarefa 3: a tela "Hoje" abre o painel sem sair do lugar

**Arquivos:**
- Modificar: `src/pages/Hoje.tsx` (o `navigate` das linhas ~206–211)
- Modificar: `src/components/pauta/RadarDeRisco.tsx` (o `navigate` da linha ~297)

**Interfaces:**
- Consome: `PainelDoNegocio` (Tarefa 1) e `useNegocioNoEndereco` (Tarefa 2).

- [ ] **Passo 1: a fila**

Em `src/pages/Hoje.tsx`, o botão hoje faz:

```tsx
navigate(
  ehCompromisso ? '/agenda' : `/app?negocio=${item.referencia_id}`,
)
```

Troque por `abrirNegocio(item.referencia_id)` **só no ramo do negócio** — compromisso continua
indo para a agenda, que é outra tela de verdade:

```tsx
const { negocioAberto, abrirNegocio, fecharNegocio } = useNegocioNoEndereco();
// …
onClick={() => (ehCompromisso ? navigate('/agenda') : abrirNegocio(item.referencia_id))}
```

E monte o painel uma vez, no fim do JSX da página:

```tsx
      <PainelDoNegocio pedidoId={negocioAberto} onClose={fecharNegocio} />
```

Repare que **não** passamos `onExcluir`: excluir um negócio a partir da pauta não foi pedido, e o
botão simplesmente não é desenhado.

- [ ] **Passo 2: a tabela de risco**

Em `src/components/pauta/RadarDeRisco.tsx`, a linha clicável hoje faz
`onClick={() => navigate(`/app?negocio=${n.id}`)}`. Troque por `onClick={() => abrirNegocio(n.id)}`,
usando o mesmo hook. **Não monte um segundo `PainelDoNegocio` aqui** — a página já monta um, e o
identificador vem do endereço, que os dois leem. Um segundo painel abriria duas cópias
sobrepostas.

Atualize o comentário da linha ~265, que hoje descreve o caminho antigo (`/app?negocio=<id>`),
para dizer que a tabela abre o painel na própria tela. Comentário que descreve o que o código
não faz mais é pior que comentário nenhum.

- [ ] **Passo 3: conferir no navegador de verdade**

Use as ferramentas do painel do navegador (`preview_start` com o servidor de desenvolvimento).
Não peça ao Lucas para conferir à mão — prove.

1. Abrir `/hoje`, clicar em "Abrir negócio" num item da fila → o painel abre **sobre** a tela
   "Hoje"; a fila continua atrás; o endereço vira `/hoje?negocio=<id>`.
2. Recarregar a página com esse endereço → o painel abre já aberto.
3. Fechar → o endereço volta a `/hoje` e a fila continua onde estava.
4. Clicar numa linha da tabela "Os 10 maiores em risco" → o mesmo painel abre.
5. Ler o console (`read_console_messages`) → sem erro.

- [ ] **Passo 4: rodar a verificação e commitar**

```bash
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -cE "error TS"
npm run test
npm run build
git status --short
git commit -m "feat(hoje): abrir negocio deixa de tirar a pessoa da tela

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" --only -- src/pages/Hoje.tsx src/components/pauta/RadarDeRisco.tsx
```

---

## Tarefa 4: as fichas de empresa e de contato abrem o painel

**Arquivos:**
- Modificar: `src/components/pedidos/PainelDeNegocios.tsx`

**Interfaces:**
- Consome: `PainelDoNegocio` (Tarefa 1) e `useNegocioNoEndereco` (Tarefa 2).

⚠️ **Cuidado com os dois nomes parecidos.** `PainelDeNegocios` (plural) é a **lista** de negócios
dentro da ficha de um cliente ou contato. `PainelDoNegocio` (singular) é o **detalhe** de um
negócio. Você vai fazer o primeiro montar o segundo.

- [ ] **Passo 1: achar o clique**

```bash
grep -n "navigate" src/components/pedidos/PainelDeNegocios.tsx
```

Esse componente nasceu em 07/09/2026 unificando os painéis da ficha da empresa e da ficha do
contato — antes eram duas cópias, e o botão "ver negócio" de uma delas ia para `/app` (a raiz),
não para o negócio. Leia o commit `3069249d` para o contexto.

- [ ] **Passo 2: trocar a navegação pelo painel**

Troque o `navigate` por `abrirNegocio(<id do negócio>)`, e monte `<PainelDoNegocio pedidoId={negocioAberto} onClose={fecharNegocio} />` uma vez, no fim do JSX deste componente.

Aqui **monte** o painel (diferente da Tarefa 3, onde a página já montava): este componente é
desenhado dentro de duas telas diferentes, e nenhuma delas monta um painel de negócio.

Não passe `onExcluir` — excluir negócio pela ficha do cliente não existe hoje e não foi pedido.

- [ ] **Passo 3: conferir no navegador**

1. Abrir a ficha de um cliente que tenha negócios → clicar numa linha → o painel abre sobre a
   ficha, sem trocar de tela.
2. Repetir na ficha de um **contato** — é o caminho que estava quebrado antes de 07/09.
3. Fechar → volta para a ficha, na mesma aba e na mesma rolagem.
4. Console sem erro.

- [ ] **Passo 4: rodar a verificação e commitar**

```bash
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -cE "error TS"
npm run test
npm run build
git status --short
git commit -m "feat(clientes): ver o negocio na ficha da empresa e do contato abre o painel na propria tela

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" --only -- src/components/pedidos/PainelDeNegocios.tsx
```

---

## Como se prova que o plano A funcionou

| | Prova |
|---|---|
| O painel é uma peça só | `src/test/painel-do-negocio-e-uma-peca-so.test.ts` passa, e `wc -l src/pages/Negocios.tsx` caiu de 3.732 para ~3.310 |
| Negócios não regrediu | Abrir pela lista, pelo Kanban e por `?negocio=<id>` direto; Editar, Fechar e Excluir agem como antes |
| A pauta não tira você da tela | `/hoje?negocio=<id>` abre o painel com a fila atrás; recarregar mantém |
| A tabela de risco idem | Clique numa das 10 linhas abre o mesmo painel |
| As fichas idem | Empresa **e** contato |
| Nada quebrou | tsc **31**, testes **≥1141** verdes, build limpo, eslint sem erro novo |

## O que este plano NÃO faz

- Não muda o conteúdo do painel, nem permite editar por ele.
- Não mexe no banco, não publica, não roda `git push`.
- Não mexe na fila nem na permissão — isso é o Plano C.
