# Estrutura de Importação de Dados — Clientes, Negócios e Fabricante

> Levantamento feito lendo o código atual (código-fonte + migrations + histórico de commits), não a
> documentação anterior. O arquivo `IMPORT_STRUCTURE.md` na raiz do repositório está desatualizado (não
> reflete o commit `c899bdb`, que mudou o import de Clientes/Negócios) — use este documento em `docs/` como
> referência corrente e considere depreciar/remover o antigo.

---

## 1. Clientes (Empresas e Contatos)

### Frontend

| Arquivo | Papel |
|---|---|
| [`src/components/ImportClientesDialog.tsx`](../src/components/ImportClientesDialog.tsx) | Wizard ativo e único caminho de import de Clientes. Suporta `target: 'empresas' \| 'contatos'` (aba ativa da tela). Tem detecção automática de mapeamento própria (`autoDetectMapping`/`AUTO_RULES`) e lógica de import própria (merge por CNPJ, upsert manual) — não usa `useBulkImport.importClientes`. |
| [`src/components/import/MappingStep.tsx`](../src/components/import/MappingStep.tsx) | UI de mapeamento de colunas compartilhada por todos os wizards de import (fuzzy matching, sanitização por tipo de campo, campos extras). |
| [`src/lib/file-validation.ts`](../src/lib/file-validation.ts) | `validateFile` — valida extensão e tamanho (`MAX_FILE_SIZE_MB = 15`) antes do parse. |
| [`src/pages/Clientes.tsx`](../src/pages/Clientes.tsx) | Renderiza o dialog: item de menu "Importar" no dropdown "Ações" (linhas ~651-654) → `<ImportClientesDialog open={importOpen} target={activeTab} .../>` (linha ~675). |

**Trigger confirmado**: item de menu em `Clientes.tsx`, sempre visível e funcional.

**Dead code removido (commit `c899bdb`)**: `Clientes.tsx` tinha um segundo botão "Importar" solto que abria `<ImportDialog importType="clientes">` (wizard genérico legado, sem suporte a empresas/contatos). Esse botão + o import do componente foram removidos nesse commit — hoje só resta o fluxo via `ImportClientesDialog`.

**Parsing**: biblioteca `xlsx` (`^0.18.5`), suporta `.csv`, `.xlsx`, `.xls`.

**Feedback de UI**: progress bar (`importProgress`), badges de registros/colunas extras no preview, toasts (`sonner`) — incluindo mensagem específica para erro de RLS ("você pode estar tentando atualizar registro de outro usuário...").

### Backend

| Item | Detalhe |
|---|---|
| Tabela `empresas`-alvo | `public.clientes` (migration `20260409192634_...sql`) |
| Tabela `contatos`-alvo | `public.contatos` (mesma migration) |
| Scoping multi-tenant | `clientes` ganhou coluna `empresa_id` (nullable, FK `public.empresas`) na migration `20260504172116_...sql`, com RLS "Acesso por empresa" baseada em `empresa_id = (SELECT empresa_id FROM usuarios WHERE user_id = auth.uid())`. Há **também** uma RLS mais antiga sobre `clientes` baseada em `vendedor_in_my_empresa(vendedor_id)` (migration `20260413223933_...sql`) coexistindo com a nova — ver seção de inconsistências. `contatos` usa RLS via `vendedor_id = get_my_vendedor_id() OR is_gestor()`, sem coluna `empresa_id` própria. |
| Edge Function | Nenhuma usada no fluxo ativo. |
| Insert | 100% client-side via `supabase-js` direto (`supabase.from('clientes'|'contatos').insert(...)`/`.update(...)`), dentro do próprio componente `ImportClientesDialog.tsx`. |
| Duplicados | Merge por CNPJ dentro do próprio arquivo (`mergeRowsByCnpj`) antes de importar. Para `target='empresas'`: busca clientes existentes com o mesmo CNPJ (`.in('cnpj', cnpjs).eq('usuario_id', vid)`) e faz **UPDATE** dos que já existem / **INSERT** dos novos, mesclando `campos_extras` (preserva valor existente quando o novo vier vazio). Para `target='contatos'`: sempre INSERT simples, sem dedupe. |
| Batch size | 500 linhas (constante `BATCH = 500` em `ImportClientesDialog.tsx`). |
| Linhas com erro | Gravadas em `public.linhas_ignoradas_importacao` com `tipo_importacao: 'clientes_empresas'` ou `'clientes_contatos'`. |

**Hook alternativo não usado por este fluxo**: [`src/hooks/use-bulk-import.ts`](../src/hooks/use-bulk-import.ts) expõe `importClientes` (batch de 50, retry linha-a-linha), mas hoje só é chamado pelo wizard legado/órfão (`ImportDataDialog`/`ImportDialog`), não pelo `ImportClientesDialog` ativo.

### Fluxo de dados

```
Upload arquivo (.csv/.xlsx) -> validateFile -> parse (xlsx) -> auto-detect mapeamento
  -> mapeamento manual + sanitização (MappingStep) -> merge por CNPJ (arquivo)
  -> lookup de CNPJ existente no banco -> UPDATE (existentes) / INSERT (novos), lotes de 500
  -> linhas inválidas -> linhas_ignoradas_importacao
```

---

## 2. Negócios (Pedidos)

### Frontend

| Arquivo | Papel |
|---|---|
| [`src/components/ImportPedidosDialog.tsx`](../src/components/ImportPedidosDialog.tsx) | Wizard ativo e único caminho de import de Negócios (upload → mapping → preview → resultado). |
| [`src/components/import-pedidos/importPedidosUtils.ts`](../src/components/import-pedidos/importPedidosUtils.ts) | `FIELDS`, `createEmptyMapping`, `detectImportPedidosMapping`, `getImportedPedidosRows`, `getSheetHeaders`. |
| [`src/components/import/MappingStep.tsx`](../src/components/import/MappingStep.tsx) | Mesma UI de mapeamento compartilhada (ver seção Clientes). |
| [`src/hooks/use-bulk-import.ts`](../src/hooks/use-bulk-import.ts) | `importNegocios(payload, nomeArquivo?)` — toda a lógica de resolução de FK, deduplicação, insert em lote e retry. |
| [`src/lib/import/resolve-entities.ts`](../src/lib/import/resolve-entities.ts) | `resolveClienteId`, `resolveFabricanteId`, `resolveObraId` + `preloadResolveCache` (cache em memória por sessão de import; cria clientes/fabricantes/obras que não existem). |
| [`src/lib/import/row-hash.ts`](../src/lib/import/row-hash.ts) | `computeRowHash` — SHA-256 do objeto canônico ordenado, usado para deduplicação. |
| [`src/pages/Negocios.tsx`](../src/pages/Negocios.tsx) | Renderiza o dialog: item "Importar" no menu popover "Ações" (linhas ~734-739) → `<ImportPedidosDialog open={importOpen} .../>` (linha ~1483). |

**Trigger confirmado**: item de menu em `Negocios.tsx`, sempre visível e funcional — **este é o único fluxo de import acessível hoje na tela de Negócios.**

**Achado — dialog órfão ainda montado**: `Negocios.tsx` também importa `ImportDialog` (linha 38, re-export de `ImportDataDialog`) e mantém estado `importAiOpen`/`setImportAiOpen` e o próprio `<ImportDialog open={importAiOpen} importType="negocios" .../>` renderizado no JSX (linhas ~1484-1491). **Não existe nenhum botão/ação que chame `setImportAiOpen(true)`** em nenhum ponto do arquivo nem em nenhum commit do histórico (`git log -p -S"setImportAiOpen(true)"` não retorna nada desde que a linha foi introduzida) — ou seja, esse segundo wizard genérico nasceu órfão e nunca teve trigger em `Negocios.tsx`. O commit `c899bdb` ("remove botão de importação duplicado") resolveu esse problema em `Clientes.tsx`, mas **não** em `Negocios.tsx`, onde o dialog órfão continua montado sem uso.

**Também no commit `c899bdb`**: `Negocios.tsx` ganhou o filtro "Ocultar negócios importados" (`hideImportados`, checkbox no popover de Filtros) — um filtro client/query-side que, por comentário explícito no código, **não** afeta `usePedidosStats` (os cartões de estatísticas continuam contando negócios importados mesmo com o filtro ativo).

**Parsing**: biblioteca `xlsx`. **Feedback de UI**: progress bar ligada a `progress` do hook, tela final com contadores (total, inseridos, sem cliente/fabricante, duplicados, falhas) e motivos de falha agregados; toasts em erros de leitura/import.

### Backend

| Item | Detalhe |
|---|---|
| Tabela alvo | `public.pedidos` (migration `20260305142619_...sql`): `cliente_id`, `obra_id`, `fabricante_id`, `vendedor_id`, `status`, `data_pedido`, `valor_total`, `observacoes`. Não possui coluna `empresa_id` própria — escopo multi-tenant é via `vendedor_id` → join com `usuarios.empresa_id`. |
| RLS | Migration `20260413223933_...sql`: `pedidos_select/insert/update/delete` usam `is_admin() OR vendedor_in_my_empresa(vendedor_id)` (ou `vendedor_id = get_my_vendedor_id()`). |
| Edge Function | Nenhuma usada no fluxo ativo. Existe `supabase/functions/import-data/index.ts` (processamento via IA/Gemini, insere em lotes de 500 usando service-role) mas **não é chamada em lugar nenhum do frontend** (`grep -rn "import-data" src/` não retorna nada) — é código órfão/morto no backend. |
| Insert | 100% client-side via `supabase-js` direto, dentro de `useBulkImport.importNegocios`: preload de lookup tables (clientes/fabricantes/vendedores/obras), depois `supabase.from('pedidos').insert(batchPayloads)`. |
| Duplicados | Hash SHA-256 por linha (`computeRowHash`) comparado contra a coluna `pedidos.import_hash` (consulta em chunks de 200) e contra hashes já vistos no próprio arquivo. **Atenção**: a coluna `import_hash` é referenciada ativamente pelo código (`use-bulk-import.ts`), mas não foi encontrada em nenhuma migration (`grep -rin "import_hash" supabase/migrations/` não retorna resultado) nem no `src/integrations/supabase/types.ts` gerado — ver seção de inconsistências. |
| Batch size | 200 linhas por lote, concorrência 4 lotes em paralelo (`PEDIDO_BATCH = 200`, `PEDIDO_CONCURRENCY = 4`). Se um lote falha, faz retry linha-a-linha. |
| Linhas com erro | `public.linhas_ignoradas_importacao` (migration `20260507172257_...sql`) com `tipo_importacao: 'negocios'`; RLS restringe a `auth.uid() = usuario_id`. Tela de revisão: rota `/importacao/ignoradas` → [`src/pages/LinhasIgnoradas.tsx`](../src/pages/LinhasIgnoradas.tsx), linkada no menu "Linhas Ignoradas" de `Negocios.tsx`. |

### Fluxo de dados

```
Upload arquivo -> parse (xlsx) -> mapeamento (MappingStep) -> sanitização por tipo
  -> preload de lookup tables (clientes/fabricantes/vendedores/obras)
  -> resolve-entities.ts: resolve ou cria cliente/fabricante/obra (cache em memória)
  -> hash SHA-256 por linha -> dedupe contra pedidos.import_hash + hashes já vistos no arquivo
  -> insert em lotes de 200 (concorrência 4) em `pedidos`
  -> lote falhou? -> retry linha a linha
  -> linha inválida/falha -> linhas_ignoradas_importacao
```

---

## 3. Fabricante

### Não encontrado

**Não existe fluxo de importação da entidade Fabricante em si** (dialog, hook, Edge Function ou script dedicado a cadastrar fabricantes em massa a partir de planilha). Busca exaustiva (`grep -rli fabricante` em `src/components/import*`, `src/lib/import`, páginas, edge functions, `scripts/migration`) não retornou nenhum fluxo dedicado.

Cadastro de fabricante hoje é **manual**, via `FabricanteForm` em [`src/pages/Fabricantes.tsx`](../src/pages/Fabricantes.tsx).

O que existe e é frequentemente confundido com "import de Fabricante":

1. **Import de catálogo/tabela de preços por fabricante** (produtos, não a entidade Fabricante):
   - [`src/components/catalogo/GlobalImportCatalogoDialog.tsx`](../src/components/catalogo/GlobalImportCatalogoDialog.tsx) — botão "Importar fabricantes" em `Fabricantes.tsx` (linhas ~334-338), mas na prática **importa linhas de `public.tabela_precos`** (produto/preço/referência/categoria/estoque), tentando casar cada linha com um fabricante **já existente** por nome (via `useFabricantes()`) ou com um fabricante selecionado manualmente no dropdown. Se o fabricante não é encontrado, a linha é simplesmente ignorada — **não há criação automática de fabricante nesse fluxo**.
   - [`src/components/catalogo/ImportCatalogoDialog.tsx`](../src/components/catalogo/ImportCatalogoDialog.tsx) — mesma finalidade, escopo de um fabricante específico já selecionado na tela.
   - Insert via `useBulkCreatePrecos` ([`src/hooks/use-fabricantes.ts`](../src/hooks/use-fabricantes.ts)) na tabela `public.tabela_precos`.

2. **Criação incidental de fabricante durante import de Negócios**: `resolveFabricanteId` (`src/lib/import/resolve-entities.ts`) cria um registro em `fabricantes` quando o nome citado numa linha de negócio não bate com nenhum fabricante existente. Isso é um efeito colateral do import de Negócios, não um fluxo de import de Fabricante.

### Achado de arquitetura relevante (RLS de `fabricantes`)

`public.fabricantes` (migration `20260305142619_...sql`) **não tem coluna `empresa_id`**. RLS de leitura é `USING (true)` para qualquer usuário autenticado (`fabricantes_select`) — ou seja, é um catálogo **compartilhado globalmente** entre todas as empresas do sistema, ao contrário de `clientes`/`pedidos`. `fabricantes_insert/update/delete` exigem `is_gestor()`, e como a criação incidental via `resolveFabricanteId`/`preloadResolveCache` roda com a sessão do usuário logado (client-side), só funciona se esse usuário passar em `is_gestor()`.

### Fluxo de dados

```
Não encontrado (import de Fabricante como entidade).

Fluxo próximo existente (Catálogo/Tabela de Preços):
Upload arquivo -> parse (xlsx) -> casa linha com fabricante existente (nome) ou fabricante selecionado
  -> se fabricante não encontrado: linha ignorada (sem criação automática)
  -> insert em `tabela_precos` via useBulkCreatePrecos
```

---

## Bibliotecas e utilitários compartilhados

- **Parsing**: `xlsx` (`^0.18.5`) — usado por todos os wizards ativos (`ImportPedidosDialog`, `ImportClientesDialog`, `GlobalImportCatalogoDialog`) e pelo utilitário legado `src/lib/import/file-parser.ts`. Nenhum uso de `papaparse` encontrado.
- **Validação de arquivo**: `src/lib/file-validation.ts` (`validateFile`, `MAX_FILE_SIZE_MB = 15`).
- **Mapeamento de colunas**: `src/components/import/MappingStep.tsx`, compartilhado por todos os wizards ativos e pelo legado.
- **Linhas ignoradas**: tabela `linhas_ignoradas_importacao` + rota `/importacao/ignoradas`, alimentada por Negócios, Clientes e Catálogo (`tipo_importacao: 'catalogo_geral'`).
- **`scripts/migration/*.ts`** (`import.ts`, `export.ts`, `inventory.ts`, `import-dry-run.ts`): **não relacionado** aos wizards de import da UI — é uma ferramenta de consolidação de bancos Supabase inteiros (multi-cliente) via conexão Postgres direta, com dry-run/commit/rollback e checagem de RLS. Fora do escopo do import de planilha pelo usuário final.

---

## Tabela resumo comparativa

| | Clientes (Empresas/Contatos) | Negócios (Pedidos) | Fabricante |
|---|---|---|---|
| UI funcional e acessível hoje? | Sim (`ImportClientesDialog`, via menu "Ações") | Sim (`ImportPedidosDialog`, via menu "Ações") | **Não existe** import dedicado (só cadastro manual + criação incidental via import de Negócios) |
| Insert client ou server-side? | Client-side direto (`supabase-js`) | Client-side direto (`supabase-js`), lotes de 200 com resolução de FK | N/A — criação incidental é client-side via `resolveFabricanteId` |
| RLS com scoping por empresa? | Duplo/inconsistente: RLS nova por `empresa_id` (clientes) coexiste com RLS antiga por `vendedor_id`; `contatos` só por `vendedor_id` | Sim, via `vendedor_in_my_empresa(vendedor_id)` | **Não** — `fabricantes` é compartilhado globalmente (`SELECT USING (true)`), sem `empresa_id` |
| Tratamento de duplicados | Sim — merge por CNPJ no arquivo + upsert (update/insert) por CNPJ existente (só `empresas`; `contatos` sem dedupe) | Sim — hash SHA-256 por linha (`import_hash`) | N/A |
| Batch size | 500 | 200 (concorrência 4) | N/A |
| Dead code / dialogs órfãos | Removido no commit `c899bdb` | Ainda presente: `ImportDialog`/`importAiOpen` em `Negocios.tsx` sem trigger algum | Edge Function `import-data` (Gemini) não é chamada por ninguém, para nenhuma entidade |

---

## Inconsistências encontradas

1. **Coluna `import_hash` sem migration correspondente**: `use-bulk-import.ts` lê e escreve `pedidos.import_hash` para deduplicação, mas nenhuma migration em `supabase/migrations/` cria essa coluna, e ela também não aparece em `src/integrations/supabase/types.ts`. Ou o schema real do banco diverge das migrations versionadas (coluna criada fora do fluxo de migration), ou o tipo gerado está desatualizado — recomenda-se confirmar contra o banco real antes de assumir que a dedupe funciona em produção.

2. **Dialog genérico órfão (`ImportDialog`/`ImportDataDialog`) ainda montado em `Negocios.tsx`**: o commit `c899bdb` removeu o botão duplicado e o dialog legado de `Clientes.tsx`, mas não fez o mesmo em `Negocios.tsx`, onde `ImportDialog`/`importAiOpen` continuam importados e renderizados sem nenhum botão que os acione. É código morto que deveria ser removido junto.

3. **Duas gerações de RLS multi-tenant coexistindo em `clientes`**: uma baseada em `vendedor_in_my_empresa(vendedor_id)` (migration `20260413223933_...sql`) e outra baseada em `empresa_id` direto (migration `20260504172116_...sql`). Não há evidência no código de que a antiga tenha sido desativada — se ambas as policies estiverem ativas simultaneamente como `PERMISSIVE`, o resultado efetivo é a união das duas (mais permissivo do que qualquer uma isolada), o que pode não ser a intenção.

4. **`fabricantes` sem scoping de empresa** enquanto `clientes`/`pedidos` têm: fabricantes criados incidentalmente durante o import de Negócios de uma empresa ficam visíveis/reutilizáveis por todas as empresas do sistema — comportamento propositalmente diferente (catálogo compartilhado), mas que vale confirmar que é intencional e não um RLS esquecido.

5. **Edge Function `import-data` (processamento via IA/Gemini) existe mas não é usada por nenhuma entidade**: código backend completo e funcional, com lotes de 500 e uso de service-role, mas sem nenhuma chamada `functions.invoke` no frontend. É a única peça do sistema pensada para lidar com arquivos "muito irregulares"; hoje esse caso de uso não é atendido por nenhum fluxo ativo.

6. **Import de Fabricante inexistente enquanto Clientes e Negócios têm wizards completos**: a ausência de um fluxo de import para Fabricante é uma assimetria não documentada anteriormente — se o volume de fabricantes cadastrados manualmente crescer, essa lacuna tende a virar pedido de feature.

7. **Tratamento de duplicados inconsistente entre `contatos` (nenhum) e `empresas`/`negócios` (dedupe explícito)**: contatos importados repetidamente pelo mesmo arquivo (ou arquivos diferentes) geram registros duplicados sem aviso, diferente do comportamento das outras duas tabelas.
