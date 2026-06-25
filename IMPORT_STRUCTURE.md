# Estrutura de Importação CSV / XLSX

Documentação técnica do sistema de importação de arquivos CSV e Excel para as páginas de **Clientes** e **Negócios**.

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
│   └── resolve-entities.ts     # Resolução de FKs (cliente, fabricante, obra)
│
├── components/
│   ├── ImportPedidosDialog.tsx  # Wizard de importação de Negócios
│   ├── import/
│   │   └── ImportDataDialog.tsx # Wizard de importação de Clientes
│   └── ImportDialog.tsx         # Componente base genérico
│
└── pages/
    ├── Clientes.tsx             # Integra ImportDataDialog
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
| `status` | Normaliza para estágios do pipeline (ver tabela abaixo) |

### Normalização de Status

| Entrada (parcial)                    | Valor normalizado |
|--------------------------------------|-------------------|
| fech / ganho / concluid / won        | `fechamento`      |
| negocia / tratativa                  | `negociacao`      |
| enviad / apresentad / proposta       | `enviado`         |
| elabora / orcamento / cotacao        | `elaboracao`      |
| novo / lead                          | `novo lead`       |
| qualquer outro                       | texto normalizado |

---

## 4. Importação de Negócios — `ImportPedidosDialog.tsx`

### Campos Suportados

| Campo           | Obrigatório | Tipo     | Descrição |
|-----------------|-------------|----------|-----------|
| `negocio`       | não         | text     | Nome/título do negócio |
| `cliente`       | **sim**     | text     | Nome da empresa cliente |
| `contato`       | não         | text     | Nome do contato |
| `obra`          | não         | text     | Nome da obra/projeto |
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
2. Carrega lookup tables (clientes, fabricantes, vendedores, obras)
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
  obra_id,
  fabricante_id,
  usuario_id,       // vendedor logado ou resolvido pelo nome
  status,
  valor_total,
  observacoes,
  campos_extras,    // colunas extras mapeadas como JSON
  data_pedido,
  created_at,
  prazo_resposta
}
```

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

### `resolveObraId(nome, clienteId)`
1. Busca por `nome_obra` dentro do cliente
2. Se não encontrar: cria com `status: 'ativa'`

**Cache de sessão:** um `Map` por entidade previne queries duplicadas para nomes repetidos na mesma importação.

---

## 6. Importação de Clientes — `ImportDataDialog.tsx`

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

```
CNPJ presente e já existe no banco?
  ├─ Sim → UPDATE: mantém valores existentes, sobrescreve apenas campos não-vazios
  │         Mescla campos_extras (JSON)
  └─ Não → INSERT novo registro
```

Linhas duplicadas por CNPJ dentro do próprio arquivo são **mescladas** antes do insert (prioriza valor não-vazio).

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
  tipo_importacao,     // "clientes_empresas" | "clientes_contatos" | "negocios"
  dados_originais,     // linha original do arquivo (JSON)
  motivo_ignorado      // mensagem de erro
}
```

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
<ImportDataDialog
  target="empresas"   // ou "contatos"
  onSuccess={() => queryClient.invalidateQueries(['clientes'])}
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
   │  → cliente / fabricante / obra│
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
