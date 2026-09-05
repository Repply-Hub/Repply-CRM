# Etapa 1 — O botão "Abrir negócio" leva ao negócio

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: use `superpowers:subagent-driven-development`
> (recomendado) ou `superpowers:executing-plans` para executar tarefa a tarefa. Os passos usam
> caixas (`- [ ]`) para acompanhamento.

**Objetivo:** clicar em "Abrir negócio" na tela "Hoje" abre a ficha daquele negócio, inclusive
quando ele é antigo, de outro funil ou está fora do mês corrente.

**Arquitetura:** o painel de negócio da tela de Negócios hoje só encontra o negócio entre as
linhas já carregadas em memória. Acrescentamos uma busca por identificador como **último**
recurso (local primeiro, buscado depois) e damos ao painel um terceiro estado, "não encontrado",
que hoje não existe — é a ausência dele que transforma qualquer falha num girador eterno.

**Tecnologias:** React 18 + TypeScript + Vite · TanStack Query · Supabase (PostgREST) · Vitest.

## Restrições globais

- **PT-BR** em interface, comentário, mensagem de erro e commit.
- **`npx tsc --noEmit -p tsconfig.app.json`** — com o `-p`. Sem ele o compilador não olha nada e
  devolve sucesso falso. Linha de base: **31 erros herdados**; o número não pode subir.
- **`git push` PUBLICA em produção** (Vercel, automático). Rode a verificação ANTES de enviar.
- **Nunca `git add -A`** — outra sessão trabalha nesta pasta. Liste os arquivos um a um, e confira
  `git status --short` num comando SEPARADO do commit.
- **Antes de começar:** `git fetch origin && git log --oneline HEAD..origin/main`. Se vier commit
  novo, puxe antes de aplicar, nunca depois.
- Erro do Supabase **não é** um `Error` — use `mensagemDeErro` de `src/lib/mensagem-de-erro.ts`.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/select-de-negocios.ts` | **Criar.** A lista de campos que um negócio completo precisa trazer. Função pura, sem dependência de rede — é o que torna o contrato testável |
| `src/lib/select-de-negocios.test.ts` | **Criar.** Fixa que o select traz todo campo que o painel lê, `marcador` incluído |
| `src/hooks/use-pedidos.ts` | **Modificar.** Passa a importar o select do novo módulo; ganha `usePedidoPorId` |
| `src/pages/Negocios.tsx` | **Modificar.** Busca por id como último recurso, três estados no painel, saída única que limpa o endereço |
| `src/test/painel-do-negocio-busca-por-id.test.ts` | **Criar.** Guarda estrutural: falha se o painel voltar a depender só da varredura local |

---

## Tarefa 1 — O select vira módulo próprio, com contrato testado

**Arquivos:**
- Criar: `src/lib/select-de-negocios.ts`
- Criar: `src/lib/select-de-negocios.test.ts`
- Modificar: `src/hooks/use-pedidos.ts:154` (tipo `RelacaoInterna`) e `:386-397` (a função)

**Interfaces:**
- Produz: `montarSelectDeNegocios(relacoesInternas?: RelacaoInterna[]): string` e
  `type RelacaoInterna = 'cliente' | 'fabricante' | 'vendedor'`, ambos exportados de
  `@/lib/select-de-negocios`.

**Por que mover:** o teste precisa importar a função sem arrastar o cliente do Supabase junto.
`use-pedidos.ts` cria o cliente no topo; um teste que o importe passa a depender de variável de
ambiente. Função pura em `src/lib/` com teste ao lado é o padrão do projeto.

- [ ] **Passo 1: criar o módulo com o conteúdo atual, sem mudar uma vírgula do texto do select**

`src/lib/select-de-negocios.ts`:

```ts
/**
 * Os campos que um negócio completo precisa trazer.
 *
 * Vive aqui, e não dentro de `use-pedidos.ts`, para poder ser conferido por teste sem arrastar
 * o cliente do Supabase junto — ver `select-de-negocios.test.ts`.
 *
 * 🔴 O embed de `usuarios` PRECISA nomear o caminho (`!pedidos_vendedor_id_fkey`). Desde
 * `20260831200000_responsaveis_do_negocio.sql` existe `pedido_responsaveis`, que liga `pedidos`
 * a `usuarios` por um SEGUNDO caminho. Sem nomear, o PostgREST recusa o embed inteiro com
 * `PGRST201 — more than one relationship`, e a lista de Negócios volta VAZIA — enquanto a
 * contagem, que não embute nada, continua achando os registros. Foi assim que o defeito passou:
 * o cabeçalho contava certo e as colunas ficavam a zero.
 */
export type RelacaoInterna = 'cliente' | 'fabricante' | 'vendedor';

export function montarSelectDeNegocios(relacoesInternas: RelacaoInterna[] = []): string {
  const j = (rel: RelacaoInterna) => (relacoesInternas.includes(rel) ? '!inner' : '');
  return `
  id, status, nome, valor_total, data_pedido, created_at, observacoes,
  cliente_id, fabricante_id, usuario_id, obra_id, endereco_entrega, campos_extras, prazo_resposta, pdf_url, marcador_id,
  cliente:clientes${j('cliente')}(id, empresa),
  fabricante:fabricantes${j('fabricante')}(id, nome),
  vendedor:usuarios!pedidos_vendedor_id_fkey${j('vendedor')}(id, nome, empresa_id),
  obra:obras(id, nome_obra),
  marcador:marcadores(id, nome, cor)
`;
}
```

- [ ] **Passo 2: escrever o teste do contrato**

`src/lib/select-de-negocios.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { montarSelectDeNegocios } from './select-de-negocios';

/**
 * O painel do negócio (o <Sheet> de `src/pages/Negocios.tsx`) lê estes campos. Quando o negócio
 * vem da busca por id — o caminho que a tela "Hoje" usa —, é ESTE select que o alimenta.
 *
 * Um campo que sair daqui não quebra nada visivelmente: o painel simplesmente mostra vazio
 * naquele pedaço. Por isso o contrato é fixado aqui em vez de confiado à leitura.
 */
describe('montarSelectDeNegocios', () => {
  const CAMPOS_QUE_O_PAINEL_LE = [
    'id', 'status', 'nome', 'valor_total', 'data_pedido', 'observacoes',
    'cliente_id', 'fabricante_id', 'usuario_id', 'obra_id',
    'endereco_entrega', 'campos_extras', 'prazo_resposta', 'pdf_url', 'marcador_id',
  ];

  it('traz todo campo que o painel do negócio lê', () => {
    const select = montarSelectDeNegocios();
    for (const campo of CAMPOS_QUE_O_PAINEL_LE) {
      expect(select, `faltou o campo ${campo}`).toContain(campo);
    }
  });

  // `marcador` é o campo que denuncia a diferença entre este select e o de `usePedidoCompleto`
  // (use-edit-pedido.ts), que NÃO o traz. Reaproveitar aquele aqui deixaria o painel sem a
  // etiqueta colorida, e a falta seria silenciosa.
  it('embute as quatro relações, com marcador entre elas', () => {
    const select = montarSelectDeNegocios();
    expect(select).toContain('cliente:clientes(');
    expect(select).toContain('fabricante:fabricantes(');
    expect(select).toContain('obra:obras(');
    expect(select).toContain('marcador:marcadores(');
  });

  // Sem nomear o caminho, o PostgREST recusa o embed inteiro (PGRST201) e a lista volta vazia.
  it('nomeia o caminho do vendedor, sempre', () => {
    expect(montarSelectDeNegocios()).toContain('usuarios!pedidos_vendedor_id_fkey');
    expect(montarSelectDeNegocios(['vendedor'])).toContain('usuarios!pedidos_vendedor_id_fkey');
  });

  it('marca como obrigatória só a relação pedida', () => {
    const so_cliente = montarSelectDeNegocios(['cliente']);
    expect(so_cliente).toContain('cliente:clientes!inner(');
    expect(so_cliente).toContain('fabricante:fabricantes(');
    expect(so_cliente).not.toContain('fabricante:fabricantes!inner(');
  });
});
```

- [ ] **Passo 3: rodar o teste e ver PASSAR**

```bash
npx vitest run src/lib/select-de-negocios.test.ts
```

Esperado: 4 testes passando. (Este é o caso raro em que o teste nasce verde de propósito — ele
fixa um contrato que já existe, para que a Tarefa 2 possa se apoiar nele.)

- [ ] **Passo 4: apagar a função de `use-pedidos.ts` e importar do módulo novo**

Em `src/hooks/use-pedidos.ts`, remover a linha 154 (`type RelacaoInterna = ...`) e o bloco da
função `montarSelectDeNegocios` (linhas 386-397, junto com o comentário de 380-385, que foi para
o módulo novo). Acrescentar aos imports do topo:

```ts
import { montarSelectDeNegocios, type RelacaoInterna } from '@/lib/select-de-negocios';
```

- [ ] **Passo 5: conferir que nada quebrou**

```bash
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -cE "error TS"
```

Esperado: `31` (a linha de base). Se subir, algum uso de `RelacaoInterna` ficou sem import.

```bash
npx vitest run
```

Esperado: todos os arquivos passando.

- [ ] **Passo 6: commitar**

```bash
git status --short
git add src/lib/select-de-negocios.ts src/lib/select-de-negocios.test.ts src/hooks/use-pedidos.ts
git commit -m "refactor(negocios): select do negocio vira modulo proprio, com contrato testado"
```

---

## Tarefa 2 — O painel busca o negócio por identificador

**Arquivos:**
- Modificar: `src/hooks/use-pedidos.ts` (novo `usePedidoPorId`, e a chave nova em
  `invalidarPaineisDeNegocios:324-344`)
- Modificar: `src/pages/Negocios.tsx:2272-2277` (o `useMemo`) e `:2319` / `:2597` (os estados)

**Interfaces:**
- Consome: `montarSelectDeNegocios()` de `@/lib/select-de-negocios` (Tarefa 1).
- Produz: `usePedidoPorId(pedidoId?: string | null, habilitado?: boolean)`, que devolve
  `UseQueryResult<PedidoWithRelations | null>`.

- [ ] **Passo 1: criar o hook, logo abaixo de `usePedidoOptionPorId` (`use-pedidos.ts:810`)**

```ts
/**
 * Um negócio completo, buscado pelo identificador.
 *
 * 🔴 EXISTE POR CAUSA DE UM CAMINHO ESPECÍFICO: o botão "Abrir negócio" da tela "Hoje".
 *
 * O painel de negócio da tela de Negócios só procurava o negócio entre as linhas JÁ carregadas.
 * O que está carregado é estreito por quatro motivos independentes — período padrão de mês
 * corrente, funil guardado no armazenamento local, teto de 50 por coluna no Kanban e o termo de
 * busca guardado. E a pauta do dia escolhe justamente o OPOSTO: o mais parado primeiro, que
 * quase nunca é do mês. O painel abria e ficava girando para sempre.
 *
 * Usa o MESMO select da lista (`montarSelectDeNegocios`), e não o de `usePedidoCompleto`
 * (use-edit-pedido.ts): aquele não traz `marcador`, e a falta é silenciosa.
 *
 * Molde de FORMA: `usePedidoOptionPorId`, logo acima, que existe para o mesmo tipo de problema
 * no seletor de negócio das tarefas.
 */
export function usePedidoPorId(pedidoId?: string | null, habilitado = true) {
  return useQuery({
    queryKey: ['pedido_por_id', pedidoId ?? null],
    enabled: !!pedidoId && habilitado,
    queryFn: async (): Promise<PedidoWithRelations | null> => {
      const { data, error } = await supabase
        .from('pedidos')
        .select(montarSelectDeNegocios())
        .eq('id', pedidoId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as PedidoWithRelations | null;
    },
    staleTime: 1000 * 60 * 5,
  });
}
```

- [ ] **Passo 2: acrescentar a chave à lista de invalidação**

Em `invalidarPaineisDeNegocios` (`use-pedidos.ts:325`), acrescentar ao array `chaves`, logo
depois de `'pedidos'`:

```ts
    // Sem isto, editar um negócio e voltar ao painel mostra o estado velho: a busca por id tem
    // chave própria e `invalidateQueries` casa elemento a elemento, não por prefixo.
    'pedido_por_id',
```

- [ ] **Passo 3: encadear como ÚLTIMO recurso no painel**

Substituir `src/pages/Negocios.tsx:2272-2277` por:

```tsx
  // O que está em memória tem prioridade: depois de arrastar um card no Kanban, a linha local já
  // reflete a etapa nova, enquanto a busca por id ainda devolveria a anterior.
  const negocioLocal = useMemo(
    () => (showKanban ? kanbanPedidosFlat : pedidos).find(p => p.id === viewOrderId)
      ?? bulkPickerData?.data?.find(p => p.id === viewOrderId),
    [showKanban, kanbanPedidosFlat, pedidos, viewOrderId, bulkPickerData]
  );

  // 🔴 A busca por id é o que faz o botão "Abrir negócio" da tela "Hoje" funcionar. Ela só sai
  // quando a varredura local falha — no caso comum (clicar num card da própria tela) não há
  // requisição nenhuma. Ver o comentário de `usePedidoPorId`.
  const { data: negocioBuscado, isLoading: buscandoNegocio } = usePedidoPorId(
    viewOrderId,
    !negocioLocal,
  );

  const selectedViewOrder = negocioLocal ?? negocioBuscado ?? undefined;
```

E acrescentar `usePedidoPorId` ao import de `@/hooks/use-pedidos` em `Negocios.tsx:25`.

- [ ] **Passo 4: dar ao painel o terceiro estado**

Substituir o `else` do corpo do painel (`src/pages/Negocios.tsx:2597-2601`) por:

```tsx
        ) : buscandoNegocio ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          /* Terceiro estado, que não existia: negócio apagado, de outra empresa, ou identificador
             que não existe mais. Sem ele o painel gira para sempre e nada chega ao registro de
             erros — o painel não lança exceção nenhuma. */
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <p className="text-sm font-medium text-card-foreground">
              Este negócio não está mais disponível.
            </p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Ele pode ter sido excluído, ou o link que você abriu é de outra empresa.
            </p>
          </div>
        )}
```

- [ ] **Passo 5: conferir tipos, testes e build**

```bash
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -cE "error TS"
```
Esperado: `31`.

```bash
npx vitest run && npx vite build
```
Esperado: testes passando e build compilando.

- [ ] **Passo 6: provar na tela, logado como VENDEDOR COMUM (não como gestor)**

1. Abrir `/hoje`.
2. Clicar em "Abrir negócio" no item **mais antigo** da pauta.
3. A ficha tem que carregar, com nome, valor, etapa e a etiqueta colorida (`marcador`).
4. Abrir `/app?negocio=00000000-0000-0000-0000-000000000000` à mão. Tem que aparecer "Este
   negócio não está mais disponível" — **não** um girador.

- [ ] **Passo 7: commitar**

```bash
git status --short
git add src/hooks/use-pedidos.ts src/pages/Negocios.tsx
git commit -m "fix(negocios): abrir negocio da pauta encontra o negocio fora do recorte da tela"
```

---

## Tarefa 3 — Fechar limpa o endereço, e o painel vazio não deixa apagar

**Arquivos:**
- Modificar: `src/pages/Negocios.tsx:2280-2295` (o `onOpenChange`), `:2612-2618` (rodapé) e
  `:2625` (o botão Excluir)

**Interfaces:**
- Consome: `selectedViewOrder` e `buscandoNegocio` da Tarefa 2.
- Produz: `fecharPainel(): void`, usada nos três pontos de saída do painel.

**Por que:** `onOpenChange` do Radix só dispara em fechamento iniciado pelo usuário (Esc, clique
fora, botão X). O botão "Fechar" do rodapé chama `setViewOrderId(null)` direto, então **não
passa por ele** — e o `?negocio=` fica no endereço. Recarregar reabre o negócio que a pessoa
fechou, e o link copiado da barra manda outra pessoa para lá.

- [ ] **Passo 1: extrair a saída única**

Acrescentar logo acima de `const viewOrderSheet = (` em `src/pages/Negocios.tsx:2279`:

```tsx
  // Os três caminhos de saída do painel passam por aqui. O `onOpenChange` do Radix só dispara
  // em fechamento iniciado pelo usuário — o botão "Fechar" do rodapé mexe no estado direto e
  // não passa por ele. Sem uma saída só, um dos caminhos deixa `?negocio=` no endereço e
  // recarregar reabre o que a pessoa acabou de fechar.
  const fecharPainel = useCallback(() => {
    setViewOrderId(null);
    if (searchParams.get('negocio')) {
      setSearchParams(prev => {
        const p = new URLSearchParams(prev);
        p.delete('negocio');
        return p;
      }, { replace: true });
    }
  }, [searchParams, setSearchParams]);
```

- [ ] **Passo 2: usar a saída única nos três pontos**

`onOpenChange` (`:2281`):

```tsx
      onOpenChange={(open) => {
        if (open) return;
        fecharPainel();
      }}
```

Botão "Fechar" do rodapé (`:2616`):

```tsx
              <Button variant="outline" onClick={fecharPainel}>
                Fechar
              </Button>
```

Botão "Excluir" (`:2625`) — troca só o `setViewOrderId(null)` inicial:

```tsx
            onClick={() => { fecharPainel(); setDeleteAllFilteredMode(false); setSelected(new Set([viewOrderId!])); setConfirmDeleteOpen(true); }}
```

⚠️ `fecharPainel()` zera `viewOrderId`, e a linha usa `viewOrderId!` depois. Guarde antes:

```tsx
            onClick={() => {
              const alvo = viewOrderId!;
              fecharPainel();
              setDeleteAllFilteredMode(false);
              setSelected(new Set([alvo]));
              setConfirmDeleteOpen(true);
            }}
```

- [ ] **Passo 3: esconder Editar e Excluir enquanto não há negócio**

No `RodapeDoPainel` (`:2612`), envolver os dois botões de ação. "Fechar" continua sempre visível
— é a única saída no estado de erro.

```tsx
          esquerda={
            <>
              {selectedViewOrder && (
                <Button onClick={() => navigate(`/pedidos/${viewOrderId}/editar`)}>
                  <Pencil className="mr-2 h-4 w-4" /> Editar
                </Button>
              )}
              <Button variant="outline" onClick={fecharPainel}>
                Fechar
              </Button>
            </>
          }
```

E no lado direito, envolver o botão Excluir na mesma condição `selectedViewOrder && (...)`.

**Por quê:** sem isso dá para apagar, direto da pauta, um negócio cujo painel nunca mostrou uma
linha. A trava do "digite APAGAR" segura o clique acidental, mas não informa nada — a pessoa
confirma confiando no que a fila do dia disse, não no que o painel mostrou.

- [ ] **Passo 4: conferir e provar na tela**

```bash
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -cE "error TS"
npx vitest run && npx vite build
```
Esperado: `31`, testes passando, build compilando.

Na tela:
1. Abrir um negócio pela pauta, fechar **pelo botão do rodapé**, e conferir que o endereço voltou
   a `/app` sem `?negocio=`.
2. Recarregar (F5). O painel **não** pode reabrir.
3. Abrir `/app?negocio=00000000-0000-0000-0000-000000000000`: só "Fechar" no rodapé, sem Editar
   nem Excluir.

- [ ] **Passo 5: commitar**

```bash
git status --short
git add src/pages/Negocios.tsx
git commit -m "fix(negocios): fechar o painel limpa o endereco, e painel vazio nao deixa apagar"
```

---

## Tarefa 4 — Guarda estrutural contra a volta do defeito

**Arquivos:**
- Criar: `src/test/painel-do-negocio-busca-por-id.test.ts`

**Interfaces:**
- Consome: nada em tempo de execução — o teste lê `src/pages/Negocios.tsx` como texto.

**Por que um teste estrutural e não de renderização:** renderizar `Negocios.tsx` num teste exige
esboçar o cliente do Supabase, o roteador e seis hooks. E o defeito não é de comportamento
visível numa unidade: é alguém simplificar o `useMemo` e o recurso por id ir junto. Foi
exatamente assim que o conserto das datas do Bitrix sumiu (CLAUDE.md §7.14) — e o teste que
pegou aquilo, `uma-leitura-de-planilha-so.test.ts`, é deste mesmo tipo.

- [ ] **Passo 1: escrever o teste**

`src/test/painel-do-negocio-busca-por-id.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * O painel do negócio precisa saber buscar o negócio pelo identificador.
 *
 * 🔴 O DEFEITO QUE ISTO IMPEDE. O painel procurava o negócio SÓ entre as linhas já carregadas
 * na tela de Negócios. Essa tela filtra pelo mês corrente, pelo funil guardado no navegador e
 * por um teto de 50 por coluna — enquanto o botão "Abrir negócio" da tela "Hoje" manda
 * justamente os mais PARADOS, que quase nunca são do mês. O painel abria e girava para sempre,
 * sem erro, sem texto e sem nada no registro de erros.
 *
 * Nenhum teste de comportamento pega a volta disso: quem simplificar o `useMemo` e derrubar o
 * recurso por id continua com a tela funcionando para quem clica num card da própria lista. O
 * sintoma só reaparece semanas depois, num negócio antigo, sem ninguém ligar uma coisa à outra.
 *
 * SE ESTE TESTE FALHOU: não o apague. O caminho certo é manter `usePedidoPorId` encadeado como
 * último recurso do painel, com a varredura local tendo prioridade.
 */
describe('o painel do negócio busca por identificador', () => {
  const fonte = readFileSync(
    join(process.cwd(), 'src', 'pages', 'Negocios.tsx'),
    'utf8',
  );

  it('usa usePedidoPorId', () => {
    expect(fonte).toContain('usePedidoPorId');
  });

  it('mantém a varredura local com prioridade sobre a busca', () => {
    // `negocioLocal ?? negocioBuscado` — nunca o contrário: depois de arrastar um card no
    // Kanban, a linha local já tem a etapa nova e a buscada ainda teria a anterior.
    expect(fonte).toMatch(/negocioLocal\s*\?\?\s*negocioBuscado/);
  });

  it('tem um estado de "não encontrado", e não só carregando', () => {
    expect(fonte).toContain('Este negócio não está mais disponível');
  });

  it('sai do painel por um caminho só, que limpa o endereço', () => {
    expect(fonte).toContain('const fecharPainel');
    // O botão "Fechar" do rodapé não pode voltar a mexer no estado direto: ele não passa pelo
    // onOpenChange do Radix, e o `?negocio=` ficaria no endereço.
    expect(fonte).not.toContain('onClick={() => setViewOrderId(null)}');
  });
});
```

- [ ] **Passo 2: rodar e ver PASSAR**

```bash
npx vitest run src/test/painel-do-negocio-busca-por-id.test.ts
```
Esperado: 4 testes passando.

- [ ] **Passo 3: provar que o teste PEGA a regressão**

Desfaça temporariamente a Tarefa 2: em `Negocios.tsx`, troque
`const selectedViewOrder = negocioLocal ?? negocioBuscado ?? undefined;` por
`const selectedViewOrder = negocioLocal;` e rode de novo.

```bash
npx vitest run src/test/painel-do-negocio-busca-por-id.test.ts
```
Esperado: **FALHA** em "mantém a varredura local com prioridade sobre a busca".

🔴 **Guarda que não pega o próprio caso é guarda oca.** Se passar mesmo com a regressão, o teste
está errado — conserte-o antes de seguir. Depois, desfaça a alteração temporária.

- [ ] **Passo 4: rodar a suíte inteira e commitar**

```bash
npx vitest run
git status --short
git add src/test/painel-do-negocio-busca-por-id.test.ts
git commit -m "test(negocios): guarda estrutural do painel que busca negocio por id"
```

---

## Verificação da etapa

```bash
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -cE "error TS"   # 31, a linha de base
npx vitest run                                                      # tudo passando
npx vite build                                                      # compila
```

**Na tela, logado como vendedor comum:**

| O quê | Esperado |
|---|---|
| "Abrir negócio" no item mais antigo da pauta | A ficha carrega, com etiqueta colorida |
| Fechar pelo botão do rodapé, depois F5 | O painel **não** reabre; endereço sem `?negocio=` |
| `/app?negocio=<uuid inexistente>` | "Este negócio não está mais disponível", sem Editar nem Excluir |
| Clicar num card da própria lista de Negócios | Abre como sempre, **sem** requisição nova (confira na aba Rede) |

**Depois de publicar:** o `git push` publica sozinho. Confirme que a mudança chegou baixando o
pedaço que está no ar e procurando a frase dentro dele (CLAUDE.md §16):

```bash
curl -s https://crm.repplyhub.com.br/ | grep -oE '/assets/index-[^"]+\.js'
```

---

## O que esta etapa NÃO faz

- Não cria permissão nenhuma, não mexe na pauta e não toca no e-mail das 7h.
- Não acrescenta filtro à tela "Hoje" — é a Etapa 2.
- Não extrai o painel para componente próprio. Isso fica para a Etapa 2, quando houver um segundo
  consumidor de verdade; extrair antes seria criar a segunda ficha antes de a primeira estar
  consertada.
