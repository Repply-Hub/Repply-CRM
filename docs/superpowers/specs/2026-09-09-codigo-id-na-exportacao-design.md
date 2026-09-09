# A exportação ganha o "Código/ID", e a importação passa a atualizar em vez de duplicar

> Desenho validado com o dono do produto em 09/09/2026.

## 1. Por que este trabalho existe

O pedido nasceu de uma pergunta simples — *"o CRM tem um código único por negócio que dê para
incluir na exportação?"* — com um motivo declarado: **não perder anotações no futuro.**

O código existe (`pedidos.id`, único nos 12.474 negócios, criado com o negócio e imutável) e
**não sai na planilha**. Mas ao medir isso apareceu um problema maior, que é o que este trabalho
de fato resolve:

🔴 **Hoje, reimportar uma planilha exportada CRIA TUDO DE NOVO.** A deduplicação por conteúdo foi
removida em 03/09/2026 (`23b3d6c9`); `import_hash` continua sendo gravado, mas só marca "veio de
importação" e não é mais conferido contra o banco. Sem coluna de identificador e sem
deduplicação, a ida e volta *exportar → anotar no Excel → devolver ao CRM* duplica a base inteira.

A coluna sozinha não resolve isso. As duas coisas juntas, sim.

## 2. O que este trabalho NÃO faz

| | Por quê |
|---|---|
| Não cria código curto legível (`MD-1042`) | Decisão do dono do produto: usar o código longo que já existe, custo quase zero. Um código curto exigiria coluna nova, numeração por empresa e migration |
| Não devolve a deduplicação por conteúdo | Foi removida por decisão em 03/09/2026. O reencontro passa a ser pelo código, que é explícito, e não por adivinhação de conteúdo |
| Não conserta o nome invisível dos 11.453 negócios (§4) | É problema separado e maior; a solução mexe no que a tela mostra. Registrado em §8 |
| Não exporta comentários, histórico de contato nem tarefas | Medido: 36 comentários, 58 registros de contato, 37 tarefas ligadas a negócio. Ficam de fora da planilha, como hoje |
| Não toca no banco | Nenhuma migration. A escrita usa o mesmo caminho de lotes pelo navegador que a importação já roda em produção |
| Não mexe na importação de Clientes | Só a de Negócios |
| Não altera Cliente, Fabricante, Valor, Etapa, Responsável nem datas | §3, decisão 4 |

## 3. Decisões do dono do produto (09/09/2026 — não reabrir)

1. **O código é o longo, o que já existe.** Não se cria identificador novo.
2. **A coluna chama "Código/ID"** e fica **no fim** da planilha, depois de "Anexo". O rótulo tem
   as duas palavras de propósito: "ID" é o que o mercado usa, "Código" é o que se fala em
   português.
3. **Célula vazia nunca apaga.** Vazio é "não informado", e o que está no CRM permanece. Para
   limpar um campo, é dentro do sistema. Nenhuma ida e volta pelo Excel consegue apagar nada.
4. **Só três coisas podem ser alteradas por planilha: Negócio, Observações e Marcador.** As
   demais colunas são lidas e ignoradas na atualização.
5. **Linha sem código para o fluxo e mostra a conta.** Quem decide se elas viram negócios novos é
   a pessoa, no passo de conferir.
6. **Código que não é encontrado recusa a linha**, e a recusa é contada à parte. Nunca vira
   negócio novo.
7. **O aviso mostra resumo por campo, com amostra para abrir** — não só o número total, nem a
   lista inteira.
8. **O nome só é gravado quando difere do rótulo automático** (§5.B, "a regra do nome").

### Decisões derivadas, tomadas no desenho — confira se concorda

9. **A atualização não cria marcador.** `resolveMarcadorId` CRIA um marcador quando o nome não
   casa, e é assim que a importação de linhas novas funciona hoje — isso não muda. Mas no caminho
   de **atualização** um nome desconhecido deixa o marcador como está e entra na conta do aviso.
   Sai do mesmo princípio da decisão 4: o caminho de atualização não cria cadastro em silêncio.
10. **Código repetido dentro do arquivo recusa todas as linhas daquele código.** Duas linhas com o
    mesmo código são uma contradição, não uma ordem: escolher a última em silêncio grava a errada
    metade das vezes.
11. **A caixinha do balde "sem código" nasce marcada só quando o arquivo inteiro está sem
    código** (§5.B). É o que mantém a importação de base nova funcionando como hoje sem abrir a
    porta para célula apagada por acidente virar duplicata.

## 4. O que existe hoje (medido em 09/09/2026 — não re-descubra)

### A exportação

`src/pages/Negocios.tsx`, `handleExportExcel` (~linha 1771). Os cabeçalhos saem de `FIELDS`
(`src/components/import-pedidos/importPedidosUtils.ts`) — a **mesma** lista que a importação lê,
justamente para os dois lados não divergirem. São 13 colunas, nesta ordem:

> Negócio · Cliente · Contato · Endereço de Entrega · Fabricante · Valor · Responsável/Vendedor ·
> Etapa · Marcador · Criação · Fechamento · Observações · Anexo

Nenhuma é identificador. E `campos_extras` **não guarda o identificador do Bitrix** — conferidas
as 20 chaves existentes, o vínculo com a origem já se perdeu.

> ⚠️ `src/lib/generate-excel.ts` (`generatePedidosExcel`, 7 colunas) **não é usado por ninguém**.
> Não confunda os dois: quem exporta é o bloco de `Negocios.tsx`.

### O nome do negócio mora em dois lugares, e a tela lê o errado

| | negócios |
|---|---|
| total | 12.474 |
| com `pedidos.nome` preenchido | **150** (são os da empresa de demonstração) |
| com o nome real em `campos_extras['Negócio']` | **12.258** |
| da MD, cujo nome extra é **diferente** de "Cliente \| Fabricante" | **11.453** |
| com campo configurado que exiba esse extra, em qualquer das 10 empresas | **0** |

A importação grava a coluna "Negócio" em `campos_extras['Negócio']`
(`ImportPedidosDialog.tsx:478-480`). Mas a lista (`Negocios.tsx:348`), o painel
(`PainelDoNegocio.tsx:188`), a ficha (`PainelDeNegocios.tsx:483`) e a exportação usam
`getNomeNegocio()`, que lê `pedidos.nome` e cai em `"cliente | fabricante"` — **nunca**
`campos_extras`.

🔴 **Consequência para este trabalho:** a coluna "Negócio" da planilha contém hoje o rótulo
automático, não o nome que veio do Bitrix. Gravar esse texto de volta em `pedidos.nome` congelaria
"Cliente | Fabricante" como nome próprio em 12.324 negócios — invisível na tela, e o rótulo
pararia de acompanhar uma renomeação de cliente. É o que a decisão 8 impede.

### Movimentação: o que serve e o que não serve

| Candidato | Serve? |
|---|---|
| `pedidos.updated_at` | ❌ **Inutilizado.** O valor mais antigo é 31/08/2026, e 6.697 negócios marcam 01/09 e 4.637 marcam 08/09 — são os reparos em massa, não trabalho comercial |
| `pedidos.fechado_em` | ❌ Só carimba entrada em etapa final |
| `pedidos_historico_status` | ✅ **É o registro de verdade.** De qual etapa para qual, quem e quando, desde 27/07/2025, cobrindo os 12.474 |

Do histórico: **12.329 negócios têm só a linha de nascimento** e apenas **145 (1,2%)** já se
moveram de etapa dentro do Repply — a base veio importada e cada negócio nasceu na etapa final
dele. E desde 01/09 a mesma tabela também guarda edição de campo (`tipo='campo'`, 13.002 linhas):
quem for medir movimento precisa filtrar `tipo='status'`.

### A régua de verificação

`npm run test` → **1.170 verdes em 85 arquivos** · `npx tsc --noEmit -p tsconfig.app.json` → **31**
(o `-p` é obrigatório) · `npx eslint .` → **433** problemas herdados. Nenhum número pode subir.

## 5. As duas entregas

### 5.A — A exportação ganha "Código/ID"

Uma coluna a mais no fim, com `pedidos.id`. O caminho é curto porque `FIELDS` é compartilhado:
acrescentar a chave lá faz a exportação **escrever** a coluna e a importação **reconhecer** o
cabeçalho, sem os dois poderem divergir.

Pontos a tocar, todos por causa de `FIELDS` ser a fonte única:

| Onde | O que muda |
|---|---|
| `importPedidosUtils.ts` — `FieldKey`, `FIELDS`, `EMPTY_MAPPING`, `HEADER_RULES`, `MIN_SCORE` | a chave `codigo`, rótulo `Código/ID`, `required: false`, **última** da lista |
| `Negocios.tsx` — `valorDaColuna`, `larguraPorCampo` | `codigo: p => p.id` e uma largura (40) |
| `ImportPedidosDialog.tsx` — `getMappedRows` | carregar `codigo` no objeto da linha |

**`MappingStep.tsx` não muda** — conferido: `getFieldType('codigo')` cai em `'text'` por não casar
com nenhuma das regras, e `sanitizeFieldValue` devolve o texto aparado. O código passa intacto.

`computeRowHash` também **não** muda: o hash só marca "veio de importação" e ninguém o confere.

`VISIBLE_FIELDS` (`ImportPedidosDialog.tsx:40`) deriva de `FIELDS`, então a coluna passa a ser
reconhecida pelo assistente de importação no mesmo gesto — que é o ponto da entrega 5.B.

### 5.B — A importação reconhece o código e atualiza

Entre "mapear colunas" e "conferir", o assistente passa a classificar cada linha em **três
baldes**, buscando no banco os códigos que vieram no arquivo (em lotes, por chave primária, que é
a consulta mais barata que existe nesta tabela):

| Balde | Quando | O que acontece |
|---|---|---|
| **Atualiza** | o código existe e você o alcança | entra na conta de alterações, com o de-para calculado |
| **Sem código** | a célula veio vazia | fica atrás de uma caixinha: entram como negócios novos ou são descartadas |
| **Não encontrado** | o código veio preenchido e não casa | recusada, contada e listada. Nunca vira negócio novo |
| **Código repetido** | o mesmo código aparece em duas linhas do arquivo | **todas** as linhas daquele código são recusadas e contadas. Não dá para saber qual vale, e escolher uma em silêncio grava a errada em metade dos casos |

**Como a caixinha do balde "sem código" nasce**, e isto não é detalhe: ela vem **marcada quando
NENHUMA linha do arquivo tem código** — é uma importação de base nova (o arquivo do Bitrix, a
planilha de um cliente novo), e o comportamento de hoje continua valendo sem atrito. Vem
**desmarcada quando há mistura** — aí o arquivo é uma volta de exportação nossa, e linha sem
código ali é mais provavelmente uma célula apagada por acidente do que um negócio novo de
propósito.

> "Não encontrado" cobre dois casos que o sistema **não consegue distinguir**: o código não
> existe, ou existe e pertence a outra empresa — a regra de segurança do banco simplesmente não o
> devolve. O texto da tela precisa dizer as duas possibilidades.

**O que o aviso mostra**, no passo de conferir, ao lado dos alertas de data e de responsável que
já existem ali:

> **38 negócios serão atualizados** — 31 em Observações, 9 no Marcador, 4 no nome
> *(botão: ver as primeiras linhas, com o que está hoje → o que vai ficar)*
> **12 linhas não têm Código/ID** e virariam negócios novos ☐
> **3 linhas trazem um Código/ID que não existe aqui** — recusadas *(lista)*
> **2 linhas repetem um Código/ID já usado no arquivo** — recusadas *(lista)*

Contas que dão zero **não aparecem**. Um arquivo saudável mostra uma linha só, e é isso que faz
as outras três chamarem atenção quando surgem.

**A regra do nome.** O campo "Negócio" só é gravado em `pedidos.nome` quando o texto da planilha
difere do rótulo automático `"cliente | fabricante"` daquele negócio. Reimportar uma exportação
intocada não muda nada; escrever um nome de verdade na célula salva. Sem esta regra, uma ida e
volta inocente congelaria 12.324 nomes (§4).

**As três regras de escrita**, juntas: vazio não mexe · igual ao automático não mexe (só no nome)
· marcador desconhecido não é criado.

### 🔴 Código com formato inválido não pode chegar na consulta

O código é um `uuid`, e o Postgres **recusa a consulta inteira** quando um dos valores não tem
esse formato — `invalid input syntax for type uuid`. Uma célula com `"abc"`, ou com o texto
`Código/ID` repetido por engano, derrubaria a busca dos 12 mil códigos válidos junto.

Por isso a classificação confere o formato **antes** de consultar: o que não tem cara de código
vai direto para o balde "não encontrado", sem passar pelo banco. Só o que sobra é consultado.

### O caminho da escrita

Lotes pelo navegador, o mesmo mecanismo que `use-bulk-import.ts` já usa para inserir 12 mil
linhas em produção. Sem migration, sem função nova no servidor. A alternativa — uma função de
banco recebendo o lote — seria mais rápida por alguns segundos e custaria uma mudança em produção
que este trabalho não precisa. A atualização filtra por chave primária, que é barato mesmo com a
regra de segurança cobrando por linha.

**Uma gravação por negócio, e isso é inevitável:** cada negócio recebe valores diferentes, então
não existe um `update` só que sirva para todos. A escrita segue o mesmo limite de 4 em paralelo
que a inserção já usa, com aviso de progresso — o mesmo padrão da exportação, que também percorre
a base em lotes. Para o uso que motivou este trabalho (anotar dezenas ou centenas de negócios)
isso é instantâneo; para um arquivo com milhares de alterações, a tela precisa dizer que vai
demorar em vez de parecer travada.

## 6. 🔴 A assimetria que o banco impõe, e que o aviso não pode ignorar

Medido nas políticas de `pedidos`:

| | quem alcança |
|---|---|
| **ver** (`pedidos_select`) | qualquer pessoa da empresa vê **todos** os negócios dela |
| **editar** (`pedidos_update`) | só os **próprios** — a menos que a pessoa seja gestor, ou tenha a permissão "editar" no módulo Negócios |

Uma vendedora comum enxerga os 12.026 negócios da MD e consegue exportar todos, mas o banco
recusa a atualização dos que não são dela. **E a recusa é silenciosa:** a gravação não dá erro,
simplesmente não altera linha nenhuma. É o mesmo defeito já catalogado como item 47 da dívida
técnica ("Salvo quando o banco recusou").

**Consequência obrigatória para o desenho:** a tela de resultado conta o que o banco **de fato**
aceitou — a gravação devolve as linhas afetadas e são elas que alimentam o número. Quando o
aceito for menor que o prometido, a tela diz quantas foram recusadas e por quê ("são de outra
pessoa e você não tem permissão para editar"). Prometer 38 e alterar 20 em silêncio seria pior do
que não ter o aviso.

## 7. O rastro é de graça

`pedidos` já tem dois gatilhos que registram alteração: `trg_historico_pedidos`
(`historico_alteracoes`) e `trg_pedidos_historico_status` (`tipo='campo'`). A atualização por
planilha entra neles sozinha, sem código novo — dá para abrir um negócio depois e ver o que a
importação mexeu, com quem e quando.

## 8. Como se prova que funcionou

Ensaio ponta a ponta, com a base da MD:

1. Exportar negócios. A planilha sai com 14 colunas, e a última é "Código/ID" preenchida.
2. **Reimportar sem editar nada** → o aviso diz *0 alterações*. É o teste que prova a regra do
   nome: se aparecer "12.324 mudam no nome", a decisão 8 não está funcionando.
3. Montar um arquivo de **7 linhas**, todas de negócios diferentes: 3 com a Observação editada e
   o código intacto · 1 com o código apagado · 1 com um código inventado · e 2 linhas carregando
   o **mesmo** código (o de um sexto negócio, colado duas vezes). Reimportar → o aviso diz
   exatamente **3 atualizações · 1 sem código · 1 não encontrado · 2 repetidas**, e a caixinha do
   "sem código" está **desmarcada**, porque o arquivo é misto.
4. Confirmar e conferir no histórico dos 3 que o registro ficou lá.
5. **Repetir logado como vendedor comum**, com negócios de colega no arquivo: o resultado tem que
   dizer quantas foram recusadas, e o número tem que bater com o que o banco aceitou.

Testes automatizados sobre as funções puras: a classificação nos quatro baldes, a regra do vazio,
a regra do nome (igual ao automático não mexe), o de-para por campo e o estado inicial da
caixinha (marcada só quando o arquivo inteiro está sem código).

## 9. Fica em aberto, para decisão posterior

**O nome que veio do Bitrix está guardado e invisível.** 11.453 negócios da MD carregam em campos
extras um nome diferente de "Cliente | Fabricante", e nem a tela nem a planilha o mostram. A
planilha que for guardada hoje **não tem** o nome que a MD usava no Bitrix. Consertar mexe no que
a tela mostra para todo mundo, então é decisão de produto própria — não entra neste trabalho.
