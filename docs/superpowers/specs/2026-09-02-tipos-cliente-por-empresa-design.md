# Tipos de cliente editáveis por empresa

**Data:** 2026-09-02
**Autor:** Lucas + Claude
**Status:** desenho aprovado, aguardando revisão da especificação

---

## 1. Objetivo

Transformar a lista de **tipos de cliente** (o campo "Tipo" do cadastro de cliente) numa
**lista da empresa, guardada no banco e compartilhada com toda a equipe**, editável pelo
gestor — em vez do mecanismo atual, que só guarda no navegador de quem clicou.

Aplicação imediata: personalizar a lista da **JHS Representações** para separar clientes
**ativos** de **inativos**, e classificar as duas levas de importação de acordo.

---

## 2. Estado atual (o que existe hoje)

- `clientes.tipo` é **texto livre** (`text NOT NULL`), sem lista fixa no banco e sem chave
  estrangeira. Cada cliente guarda o valor do tipo direto como string.
- O dropdown de tipo em `src/pages/Clientes.tsx` é montado a partir de:
  - **9 tipos embutidos no código** (`baseTipos`): construtora, loja, pessoa_fisica,
    condominio, hospital, distribuidor, hotel, escola, instalador;
  - **tipos personalizados salvos em `localStorage`** (`clientes_custom_tipos`), e uma lista
    de "ocultos" (`clientes_hidden_tipos`) — **por navegador/dispositivo, não compartilhados**;
  - o próprio valor bruto do cliente (via `getTipoLabel`, que cai no valor cru quando não
    acha rótulo).
- Consequência: o que um gestor cria num computador **não aparece** para o resto da equipe
  nem em outro dispositivo. É frágil e não é por empresa.

### Retrato do banco de produção (medido em 2026-09-02)

- `clientes.empresa_id` está **nulo em todas as 1.584 linhas**. O vínculo do cliente com a
  empresa (inquilino) é por `usuario_id` → `usuarios.empresa_id`. **A lista nova precisa
  escopar por empresa pela mesma via** (`get_my_empresa_id()`), não por `clientes.empresa_id`.
- Tipos em uso por empresa (amostra relevante):
  - **JHS Representações Limitada** (`9ad7723e-a9ba-4608-b961-72b9bdeabcbe`): `construtora` 186,
    `loja` 33, `hotel` 2 = **221** (a primeira leva de ativos **já foi importada**).
  - **MD Representações**: ~19 tipos próprios, ex.: `construtora - 3 níveis` (471),
    `construtora`, `pessoa fisica`, `outros`, `construtora - alto padrão`, `condomínios`,
    `hotéis`, `cliente`, `indústria`, `clínicas / hospitais`, etc.
  - Outras (Repply, PR & COCENTINO, House Design): tipos variados.
- **Nada pode apagar a lista da MD nem das outras.** Cada empresa precisa continuar com os
  tipos que já usa.

---

## 3. Decisões do brainstorming

1. **Onde mora a lista:** tabela nova por empresa no banco, no molde de `marcadores`
   (`supabase/migrations/20260731130000_marcadores_negocios.sql`) — backfill das existentes +
   gatilho que semeia empresa nova.
2. **Quem edita:** **só gestor** (`is_gestor()`), igual a `marcadores`. Vendedor comum só
   seleciona da lista.
3. **Empresas existentes não mudam:** cada uma é semeada com **os tipos que já usa hoje**.
4. **Empresa nova** nasce com a lista padrão: **Construtora, Loja, Pessoa Física**.
5. **JHS** recebe **7 tipos**: Construtora Ativa, Construtora Inativa, Loja Ativa, Loja
   Inativa, Hotel Ativo, Hotel Inativo, Pessoa Física.
   - Os **221 já importados** são renomeados: `construtora`→`construtora_ativa`,
     `loja`→`loja_ativa`, `hotel`→`hotel_ativo`.
   - A **segunda leva (591 inativos)** entra como `construtora_inativa` / `loja_inativa` /
     `hotel_inativo`, e os **14 CPF** como `pessoa_fisica`.
6. **`clientes.tipo` continua texto livre** (guardando o *slug*), **sem chave estrangeira**.
   A tabela nova só governa o dropdown e o rótulo de exibição. Motivo: virar chave
   estrangeira exigiria reescrever o tipo de 1.584 clientes de todas as empresas (risco alto,
   sem ganho para o objetivo). Manter texto livre preserva tudo que já existe.

---

## 4. Desenho técnico

### 4.1 Tabela `clientes_tipos`

Modelada em `marcadores`:

```
clientes_tipos
  id           uuid pk default gen_random_uuid()
  empresa_id   uuid not null references empresas(id)
  slug         text not null           -- valor guardado em clientes.tipo
  nome         text not null           -- rótulo exibido
  ordem        integer not null default 0
  is_sistema   boolean not null default false   -- itens padrão protegidos de exclusão
  created_at   timestamptz not null default now()
  updated_at   timestamptz not null default now()
  unique (empresa_id, slug)
índice: (empresa_id, ordem)
trigger: update_updated_at_column em UPDATE
```

**RLS** (idêntica ao padrão de `marcadores`):
- `select`: `is_admin() OR empresa_id = get_my_empresa_id()`
- `insert` / `update` / `delete`: `is_admin() OR (is_gestor() AND empresa_id = get_my_empresa_id())`

### 4.2 Semeadura

- **Empresas existentes (backfill, na própria migration):** para cada empresa, inserir uma
  linha por `tipo` distinto já usado por seus clientes (via `usuario_id`→`usuarios.empresa_id`),
  com `slug = tipo`, `nome = tipo`, `is_sistema = false`. Isso garante que todo cliente atual
  tenha seu tipo no dropdown e que a exibição não mude. `ON CONFLICT (empresa_id, slug) DO NOTHING`.
- **Empresa nova (gatilho `AFTER INSERT ON empresas`):** inserir o padrão
  `('construtora','Construtora',0)`, `('loja','Loja',1)`, `('pessoa_fisica','Pessoa Física',2)`,
  `is_sistema = true`. Espelha `criar_marcadores_padrao()`.
  > ⚠️ Memória do projeto: "o semeador de empresa nova diverge das migrations". Aqui os dois
  > andam juntos por construção (gatilho + backfill na mesma migration), como em `marcadores`.

### 4.3 Hook `src/hooks/use-clientes-tipos.ts`

Um hook de domínio com TanStack Query:
- `useClientesTipos()` → lista os tipos da empresa (ordenados por `ordem`).
- Mutations: `criarTipo(nome)`, `renomearTipo(id, nome)`, `excluirTipo(id)`, (opcional)
  `reordenar`. Invalidam a query `['clientes_tipos']`.
- Erros de banco lidos com `mensagemDeErro` (`src/lib/mensagem-de-erro.ts`) — nunca
  `e instanceof Error` (ver CLAUDE.md §4.6).

### 4.4 Tela de cadastro/lista de clientes (`src/pages/Clientes.tsx`)

- Trocar as fontes `baseTipos` + `customTipos`/`hiddenTipos` (localStorage) pela lista vinda
  do hook. O dropdown de tipo passa a listar `clientes_tipos` da empresa.
- O "+ Criar novo tipo…" e a exclusão de tipo passam a **gravar no banco** (via mutations),
  visíveis só para gestor. Espelhar o padrão de gerência de `MarcadoresDialog.tsx`.
- `getTipoLabel(valor)` resolve pelo `slug` na lista da empresa → `nome`; se não achar, cai no
  valor cru (compatibilidade com qualquer dado legado).
- Remover a dependência de `localStorage` para tipos (as chaves antigas podem ser ignoradas;
  não é preciso migrá-las — o backfill do banco já captura o que está em uso).

### 4.5 Dados da JHS (passo isolado, com autorização explícita)

Um passo de dados **separado** do schema, aplicado só após o "pode" do Lucas:
1. Definir a lista da JHS como exatamente os 7 tipos (inserir os slugs novos; remover os
   `construtora`/`loja`/`hotel` que o backfill genérico tiver criado para a JHS).
2. `UPDATE clientes SET tipo = <novo>` para os 221 já importados, mapeando
   `construtora`→`construtora_ativa`, `loja`→`loja_ativa`, `hotel`→`hotel_ativo`, escopado ao
   `empresa_id` da JHS (via `usuario_id`).

Slugs/rótulos da JHS:

| slug | nome |
|---|---|
| construtora_ativa | Construtora Ativa |
| construtora_inativa | Construtora Inativa |
| loja_ativa | Loja Ativa |
| loja_inativa | Loja Inativa |
| hotel_ativo | Hotel Ativo |
| hotel_inativo | Hotel Inativo |
| pessoa_fisica | Pessoa Física |

### 4.6 Planilha de inativos (entrega ao Lucas)

Regerar a planilha da segunda leva usando o mesmo processo já validado nos ativos, com a
coluna **Tipo** preenchida com os **slugs**:
- construtora → `construtora_inativa`; loja → `loja_inativa`; hotel → `hotel_inativo`;
  CPF/pessoa → `pessoa_fisica`; sem sinal → `construtora_inativa` (mesmo default de "vira
  construtora" usado nos ativos, mas na variante inativa).
- O Lucas importa pela tela de Empresas (a lista da JHS já terá os 7 tipos, então o valor
  aparece com rótulo bonito e fica selecionável).

### 4.7 Tipos do TypeScript

`src/integrations/supabase/types.ts` é gerado, mas não há banco local (CLAUDE.md §6.8).
Acrescentar à mão a tabela `clientes_tipos` (Row/Insert/Update) para o código compilar.

### 4.8 Testes

- Teste do hook / da resolução `slug → nome` (inclui o fallback para valor cru).
- Se possível, um teste de que vendedor comum não vê os controles de edição (a proteção real
  é a RLS; o teste de UI é só cortesia).

---

## 5. Ordem de aplicação em produção (sequência importa)

1. **Migration A** (schema + RLS + gatilho + backfill de todas as empresas) — aplicada ao
   banco de produção **antes** do código, senão a tela de Clientes consultaria uma tabela que
   ainda não existe. Precisa de autorização (é mudança no banco de produção).
2. **Deploy do código** (`git push` publica) — só depois da Migration A no ar.
3. **Passo de dados da JHS** (§4.5) — aplicado com autorização explícita, isolado do schema.
4. **Entrega da planilha de inativos** para o Lucas importar.

Antes de pedir autorização para publicar: rodar `npm run test`, `npm run build` e
`npx tsc --noEmit -p tsconfig.app.json` (o `-p` é obrigatório — CLAUDE.md §9), e conferir que
lint/tipos não subiram de número.

---

## 6. Riscos e armadilhas

- **Não quebrar a MD e as outras:** o backfill precisa capturar 100% dos tipos distintos já
  usados por cada empresa. Conferir contagem antes/depois.
- **Escopo por empresa é via `usuario_id`**, não `clientes.empresa_id` (que é nulo). Errar
  isso vaza tipos entre empresas ou esvazia a lista.
- **RLS de escrita só para gestor:** testar logado como vendedor comum (CLAUDE.md §9) — ele
  não pode criar/editar/excluir tipo.
- **Semeador de empresa nova junto da migration** (gatilho), para não repetir a divergência já
  registrada na memória do projeto.
- **Erro do Supabase não é `Error`** — usar `mensagemDeErro` (CLAUDE.md §4.6).
- **Excluir um tipo em uso:** como não há chave estrangeira, excluir um tipo só o tira do
  dropdown; clientes que já tinham aquele valor continuam mostrando o texto (comportamento de
  hoje). Proteger com `is_sistema` os padrões; para os demais, apenas remover da lista.
- **Reclassificação da JHS é dado de produção** — só após "pode", isolada do schema.

---

## 7. Fora de escopo

- Virar `clientes.tipo` em chave estrangeira / migrar os 1.584 para `tipo_id`.
- Mexer nas listas das outras empresas além de semeá-las com o que já usam (sem "embelezar"
  os rótulos da MD).
- Separar "segmento" e "situação" em dois campos distintos — a opção do Lucas é a lista única
  combinada (Construtora Ativa/Inativa…), coerente com como a MD já usa tipos compostos.
- Aba nova em Configurações — a edição vive no próprio cadastro de cliente (onde o Lucas pediu
  "ao cadastrar"), no molde do `MarcadoresDialog`.
