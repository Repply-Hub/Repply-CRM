# Importação de planilha (CSV / XLSX)

Documentação técnica do sistema de importação de arquivos CSV e Excel.

> **Este documento absorveu quatro anteriores** — `docs/IMPORT_STRUCTURE.md` (cópia
> antiga), `docs/IMPORTACAO_ESTRUTURA_ATUAL.md`, `importacoes_resumo.md` e
> `LinhasIgnoradas.md`. As seções 12 a 14 vieram deles.

> 🔴 **A importação é a prioridade zero do projeto.** Um problema de formatação de datas
> trava a migração da base da MD Representações do Bitrix24 para o Repply. Ver
> [`docs/divida-tecnica.md` §3](../divida-tecnica.md).

---

## Visão Geral

O sistema segue um fluxo de três etapas (wizard):

```
Upload do Arquivo → Mapeamento de Colunas → Preview & Confirmação
```

Ao final, os dados são inseridos em lote no Supabase com estratégias de resiliência a falhas.

---

## Estrutura de Arquivos

```
src/
├── lib/import/
│   ├── file-parser.ts          # Leitura e parse do arquivo (CSV/XLSX)
│   └── resolve-entities.ts     # Resolução de FKs (cliente, fabricante)
│
├── components/
│   ├── ImportPedidosDialog.tsx      # Wizard de importação de Negócios
│   ├── clientes/
│   │   └── ImportClientesDialog.tsx # Wizard de importação de Clientes/Contatos (o real — usado por Clientes.tsx)
│   ├── import/
│   │   └── ImportDataDialog.tsx     # Wizard genérico (empresas/negócios) — usado só por Fabricantes.tsx e Negocios.tsx via o alias ImportDialog.tsx, não por Clientes.tsx
│   └── ImportDialog.tsx             # Re-export de ImportDataDialog
│
└── pages/
    ├── Clientes.tsx             # Integra ImportClientesDialog (target="empresas" | "contatos")
    └── Negocios.tsx             # Integra ImportPedidosDialog

supabase/functions/
└── import-data/
    └── index.ts                 # Edge Function com processamento via IA (Gemini)
```

---

## 1. Camada de Parse — `src/lib/import/file-parser.ts`

Responsável por ler o arquivo e extrair cabeçalhos e linhas brutas.

**Biblioteca:** [`xlsx`](https://www.npmjs.com/package/xlsx)

**Formatos suportados:** `.csv`, `.xlsx`, `.xls`

**Processo:**
1. CSV → lido como texto; Excel → lido como `ArrayBuffer`
2. `sheet_to_json` com `header: 1` retorna uma matriz de arrays
3. Primeira linha → `headers` (trimados, sem valores vazios)
4. Linhas seguintes → objetos `{ [header]: valor | "" }`
5. Linhas completamente vazias são descartadas

**Tipo retornado:**
```ts
interface ParsedFile {
  headers: string[];
  rawData: Record<string, string>[];
}
```

---

## 2. Detecção Automática de Colunas

Cada campo possui uma lista de **padrões regex** e **sinônimos** que são comparados contra os cabeçalhos do arquivo usando um algoritmo de **fuzzy matching** (distância de Levenshtein).

### Pontuação

| Tipo de match         | Score |
|-----------------------|-------|
| Exato                 | 100   |
| Contém / é contido    | 86    |
| Similaridade (Levenshtein) | 0–82 |

Além dos cabeçalhos, **amostras dos dados** são analisadas para aumentar a confiança:

- **Status**: +pontos se valores resolvem para estágios conhecidos do pipeline
- **Valor**: +pontos se os valores são numéricos > 0
- **Fabricante**: +10 se o cabeçalho contém "pipeline"
- **Cliente**: +10 se o cabeçalho é exatamente "empresa"

---

## 3. Sanitização de Valores — `MappingStep`

Cada tipo de campo possui uma função de sanitização dedicada:

| Tipo     | Transformação aplicada |
|----------|------------------------|
| `text`   | Trim básico |
| `cnpj`   | Remove tudo que não é dígito |
| `phone`  | Separa por delimitadores, remove não-dígitos, une com `", "` |
| `email`  | Lowercase |
| `number` | Converte formato BR (`1.234,56` → `1234.56`), remove `R$` |
| `date`   | Aceita serial Excel, `DD/MM/YYYY`, `DD-MM-YYYY` → ISO 8601 |
| `status` | Passa direto (só trim + espaços colapsados) — ver "Normalização de Status" abaixo |

### Normalização de Status

Ao contrário dos outros tipos, o campo `status` **não** é reduzido a um valor genérico no
passo de sanitização (`sanitizeFieldValue`, `MappingStep.tsx`) — as etapas do pipeline são
configuráveis por empresa via `kanban_colunas` (não um enum fixo), então adivinhar um valor
genérico ali só descartaria informação antes da hora (ex.: uma tabela fixa antiga reduzia
"negociação perdida" a `negociacao` antes mesmo de "perdido" ser considerado).

O texto da planilha segue intacto até `matchPedidoStatusToColuna`
(`src/components/import-pedidos/importPedidosUtils.ts`), chamado em `use-bulk-import.ts`
logo antes do INSERT em `pedidos`, com as colunas reais do funil escolhido já carregadas.
Essa função resolve, em ordem:

1. Match exato contra `nome` ou `slug` de uma coluna real (cobre etapas renomeadas/customizadas)
2. Contém / é contido (parcial) contra `nome` ou `slug`
3. Sinônimos conhecidos — `fech/ganho/concluid/won`, `perdid/perda/cancelad/lost/reprovad/recusad/declinad`,
   `negocia/tratativa`, `enviad/apresentad/proposta`, `elabora/orcamento/cotacao`, `novo lead` —
   apontando para a coluna real cujo slug bate com o slug padrão do sistema
4. Se nada bater: cai na primeira coluna do funil, respeitando a ordem configurada

A prévia do wizard (`ImportPedidosDialog.tsx`) usa a mesma função para mostrar o badge real
(nome + cor) da coluna em que cada linha vai cair, em vez de um rótulo solto sem cor.

---

## 4. Importação de Negócios — `ImportPedidosDialog.tsx`

### Campos Suportados

| Campo           | Obrigatório | Tipo     | Descrição |
|-----------------|-------------|----------|-----------|
| `negocio`       | não         | text     | Nome/título do negócio |
| `cliente`       | **sim**     | text     | Nome da empresa cliente |
| `contato`       | não         | text     | Nome do contato |
| `obra`          | não         | text     | Endereço de entrega (texto livre — **não** cria/vincula registros em `obras`) |
| `fabricante`    | **sim**     | text     | Nome do fabricante |
| `valor`         | não         | number   | Valor total |
| `vendedor`      | não         | text     | Nome do vendedor |
| `observacoes`   | não         | text     | Observações livres |
| `status`        | não         | status   | Estágio do pipeline |
| `data_pedido`   | não         | date     | Data do pedido |
| `prazo_resposta`| não         | date     | Prazo de resposta |

### Fluxo de Importação

```
1. Validação → cliente e fabricante devem estar mapeados
       ↓
2. Carrega lookup tables (clientes, fabricantes, vendedores)
   em blocos de 1.000 linhas
       ↓
3. Resolve entidades (cria se não existir — ver seção 5)
       ↓
4. Insere em lotes de 200 linhas
       ↓
5. Se lote falha → retry linha a linha
       ↓
6. Linhas com erro → tabela linhas_ignoradas_importacao
```

### Payload inserido em `pedidos`

```ts
{
  cliente_id,
  endereco_entrega,  // texto livre da coluna `obra` — nunca vira obra_id
  fabricante_id,
  usuario_id,        // vendedor logado ou resolvido pelo nome
  status,
  valor_total,
  observacoes,
  campos_extras,     // colunas extras mapeadas como JSON
  data_pedido,
  created_at,
  prazo_resposta
}
```

`obra_id` nunca é preenchido pela importação — a entidade `obras` só é criada/vinculada manualmente
pela UI (`NovoNegocioDialog`), pois é um cadastro próprio por cliente (com endereço, SPE/CNPJ etc.),
diferente do campo de texto livre `endereco_entrega` do negócio.

---

## 5. Resolução de Entidades — `src/lib/import/resolve-entities.ts`

Utilizado exclusivamente pelo fluxo de **Negócios**. Resolve ou cria registros de FK antes do insert.

### `resolveClienteId(nome)`
1. Busca por `empresa` (ilike, case-insensitive)
2. Fallback: busca por `razao_social`
3. Se não encontrar: cria novo cliente com `tipo: 'cliente'`

### `resolveFabricanteId(nome)`
1. Busca por `nome` (case-insensitive)
2. Se não encontrar: cria novo fabricante (catálogo compartilhado, sem `usuario_id`)

**Cache de sessão:** um `Map` por entidade previne queries duplicadas para nomes repetidos na mesma importação.

---

## 6. Importação de Clientes — `ImportClientesDialog.tsx`

Suporta dois **alvos**:

- `empresas` — importa registros de clientes/empresas
- `contatos` — importa contatos vinculados a empresas existentes

### Campos Suportados

| Campo              | Alvo      | Obrigatório         | Tipo  |
|--------------------|-----------|---------------------|-------|
| `empresa`          | ambos     | sim (ver regra)     | text  |
| `razao_social`     | empresas  | não                 | text  |
| `tipo`             | empresas  | não                 | text  |
| `cnpj`             | empresas  | não                 | cnpj  |
| `email`            | ambos     | não                 | email |
| `telefone`         | ambos     | não                 | phone |
| `logradouro`       | empresas  | não                 | text  |
| `numero`           | empresas  | não                 | text  |
| `complemento`      | empresas  | não                 | text  |
| `bairro`           | empresas  | não                 | text  |
| `cidade`           | empresas  | não                 | text  |
| `uf`               | empresas  | não                 | text  |
| `cep`              | empresas  | não                 | text  |
| `nome_contato`     | contatos  | sim (ver regra)     | text  |
| `sobrenome_contato`| contatos  | não                 | text  |
| `cargo`            | contatos  | não                 | text  |
| `classificacao`    | empresas  | não                 | text  |
| `data_criacao`     | ambos     | não                 | date  |

**Regras de validação:**
- Empresas: ao menos um entre `empresa`, `razao_social` ou `cnpj`
- Contatos: ao menos um entre `empresa` ou `nome_contato`

### Normalização de `tipo`

| Entrada             | Valor normalizado |
|---------------------|-------------------|
| pf / pessoa_fisica  | `pessoa fisica`   |
| pj / pessoa_juridica| `pessoa juridica` |
| cliente             | `cliente`         |
| fornecedor          | `fornecedor`      |

### Estratégia de Upsert (Empresas)

Busca um cliente já existente (do mesmo `usuario_id` de quem está importando) em três tentativas,
na ordem — a primeira que bater vence:

```
1. CNPJ (exato)
2. empresa (ilike, normalizado)
3. razao_social (ilike, normalizado)
      │
      ├─ Achou → UPDATE: preenche só os campos que estavam vazios no cadastro existente
      │           (nunca sobrescreve um valor já cadastrado — nem o do próprio arquivo,
      │           nem um editado manualmente depois). Mescla campos_extras (JSON) do
      │           mesmo jeito: só adiciona chaves que ainda não existiam.
      └─ Não achou → INSERT novo registro
```

O fallback por nome existe especificamente porque a importação de Negócios
(`resolve-entities.ts` → `resolveClienteId`) cria clientes só com `empresa` preenchido, sem
CNPJ — sem esse fallback, importar as Empresas depois duplicava esse cliente em vez de
completar o cadastro.

Linhas duplicadas por CNPJ dentro do próprio arquivo são **mescladas** antes do insert
(prioriza o valor não-vazio da linha mais recente do arquivo — regra diferente da usada
contra o banco, onde o cadastro já existente sempre vence).

### Tamanho dos Lotes

| Alvo     | Lote |
|----------|------|
| Empresas | 500  |
| Contatos | 500  |

---

## 7. Colunas Extras e Campos Dinâmicos

Colunas do arquivo que não mapeiam para nenhum campo padrão podem ser capturadas como **campos extras**:

- Armazenadas em `campos_extras` (coluna `jsonb`) na tabela alvo
- Podem ser vinculadas a colunas existentes no formato `"Label::ID"`
- Novos campos personalizados podem ser criados durante o mapeamento com valores padrão
- Múltiplas colunas podem ser mescladas em um único campo:
  - Tipo `text`: valores unidos com `", "`
  - Outros tipos: primeiro valor não-vazio

---

## 8. Persistência de Mapeamentos (localStorage)

Para evitar retrabalho em importações recorrentes, os mapeamentos são salvos automaticamente:

| Chave                              | Conteúdo |
|------------------------------------|----------|
| `import_pedidos_mapping`           | Mapeamento campo → coluna |
| `import_pedidos_defaults`          | Valores padrão por campo |
| `import_pedidos_custom`            | Campos personalizados criados |
| `import_pedidos_labels`            | Labels dos campos extras |
| `import_clientes_{target}_mapping` | Mapeamento para clientes/contatos |
| `pedidos_all_columns`              | Definições de colunas da tabela |
| `pedidos_visible_columns`          | Colunas visíveis na tabela |

---

## 9. Linhas Ignoradas

Linhas que falham na validação ou no insert são registradas em `linhas_ignoradas_importacao`:

```ts
{
  usuario_id,          // quem importou
  tipo_importacao,     // "clientes" | "clientes_empresas" | "clientes_contatos" | "negocios" | "catalogo_geral"
  dados_originais,     // linha já mapeada para os campos canônicos do sistema (não os
                        // cabeçalhos originais da planilha) — necessário para reeditar
  motivo_ignorado,     // mensagem de erro
  nome_arquivo         // nome do arquivo de origem, usado para agrupar na tela
}
```

`dados_originais` guarda os campos já mapeados (ex.: `empresa`, `cnpj`, `nome_contato`,
`fabricante_nome`, `descricao_material`) em vez dos cabeçalhos brutos do arquivo — a tela de
revisão não tem acesso ao mapeamento de colunas escolhido no wizard, então gravar os nomes
de campo do sistema é o que permite reabrir a linha depois e editá-la com sentido.

### Revisão e reenvio — `src/pages/LinhasIgnoradas.tsx`

Cada linha ignorada pode ser reaberta num diálogo que edita os campos e tenta importar de
novo, roteando por `tipo_importacao`:

| `tipo_importacao`                    | Reenviado via |
|---------------------------------------|---------------|
| `clientes` / `clientes_empresas`      | `useBulkImport().importClientes` (tabela `clientes`) |
| `clientes_contatos`                   | insert direto em `contatos`, resolvendo `cliente_id` pelo nome da empresa |
| `negocios`                            | `useBulkImport().importNegocios` (resolve cliente/fabricante pelo nome) |
| `catalogo_geral`                      | insert direto em `tabela_precos`, resolvendo `fabricante_id` pelo nome |

A linha original é apagada antes da nova tentativa; se ela falhar de novo, é recriada com os
dados editados e o novo motivo — uma tentativa malsucedida nunca é perdida silenciosamente.

---

## 10. Edge Function — `supabase/functions/import-data/`

Processamento alternativo via IA (Gemini Flash) — **não integrado ao fluxo padrão da UI**.

**Funcionalidade:**
1. Divide o arquivo em blocos de 60 linhas (mantendo cabeçalho)
2. Processa 4 blocos em paralelo com timeout de 45s cada
3. Envia para Gemini com schema de destino
4. Gemini normaliza: telefones, datas, CNPJ, valores monetários
5. Resultado inserido em lotes de 500 no Supabase

**Casos de uso pretendidos:** arquivos com formatação muito irregular que a sanitização client-side não consegue normalizar.

---

## 11. Integração nas Páginas

### `Clientes.tsx`
```tsx
<ImportClientesDialog
  open={importOpen}
  onOpenChange={setImportOpen}
  hideTrigger
  target={activeTab}   // "empresas" ou "contatos"
/>
```

### `Negocios.tsx`
```tsx
<ImportPedidosDialog
  onSuccess={() => queryClient.invalidateQueries(['pedidos'])}
/>
```

Ambos os dialogs gerenciam estado interno e invalidam o cache de queries ao concluir com sucesso.

---

## Diagrama de Fluxo Completo

```
Arquivo (CSV/XLSX)
        │
        ▼
   file-parser.ts
   ┌──────────────┐
   │  headers[]   │
   │  rawData[]   │
   └──────┬───────┘
          │
          ▼
   Detecção Automática
   (fuzzy match + análise de amostras)
          │
          ▼
   Mapeamento Manual (UI)
   + Valores Padrão
   + Campos Personalizados
          │
          ▼
   Sanitização por Tipo
   (text/cnpj/phone/email/number/date/status)
          │
          ▼
   ┌──────────────────────────────┐
   │  Negócios?                   │
   │  resolve-entities.ts         │
   │  → cliente / fabricante      │
   │  (endereço vira texto livre) │
   └──────────────┬───────────────┘
                  │
                  ▼
          Lotes (200–500 linhas)
                  │
           ┌──────┴──────┐
      Sucesso          Falha
           │              │
      Supabase      Retry row-by-row
                         │
                  ┌──────┴──────┐
             Sucesso         Falha
                         linhas_ignoradas
                         _importacao
```

---

## 12. Catálogo e tabela de preços — o import que todo mundo confunde

O botão **"Importar fabricantes"** na tela de Fabricantes **não importa fabricantes.**
Ele importa linhas de `tabela_precos` — produto, preço, referência, categoria, estoque.

| Componente | Escopo |
|---|---|
| `src/components/catalogo/GlobalImportCatalogoDialog.tsx` | Vários fabricantes de uma vez |
| `src/components/catalogo/ImportCatalogoDialog.tsx` | Um fabricante já selecionado na tela |

Cada linha é casada com um fabricante **já existente**, por nome, ou com um fabricante
escolhido no seletor. **Se o fabricante não é encontrado, a linha é ignorada** — não há
criação automática nesse fluxo. A gravação é por `useBulkCreatePrecos`
(`src/hooks/use-fabricantes.ts`).

### Não existe importação da entidade Fabricante

Busca exaustiva não encontrou nenhum fluxo dedicado a cadastrar fabricantes em massa a
partir de planilha. O cadastro é **manual**, pelo formulário em `src/pages/Fabricantes.tsx`.

A única criação automática de fabricante acontece **como efeito colateral** da importação
de Negócios: `resolveFabricanteId` (`src/lib/import/resolve-entities.ts`) cria o registro
quando o nome citado numa linha não bate com nenhum existente.

> É uma assimetria: Clientes e Negócios têm assistente completo, Fabricante não tem
> nenhum. Se o volume de cadastro manual crescer, vira pedido de funcionalidade.

---

## 13. Achados de arquitetura

Levantados na auditoria da agência. **O estado de cada um foi reconferido em 19/08/2026.**

### ✅ Resolvido — `fabricantes` sem escopo de empresa

O achado original: `public.fabricantes` não tinha `empresa_id` e a leitura era
`USING (true)` para qualquer usuário autenticado — ou seja, **catálogo compartilhado entre
todas as empresas do sistema.**

**Corrigido em 19/08/2026** pelas migrations
`20260819124247_fabricantes_e_precos_por_empresa.sql` e
`20260819125643_fabricantes_escrita_para_todo_membro_da_empresa.sql`: catálogo e preços
passaram a ser por empresa, e a escrita deixou de exigir papel de gestor.

### ⚠️ Em aberto — duas gerações de política em `clientes`

Coexistem duas políticas de acesso multi-empresa na tabela `clientes`: uma baseada em
`vendedor_in_my_empresa(vendedor_id)` (migration `20260413223933`) e outra baseada em
`empresa_id` direto (migration `20260504172116`). **Não há evidência de que a antiga tenha
sido desativada.**

Se as duas estiverem ativas como `PERMISSIVE`, o resultado efetivo é a **união** delas —
mais permissivo do que qualquer uma isolada, o que provavelmente não é a intenção.
Registrado em [`docs/divida-tecnica.md`](../divida-tecnica.md).

### ⚠️ Em aberto — coluna `import_hash` sem migration

`use-bulk-import.ts` lê e escreve `pedidos.import_hash` para evitar linha duplicada, mas
**nenhuma migration cria essa coluna** e ela não aparece nos tipos gerados. Ou o banco real
divergiu das migrations (coluna criada fora do fluxo), ou o tipo está desatualizado.

> **Confirme contra o banco real antes de assumir que a deduplicação funciona em
> produção.**

### ⚠️ Em aberto — código morto em `Negocios.tsx`

`ImportDialog` / `ImportDataDialog` continuam importados e renderizados em `Negocios.tsx`
sem nenhum botão que os acione. O equivalente já foi removido de `Clientes.tsx` (commit
`c899bdb`), mas não aqui.

### ⚠️ Em aberto — contatos duplicam sem aviso

`contatos` não tem nenhuma estratégia de deduplicação, diferente de empresas (junção por
CNPJ) e negócios (hash de linha). Importar o mesmo arquivo duas vezes gera contatos
repetidos, silenciosamente.

---

## 14. Pontos a considerar se a importação for refeita

Registrados pela auditoria anterior e ainda válidos:

1. **Três lógicas diferentes de detecção automática de coluna**, nenhuma reaproveitada
   pelas outras: expressão regular fixa em `ImportClientesDialog`, pontuação por expressão
   + amostra em `importPedidosUtils`, e `detectFuzzyMapping` genérico em `MappingStep`,
   usado só como último recurso. **Unificar isso é o ganho mais direto.**
2. **Cada entidade deduplica de um jeito**: junção por CNPJ (empresas), hash SHA-256 da
   linha (negócios), nome de fabricante existente (catálogo), nenhuma (contatos).
3. **A importação roda inteira no navegador**, sem função de servidor. Arquivos de até
   15 MB são lidos e processados no cliente.
4. **Dois assistentes que não compartilham lógica de negócio** — só a interface de
   mapeamento. Um modelo unificado precisaria abstrair a parte específica de cada entidade
   (campos, validação, resolução de vínculo, deduplicação) por trás de uma interface comum.
5. **Um diálogo genérico órfão** (`ImportDialog` / `ImportDataDialog`,
   `useBulkImport.importClientes`) já existe e não é usado. Avalie se serve de base ou se
   deve ser removido.
6. **A função de borda `import-data` está desconectada** e é a única peça pensada para
   arquivos muito irregulares. Ela também converte data **com IA**, sem a regra brasileira
   de desambiguação que o caminho real aplica — ver
   [`docs/divida-tecnica.md` §6](../divida-tecnica.md).
