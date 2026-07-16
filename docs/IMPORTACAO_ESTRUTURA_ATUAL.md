# Estrutura atual de importação (para servir de base ao modelo novo)

> Levantamento feito lendo o código-fonte, migrations e histórico de commits em 2026-07-16 (HEAD `60837cf`).
> Existem dois outros arquivos no repo sobre o mesmo assunto — `IMPORT_STRUCTURE.md` (raiz, desatualizado)
> e `docs/IMPORT_STRUCTURE.md` (levantamento anterior, de 2026-07-08) — este documento os substitui como
> referência para o redesenho.

## Visão geral

Hoje existem **três fluxos de import independentes**, cada um com seu próprio wizard, sua própria lógica de
detecção de colunas e sua própria lógica de gravação no banco. Não há um pipeline genérico compartilhado —
o que é compartilhado é só a UI de mapeamento de colunas (`MappingStep`) e a validação de arquivo.

| | Clientes (Empresas/Contatos) | Negócios (Pedidos) | Catálogo/Tabela de Preços |
|---|---|---|---|
| Entidade alvo | `clientes`, `contatos` | `pedidos` (+ cria `clientes`/`fabricantes`/`obras` incidentalmente) | `tabela_precos` |
| Componente | `ImportClientesDialog.tsx` | `ImportPedidosDialog.tsx` | `GlobalImportCatalogoDialog.tsx` / `ImportCatalogoDialog.tsx` |
| Lógica de import | dentro do próprio componente | `useBulkImport.importNegocios` + `resolve-entities.ts` | `useBulkCreatePrecos` |
| Dedupe | merge por CNPJ (só `empresas`) | hash SHA-256 por linha (`pedidos.import_hash`) | por nome de fabricante existente |
| Batch | 500 | 200, 4 lotes em paralelo | — |
| Import da entidade **Fabricante** em si | — | — | **não existe** |

Não existe hoje um import dedicado para cadastrar Fabricantes em massa — só cadastro manual
(`FabricanteForm`) e criação incidental de fabricante durante o import de Negócios quando o nome citado não
bate com nenhum existente.

---

## 1. Peças compartilhadas entre os wizards

- **Parsing**: biblioteca `xlsx` (`^0.18.5`) lê `.csv`/`.xlsx`/`.xls` inteiramente no browser
  (`XLSX.read` → `XLSX.utils.sheet_to_json`). Sem streaming — o arquivo inteiro vai para memória.
- **Validação de arquivo**: [`src/lib/file-validation.ts`](../src/lib/file-validation.ts) — `validateFile`
  checa extensão e tamanho (`MAX_FILE_SIZE_MB = 15`) antes do parse.
- **UI de mapeamento**: [`src/components/import/MappingStep.tsx`](../src/components/import/MappingStep.tsx)
  — componente único usado pelos 2 wizards ativos (Clientes e Negócios). Expõe:
  - `detectFuzzyMapping` — fuzzy matching genérico de headers → campos (usado como fallback; cada wizard
    também tem sua própria heurística de auto-detecção mais específica, ver seções 2 e 3).
  - `sanitizeImportedRows` — normaliza tipos por campo (`getFieldType`/`sanitizeFieldValue`), aplica
    "campos extras" (colunas da planilha sem campo correspondente no sistema → guardadas em JSONB
    `campos_extras`) e "colunas customizadas" (campo novo criado do zero pelo usuário, valor fixo para
    todas as linhas).
  - Cada wizard mantém em `localStorage` o último mapeamento usado por tipo de import
    (`import_clientes_<target>_mapping`, `import_pedidos_mapping`, etc.) e oferece "salvar como padrão".
- **Linhas ignoradas**: tabela `public.linhas_ignoradas_importacao` recebe toda linha que falha validação
  ou insert, com `tipo_importacao` (`clientes_empresas`, `clientes_contatos`, `negocios`, `catalogo_geral`),
  `dados_originais` (a linha crua) e `motivo_ignorado`. Tela de revisão em `/importacao/ignoradas`
  ([`src/pages/LinhasIgnoradas.tsx`](../src/pages/LinhasIgnoradas.tsx)).
- **Todo insert é client-side direto via `supabase-js`** — não há Edge Function no caminho ativo de nenhum
  dos três fluxos. A única Edge Function relacionada a import,
  [`supabase/functions/import-data/index.ts`](../supabase/functions/import-data/index.ts) (processamento
  via IA/Gemini, lotes de 500, service-role), **existe mas não é chamada em nenhum lugar do frontend**
  (`grep -rn "import-data" src/` não retorna nada) — código órfão.

---

## 2. Clientes (Empresas e Contatos) — `ImportClientesDialog.tsx`

Wizard único, com `target: 'empresas' | 'contatos'` conforme a aba ativa em
[`src/pages/Clientes.tsx`](../src/pages/Clientes.tsx) (menu "Ações" → "Importar", linha ~675).

**Particularidade**: não usa `MappingStep.detectFuzzyMapping` nem `useBulkImport` — tem sua própria
detecção (`autoDetectMapping`/`AUTO_RULES`, regex por campo) e sua própria lógica de gravação, escrita
inteira dentro do componente.

Fluxo:
```
Upload (.csv/.xlsx/.xls) → validateFile → parse (xlsx)
  → auto-detect mapeamento (AUTO_RULES, regex por campo) + auto-detect de "extras" (AUTO_RULES genéricas
    tipo "vendedor", "origem", "observações")
  → mapeamento manual (MappingStep) + sanitização por tipo de campo
  → merge por CNPJ dentro do próprio arquivo (mergeRowsByCnpj — linhas repetidas do mesmo CNPJ são
    mescladas, preservando o valor não-vazio mais recente)
  → preview (até 50 linhas mostradas)
  → confirmação:
      target=empresas: busca CNPJs já existentes (.in('cnpj', ...).eq('usuario_id', vid))
        → UPDATE dos que já existem / INSERT dos novos, merge de campos_extras
      target=contatos: sempre INSERT simples, sem dedupe nenhum
  → lotes de 500 (BATCH = 500)
  → linhas sem empresa/nome válido → linhas_ignoradas_importacao
```

Tabelas: `public.clientes` e `public.contatos`
(migration `20260409192634_...sql`). `clientes` tem RLS **duplo** coexistindo — uma geração baseada em
`empresa_id` direto (`20260504172116_...sql`) e outra mais antiga baseada em
`vendedor_in_my_empresa(vendedor_id)` (`20260413223933_...sql`); `contatos` só tem a segunda (via
`vendedor_id`, sem `empresa_id` próprio).

Assimetria notável: `empresas` tem dedupe por CNPJ, `contatos` não tem dedupe nenhum — importar o mesmo
arquivo de contatos duas vezes duplica tudo.

---

## 3. Negócios (Pedidos) — `ImportPedidosDialog.tsx`

Único caminho de import ativo em [`src/pages/Negocios.tsx`](../src/pages/Negocios.tsx) (menu "Ações" →
"Importar", linha ~739). O wizard delega toda a lógica de resolução/dedupe/insert para
`useBulkImport.importNegocios`.

Fluxo:
```
Upload → parse (xlsx, raw: false) → detectImportPedidosMapping (scoring por regex + heurística sobre
  amostra de valores — ver importPedidosUtils.ts) → mapeamento manual (MappingStep) → sanitização
  → getMappedRows: normaliza status (resolveImportedPedidoStatus), valor (parseNumber, PT-BR/EN),
    datas (processDate — trata Excel serial date, DD/MM/YYYY, ano de 2 dígitos, ISO)
  → handleImport:
      resolve vendedor por nome (se usuário é gestor) → enrichedRows (campos_extras, usuario_id)
      → useBulkImport.importNegocios:
          resetResolveCache()
          → em paralelo: computeRowHash (SHA-256) de cada linha + preloadResolveCache
            (pré-carrega/cria em lote clientes, fabricantes e obras por nome — ilike em chunks de 50)
          → busca hashes já existentes em pedidos.import_hash (chunks de 200)
          → processa em lotes de 200 (PEDIDO_BATCH), 4 lotes em paralelo (PEDIDO_CONCURRENCY):
              por linha: pula se hash duplicado → resolve cliente/fabricante/obra (cache hit após
              preload; cria se não existir) → monta payload → INSERT em lote
              → lote falhou? retry linha-a-linha
  → tela "done" com contadores (total, inseridos, sem cliente/fabricante, duplicados, falhas)
```

Tabela alvo: `public.pedidos` (migration `20260305142619_...sql`), sem `empresa_id` próprio — escopo
multi-tenant via `vendedor_id` → join `usuarios.empresa_id`. RLS: `is_admin() OR
vendedor_in_my_empresa(vendedor_id)`.

**Achado de schema drift corrigido**: a coluna `pedidos.import_hash` (usada para dedupe) e outras 3
(`origem_lead`, `endereco_entrega`, `pdf_url`) existiam em produção sem migration correspondente — isso foi
documentado e corrigido retroativamente na migration
[`20260708174139_documenta_colunas_pedidos_drift.sql`](../supabase/migrations/20260708174139_documenta_colunas_pedidos_drift.sql).
Hoje o schema versionado já reflete a coluna usada pelo código.

**Dialog órfão ainda montado**: `Negocios.tsx` também importa `ImportDialog` (re-export do wizard genérico
legado `ImportDataDialog`) e mantém estado `importAiOpen`/`<ImportDialog open={importAiOpen}
importType="negocios" .../>` renderizado (linhas ~1484-1491), mas **não há nenhum botão que chame
`setImportAiOpen(true)`** em lugar nenhum do arquivo — é código morto, candidato a remoção junto do
redesenho.

Criação incidental de entidades (`resolve-entities.ts`): se o nome de cliente/fabricante/obra citado numa
linha não bate com nada existente (`ilike`), a linha cria o registro automaticamente. É a única forma hoje
de "importar fabricantes" — efeito colateral, não um fluxo dedicado. Nota: `fabricantes` não tem
`empresa_id` e RLS de leitura é `USING (true)` — catálogo compartilhado globalmente entre empresas,
diferente de `clientes`/`pedidos`.

---

## 4. Catálogo / Tabela de Preços — `GlobalImportCatalogoDialog.tsx` / `ImportCatalogoDialog.tsx`

Frequentemente confundido com "import de Fabricante", mas na prática importa **linhas de
`public.tabela_precos`** (produto/preço/referência/categoria/estoque) casando cada linha com um fabricante
**já existente** (por nome via `useFabricantes()`, ou fabricante fixo selecionado manualmente no dropdown).
Se o fabricante da linha não é encontrado, a linha é simplesmente ignorada — sem criação automática.
Insert via `useBulkCreatePrecos` ([`src/hooks/use-fabricantes.ts`](../src/hooks/use-fabricantes.ts)).

---

## 5. Pontos a considerar para o modelo novo

1. **Três lógicas de auto-detecção de colunas diferentes** (regex fixo em `ImportClientesDialog`, scoring
   por regex+amostra em `importPedidosUtils`, `detectFuzzyMapping` genérico em `MappingStep` usado só como
   fallback) — nenhuma é reaproveitada pelas outras. Unificar isso é o ganho mais direto de um modelo novo.
2. **Nenhuma entidade compartilha a mesma lógica de dedupe/upsert**: CNPJ-merge (Clientes/empresas), hash
   SHA-256 de linha (Negócios), nome-de-fabricante-existente (Catálogo), nenhum dedupe (Contatos).
3. **Import 100% client-side, sem Edge Function** — arquivos grandes (até 15MB) são lidos e processados
   inteiramente no browser; a Edge Function `import-data` (Gemini) que resolveria isso para arquivos
   irregulares existe mas está desconectada.
4. **Import de Fabricante como entidade não existe** — se isso for parte do modelo novo, hoje não há
   nenhum código para reaproveitar além da criação incidental em `resolve-entities.ts`.
5. **Dois wizards a limpar/substituir**: `ImportClientesDialog` e `ImportPedidosDialog` não compartilham
   lógica de negócio entre si (só a UI de mapeamento) — um modelo novo unificado precisaria abstrair a
   parte específica de cada entidade (campos, validação, resolução de FK, dedupe) por trás de uma interface
   comum.
6. **Dialog genérico órfão** (`ImportDialog`/`ImportDataDialog`, `useBulkImport.importClientes`) já existe
   mas não é usado por nenhum wizard ativo — vale avaliar se ele é aproveitável como base do modelo novo ou
   se deve ser removido.
