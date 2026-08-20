# Auditoria da estrutura de filtros — Página de Negócios (Pipeline/Kanban)

> Documento gerado a partir de uma investigação read-only (sem alteração de código, sem migrations,
> sem build/test) da estrutura de filtros da página de Negócios (`/negocios`, Kanban + Lista).
> Serve de base para um prompt de implementação posterior (filtros combináveis/personalizados,
> filtros salvos). Data da auditoria: 2026-08-08.

---

## 1. Diagrama textual do fluxo de dados

```
┌─────────────────────────────────────────────────────────────────────┐
│  URL (searchParams) ──init──▶  useState (Negocios.tsx)               │
│       ▲                              │                                │
│       └──────── useEffect (mirror, replace:true) ◀────── mudam        │
│                                       │                                │
│                                       ▼                                │
│                     pedidosFilters = useMemo({...})                    │
│                     activeStages   = selectedStages || undefined       │
│                                       │                                │
│              ┌────────────────────────┼─────────────────────────┐     │
│              ▼                        ▼                         ▼     │
│      usePedidos(Lista)        usePedidosStats (header)   KanbanColumn  │
│      só quando !showKanban    RPC pedidos_stats           × N (1 por   │
│                                (SECURITY INVOKER)          etapa vis.) │
│              │                        │                         │      │
│              ▼                        ▼                         ▼      │
│         supabase.from('pedidos')   supabase.rpc(...)   usePedidos(1   │
│         .select(...).in().gte()                          etapa só)    │
│         .order(created_at,id)                                         │
│              │                                                        │
│              ▼                                                        │
│         RLS: pedidos_select USING                                     │
│         (usuario_id = get_my_usuario_id()                             │
│          OR usuario_in_my_empresa(usuario_id))                        │
└─────────────────────────────────────────────────────────────────────┘
```

Busca textual livre é resolvida à parte, em 3 sub-queries (`clientes`, `fabricantes`, `obras` via
`ilike`) que retornam ids, convertidos num `.or()` — repetido dentro de **cada** `queryFn` que
precisa dele (não é uma query própria cacheada, ver §6).

---

## 2. Mapeamento de componentes

| Arquivo | Papel |
|---|---|
| `src/pages/Negocios.tsx` | Orquestrador único: todo o estado de filtro, sincronização com URL, monta o popover de filtros inline (JSX), decide Kanban vs Lista, aciona `usePedidos`/`usePedidosStats`. |
| `src/hooks/use-pedidos.ts` | `usePedidos`, `usePedidosStats`, `useBulkDeletePedidos`, `useBulkUpdatePedidos`, tipo `PedidosFilters`. Contém a lógica de aplicação de cada filtro no Supabase (repetida em 3 lugares — ver §6). |
| `src/components/pedidos/kanban/KanbanColumn.tsx` | Cada coluna do Kanban chama `usePedidos` com seu próprio `stageFilter=[stageKey]` e seu próprio `limit`/`loadedBatches` — query e cache **independentes por coluna**. Reaplica a busca textual no cliente sobre linhas já filtradas no servidor (redundante). |
| `src/components/shared/FilterButton.tsx` | Shell puramente apresentacional (trigger + badge + "Limpar filtros"). Não sabe nada sobre filtros de Negócios — cada submenu é montado à mão em `Negocios.tsx` via `StandardPopoverMenu`. |
| `src/components/ui/standard-popover-menu.tsx` | Primitivas de submenu (`StandardPopoverMenu`, `StandardMenuItem`) reaproveitadas para cada filtro (Etapa/Vendedor/Fabricante/Marcador/Período). |
| `src/components/shared/SearchWithRecent.tsx` | Input de busca + "buscas recentes" (localStorage). Tem debounce de 450ms, mas **só** para sugestões de endereço via Nominatim (`showAddressSuggestions`) — não usado nesta tela, então o `onValueChange` dispara a cada tecla sem debounce próprio. |
| `src/hooks/use-clientes.ts` | `useVendedores`, `useFabricantes` — fontes das opções dos filtros; sem `.eq('empresa_id', ...)` explícito no client, dependem 100% de RLS. |
| `src/hooks/use-marcadores.ts` / `src/hooks/use-funis.ts` | Fontes de opções (Marcador, Funil); estes **fazem** `.eq('empresa_id', empresaId)` client-side além de RLS (padrão inconsistente com `useVendedores`/`useFabricantes`, mas inofensivo — defesa em profundidade). |
| `supabase/migrations/20260702000000_pedidos_stats_rpc.sql` + evoluções (`20260722140000_funis.sql`, `20260731130000_marcadores_negocios.sql`, `20260803150000_pedidos_stats_atencao_exclui_etapas_finais.sql`, `20260803160000_pedidos_stats_hide_importados.sql`, `20260807130000_pedidos_stats_busca_por_obra.sql`) | RPC `pedidos_stats` (`SECURITY INVOKER`) — evoluiu junto com cada novo filtro adicionado no front. |
| `supabase/migrations/20260804195019_admin_geral_sem_acesso_ao_conteudo_dos_clientes.sql` | Definição **atual** das policies RLS de `pedidos` (select/insert/update/delete). |

Árvore de renderização: `Negocios.tsx` → (`filtrosPopover` memoizado inline) → `FilterButton` →
`StandardPopoverMenu` × 5 (Etapa, Vendedor, Fabricante, Marcador, Período) + 2 blocos de checkbox
soltos (Atenção, Importação) → e, em paralelo, `SearchWithRecent` (busca) e `KanbanColumn` × N ou
a `<Table>` da Lista.

---

## 3. Estado e fluxo de dados

- **Armazenamento**: `useState` local em `Negocios.tsx` para cada filtro (`selectedStages`,
  `selectedVendedores`, `selectedFabricantes`, `selectedMarcadores`, `showOnlyAttention`,
  `hideImportados`, `dateFrom`, `dateTo`, `search`). Não há Context nem Zustand — tudo mora no
  componente de página.
- **URL**: sincronização unidirecional-com-init — os `useState` inicializam lendo `searchParams`
  (`stages`, `vendedores`, `fabricantes`, `marcadores`, `atencao`, `ocultar_importados`, `data_de`,
  `data_ate`), e um único `useEffect` espelha o estado de volta pra URL via
  `setSearchParams(..., { replace: true })`. Isso **sobrevive a reload** e a navegação
  (abrir/fechar um negócio via `navigate(-1)`), comentado explicitamente no código
  (`Negocios.tsx:91-93,757-761`). `search` (busca textual) **não** vai para a URL — só para
  `localStorage` (`negocios_search`).
- **Chegada até as queries**: todos os `useState` acima alimentam um único
  `pedidosFilters = useMemo(...)` (`Negocios.tsx:532`) + `activeStages`, consumidos por
  `usePedidos` (Lista), `usePedidosStats` (header) e — cada um recebendo os mesmos objetos — por
  cada `KanbanColumn` (que soma seu próprio `stageFilter`).

---

## 4. Queries e performance

### 4.1 Aplicação por filtro

| Filtro | Client ou server? | Onde |
|---|---|---|
| Etapa | server (`.in('status', stages)`) | `usePedidos`, RPC `pedidos_stats` (`p_stages`) |
| Vendedor/Responsável | server, via `resolveUsuarioIds` → `.in('usuario_id', ids)` | idem |
| Fabricante | server (`.in('fabricante_id', ids)`) | idem |
| Marcador | server (`.in('marcador_id', ids)`) | idem |
| Período (data) | server (`.gte`/`.lte` em `data_pedido`) | idem |
| Atenção (7+ dias) | server (`.lte(created_at, cutoff).not('status','in',(fechamento,perdido))`) | idem |
| Ocultar importados | server (`.is('import_hash', null)`) | idem |
| Busca textual | server, via sub-resolução (`clientes`/`fabricantes`/`obras` → ids → `.or()`) **+ re-filtrado no cliente dentro do Kanban** (redundante, ver §6) | `usePedidos`, `KanbanColumn.tsx:62-70` |
| Cliente (dedicado) | **inexistente** — só alcançável via busca textual | — |
| Obra (dedicado) | **inexistente** — só alcançável via busca textual | — |
| Valor (faixa) | **inexistente** em qualquer camada | — |

### 4.2 Combinação de filtros

Todos os filtros combinam em **AND** implícito — cada `if (filtro) query = query.in/gte/lte(...)`
encadeado sequencialmente. Não há suporte a OR entre categorias de filtro (ex.: "Vendedor A OU
Fabricante X" não é possível hoje — só "Vendedor A E Fabricante X"). Construção é 100%
hardcoded/imperativa, sem query builder declarativo.

### 4.3 Status do Kanban por coluna (ponto já identificado antes)

**Confirmado: já corrigido.** Cada `KanbanColumn` chama
`usePedidos(empresaId, 0, limit, [stageKey], filters, stageEnabled)` com `queryKey` própria (o
`stages=[stageKey]` entra na key) e `limit` próprio via `loadedBatches` (estado local do "Ver
mais"). Não existe mais uma query global compartilhada para o board inteiro — isso é
explicitamente documentado nos comentários do próprio código (`Negocios.tsx:524-527,711-714`).

### 4.4 Tiebreaker de ordenação

**Presente e correto** em `usePedidos`: `.order('created_at', {ascending:false}).order('id',
{ascending:false})`, com comentário explicando por que (`created_at` duplicado em importações em
massa). As mutações em massa (`useBulkDeletePedidos`/`useBulkUpdatePedidos` "por filtro") não
precisam de `.order()` (são DELETE/UPDATE, não paginam). A RPC `pedidos_stats` é um agregado
(`COUNT`/`SUM`), também não precisa.

---

## 5. Multi-tenant / RLS

**Confirmado seguro.** A policy atual
(`20260804195019_admin_geral_sem_acesso_ao_conteudo_dos_clientes.sql:51-58`):

```sql
pedidos_select: USING (usuario_id = get_my_usuario_id() OR usuario_in_my_empresa(usuario_id))
pedidos_update: USING (usuario_id = get_my_usuario_id() OR (is_gestor() AND usuario_in_my_empresa(usuario_id)))
pedidos_delete: USING (is_gestor() AND usuario_in_my_empresa(usuario_id))
```

Ponto que vale registrar (não é bug, mas é o tipo de coisa que este pedido pediu para confirmar):
`resolveUsuarioIds()` em `use-pedidos.ts:47-54`, quando `vendedorIds` é passado (filtro "Vendedor"
ativo), **retorna os ids recebidos do client sem checar se pertencem à empresa** — o
`.in('usuario_id', vendedorIds)` é montado com o que veio do filtro, cru. Isso só é seguro porque
a RLS (`usuario_in_my_empresa`) filtra por baixo independentemente do que o client pediu — um
`vendedorIds` manipulado (via URL, ex. `?vendedores=<uuid-de-outra-empresa>`) simplesmente retorna
vazio, nunca vaza dados. A RPC `pedidos_stats` é `SECURITY INVOKER`, então também respeita RLS.

**Conclusão: não há vazamento cross-tenant via manipulação de filtro no client — a RLS é de fato a
fronteira real**, como diz o `CLAUDE.md`. Isso vale tanto para leitura quanto para as mutações em
massa "por filtro" (`useBulkDeletePedidos`/`useBulkUpdatePedidos`), que também dependem só da RLS
para o corte final.

---

## 6. Bugs e inconsistências encontrados

| # | Severidade | Descrição | Causa raiz |
|---|---|---|---|
| 1 | **Médio** | No Kanban, a busca textual roda **duas vezes**: uma vez no servidor (via `resolveSearchMatches`, dentro de `usePedidos`) e de novo no cliente (`KanbanColumn.tsx:62-70`, filtrando `rawRows` já filtradas). Além de redundante, o comentário que justifica esconder a contagem no botão "Ver mais" quando há busca ativa (`KanbanColumn.tsx:156-158`, "o total do servidor não reflete o filtro") está **desatualizado** — desde que a busca passou a ser aplicada no servidor também, `stageTotal` (vindo de `count: 'exact'`) já reflete a busca corretamente. | Comentário/lógica não acompanharam a migração da busca de client-only para server+client. |
| 2 | **Médio** | Cada `KanbanColumn` visível (até 6+ por padrão) resolve `resolveUsuarioIds` e, quando há busca ativa, `resolveSearchMatches` (3 sub-queries: `clientes`/`fabricantes`/`obras`) **independentemente**, sem cache compartilhado entre colunas — porque essas chamadas vivem dentro do `queryFn` de cada `usePedidos`, cuja `queryKey` difere por `stageKey`. Com 6 etapas visíveis e busca ativa, uma única tecla digitada pode disparar até ~25 chamadas Supabase (6 × (1 + 3) + 1 da RPC de stats), sem nenhum agrupamento. | Falta de uma camada de cache/hook próprio para `resolveUsuarioIds`/`resolveSearchMatches`, hoje reimplementados como funções soltas chamadas dentro de cada `queryFn`. |
| 3 | **Médio** | A busca textual não tem debounce real — `SearchWithRecent.onValueChange` dispara a cada tecla; a única mitigação é `useDeferredValue(search)` em `Negocios.tsx:433`, que é uma técnica de *priorização de render* do React, não um debounce de rede com atraso fixo. Combinado com o achado #2, digitação rápida pode gerar múltiplas rodadas de queries Supabase em paralelo (sem cancelamento entre `queryKey`s distintas, já que cada tecla gera uma `search` diferente na key). Não chega a corromper resultado (cada `queryKey` guarda sua própria resposta), mas desperdiça banda/carga no banco. | `useDeferredValue` foi usado no lugar de um debounce temporizado (`setTimeout`/`useDebouncedValue`). |
| 4 | **Médio** | Trocar de Funil (pipeline) **não** força a Lista de volta para a página 1. O `useEffect` que reseta `page` (`Negocios.tsx:703-705`) não inclui `funilId` nas dependências — só existe o fallback `if (page > totalPages) setPage(totalPages)` (`Negocios.tsx:707-709`), que apenas recorta o excesso, sem restaurar a página 1. Resultado: usuário na página 3 do Funil A, ao trocar para o Funil B, pode continuar vendo a "página 3" desse novo funil (conteúdo diferente do que ele esperava, sem nenhum sinal de que a página mudou de contexto). | `funilId` ausente do array de dependências do `useEffect` de reset de página. |
| 5 | **Baixo** | `toggleFilter` e `clearPipelineFilters` são funções recriadas a cada render de `Negocios.tsx` (não usam `useCallback`), mas aparecem no array de dependências do `useMemo` que monta `filtrosPopover` (`Negocios.tsx:1362`). Isso invalida a memoização em **todo** re-render do componente — inclusive a cada tecla digitada na busca (que já muda `search`) — refazendo a árvore JSX inteira do popover (checkboxes de vendedores/fabricantes/marcadores) sem necessidade. | Funções não memoizadas usadas como dependência de `useMemo`. |
| 6 | **Baixo** | Não existem filtros dedicados de **Cliente**, **Obra** ou **Valor** (faixa min/max) em nenhuma camada — nem UI, nem `PedidosFilters`, nem RPC. Cliente e Obra só são alcançáveis indiretamente via a busca textual livre (que casa contra `clientes.empresa`, `fabricantes.nome`, `obras.nome_obra`); Valor não é filtrável de forma alguma hoje. Não é um "bug" no sentido de comportamento incorreto, mas é uma lacuna real do pedido original. | Filtros nunca implementados — não é regressão, é gap de escopo. |
| 7 | **Baixo** | Existem dois conceitos de "etapa" sobrepostos e fáceis de confundir ao mexer no código: `selectedStages` (filtro "Etapa" do `FilterButton`, afeta a query em Lista **e** Kanban) vs. `visibleKanbanStages` (toggle puramente visual de quais colunas do board aparecem, não filtra nada, persistido em `localStorage` por funil). Uma coluna pode estar **visível** (`visibleKanbanStages`) mas **desabilitada** pela `etapaFilter` (se `selectedStages` não a incluir) — nesse caso ela renderiza vazia com contagem 0, indistinguível visualmente de uma etapa genuinamente sem negócios. | Dois mecanismos de "etapa" com propósitos diferentes, sem indicação visual que diferencie "vazio por filtro" de "vazio de verdade". |

Não foram encontrados: filtros "mortos" (todo `useState` de filtro está conectado a
`pedidosFilters` e à UI), filtros duplicados entre componentes diferentes, ou um filtro que reseta
outro sem ser intencional (a única interdependência — trocar Data Início empurrando Data Fim, e
reset de `selectedStages` ao trocar de funil de fato — é proposital e comentada no código). O
botão "Limpar filtros" (`clearPipelineFilters`) reseta corretamente todos os 7 `useState` de
filtro de uma vez; como a URL é espelhada via `useEffect` reativo ao estado (não o inverso), ela é
automaticamente limpa também. O cache do React Query não precisa de invalidação manual nesse caso
— mudar os `useState` já muda as `queryKey`s e aciona novas queries.

---

## 7. Avaliação de extensibilidade

**Hoje: baixa.** Adicionar um novo tipo de filtro simples (ex.: "Cliente") exige tocar em pelo
menos **8 lugares diferentes**, sem nenhum ponto central de registro:

1. Novo `useState` + parse do parâmetro de URL em `Negocios.tsx`.
2. Nova linha em `pedidosFilters = useMemo(...)`.
3. Novo campo na interface `PedidosFilters` (`use-pedidos.ts`).
4. Nova cláusula `.in()/.eq()` dentro do `queryFn` de `usePedidos`.
5. Novo parâmetro na RPC `pedidos_stats` (nova migration SQL) + nova entrada na chamada de `usePedidosStats`.
6. Mesma cláusula duplicada manualmente dentro de `useBulkDeletePedidos` ("por filtro").
7. Mesma cláusula duplicada de novo dentro de `useBulkUpdatePedidos` ("por filtro").
8. Novo bloco JSX de submenu em `filtrosPopover`, mais entrada em `activeFilterCount`,
   `hasPipelineFilters`, `clearPipelineFilters` e no `useEffect` de sincronização com a URL.

A lógica de "aplicar filtro numa query Supabase" está **copiada 3 vezes** (`usePedidos`,
`useBulkDeletePedidos`, `useBulkUpdatePedidos`) em vez de centralizada numa função
`applyPedidosFilters(query, filters)` compartilhada — qualquer novo filtro que esqueça uma das 3
cópias gera divergência silenciosa entre "o que a tela mostra" e "o que a exclusão/edição em massa
por filtro realmente afeta" (o próprio código já tem comentários alertando sobre esse risco de
divergência histórica, ex. `use-pedidos.ts:431-433`).

**Para filtros compostos/combináveis e filtros salvos (o próximo passo mencionado)**, a
arquitetura atual não comporta isso sem refatoração estrutural, porque:

- Não há um modelo de dados genérico para "um filtro" (tipo, operador, valor) — cada filtro é um
  `useState` + `if` hardcoded.
- Combinação é sempre AND fixo entre categorias — não há como expressar OR entre categorias, nem
  grupos de condições.
- "Filtro salvo" exigiria persistir uma estrutura arbitrária (hoje só a URL/localStorage guardam
  valores concretos de campos fixos, não uma configuração de filtro genérica).
- A duplicação tripla da lógica de aplicação (item acima) tornaria qualquer filtro composto
  genérico um retrabalho em 3 lugares por definição.

---

## 8. Recomendações para a próxima fase (sem implementar)

1. **Centralizar a aplicação de filtros**: extrair a cadeia `.in()/.gte()/.lte()/.or()` de
   `usePedidos`/`useBulkDeletePedidos`/`useBulkUpdatePedidos` para uma função única
   `applyPedidosFilters(query, filters, searchMatches)`, eliminando a triplicação — pré-requisito
   antes de qualquer filtro novo, senão a dívida só cresce.
2. **Modelar filtro como dado, não como `useState` avulso**: um tipo
   `{ campo, operador, valor }[]` (ou similar) substituindo os 7+ `useState` soltos, permitindo
   filtros arbitrários/combináveis e "filtros salvos" (serializável para `localStorage`/tabela
   nova) sem re-arquitetar de novo a cada campo.
3. **Compartilhar `resolveUsuarioIds`/`resolveSearchMatches` entre colunas do Kanban** via um hook
   próprio com `useQuery` e `queryKey` estável (`['usuario-ids', empresaId, vendedorIds]`,
   `['search-matches', trimmedSearch]`) — resolve o achado #2 (N+1) de graça, já que o React Query
   passa a deduplicar entre as N colunas.
4. **Debounce real na busca** (ex. 300ms via hook dedicado), substituindo/complementando o
   `useDeferredValue` — resolve o achado #3.
5. **Decidir explicitamente o mapeamento Cliente/Obra/Valor**: se vão virar filtros dedicados
   (dropdown/range) ou continuar só via busca textual — hoje é uma lacuna silenciosa, vale decisão
   consciente antes de generalizar.
6. Ao mexer em `visibleKanbanStages` vs. `selectedStages`, considerar unificar a semântica visual
   (uma coluna oculta pelo filtro "Etapa" deveria talvez desaparecer do board, não aparecer
   vazia) — pequeno, mas evita confusão ao construir a UI de filtros combináveis em cima disso.
7. Corrigir o reset de página ao trocar de funil (achado #4) — baixo esforço, isolado, pode entrar
   como fix rápido independente da refatoração maior.
