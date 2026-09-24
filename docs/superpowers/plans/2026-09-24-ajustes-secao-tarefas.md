# Ajustes na seção de Tarefas — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development para implementar tarefa a tarefa. Passos usam checkbox (`- [ ]`).

**Goal:** Entregar os 5 ajustes de Tarefas: vínculo real com Obras, botões no padrão da casa, negócio/empresa clicáveis, foto do responsável nos cards/listas, e o formulário do negócio mostrando os vínculos + scroll destravado.

**Architecture:** Uma coluna nova `tarefas.obra_id` (FK para `obras`) sustenta o item 1; o campo vira um `SeletorComBusca` de obras no `TarefaFormDialog`. Uma peça `ResponsavelComFoto` centraliza o avatar+nome e é aplicada nos cards/listas. O detalhe da tarefa (hoje um `Sheet` cru) passa a usar a moldura compartilhada `PainelDeDetalhes`, com negócio/empresa clicáveis. O scroll do formulário sobre o painel do negócio é investigado por systematic-debugging.

**Tech Stack:** React 18 + TS + Vite, shadcn/Radix, TanStack Query, Supabase, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-24-ajustes-secao-tarefas-design.md`

## Global Constraints

- **PT-BR** em tudo (código, teste, commit).
- **Banco:** só o item 1 acrescenta `tarefas.obra_id` (uuid, anulável, FK `obras`, herda RLS). A aplicação no banco é do CONTROLADOR (rito: ensaio → "pode" → apply → renomear o arquivo para a versão registrada). O subagente ESCREVE a migration e os tipos, **não aplica**.
- 🔴 A coluna `projeto` (texto) **fica** — é legado exibível; não apagar (§6.3).
- 🔴 A **criação de negócio/tarefa não regride**: o `TarefaFormDialog` é reusado em vários lugares (Tarefas, negócio, cliente, contato) — mudanças nele valem para todos.
- Modal com formulário = `ConteudoDialogo`; painel de detalhe = `PainelDeDetalhes` (nunca `SheetContent`/`DialogContent` cru).
- `useObras()` (todas as obras da empresa; obra tem `nome_obra`, `cliente_id`, `clientes(empresa)`). `useObrasByCliente(clienteId)` filtra por cliente.
- Avatar: `Avatar`/`AvatarImage`/`AvatarFallback` + `iniciais()` de `src/lib/iniciais.ts`; `avatar_url` vem de `useVendedores()`.
- **Verificação (três "não"):** `npm run test` (suíte inteira; nº não cai), `npx tsc --noEmit -p tsconfig.app.json` (não sobe da base 35), `npm run build`, `npm run lint` (não sobe).

---

## Estrutura de arquivos

- `supabase/migrations/<versão>_tarefas_obra_id.sql` — **novo** (item 1).
- `src/integrations/supabase/types.ts` — `tarefas` ganha `obra_id`.
- `src/hooks/use-tarefas.ts` — `Tarefa.obra_id`.
- `src/components/tarefas/TarefaFormDialog.tsx` — campo Obra + mostrar campos travados.
- `src/lib/alvo-da-tarefa-do-negocio.ts` — passar a obra do negócio (pré-preenchimento).
- `src/components/pedidos/PainelDoNegocio.tsx` — passar `obraPadrao` ao dialog (1 linha).
- `src/components/shared/ResponsavelComFoto.tsx` (+ `.test.tsx`) — **novo** (item 4).
- `src/components/tarefas/TarefaKanbanCard.tsx`, `src/pages/Tarefas.tsx` — aplicar avatar (item 4) + detalhe (itens 1/2/3).
- `src/components/pedidos/kanban/KanbanCard.tsx`, `src/pages/Negocios.tsx`, `src/components/pedidos/PainelDeNegocios.tsx` — aplicar avatar (item 4).

---

## Task 1: Banco + tipos + interface (item 1, base)

**Files:**
- Create: `supabase/migrations/20260924120000_tarefas_obra_id.sql`
- Modify: `src/integrations/supabase/types.ts` (bloco de `tarefas`)
- Modify: `src/hooks/use-tarefas.ts` (interface `Tarefa`)

**Interfaces:**
- Produces: coluna `tarefas.obra_id`; `Tarefa.obra_id: string | null`.

- [ ] **Passo 1: Escrever a migration** (NÃO aplicar — o controlador aplica)

`supabase/migrations/20260924120000_tarefas_obra_id.sql`:
```sql
-- Liga a tarefa a uma OBRA de verdade (antes "Projeto/Obra" era texto livre em localStorage).
-- Anulável, herda a RLS existente de `tarefas` (sem política nova). A coluna `projeto` (texto)
-- fica como legado exibível.
ALTER TABLE public.tarefas
  ADD COLUMN IF NOT EXISTS obra_id uuid REFERENCES public.obras(id);
```

- [ ] **Passo 2: Atualizar `types.ts`**

No bloco `tarefas` de `src/integrations/supabase/types.ts`, acrescentar `obra_id: string | null` em `Row`, `Insert` (opcional) e `Update` (opcional), no mesmo estilo das colunas vizinhas (`pedido_id`, `cliente_id`).

- [ ] **Passo 3: Atualizar a interface `Tarefa`**

Em `src/hooks/use-tarefas.ts`, na interface `Tarefa`, acrescentar depois de `pedido_id`:
```ts
  obra_id: string | null;
```

- [ ] **Passo 4: Conferir tipos**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: 35 (não sobe).

- [ ] **Passo 5: Commit**
```bash
git add supabase/migrations/20260924120000_tarefas_obra_id.sql src/integrations/supabase/types.ts src/hooks/use-tarefas.ts
git commit -m "feat(tarefas): coluna obra_id (vinculo real com obras) + tipos"
```

---

## Task 2: Campo Obra no formulário + mostrar campos travados (itens 1 e 5a)

**Files:**
- Modify: `src/components/tarefas/TarefaFormDialog.tsx`
- Modify: `src/lib/alvo-da-tarefa-do-negocio.ts`
- Modify: `src/components/pedidos/PainelDoNegocio.tsx`
- Test: `src/components/tarefas/TarefaFormDialog.test.tsx` (criar se não existir)

**Interfaces:**
- Consumes: `useObras`, `useObrasByCliente`, `SeletorComBusca`, `Tarefa.obra_id`.
- Produces: o form grava `obra_id`; campos Empresa/Negócio aparecem travados quando vêm de `extraFields`.

- [ ] **Passo 1: Teste (falha primeiro)**

Em `src/components/tarefas/TarefaFormDialog.test.tsx`, cobrir (mockando `@/hooks/use-tarefas`, `@/hooks/use-clientes`, `@/hooks/use-obras`, `@/hooks/use-pedidos` e envolvendo em `QueryClientProvider`):
1. Com `extraFields={{ cliente_id: 'c1', pedido_id: 'p1' }}`, os campos "Empresa (cliente)" e "Negócio" **aparecem** (não somem) e estão **desabilitados**.
2. Escolher uma obra no seletor e salvar chama `createTarefa.mutateAsync` com `obra_id` preenchido.
(Se o mock ficar pesado, no mínimo cobrir por um teste de unidade a função pura de rótulo/decisão que você extrair; a lógica de "mostrar travado" pode virar um helper puro testável.)

- [ ] **Passo 2: Rodar e ver falhar**

Run: `npx vitest run src/components/tarefas/TarefaFormDialog.test.tsx`
Expected: FAIL.

- [ ] **Passo 3: Estado do form ganha `obra_id`**

Em `TarefaFormDialog.tsx`: no `emptyForm` acrescentar `obra_id: ''`; no `setForm` do ramo EDITAR (dentro do `useEffect`, ~149-160) acrescentar `obra_id: editingTarefa.obra_id || ''`; no `handleSave`, incluir `obra_id: obra_id || null` no `payload` (desestruturar `obra_id` junto de `pedido_id`/`cliente_id`).

- [ ] **Passo 4: Pré-preencher a obra a partir do negócio (opcional, editável)**

Acrescentar prop `obraPadrao?: string | null` ao `TarefaFormDialogProps`. No `useEffect` de abertura, no ramo CRIAR (`else`), semear `obra_id: obraPadrao ?? ''`. Em `alvo-da-tarefa-do-negocio.ts`, `AlvoDaTarefaDoNegocio` ganha `obra_id: string | null` e `alvoDaTarefaDoNegocio` devolve `obra_id: negocio.obra_id ?? null` (atualizar o teste `tarefa-do-painel-nasce-ligada-ao-negocio.test.ts`). Em `PainelDoNegocio.tsx`, passar `obraPadrao={<obra_id do negócio>}` ao `TarefaFormDialog` (o `obra_id` NÃO entra em `extraFields` — a obra fica editável, não travada).

- [ ] **Passo 5: Campo "Obra" na tela**

Adicionar um bloco no corpo do form (perto de Empresa/Negócio), um `SeletorComBusca` de obras. Fonte: `useObras()`; quando `form.cliente_id` estiver definido, filtrar as obras por esse cliente (`obra.cliente_id === form.cliente_id`); mapear para `{ value: o.id, label: o.nome_obra, descricao: o.clientes?.empresa }`. `value={form.obra_id}` / `onValueChange={v => setForm(f => ({ ...f, obra_id: v }))}`. Rótulo "Obra".

- [ ] **Passo 6: Mostrar os campos travados (item 5a)**

Trocar a condição que ESCONDE Empresa/Negócio. Hoje: `{(!clienteTravado || !negocioTravado) && (<div>… campos …</div>)}` e cada campo dentro de `{!clienteTravado && …}` / `{!negocioTravado && …}`. Passar a **sempre renderizar** os dois campos; quando travado, renderizar o `SeletorComBusca` correspondente com `disabled` (a prop `disabled` no `SeletorComBusca` precisa desabilitar o `PopoverTrigger`/`Button` — acrescentar se não existir) e o `value` já vindo do `extraFields`/`pedidoVinculado`. O `handleSave` já aplica `...extraFields` por cima, então o valor gravado continua o do negócio.

- [ ] **Passo 7: Rodar testes e verificação**

Run: `npx vitest run` (suíte inteira; não cai) e `npx tsc --noEmit -p tsconfig.app.json` (35).

- [ ] **Passo 8: Commit**
```bash
git add src/components/tarefas/TarefaFormDialog.tsx src/components/tarefas/TarefaFormDialog.test.tsx src/lib/alvo-da-tarefa-do-negocio.ts src/test/tarefa-do-painel-nasce-ligada-ao-negocio.test.ts src/components/pedidos/PainelDoNegocio.tsx
git commit -m "feat(tarefas): campo Obra no formulario + mostra empresa/negocio travados preenchidos"
```

---

## Task 3: Peça `ResponsavelComFoto` (item 4, base)

**Files:**
- Create: `src/components/shared/ResponsavelComFoto.tsx`
- Test: `src/components/shared/ResponsavelComFoto.test.tsx`

**Interfaces:**
- Produces: `ResponsavelComFoto({ nome, avatarUrl?, mostrarNome?, tamanho?, className? })`.

- [ ] **Passo 1: Teste (falha primeiro)**

`src/components/shared/ResponsavelComFoto.test.tsx` — mockar `@/hooks/use-clientes` (`useVendedores` devolvendo `[{ id:'1', nome:'Ana Souza', avatar_url:'http://x/a.png' }]`), envolver em `QueryClientProvider`:
1. `nome="Ana Souza"` → renderiza o nome e uma `<img>` com o src do avatar.
2. `nome="Bruno Lima"` (sem foto no mock) → renderiza o nome e as iniciais "BL" (sem `<img>`).
3. `nome={null}` → não renderiza nada (container vazio).
4. `mostrarNome={false}` → não renderiza o texto do nome (só o avatar).

- [ ] **Passo 2: Rodar e ver falhar** — `npx vitest run src/components/shared/ResponsavelComFoto.test.tsx` → FAIL.

- [ ] **Passo 3: Escrever o componente**

```tsx
import { useMemo } from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { iniciais } from '@/lib/iniciais';
import { useVendedores } from '@/hooks/use-clientes';
import { cn } from '@/lib/utils';

const DIM = { xs: 'h-5 w-5', sm: 'h-6 w-6' } as const;
const TXT = { xs: 'text-[8px]', sm: 'text-[9px]' } as const;

/** Foto (ou iniciais) do responsável ao lado do nome. A foto vem de `avatarUrl` quando o chamador
 *  já a tem; senão é procurada por NOME em `useVendedores()` (como o UserProfilePopover já faz). */
export function ResponsavelComFoto({
  nome, avatarUrl, mostrarNome = true, tamanho = 'sm', className,
}: {
  nome: string | null | undefined;
  avatarUrl?: string | null;
  mostrarNome?: boolean;
  tamanho?: 'xs' | 'sm';
  className?: string;
}) {
  const { data: vendedores = [] } = useVendedores();
  const url = useMemo(() => {
    if (avatarUrl !== undefined) return avatarUrl;
    if (!nome) return null;
    const alvo = nome.trim().toLowerCase();
    return vendedores.find((v) => (v.nome ?? '').trim().toLowerCase() === alvo)?.avatar_url ?? null;
  }, [avatarUrl, nome, vendedores]);

  if (!nome) return null;
  return (
    <span className={cn('inline-flex items-center gap-1.5 min-w-0', className)}>
      <Avatar className={cn('shrink-0', DIM[tamanho])}>
        {url && <AvatarImage src={url} alt="" className="h-full w-full object-cover" />}
        <AvatarFallback className={cn('bg-muted font-medium text-muted-foreground', TXT[tamanho])}>
          {iniciais(nome)}
        </AvatarFallback>
      </Avatar>
      {mostrarNome && <span className="truncate">{nome}</span>}
    </span>
  );
}
```

- [ ] **Passo 4: Rodar e ver passar** — `npx vitest run src/components/shared/ResponsavelComFoto.test.tsx` → PASS.

- [ ] **Passo 5: Commit**
```bash
git add src/components/shared/ResponsavelComFoto.tsx src/components/shared/ResponsavelComFoto.test.tsx
git commit -m "feat(shared): ResponsavelComFoto (avatar + nome do responsavel)"
```

---

## Task 4: Aplicar o avatar nas Tarefas (item 4)

**Files:**
- Modify: `src/components/tarefas/TarefaKanbanCard.tsx`
- Modify: `src/pages/Tarefas.tsx` (linha da lista e card mobile)

**Interfaces:** Consumes `ResponsavelComFoto`.

- [ ] **Passo 1: Card do kanban** — em `TarefaKanbanCard.tsx`, no bloco do responsável (~84-91), trocar o ícone `User` + `<span>{tarefa.responsavel}</span>` por `<ResponsavelComFoto nome={tarefa.responsavel} tamanho="xs" className="text-[10px] font-medium" />` (manter o `border-t`/espaçamento do container). Remover o import `User` se ficar sem uso.

- [ ] **Passo 2: Lista de tarefas** — em `src/pages/Tarefas.tsx`, nos dois pontos onde o responsável aparece via `UserProfilePopover` (linha desktop ~647-650 e card mobile ~566-569), colocar a foto ao lado: `<span className="inline-flex items-center gap-1.5"><ResponsavelComFoto nome={t.responsavel} mostrarNome={false} tamanho="xs" /><UserProfilePopover name={t.responsavel} /></span>` (mantém o popover; só acrescenta a foto). Importar `ResponsavelComFoto`.

- [ ] **Passo 3: Verificação** — `npx vitest run` (suíte inteira), `npx tsc --noEmit -p tsconfig.app.json`, `npm run build`.

- [ ] **Passo 4: Commit**
```bash
git add src/components/tarefas/TarefaKanbanCard.tsx src/pages/Tarefas.tsx
git commit -m "feat(tarefas): foto do responsavel no card e na lista"
```

---

## Task 5: Aplicar o avatar nos Negócios (item 4)

**Files:**
- Modify: `src/components/pedidos/kanban/KanbanCard.tsx`
- Modify: `src/pages/Negocios.tsx`
- Modify: `src/components/pedidos/PainelDeNegocios.tsx`

**Interfaces:** Consumes `ResponsavelComFoto`.

- [ ] **Passo 1: Card do kanban de negócio** — em `kanban/KanbanCard.tsx` (~172-182), onde mostra `order.vendedor` (nome), trocar por `<ResponsavelComFoto nome={order.vendedor} tamanho="xs" />` (se o objeto tiver `avatar_url` à mão, passar `avatarUrl={...}`; senão a peça acha por nome).

- [ ] **Passo 2: Lista de negócios (página)** — em `src/pages/Negocios.tsx` (~421-427), onde renderiza `pedido.vendedor?.nome ?? '-'`, trocar por `<ResponsavelComFoto nome={pedido.vendedor?.nome} avatarUrl={pedido.vendedor?.avatar_url ?? undefined} tamanho="xs" />` (passar `avatarUrl` se o `vendedor` já trouxer; conferir no objeto). Manter o "-" quando não houver nome (a peça já não renderiza nada; se o layout exigir um traço, envolver com fallback).

- [ ] **Passo 3: Lista reutilizável** — em `src/components/pedidos/PainelDeNegocios.tsx` (~503-504), mesmo tratamento de `p.vendedor?.nome`.

- [ ] **Passo 4: Verificação** — `npx vitest run`, `npx tsc --noEmit -p tsconfig.app.json`, `npm run build`, `npm run lint`.

- [ ] **Passo 5: Commit**
```bash
git add src/components/pedidos/kanban/KanbanCard.tsx src/pages/Negocios.tsx src/components/pedidos/PainelDeNegocios.tsx
git commit -m "feat(negocios): foto do responsavel no card e nas listas"
```

---

## Task 6: Detalhe da tarefa — moldura padrão + Obra + links (itens 1-detalhe, 2, 3)

**Files:**
- Modify: `src/pages/Tarefas.tsx` (o `<Sheet>` de detalhe e a montagem do painel de negócio)

**Interfaces:** Consumes `PainelDeDetalhes` (`ConteudoDoPainel`/`CabecalhoDoPainel`/`CorpoDoPainel`/`RodapeDoPainel`), `useObras`, `useNegocioNoEndereco`, `PainelDoNegocio`.

- [ ] **Passo 1: Adotar a moldura (item 2)** — ler o `<Sheet>` de detalhe inteiro (do `<Sheet ...>` ao `</Sheet>`, ~700-882). Trocar `SheetContent` cru pela moldura: `<ConteudoDoPainel className="w-full sm:max-w-xl">` → `<CabecalhoDoPainel><SheetTitle>…</SheetTitle></CabecalhoDoPainel>` → `<CorpoDoPainel>` com os campos → `<RodapeDoPainel esquerda={<><Editar/><Fechar/></>}><Excluir/></RodapeDoPainel>`. Os três botões mantêm os `onClick` atuais (Excluir → `setDeleteTarefaTarget`+`setSelectedTarefa(null)`; Fechar → `setSelectedTarefa(null)`; Editar → `openEdit`+`setSelectedTarefa(null)`). Resultado: **Editar+Fechar à esquerda, Excluir à direita**, cabeçalho e rodapé congelados.

- [ ] **Passo 2: Rótulo "Obra" + valor (item 1-detalhe)** — trocar o bloco "Projeto / Obra" (~791-796) por "Obra": `useObras()` no componente; mostrar `obras.find(o => o.id === selectedTarefa.obra_id)?.nome_obra`; se não houver `obra_id` mas houver `selectedTarefa.projeto`, mostrar o texto legado; senão "—".

- [ ] **Passo 3: Empresa e Negócio clicáveis (item 3)** — 
  - Empresa (~797-804): quando há `selectedTarefa.cliente_id`, o nome vira um `<button>`/link que faz `navigate(\`/clientes/${selectedTarefa.cliente_id}\`)` e fecha o detalhe (`setSelectedTarefa(null)`).
  - Negócio (~805-815): montar no componente `const { negocioAberto, abrirNegocio, fecharNegocio } = useNegocioNoEndereco();` e, no fim do JSX da página, `<PainelDoNegocio pedidoId={negocioAberto} onClose={fecharNegocio} />` (como `VendasDaObra.tsx`). Quando há negócio vinculado, o nome vira link que faz `setSelectedTarefa(null)` e `abrirNegocio(<pedido_id>)`. Aparência: cor primária + sublinhado no hover; sem negócio/cliente, continua texto "—".

- [ ] **Passo 4: Verificação** — `npx vitest run` (suíte inteira), `npx tsc --noEmit -p tsconfig.app.json` (35), `npm run build`, `npm run lint`. Conferir que o detalhe abre, os botões estão nos lados certos, e os links navegam (ao menos por leitura do código + testes de helper, se extraídos).

- [ ] **Passo 5: Commit**
```bash
git add src/pages/Tarefas.tsx
git commit -m "feat(tarefas): detalhe na moldura padrao (botoes) + Obra + empresa/negocio clicaveis"
```

---

## Task 7: Destravar o scroll do formulário sobre o painel do negócio (item 5b)

**Files:**
- Modify: `src/components/tarefas/TarefaFormDialog.tsx` e/ou `src/components/pedidos/PainelDoNegocio.tsx` (conforme a causa-raiz)

**REQUIRED SUB-SKILL:** superpowers:systematic-debugging — achar a causa antes de consertar.

- [ ] **Passo 1: Reproduzir e achar a causa** — o `TarefaFormDialog` abre por cima do `PainelDoNegocio`, que é um `Sheet` **modal** (Radix). Hipótese: o trava-rolagem do `Sheet` por baixo bloqueia a roda do mouse dentro do dialog (o dialog já é `modal={false}` e tem backdrop manual). Confirmar a causa (ex.: `RemoveScroll` do Sheet, `pointer-events` no body) antes de mexer. Documentar a causa achada.

- [ ] **Passo 2: Conserto mínimo** — aplicar o conserto que resolve a roda do mouse dentro do formulário **sem** quebrar: (a) o scroll do mesmo formulário aberto pela tela de Tarefas (sem Sheet por baixo); (b) o scroll do painel do negócio depois de fechar o formulário. Preferir o menos invasivo (liberar a rolagem enquanto o dialog está aberto) a fechar o painel.

- [ ] **Passo 3: Verificação** — suíte inteira, tsc, build, lint. Como o gesto de rolagem não é coberto por teste de unidade, descrever no relatório o teste manual exato para validação no ar; cobrir por teste o que for lógica pura.

- [ ] **Passo 4: Commit**
```bash
git add <arquivos tocados>
git commit -m "fix(tarefas): destrava o scroll do formulario aberto sobre o painel do negocio"
```

---

## Self-Review (feito ao escrever o plano)

1. **Cobertura do spec:** item 1 (T1 banco/tipos, T2 form, T6 detalhe), item 2 (T6 moldura), item 3 (T6 links), item 4 (T3 peça, T4 tarefas, T5 negócios), item 5a (T2), item 5b (T7). ✔
2. **Placeholders:** código real para as peças novas (migration, ResponsavelComFoto) e instruções ancoradas por conteúdo para as edições em arquivos existentes (o implementador lê o arquivo). O item 5b é deliberadamente aberto (systematic-debugging) — a causa-raiz não se decide no papel. ✔
3. **Consistência de tipos:** `Tarefa.obra_id` (T1) consumido em T2/T6; `ResponsavelComFoto` (T3) consumido em T4/T5; `alvoDaTarefaDoNegocio` ganha `obra_id` em T2 e é usado no mesmo passo. ✔
4. **Ordem/independência:** T1 antes de T2/T6 (precisa da coluna/tipo); T3 antes de T4/T5 (a peça); T6 depois de T1 (usa obra); T2 e T6 tocam arquivos diferentes (form vs página) — sem choque; T4 e T6 tocam Tarefas.tsx em regiões diferentes (lista vs detalhe), sequenciais. ✔

## Handoff

Execução recomendada: **subagent-driven-development**. A aplicação da migration do item 1 é do controlador, com o "pode" do dono, antes de publicar.
