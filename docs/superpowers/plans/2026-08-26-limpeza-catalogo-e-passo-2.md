# Limpeza do catálogo de produtos e passo 2 do Novo Negócio — plano de implementação

> **Para quem for executar:** use `superpowers:subagent-driven-development` ou
> `superpowers:executing-plans`. Os passos usam `- [ ]` para acompanhamento.

**Objetivo:** remover o módulo de catálogo de produtos (que nunca teve dado real) e
reorganizar o passo 2 do assistente de negócio, que perde os itens e ganha o anexo do PDF.

**Arquitetura:** é uma entrega de **remoção**, não de construção. Nada novo nasce além de uma
migration de limpeza de configuração e dois documentos. O passo 2 do assistente sobrevive
renomeado, com dois campos.

**Entrega 1 de 3.** As outras duas (o drive e o envio por WhatsApp) têm planos próprios,
escritos depois que esta rodar. Desenho: `docs/superpowers/specs/2026-08-26-drive-de-catalogos-design.md`.

---

## Restrições globais

Valem para **todas** as tarefas. Vêm do `CLAUDE.md` e do desenho.

- **PT-BR** em interface, documentação, comentário e mensagem de commit.
- **Verificação obrigatória** antes de dizer "pronto" — os quatro, e o critério é *não subir*:
  `npm run test` (223 passando) · `npm run build` (compila) ·
  `npx tsc --noEmit -p tsconfig.app.json` (**35**, com o `-p`) · `npx eslint .` (**493**).
- 🔴 **`npx tsc --noEmit` sem `-p` não confere nada e devolve sucesso.** Sempre com `-p tsconfig.app.json`.
- 🔴 **Nunca `git add -A`.** Duas sessões trabalham nesta pasta. Liste arquivo por arquivo e
  confira `git status --short` num comando **separado** do commit.
- 🔴 **Autorização do Lucas por commit**, antes de cada um. E `git push` **publica em produção**
  desde 26/08/2026 — não há etapa depois. Rode a verificação **antes** de pedir o "pode".
- 🔴 **Nada é aplicado no banco sem autorização explícita** do Lucas.
- `deno.lock` aparece modificado na pasta e **não é desta entrega** — deixe fora de todo commit.
- Referências de código neste plano usam **âncoras de texto**, não número de linha: os números
  mudam a cada tarefa.

---

## Estrutura de arquivos

| arquivo | o que acontece |
|---|---|
| `supabase/migrations/2026XXXXXXXXXX_limpeza_catalogo_produtos.sql` | **criar** — configuração dos campos e `tabela_precos` |
| `src/components/pedidos/NovoNegocioDialog.tsx` | modificar — tira itens, renomeia etapa, traz o PDF |
| `src/pages/EditarPedido.tsx` | modificar — a mesma coisa |
| `src/pages/Fabricantes.tsx` | modificar — remove o cartão do catálogo |
| `src/hooks/use-fabricantes.ts` | modificar — remove os ganchos do catálogo |
| `src/hooks/use-novo-pedido.ts` | modificar — remove `useTabelaPrecos` e `itens` do payload |
| `src/pages/Catalogo.tsx` | **apagar** — 468 linhas já órfãs |
| `src/components/catalogo/` | **apagar** — 4 componentes |
| `docs/operacao/catalogo-de-produtos-removido.md` | **criar** — o documento de retomada |
| `docs/divida-tecnica.md` | modificar — item novo do WhatsApp sem contagem |

**Não toque:** `src/components/shared/DialogoResponsivo.tsx`. O `CabecalhoAssistente` é
compartilhado por cinco modais desde o commit `897cb937`; mudá-lo para atender o Novo Negócio
quebra os outros quatro.

**Não apague:** a tabela `itens_pedido`. Tem 1 linha de negócio real. Decisão do Lucas.

---

## Tarefa 1: a migration de limpeza da configuração

🔴 **Esta tarefa tem um acoplamento que não pode ser ignorado.** O código decide o que é campo
do passo 2 comparando com o **texto** gravado no banco:

```ts
c.etapa === 'Itens do Negócio'
```

Se a migration for aplicada sozinha, o código para de encontrar os campos do passo 2 até o
deploy do front. A janela é curta e a consequência é pequena (uma checagem de obrigatoriedade
deixa de valer), mas **aplique a migration e publique o código na mesma janela**, e nesta ordem:
código primeiro, migration depois. Assim o texto novo já é reconhecido quando aparece.

**Arquivos:**
- Criar: `supabase/migrations/2026XXXXXXXXXX_limpeza_catalogo_produtos.sql` (use a data/hora real)

**Interfaces:**
- Produz: a etapa passa a se chamar `'Valor e orçamento'` no banco. A Tarefa 2 e a Tarefa 3
  usam exatamente esse texto.

- [ ] **Passo 1: medir o estado atual, para o commit poder citar o número**

```sql
select coalesce(etapa,'(nula)') as etapa, campo_key, count(*) as linhas
from configuracoes_campos
where etapa = 'Itens do Negócio'
group by 1,2 order by 2;
```

Esperado hoje: `itens` 8 linhas · `valor_manual` 8 · `proximo_contato` 8.

- [ ] **Passo 2: escrever a migration**

```sql
-- ============================================================================
-- Limpeza do catálogo de produtos e da etapa "Itens do Negócio"
-- ============================================================================
-- Desenho: docs/superpowers/specs/2026-08-26-drive-de-catalogos-design.md
--
-- O módulo de catálogo nunca teve dado real: `tabela_precos` com 0 linhas nas 8 empresas,
-- `itens_pedido` com 1 linha em 11.910 negócios, e nenhum item criado dentro do CRM.
--
-- 🔴 `itens_pedido` NÃO é apagada. Aquela 1 linha é de um negócio real, e apagá-la seria
-- destruir o único registro que alguém um dia pode perguntar por quê. A tela sai; a tabela
-- fica órfã e documentada em docs/operacao/catalogo-de-produtos-removido.md.
-- ============================================================================

-- ── Os campos que perdem a tela ────────────────────────────────────────────
-- `itens` some com o módulo. `proximo_contato` já estava órfão ANTES desta mudança: o campo
-- saiu da tela há tempos e a linha de configuração ficou para trás, prometendo ao gestor um
-- campo que ele não encontra em lugar nenhum.
delete from configuracoes_campos
where etapa = 'Itens do Negócio'
  and campo_key in ('itens', 'proximo_contato');

-- ── A etapa é renomeada, não removida ──────────────────────────────────────
-- O assistente continua com dois passos: a aba Campos deixa cada empresa escolher em que
-- passo cada campo vive, e colapsar em uma tela só mataria essa configuração.
--
-- 🔴 Este texto é comparado LITERALMENTE pelo front (`c.etapa === '...'`). Mudar aqui sem
-- mudar lá faz o passo 2 deixar de reconhecer os próprios campos, em silêncio.
update configuracoes_campos
   set etapa = 'Valor e orçamento', updated_at = now()
 where etapa = 'Itens do Negócio';

-- ── A tabela do catálogo ───────────────────────────────────────────────────
-- 0 linhas nas 8 empresas, conferido antes de escrever esta migration.
drop table if exists public.tabela_precos;

```

🔴 **Corrigido em 26/08/2026, ao testar:** o balde **não sai por SQL**. O Supabase recusa com
`42501: Direct deletion from storage tables is not allowed` — é um gatilho de proteção contra
objeto órfão. O balde `catalogo-produtos` (0 arquivos) sai **pelo painel**, à mão, na Tarefa 6.

- [ ] **Passo 3: conferir em transação desfeita, ANTES de pedir autorização**

Rode o corpo da migration entre `begin;` e `rollback;`, e no meio:

```sql
select coalesce(etapa,'(nula)') as etapa, campo_key, count(*)
from configuracoes_campos group by 1,2 order by 1,2;
select to_regclass('public.tabela_precos') as tabela_precos_ainda_existe;
```

Esperado: `Valor e orçamento` com `valor_manual` (8 linhas), nenhuma linha de `itens` nem de
`proximo_contato`, e `tabela_precos_ainda_existe` nulo.

- [ ] **Passo 4: NÃO aplicar ainda**

A migration só é aplicada junto com o deploy do código das Tarefas 2 e 3, na ordem do topo
desta tarefa. Peça a autorização do Lucas naquele momento, não agora.

- [ ] **Passo 5: commitar só o arquivo**

```bash
git status --short
git add supabase/migrations/2026XXXXXXXXXX_limpeza_catalogo_produtos.sql
git diff --cached --name-only
git commit -m "chore(catalogo): migration de limpeza da etapa Itens do Negócio (não aplicada)"
```

---

## Tarefa 2: Novo Negócio perde os itens

**Arquivos:**
- Modificar: `src/components/pedidos/NovoNegocioDialog.tsx`
- Modificar: `src/hooks/use-novo-pedido.ts`

**Interfaces:**
- Consome: o texto `'Valor e orçamento'` da Tarefa 1.
- Produz: `NovoPedidoPayload` sem o campo `itens`. A Tarefa 3 espelha a mesma mudança.

**Sobre teste:** este projeto tem 18 arquivos de teste e **nenhum renderiza componente** — todos
testam função pura. Não invente um arsenal de teste de tela para uma tarefa de remoção. A
verificação aqui é o compilador, o lint e o navegador, e está nos passos abaixo.

- [ ] **Passo 1: renomear a etapa no cabeçalho**

Âncora — em `CabecalhoAssistente`, trocar:

```jsx
            { id: 2, label: 'Itens do Negócio' },
```

por:

```jsx
            { id: 2, label: 'Valor e orçamento' },
```

- [ ] **Passo 2: apontar a comparação para o texto novo**

Âncora: `c.etapa === 'Itens do Negócio'`. Trocar por `c.etapa === 'Valor e orçamento'`, nas
duas ocorrências (`etapaAlvo === 'step2' ? ... : ...`).

- [ ] **Passo 3: remover o estado dos itens e do modo manual**

Apagar as declarações `const [itens, setItens]`, `const valorTotalItens`, `isManualMode` /
`setIsManualMode`, e as funções que mexem em item (`setItens(prev => ...)` — adicionar,
alterar, remover, escolher da tabela de preços).

O valor final deixa de ser condicional:

```ts
// Antes: const valorFinal = isManualMode ? (valorManual || 0) : valorTotalItens;
const valorFinal = valorManual || 0;
```

- [ ] **Passo 4: remover a busca da tabela de preços**

Apagar `const { data: tabelaPrecos } = useTabelaPrecos(fabricanteId || null);` e tirar
`useTabelaPrecos` do `import` de `@/hooks/use-novo-pedido`.

Apagar também o componente de busca de produto que só ele usava (o que tem o comentário
"digita um termo genérico acha que a fábrica só tem 10 produtos"), no fim do arquivo.

- [ ] **Passo 5: mover o campo do PDF para o passo 2**

Recortar o bloco do anexo (âncora: `onChange={(e) => setPdfFile(e.target.files?.[0] || null)}`,
com o cartão tracejado em volta) do passo 1 e colar no passo 2, **acima** do valor de
negociação — o representante anexa o orçamento e depois digita quanto é.

Manter `pdfFile`/`setPdfFile` e todo o trecho de upload no envio: só o lugar na tela muda.

- [ ] **Passo 6: tirar `itens` do payload**

Em `NovoNegocioDialog`, apagar do objeto enviado:

```ts
        itens: itens.map(i => ({ ... })),
```

E em `src/hooks/use-novo-pedido.ts`, remover `itens` de `NovoPedidoPayload` e o trecho de
`useCreatePedidoCompleto` que insere em `itens_pedido`.

🔴 A tabela `itens_pedido` **continua existindo** — só deixa de receber linha nova.
Deixe um comentário curto no lugar dizendo isso, senão o próximo dev acha que é esquecimento.

- [ ] **Passo 7: conferir que nada ficou pendurado**

```bash
grep -n "itens\|isManualMode\|tabelaPrecos\|valorTotalItens" src/components/pedidos/NovoNegocioDialog.tsx
```

Esperado: nenhuma linha, fora comentário explicativo.

- [ ] **Passo 8: a verificação de quatro pernas**

```bash
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -cE "error TS"   # 35
npx vitest run 2>&1 | grep -E "Tests "                              # 223 passando
npm run build 2>&1 | tail -2                                        # compila
npx eslint . 2>&1 | grep problems                                   # 493, não pode subir
```

- [ ] **Passo 9: ver com os próprios olhos**

Suba a prévia, abra Negócios → Novo Negócio e confirme: o passo 2 diz **"Valor e orçamento"**,
tem o anexo do PDF e o valor, não tem tabela de itens, e o botão de concluir grava.

- [ ] **Passo 10: commitar (com autorização)**

```bash
git status --short
git add src/components/pedidos/NovoNegocioDialog.tsx src/hooks/use-novo-pedido.ts
git diff --cached --name-only
git commit -m "refactor(negocios): passo 2 vira Valor e orçamento e perde os itens"
```

---

## Tarefa 3: Editar Negócio, a mesma mudança

**Arquivos:**
- Modificar: `src/pages/EditarPedido.tsx`

**Interfaces:**
- Consome: `NovoPedidoPayload` sem `itens` (Tarefa 2) e o texto `'Valor e orçamento'` (Tarefa 1).

**Por que é tarefa separada:** um revisor pode aprovar a criação e reprovar a edição. E fazer só
uma das duas deixa o sistema com duas verdades sobre o mesmo negócio — a criação sem itens e a
edição ainda mostrando a tabela.

- [ ] **Passo 1: repetir os passos 1 a 6 da Tarefa 2 neste arquivo**

As âncoras são as mesmas: `step`, `itens`, `isManualMode`, `valorManual`, `tabelaPrecos`,
`pdfFile`.

- [ ] **Passo 2: cuidado com o trecho que ADIVINHA o modo**

Há aqui um bloco que não existe na criação — ele deduz se o valor foi digitado ou somado:

```ts
      const somaItens = pedidoData.itens.reduce(...);
      if (Math.abs(valorSalvo - somaItens) >= 0.01) { setIsManualMode(true); ... }
```

Ele **sai inteiro**. Sem itens não há o que deduzir: o valor salvo é o valor, e vai direto para
`valorManual`.

🔴 Confira que o negócio existente abre com o valor certo depois disso. É o único ponto desta
entrega onde dado de 11.910 negócios passa por código novo.

- [ ] **Passo 3: verificação de quatro pernas** (mesmos comandos e números da Tarefa 2, passo 8)

- [ ] **Passo 4: ver com os próprios olhos**

Abra um negócio **que já existe e tem valor** e confirme que o valor aparece igual ao da lista.
Depois abra o único negócio que tem item — pergunte ao Lucas qual é, ou:

```sql
select pedido_id from itens_pedido limit 1;
```

Ele deve abrir normalmente, mostrando o valor, sem a tabela de itens e sem erro no console.

- [ ] **Passo 5: commitar (com autorização)**

```bash
git status --short
git add src/pages/EditarPedido.tsx
git diff --cached --name-only
git commit -m "refactor(negocios): editar negócio acompanha o passo 2 sem itens"
```

---

## Tarefa 4: remover o módulo de catálogo de produtos

**Arquivos:**
- Apagar: `src/pages/Catalogo.tsx`, `src/components/catalogo/` (os 4)
- Modificar: `src/pages/Fabricantes.tsx`, `src/hooks/use-fabricantes.ts`

- [ ] **Passo 1: confirmar que a página está mesmo órfã**

```bash
grep -rn "pages/Catalogo" src/ ; grep -rn "catalogo" src/App.tsx
```

Esperado: nada nas duas. Se aparecer algo, **pare** — alguém ligou a rota depois do
levantamento e o desenho precisa ser revisto.

- [ ] **Passo 2: apagar os arquivos**

```bash
git rm src/pages/Catalogo.tsx
git rm -r src/components/catalogo
```

- [ ] **Passo 3: remover o cartão de dentro de Fabricantes**

Âncora: o `<Card>` cujo título é `Catálogo de Produtos`. Remover o cartão inteiro, o filtro de
categoria, o `ColumnSettings` dele e os diálogos de importação que ele abria.

🔴 O painel de detalhe da fábrica **não pode ficar vazio**. Enquanto o drive (entrega 2) não
existe, deixe no lugar um aviso curto de uma linha:

```jsx
<div className="rounded-lg border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
  Os catálogos e materiais desta fábrica aparecem aqui em breve.
</div>
```

Sem isso, o gestor abre uma fábrica e vê um buraco, e a primeira leitura dele é "quebrou".

- [ ] **Passo 4: remover os ganchos que só serviam ao catálogo**

De `src/hooks/use-fabricantes.ts`: `useTabelaPrecos`, `useCatalogoGlobal`, `useCategorias`,
`useCreatePreco`, `useBulkCreatePrecos`, `useUpdatePreco`, `useDeletePreco`,
`useBulkDeletePrecos`, `useDeleteCategoria`, e a interface `PrecoPayload`.

**Ficam:** `useUpdateFabricante` e `useDeleteFabricante` — são da fábrica, não do catálogo.

De `src/hooks/use-novo-pedido.ts`: `useTabelaPrecos` (é uma segunda cópia, com o mesmo nome).

- [ ] **Passo 5: 🔴 remover o reprocessamento de catálogo em `LinhasIgnoradas.tsx`**

**Não é comentário — é código que grava.** Este arquivo tem `retryCatalogo()`, que insere em
`tabela_precos`. Derrubar a tabela sem mexer aqui deixa um botão que **falha em produção**, e o
compilador pode não avisar: `src/integrations/supabase/types.ts` é mantido à mão neste projeto,
então ele continuaria descrevendo uma tabela que não existe mais.

Seguro de remover, medido em 26/08/2026:

```
linhas_ignoradas_importacao por tipo:
  negocios ............ 4.861
  clientes_empresas ...    52
  catalogo_geral ......     0   ← nada a reprocessar
```

Remova, neste arquivo:
- a função `async function retryCatalogo(...)` inteira
- o ramo `} else if (tipo === 'catalogo_geral') { await retryCatalogo(...) }`
- a entrada `catalogo_geral` nos dois mapas de campos (o `Set` de obrigatórios e a lista de colunas)
- o comentário sobre "no catálogo o fabricante NÃO nasce sozinho", que perde o objeto

- [ ] **Passo 6: caçar o resto que ficou apontando para o vazio**

```bash
grep -rn "tabela_precos\|tabelaPrecos\|PrecoPayload\|ImportCatalogoDialog\|ProductForm\|ProductImageUpload\|catalogo_geral" src/ --include=*.ts --include=*.tsx
```

Esperado: **nenhuma linha**. Se sobrar algo, resolva aqui — sobra que aponta para tabela
inexistente é exatamente o defeito que o `types.ts` à mão não pega.

- [ ] **Passo 7: tirar a tabela do arquivo de tipos**

`src/integrations/supabase/types.ts` é **gerado, mas mantido à mão neste ambiente**
(`CLAUDE.md` §6.8). Remova a entrada `tabela_precos` dele, senão o arquivo passa a descrever
uma tabela que não existe e engana quem for escrever consulta depois.

- [ ] **Passo 8: verificação de quatro pernas** (mesmos comandos e números)

⚠️ O lint pode **cair** abaixo de 493 ao remover 2 mil linhas. Cair é bom — o critério é não
subir. Anote o número novo: ele vira a linha de base das próximas entregas.

- [ ] **Passo 9: ver com os próprios olhos**

Abra Fabricantes, selecione uma fábrica, confirme o aviso no lugar do cartão e o console limpo.
Confirme que criar, editar e excluir fabricante continuam funcionando.

- [ ] **Passo 10: commitar (com autorização)**

```bash
git status --short
git add -u src/pages/Catalogo.tsx src/components/catalogo src/pages/Fabricantes.tsx src/hooks/use-fabricantes.ts src/hooks/use-novo-pedido.ts
git diff --cached --name-only
git commit -m "refactor(catalogo): remove o módulo de catálogo de produtos"
```

---

## Tarefa 5: os dois documentos

**Arquivos:**
- Criar: `docs/operacao/catalogo-de-produtos-removido.md`
- Modificar: `docs/divida-tecnica.md`, `docs/README.md`

- [ ] **Passo 1: o documento de retomada**

Precisa responder, para quem for decidir se vale ressuscitar:

1. **O que o módulo fazia** — cadastro de produto por fabricante, com preço, categoria, imagem
   e dois caminhos de importação por planilha.
2. **Por que saiu** — decisão dos sócios em 26/08/2026, com os números: `tabela_precos` 0 linhas
   nas 8 empresas, `itens_pedido` 1 linha em 11.910 negócios, 0 itens criados dentro do CRM,
   `Catalogo.tsx` já órfã. **Este é o dado mais importante do documento: nunca teve uso real.**
3. **O commit exato de onde recuperar** — rode `git log --oneline -1` depois da Tarefa 4 e
   escreva o sha, com o comando:
   ```bash
   git show <sha>^:src/pages/Catalogo.tsx > src/pages/Catalogo.tsx
   ```
4. **O que precisaria ser repensado** — que `itens_pedido` ficou órfã com 1 linha, e que o
   drive de catálogos passou a ocupar o lugar dele na tela da fábrica.

- [ ] **Passo 2: o item novo na dívida técnica**

Item 33, com o número medido em 26/08/2026:

> **O WhatsApp não tem contagem de envio nenhuma.** Nem para texto, nem para mídia, em
> `whatsapp-send`. Qualquer pessoa com acesso ao sistema pode disparar em volume pelo número da
> empresa. Medido: **MD Representações tem 2 números para 13 pessoas** — um deles com 13 pessoas
> ligadas. A conexão é por API não oficial, e número derrubado é perda de operação.
>
> **Gravidade: alta. Não bloqueia nada hoje** porque todo envio é um humano digitando na caixa
> de entrada, um de cada vez.
>
> Não foi corrigido junto com o drive de catálogos porque `whatsapp-send` é o caminho crítico do
> atendimento: um representante numa conversa rápida manda muitas mensagens de forma legítima, e
> a trava quebraria o atendimento. O mecanismo desenhado para o catálogo
> (`fabricante_arquivo_envios`, contagem por instância no servidor) é o mesmo que serviria aqui.

Acrescente também a linha no índice do topo do arquivo — ele já ficou defasado uma vez.

- [ ] **Passo 3: apontar o índice de docs para o documento novo**

Uma linha em `docs/README.md`, na seção de operação.

- [ ] **Passo 4: commitar (com autorização)**

```bash
git status --short
git add docs/operacao/catalogo-de-produtos-removido.md docs/divida-tecnica.md docs/README.md
git diff --cached --name-only
git commit -m "docs: registra a remoção do catálogo de produtos e o WhatsApp sem contagem"
```

---

## Tarefa 6: publicar e aplicar a migration

🔴 A ordem importa, e está explicada na Tarefa 1.

- [ ] **Passo 1: conferir que ninguém entrou na frente**

```bash
git fetch origin && git log --oneline HEAD..origin/main
```

Se aparecer commit novo, veja se toca os mesmos arquivos. Se tocar, **pare e avise o Lucas**.

- [ ] **Passo 2: enviar o código**

```bash
git push origin main
```

Isso **já publica** — a Vercel dispara sozinha desde 26/08/2026. Não há comando depois.

- [ ] **Passo 3: confirmar que a publicação saiu**

```bash
gh api repos/Repply-Hub/Repply-CRM/commits/<sha>/status --jq '.state, [.statuses[].context]'
```

Esperado: `success` e **uma só** verificação, `Vercel`. Duas significam que a conta do
desenvolvedor anterior voltou — avise o Lucas.

- [ ] **Passo 4: aplicar a migration, com autorização explícita do Lucas**

Só depois de a publicação estar `success`.

- [ ] **Passo 5: conferir no banco**

```sql
select coalesce(etapa,'(nula)') as etapa, campo_key, count(*)
from configuracoes_campos group by 1,2 order by 1,2;
select to_regclass('public.tabela_precos');
select count(*) from itens_pedido;   -- tem que continuar 1
```

- [ ] **Passo 6: conferir no ar**

Abra `crm.repplyhub.com.br`, entre, crie um negócio de teste pelo assistente e confirme que
grava. Depois abra um negócio antigo para editar e confirme que o valor aparece certo.

---

## Definição de pronto

- [ ] `tabela_precos` não existe mais; `itens_pedido` continua com 1 linha
- [ ] Nenhum arquivo em `src/` referencia o catálogo de produtos, fora comentário atualizado
- [ ] O passo 2 do assistente se chama "Valor e orçamento" e tem valor + PDF
- [ ] Criar e editar negócio funcionam em produção
- [ ] Tipos em 35, testes em 223, build compila, lint **não subiu** de 493
- [ ] O documento de retomada existe e cita o sha de recuperação
- [ ] O buraco do catálogo na tela da fábrica tem o aviso, não um vazio
